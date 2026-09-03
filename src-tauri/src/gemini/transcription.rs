use std::sync::atomic::{AtomicU64, Ordering};

use chrono::Local;

use crate::models::TranscriptionSegment;

static NEXT_SEGMENT_ID: AtomicU64 = AtomicU64::new(1);

pub(super) struct TranscriptionAccumulator {
    id: String,
    timestamp: String,
    text: String,
}

impl TranscriptionAccumulator {
    pub(super) fn new() -> Self {
        Self {
            id: String::new(),
            timestamp: String::new(),
            text: String::new(),
        }
    }

    fn ensure_segment(&mut self) {
        if self.id.is_empty() {
            let id = NEXT_SEGMENT_ID.fetch_add(1, Ordering::Relaxed);
            self.id = format!("transcription-{id}");
            self.timestamp = timestamp_now();
        }
    }

    pub(super) fn update_interim(&mut self, text: &str) {
        if text.is_empty() {
            return;
        }
        self.ensure_segment();
        self.text = text.to_string();
    }

    pub(super) fn commit_final(&mut self, text: &str) {
        if text.is_empty() {
            return;
        }
        self.ensure_segment();
        self.text = text.to_string();
    }

    pub(super) fn has_text(&self) -> bool {
        !self.text.is_empty()
    }

    pub(super) fn segment(&self, session_id: u64, is_final: bool) -> TranscriptionSegment {
        TranscriptionSegment {
            id: self.id.clone(),
            session_id,
            text: self.text.clone(),
            timestamp: self.timestamp.clone(),
            is_final,
        }
    }

    pub(super) fn reset(&mut self) {
        self.id.clear();
        self.timestamp.clear();
        self.text.clear();
    }
}

fn timestamp_now() -> String {
    Local::now().format("%H:%M:%S").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn interim_text_is_replaced_and_final_text_is_stable() {
        let mut accumulator = TranscriptionAccumulator::new();
        accumulator.update_interim("Hel");
        assert_eq!(accumulator.segment(7, false).text, "Hel");

        accumulator.update_interim("Hello");
        assert_eq!(accumulator.segment(7, false).text, "Hello");

        accumulator.commit_final("Hello world");
        let segment = accumulator.segment(7, true);
        assert_eq!(segment.text, "Hello world");
        assert_eq!(segment.session_id, 7);
        assert!(segment.is_final);
    }
}
