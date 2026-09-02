use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, Stream};

use super::capture::resample;
use crate::models::AppError;

const OUTPUT_SAMPLE_RATE: u32 = 24_000;
const MAX_PLAYBACK_SAMPLES: usize = OUTPUT_SAMPLE_RATE as usize * 3;

pub struct AudioPlayback {
    _stream: Stream,
    queue: Arc<Mutex<VecDeque<i16>>>,
    device_rate: u32,
}

impl AudioPlayback {
    pub fn start(enabled: bool) -> Result<Option<Self>, AppError> {
        if !enabled {
            return Ok(None);
        }

        let host = cpal::default_host();
        let device = host
            .default_output_device()
            .ok_or_else(|| AppError::new("audio.playback_device_missing"))?;
        let supported = device.default_output_config().map_err(|error| {
            AppError::with_detail("audio.playback_config_failed", error.to_string())
        })?;
        let device_rate = supported.sample_rate();
        let config = supported.config();
        let channels = usize::from(config.channels);
        let queue = Arc::new(Mutex::new(VecDeque::new()));
        let callback_queue = Arc::clone(&queue);
        let error_callback = |error| eprintln!("output audio stream error: {error}");

        let stream = match supported.sample_format() {
            SampleFormat::F32 => device.build_output_stream(
                config,
                move |data: &mut [f32], _| fill_output(data, channels, &callback_queue),
                error_callback,
                None,
            ),
            SampleFormat::I16 => device.build_output_stream(
                config,
                move |data: &mut [i16], _| fill_output(data, channels, &callback_queue),
                error_callback,
                None,
            ),
            SampleFormat::U16 => device.build_output_stream(
                config,
                move |data: &mut [u16], _| fill_output(data, channels, &callback_queue),
                error_callback,
                None,
            ),
            _ => return Err(AppError::new("audio.playback_sample_format_unsupported")),
        }
        .map_err(|error| {
            AppError::with_detail("audio.playback_stream_create_failed", error.to_string())
        })?;

        stream.play().map_err(|error| {
            AppError::with_detail("audio.playback_stream_start_failed", error.to_string())
        })?;
        Ok(Some(Self {
            _stream: stream,
            queue,
            device_rate,
        }))
    }

    pub fn push(&self, pcm_24k: &[u8]) {
        let samples: Vec<i16> = pcm_24k
            .as_chunks::<2>()
            .0
            .iter()
            .map(|bytes| i16::from_le_bytes(*bytes))
            .collect();
        let samples = resample(&samples, OUTPUT_SAMPLE_RATE, self.device_rate);
        if let Ok(mut queue) = self.queue.lock() {
            queue.extend(samples);
            while queue.len() > MAX_PLAYBACK_SAMPLES {
                queue.pop_front();
            }
        }
    }
}

fn fill_output<T>(data: &mut [T], channels: usize, queue: &Arc<Mutex<VecDeque<i16>>>)
where
    T: OutputSample,
{
    let mut queue = queue.lock().expect("audio queue poisoned");
    for frame in data.chunks_mut(channels.max(1)) {
        let sample = queue.pop_front().unwrap_or_default();
        for output in frame {
            *output = T::from_i16(sample);
        }
    }
}

trait OutputSample {
    fn from_i16(value: i16) -> Self;
}

impl OutputSample for f32 {
    fn from_i16(value: i16) -> Self {
        value as f32 / i16::MAX as f32
    }
}

impl OutputSample for i16 {
    fn from_i16(value: i16) -> Self {
        value
    }
}

impl OutputSample for u16 {
    fn from_i16(value: i16) -> Self {
        (i32::from(value) + 32_768) as u16
    }
}
