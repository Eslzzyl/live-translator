use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, SampleFormat, Stream};
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

pub struct AudioCapture {
    _streams: Vec<Stream>,
}

impl AudioCapture {
    pub fn start(
        source: &crate::models::AudioSource,
        tx: Sender<AudioChunk>,
    ) -> Result<Self, AppError> {
        let host = cpal::default_host();
        let mut streams = Vec::new();

        if matches!(
            source,
            crate::models::AudioSource::System | crate::models::AudioSource::Mixed
        ) {
            let device = find_system_device(&host)?;
            streams.push(build_input_stream(device, CaptureKind::System, tx.clone())?);
        }

        if matches!(
            source,
            crate::models::AudioSource::Microphone | crate::models::AudioSource::Mixed
        ) {
            let device = host
                .default_input_device()
                .ok_or_else(|| AppError::new("audio.microphone_missing"))?;
            streams.push(build_input_stream(
                device,
                CaptureKind::Microphone,
                tx.clone(),
            )?);
        }

        Ok(Self { _streams: streams })
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
) -> Result<Stream, AppError> {
    let supported = capture_config(&device, source)?;
    let sample_rate = supported.sample_rate();
    let config = supported.config();
    let channels = usize::from(config.channels);
    let error_callback = move |error| {
        eprintln!("{} audio stream error: {error}", source_label(source));
    };

    let stream = match supported.sample_format() {
        SampleFormat::F32 => {
            let tx = tx.clone();
            device.build_input_stream(
                config,
                move |data: &[f32], _| send_samples(data, channels, sample_rate, source, &tx),
                error_callback,
                None,
            )
        }
        SampleFormat::I16 => {
            let tx = tx.clone();
            device.build_input_stream(
                config,
                move |data: &[i16], _| send_samples(data, channels, sample_rate, source, &tx),
                error_callback,
                None,
            )
        }
        SampleFormat::U16 => {
            let tx = tx.clone();
            device.build_input_stream(
                config,
                move |data: &[u16], _| send_samples(data, channels, sample_rate, source, &tx),
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
) where
    T: IntoPcmSample + Copy,
{
    if channels == 0 {
        return;
    }

    let mut mono = Vec::with_capacity(data.len() / channels);
    for frame in data.chunks(channels) {
        let sum: i32 = frame.iter().map(|sample| sample.to_i16() as i32).sum();
        mono.push((sum / frame.len() as i32) as i16);
    }

    let resampled = resample(&mono, sample_rate, 16_000);
    let mut pcm = Vec::with_capacity(resampled.len() * 2);
    for sample in resampled {
        pcm.extend_from_slice(&sample.to_le_bytes());
    }
    let _ = tx.try_send(AudioChunk { source, pcm });
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
