use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, SampleFormat, Stream};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::sync::mpsc::Sender;

use crate::models::AppError;

#[derive(Clone, Copy, Debug)]
pub enum CaptureKind {
    System,
    Microphone,
}

pub struct AudioChunk {
    pub source: CaptureKind,
    pub pcm: Vec<u8>,
}

#[derive(Clone, Default)]
pub struct AudioHealth {
    callback_count: Arc<AtomicU64>,
    dropped_chunks: Arc<AtomicU64>,
    stream_errors: Arc<AtomicU64>,
    xrun_count: Arc<AtomicU64>,
}

impl AudioHealth {
    pub fn callback_count(&self) -> u64 {
        self.callback_count.load(Ordering::Relaxed)
    }

    pub fn dropped_chunks(&self) -> u64 {
        self.dropped_chunks.load(Ordering::Relaxed)
    }

    pub fn stream_errors(&self) -> u64 {
        self.stream_errors.load(Ordering::Relaxed)
    }

    pub fn xrun_count(&self) -> u64 {
        self.xrun_count.load(Ordering::Relaxed)
    }

    fn record_callback(&self) {
        self.callback_count.fetch_add(1, Ordering::Relaxed);
    }

    fn record_dropped_chunk(&self) -> u64 {
        self.dropped_chunks.fetch_add(1, Ordering::Relaxed) + 1
    }

    fn record_stream_error(&self, kind: cpal::ErrorKind) -> u64 {
        let error_count = self.stream_errors.fetch_add(1, Ordering::Relaxed) + 1;
        if kind == cpal::ErrorKind::Xrun {
            self.xrun_count.fetch_add(1, Ordering::Relaxed);
        }
        error_count
    }
}

pub struct AudioCapture {
    _streams: Vec<Stream>,
    health: AudioHealth,
}

impl AudioCapture {
    pub fn start(
        source: &crate::models::AudioSource,
        tx: Sender<AudioChunk>,
    ) -> Result<Self, AppError> {
        let host = cpal::default_host();
        let mut streams = Vec::new();
        let health = AudioHealth::default();
        log::info!(
            "[audio] capture_start source={}",
            audio_source_label(source)
        );

        if matches!(
            source,
            crate::models::AudioSource::System | crate::models::AudioSource::Mixed
        ) {
            let device = find_system_device(&host)?;
            log::info!(
                "[audio] device_selected source={} device={}",
                source_label(CaptureKind::System),
                device
            );
            streams.push(build_input_stream(
                device,
                CaptureKind::System,
                tx.clone(),
                health.clone(),
            )?);
        }

        if matches!(
            source,
            crate::models::AudioSource::Microphone | crate::models::AudioSource::Mixed
        ) {
            let device = host
                .default_input_device()
                .ok_or_else(|| AppError::new("audio.microphone_missing"))?;
            log::info!(
                "[audio] device_selected source={} device={}",
                source_label(CaptureKind::Microphone),
                device
            );
            streams.push(build_input_stream(
                device,
                CaptureKind::Microphone,
                tx.clone(),
                health.clone(),
            )?);
        }

        Ok(Self {
            _streams: streams,
            health,
        })
    }

    pub fn health(&self) -> AudioHealth {
        self.health.clone()
    }
}

fn find_system_device(host: &cpal::Host) -> Result<Device, AppError> {
    let devices = host.input_devices().map_err(|error| {
        AppError::with_detail("audio.device_enumeration_failed", error.to_string())
    })?;
    let candidate = devices.filter_map(|device| {
        let name = device.to_string().to_lowercase();
        let looks_like_loopback = name.contains("loopback")
            || name.contains("monitor")
            || name.contains("stereo mix")
            || name.contains("what u hear")
            || name.contains("what you hear")
            || name.contains("blackhole")
            || name.contains("soundflower")
            || name.contains("vb-audio")
            || name.contains("cable output");
        looks_like_loopback.then_some(device)
    });

    if let Some(device) = candidate.into_iter().next() {
        return Ok(device);
    }

    #[cfg(target_os = "windows")]
    if let Some(device) = host.default_output_device() {
        // CPAL's WASAPI backend transparently uses an output device in loopback
        // mode when it is opened as an input stream.
        return Ok(device);
    }

    Err(system_device_error())
}

