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
            #[cfg(target_os = "macos")]
            super::macos_permissions::ensure_system_audio_permission()?;

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
    #[cfg(target_os = "macos")]
    if let Some(device) = host.default_output_device() {
        // Prefer the native CoreAudio output tap. CPAL provides this loopback
        // path on macOS 14.6 and later, independent of virtual audio drivers.
        return Ok(device);
    }

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
        // WASAPI transparently uses an output device in loopback mode when it
        // is opened as an input stream.
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
    _source: CaptureKind,
) -> Result<cpal::SupportedStreamConfig, AppError> {
    #[cfg(any(target_os = "windows", target_os = "macos"))]
    if matches!(_source, CaptureKind::System) {
        // System loopback reads from an output endpoint. CPAL exposes the
        // output endpoint through its output configuration, then enables the
        // platform-specific loopback path when build_input_stream is called.
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

    let mut resampled = resample(&mono, sample_rate, 16_000);
    normalizer.process(&mut resampled);
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
const AGC_MIN_GAIN: f32 = 0.25;
const AGC_MAX_GAIN: f32 = 24.0;
const AGC_HOLD_SAMPLES: usize = 12_800; // ~800ms at 16kHz
const AGC_NOISE_FLOOR_INIT: f32 = 0.0005;
const AGC_SPEECH_ABSOLUTE_FLOOR: f32 = 0.0008;

struct AutoGain {
    gain: f32,
    hold_remaining_samples: usize,
    noise_floor: f32,
}

impl Default for AutoGain {
    fn default() -> Self {
        Self {
            gain: 1.0,
            hold_remaining_samples: 0,
            noise_floor: AGC_NOISE_FLOOR_INIT,
        }
    }
}

impl AutoGain {
    fn process(&mut self, samples: &mut [i16]) {
        if samples.is_empty() {
            return;
        }

        let mut sum_squares = 0.0f64;
        let mut peak = 0.0f32;
        for &sample in samples.iter() {
            let norm = sample as f32 / i16::MAX as f32;
            sum_squares += f64::from(norm * norm);
            let abs_norm = norm.abs();
            if abs_norm > peak {
                peak = abs_norm;
            }
        }
        let rms = (sum_squares / samples.len() as f64).sqrt() as f32;

        // Adaptively track the background noise floor
        if rms < self.noise_floor {
            self.noise_floor = self.noise_floor * 0.9 + rms * 0.1;
        } else {
            self.noise_floor = (self.noise_floor * 0.9995 + rms * 0.0005).min(0.005);
        }

        let speech_threshold = (self.noise_floor * 2.2).max(AGC_SPEECH_ABSOLUTE_FLOOR);
        let is_speech = rms >= speech_threshold;

        if is_speech {
            let desired_gain = (AGC_TARGET_RMS / rms.max(1e-4)).clamp(AGC_MIN_GAIN, AGC_MAX_GAIN);
            let smoothing = if desired_gain < self.gain {
                0.25 // Rapid response when signal gets too loud
            } else {
                0.12 // Smooth ramp-up for quiet speech
            };
            self.gain += (desired_gain - self.gain) * smoothing;
            self.hold_remaining_samples = AGC_HOLD_SAMPLES;
        } else if self.hold_remaining_samples > 0 {
            // Hangover hold: freeze gain across brief pauses between words and syllables
            self.hold_remaining_samples = self.hold_remaining_samples.saturating_sub(samples.len());
        } else {
            // Prolonged silence: slowly release gain towards neutral 1.0 without noise boost
            self.gain += (1.0 - self.gain) * 0.02;
        }

        // Apply gain with smooth soft-knee saturation to eliminate harsh clipping
        for sample in samples.iter_mut() {
            let val = (*sample as f32 / i16::MAX as f32) * self.gain;
            let saturated = if val > 0.85 {
                0.85 + 0.14 * ((val - 0.85) / 0.14).tanh()
            } else if val < -0.85 {
                -0.85 - 0.14 * ((-val - 0.85) / 0.14).tanh()
            } else {
                val
            };
            *sample = (saturated * i16::MAX as f32).clamp(i16::MIN as f32, i16::MAX as f32) as i16;
        }
    }
}

pub(crate) fn resample(input: &[i16], from_rate: u32, to_rate: u32) -> Vec<i16> {
    if input.is_empty() || from_rate == to_rate {
        return input.to_vec();
    }

    let ratio = from_rate as f64 / to_rate as f64;
    let output_len = (input.len() as u64 * u64::from(to_rate) / u64::from(from_rate)) as usize;
    if output_len == 0 {
        return Vec::new();
    }

    let mut output = Vec::with_capacity(output_len);

    if ratio >= 1.0 {
        // Downsampling: area-averaging across fractional window [t_start, t_end]
        // Provides natural low-pass anti-aliasing filtering and eliminates foldback distortion.
        for i in 0..output_len {
            let t_start = i as f64 * ratio;
            let t_end = (i + 1) as f64 * ratio;
            let mut sum = 0.0f64;

            let idx_start = t_start.floor() as usize;
            let idx_end = (t_end.ceil() as usize).min(input.len());

            for idx in idx_start..idx_end {
                let seg_start = (idx as f64).max(t_start);
                let seg_end = ((idx + 1) as f64).min(t_end);
                let weight = (seg_end - seg_start).max(0.0);
                sum += f64::from(input[idx.min(input.len() - 1)]) * weight;
            }

            let span = (t_end - t_start).max(1e-6);
            let avg = (sum / span).round().clamp(i16::MIN as f64, i16::MAX as f64) as i16;
            output.push(avg);
        }
    } else {
        // Upsampling: linear interpolation between adjacent samples
        for i in 0..output_len {
            let t = i as f64 * ratio;
            let idx = t.floor() as usize;
            let frac = t - idx as f64;

            let s0 = f64::from(input[idx.min(input.len() - 1)]);
            let s1 = f64::from(input[(idx + 1).min(input.len() - 1)]);
            let sample = (s0 * (1.0 - frac) + s1 * frac)
                .round()
                .clamp(i16::MIN as f64, i16::MAX as f64) as i16;
            output.push(sample);
        }
    }

    output
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
    use super::*;

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
    fn auto_gain_holds_gain_during_short_speech_pause() {
        let mut normalizer = AutoGain::default();
        for _ in 0..20 {
            let mut speech = vec![300i16; 480];
            normalizer.process(&mut speech);
        }
        let gain_after_speech = normalizer.gain;
        assert!(gain_after_speech > 1.5);

        // Pause for 480 samples (~30ms, well within 800ms hold time)
        let mut silence = vec![0i16; 480];
        normalizer.process(&mut silence);

        // Gain must be held unchanged during speech pause
        assert_eq!(normalizer.gain, gain_after_speech);
        assert!(silence.iter().all(|&s| s == 0));
    }

    #[test]
    fn auto_gain_soft_limiter_prevents_clipping() {
        let mut normalizer = AutoGain::default();
        normalizer.gain = 2.0;
        let mut loud = vec![30_000i16; 480];
        normalizer.process(&mut loud);

        // Output must remain strictly bounded without overflow/wrap
        assert!(loud.iter().all(|&s| s < i16::MAX && s > 0));
    }

    #[test]
    fn resample_downsamples_with_area_average() {
        // 48kHz to 16kHz is 3:1 decimation
        let input = vec![1000i16, 2000i16, 3000i16, 4000i16, 5000i16, 6000i16];
        let output = resample(&input, 48_000, 16_000);
        assert_eq!(output.len(), 2);
        assert_eq!(output[0], 2000); // (1000 + 2000 + 3000) / 3
        assert_eq!(output[1], 5000); // (4000 + 5000 + 6000) / 3
    }
}
