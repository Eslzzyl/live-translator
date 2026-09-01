use std::collections::VecDeque;

use super::capture::{AudioChunk, CaptureKind};

pub struct AudioMixer {
    system: VecDeque<i16>,
    microphone: VecDeque<i16>,
}

impl AudioMixer {
    pub fn new() -> Self {
        Self {
            system: VecDeque::new(),
            microphone: VecDeque::new(),
        }
    }

    pub fn push(&mut self, chunk: AudioChunk) -> Vec<u8> {
        let target = match chunk.source {
            CaptureKind::System => &mut self.system,
            CaptureKind::Microphone => &mut self.microphone,
        };
        target.extend(
            chunk
                .pcm
                .as_chunks::<2>()
                .0
                .iter()
                .map(|bytes| i16::from_le_bytes(*bytes)),
        );

        let count = self.system.len().min(self.microphone.len());
        if count >= 320 {
            return mix_samples(&mut self.system, &mut self.microphone, count);
        }

        if self.system.len().max(self.microphone.len()) >= 960 {
            if self.system.len() > self.microphone.len() {
                return drain_samples(&mut self.system, 320);
            }
            return drain_samples(&mut self.microphone, 320);
        }
        Vec::new()
    }
}

fn mix_samples(
    system: &mut VecDeque<i16>,
    microphone: &mut VecDeque<i16>,
    count: usize,
) -> Vec<u8> {
    let mut output = Vec::with_capacity(count * 2);
    for _ in 0..count {
        let left = system.pop_front().unwrap_or_default() as i32;
        let right = microphone.pop_front().unwrap_or_default() as i32;
        let mixed = ((left + right) / 2).clamp(i16::MIN as i32, i16::MAX as i32) as i16;
        output.extend_from_slice(&mixed.to_le_bytes());
    }
    output
}

fn drain_samples(queue: &mut VecDeque<i16>, count: usize) -> Vec<u8> {
    let count = count.min(queue.len());
    let mut output = Vec::with_capacity(count * 2);
    for _ in 0..count {
        output.extend_from_slice(&queue.pop_front().unwrap_or_default().to_le_bytes());
    }
    output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mixer_combines_two_sources() {
        let mut mixer = AudioMixer::new();
        let pcm = |value: i16| value.to_le_bytes().repeat(320);
        let mut result = mixer.push(AudioChunk {
            source: CaptureKind::System,
            pcm: pcm(1_000),
        });
        assert!(result.is_empty());
        result = mixer.push(AudioChunk {
            source: CaptureKind::Microphone,
            pcm: pcm(3_000),
        });
        assert_eq!(result.len(), 640);
        assert_eq!(i16::from_le_bytes([result[0], result[1]]), 2_000);
    }
}