fn system_device_error() -> AppError {
    #[cfg(target_os = "windows")]
    {
        AppError::new("audio.system_unavailable.windows")
    }
    #[cfg(target_os = "linux")]
    {
        AppError::new("audio.system_unavailable.linux")
    }
    #[cfg(target_os = "macos")]
    {
        AppError::new("audio.system_unavailable.macos")
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
    {
        AppError::new("audio.system_unavailable")
    }
}

fn build_input_stream(
    device: Device,
    source: CaptureKind,
    tx: Sender<AudioChunk>,
    health: AudioHealth,
) -> Result<Stream, AppError> {
    let supported = capture_config(&device, source)?;
    let sample_rate = supported.sample_rate();
    let config = supported.config();
    let channels = usize::from(config.channels);
    let sample_format = supported.sample_format();
    let buffer_size = format!("{:?}", config.buffer_size);
    let supported_buffer_size = format!("{:?}", supported.buffer_size());
    log::info!(
        "[audio] stream_config source={} device={} sample_format={:?} sample_rate={} channels={} buffer_size={} supported_buffer_size={} normalization=auto",
        source_label(source),
        device,
        sample_format,
        sample_rate,
        channels,
        buffer_size,
        supported_buffer_size
    );
    let error_health = health.clone();
    let error_callback = move |error: cpal::Error| {
        let error_kind = error.kind();
        let error_count = error_health.record_stream_error(error_kind);
        log::error!(
            "[audio] stream_error source={} kind={:?} count={} xrun_count={} detail={}",
            source_label(source),
            error_kind,
            error_count,
            error_health.xrun_count(),
            error
        );
    };

    let stream = match sample_format {
        SampleFormat::F32 => {
            let tx = tx.clone();
            let health = health.clone();
            let mut normalizer = AutoGain::default();
            device.build_input_stream(
                config,
                move |data: &[f32], _| {
                    send_samples(
                        data,
                        channels,
                        sample_rate,
                        source,
                        &tx,
                        &health,
                        &mut normalizer,
                    )
                },
                error_callback,
                None,
            )
        }
        SampleFormat::I16 => {
            let tx = tx.clone();
            let health = health.clone();
            let mut normalizer = AutoGain::default();
            device.build_input_stream(
                config,
                move |data: &[i16], _| {
                    send_samples(
                        data,
                        channels,
                        sample_rate,
                        source,
                        &tx,
                        &health,
                        &mut normalizer,
                    )
                },
                error_callback,
                None,
            )
        }
        SampleFormat::U16 => {
            let tx = tx.clone();
            let health = health.clone();
            let mut normalizer = AutoGain::default();
            device.build_input_stream(
                config,
                move |data: &[u16], _| {
                    send_samples(
                        data,
                        channels,
                        sample_rate,
                        source,
                        &tx,
                        &health,
                        &mut normalizer,
                    )
                },
                error_callback,
                None,
            )
        }
        _ => return Err(AppError::new("audio.sample_format_unsupported")),
    }
    .map_err(|error| AppError::with_detail("audio.stream_create_failed", error.to_string()))?;

    stream
        .play()
        .map_err(|error| AppError::with_detail("audio.stream_start_failed", error.to_string()))?;
    Ok(stream)
}

fn capture_config(
    device: &Device,
    source: CaptureKind,
) -> Result<cpal::SupportedStreamConfig, AppError> {
    #[cfg(target_os = "windows")]
    if matches!(source, CaptureKind::System) {
        // WASAPI loopback reads from an output endpoint. CPAL exposes the
        // output endpoint through its output configuration, then enables
        // loopback when build_input_stream is called on that device.
        if let Ok(config) = device.default_output_config() {
            return Ok(config);
        }
    }

    device
        .default_input_config()
        .map_err(|error| AppError::with_detail("audio.config_failed", error.to_string()))
}

fn send_samples<T>(
    data: &[T],
    channels: usize,
    sample_rate: u32,
    source: CaptureKind,
    tx: &Sender<AudioChunk>,
    health: &AudioHealth,
    normalizer: &mut AutoGain,
) where
    T: IntoPcmSample + Copy,
{
    if channels == 0 {
        return;
    }
    health.record_callback();

    let mut mono = Vec::with_capacity(data.len() / channels);
    for frame in data.chunks(channels) {
        let sum: i32 = frame.iter().map(|sample| sample.to_i16() as i32).sum();
        mono.push((sum / frame.len() as i32) as i16);
    }

    normalizer.process(&mut mono);
    let resampled = resample(&mono, sample_rate, 16_000);
    let mut pcm = Vec::with_capacity(resampled.len() * 2);
    for sample in resampled {
        pcm.extend_from_slice(&sample.to_le_bytes());
    }
    if tx.try_send(AudioChunk { source, pcm }).is_err() {
        health.record_dropped_chunk();
    }
}

trait IntoPcmSample {
    fn to_i16(self) -> i16;
}

impl IntoPcmSample for f32 {
    fn to_i16(self) -> i16 {
        (self.clamp(-1.0, 1.0) * i16::MAX as f32) as i16
    }
}

impl IntoPcmSample for i16 {
    fn to_i16(self) -> i16 {
        self
    }
}

impl IntoPcmSample for u16 {
    fn to_i16(self) -> i16 {
        (self as i32 - i16::MAX as i32 - 1) as i16
    }
}

const AGC_TARGET_RMS: f32 = 0.08;
const AGC_NOISE_GATE_RMS: f32 = 0.002;
const AGC_MIN_GAIN: f32 = 0.35;
const AGC_MAX_GAIN: f32 = 8.0;
const AGC_LIMIT: f32 = 0.95;
const AGC_ATTACK: f32 = 0.2;
const AGC_RELEASE: f32 = 0.05;

struct AutoGain {
    gain: f32,
}

impl Default for AutoGain {
    fn default() -> Self {
        Self { gain: 1.0 }
    }
}

impl AutoGain {
    fn process(&mut self, samples: &mut [i16]) {
        if samples.is_empty() {
            return;
        }

        let (sum_squares, peak) = samples
            .iter()
            .fold((0.0f64, 0.0f32), |(sum, peak), sample| {
                let normalized = *sample as f32 / i16::MAX as f32;
                (
                    sum + f64::from(normalized * normalized),
                    peak.max(normalized.abs()),
                )
            });
        let rms = (sum_squares / samples.len() as f64).sqrt() as f32;
        let desired_gain = if rms >= AGC_NOISE_GATE_RMS {
            (AGC_TARGET_RMS / rms).clamp(AGC_MIN_GAIN, AGC_MAX_GAIN)
        } else {
            1.0
        };
        let smoothing = if desired_gain > self.gain {
            AGC_ATTACK
        } else {
            AGC_RELEASE
        };
        self.gain += (desired_gain - self.gain) * smoothing;

        let applied_gain = if peak > 0.0 {
            self.gain.min(AGC_LIMIT / peak)
        } else {
            self.gain
        };
        for sample in samples {
            let normalized = *sample as f32 / i16::MAX as f32;
            let limited = (normalized * applied_gain).clamp(-AGC_LIMIT, AGC_LIMIT);
            *sample = (limited * i16::MAX as f32) as i16;
        }
    }
}

pub(crate) fn resample(input: &[i16], from_rate: u32, to_rate: u32) -> Vec<i16> {
    if input.is_empty() || from_rate == to_rate {
        return input.to_vec();
    }
    let output_len = (input.len() as u64 * u64::from(to_rate) / u64::from(from_rate)) as usize;
    (0..output_len)
        .map(|index| {
            let source_index = (index as u64 * u64::from(from_rate) / u64::from(to_rate)) as usize;
            input[source_index.min(input.len() - 1)]
        })
        .collect()
}

fn source_label(source: CaptureKind) -> &'static str {
    match source {
        CaptureKind::System => "系统",
        CaptureKind::Microphone => "麦克风",
    }
}

fn audio_source_label(source: &crate::models::AudioSource) -> &'static str {
    match source {
        crate::models::AudioSource::System => "system",
        crate::models::AudioSource::Microphone => "microphone",
        crate::models::AudioSource::Mixed => "mixed",
    }
}

#[cfg(test)]
mod tests {
    use super::AutoGain;

    #[test]
    fn auto_gain_raises_quiet_signal_without_exceeding_limit() {
        let mut normalizer = AutoGain::default();
        let mut samples = Vec::new();

        for _ in 0..40 {
            samples = vec![200i16; 480];
            normalizer.process(&mut samples);
        }

        assert!(samples[0] > 1_000);
        assert!(samples[0] < i16::MAX);
    }

    #[test]
    fn auto_gain_reduces_loud_signal() {
        let mut normalizer = AutoGain::default();
        let mut samples = Vec::new();

        for _ in 0..40 {
            samples = vec![20_000i16; 480];
            normalizer.process(&mut samples);
        }

        assert!(samples[0] < 20_000);
    }

    #[test]
    fn auto_gain_does_not_turn_silence_into_noise() {
        let mut normalizer = AutoGain::default();
        for _ in 0..40 {
            let mut quiet_signal = vec![100i16; 480];
            normalizer.process(&mut quiet_signal);
        }
        let gain_after_signal = normalizer.gain;

        let mut silence = vec![0i16; 480];
        normalizer.process(&mut silence);

        assert!(silence.iter().all(|sample| *sample == 0));
        assert!(normalizer.gain < gain_after_signal);
    }
}
