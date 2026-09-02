use std::sync::atomic::{AtomicU64, Ordering};

use chrono::Local;

use crate::models::TranscriptEntry;

static NEXT_TURN_ID: AtomicU64 = AtomicU64::new(1);

pub(super) struct TranscriptAccumulator {
    id: String,
    timestamp: String,
    source_committed: String,
    source_interim: String,
    translation: String,
}

impl TranscriptAccumulator {
    pub(super) fn new() -> Self {
        Self {
            id: String::new(),
            timestamp: String::new(),
            source_committed: String::new(),
            source_interim: String::new(),
            translation: String::new(),
        }
    }

    fn ensure_turn(&mut self) {
        if self.id.is_empty() {
            let id = NEXT_TURN_ID.fetch_add(1, Ordering::Relaxed);
            self.id = format!("turn-{id}");
            self.timestamp = timestamp_now();
        }
    }

    pub(super) fn update_source_interim(&mut self, text: &str) {
        if text.is_empty() {
            return;
        }
        self.ensure_turn();
        self.source_interim = text.to_string();
    }

    pub(super) fn commit_source(&mut self, text: &str) {
        if text.is_empty() {
            return;
        }
        self.ensure_turn();
        append_transcript(&mut self.source_committed, text);
        self.source_interim.clear();
    }

    pub(super) fn finalize_source_interim(&mut self) {
        if self.source_interim.is_empty() {
            return;
        }
        let interim = std::mem::take(&mut self.source_interim);
        append_transcript(&mut self.source_committed, &interim);
    }

    pub(super) fn update_translation(&mut self, text: &str, finished: bool) {
        if text.is_empty() {
            return;
        }
        self.ensure_turn();
        if finished {
            self.translation = text.to_string();
        } else {
            self.translation.push_str(text);
        }
    }

    pub(super) fn has_text(&self) -> bool {
        !self.source_committed.is_empty()
            || !self.source_interim.is_empty()
            || !self.translation.is_empty()
    }

    pub(super) fn has_translation(&self) -> bool {
        !self.translation.is_empty()
    }

    pub(super) fn entry(&self, is_final: bool) -> TranscriptEntry {
        let mut source = self.source_committed.clone();
        source.push_str(&self.source_interim);
        TranscriptEntry {
            id: self.id.clone(),
            source,
            translation: self.translation.clone(),
            timestamp: self.timestamp.clone(),
            is_final,
        }
    }

    pub(super) fn reset(&mut self) {
        self.id.clear();
        self.timestamp.clear();
        self.source_committed.clear();
        self.source_interim.clear();
        self.translation.clear();
    }
}

fn append_transcript(target: &mut String, text: &str) {
    if text.is_empty() {
        return;
    }
    if target.is_empty() {
        target.push_str(text);
    } else if !target.ends_with(text) {
        if let Some(remainder) = text.strip_prefix(target.as_str()) {
            target.push_str(remainder);
        } else {
            target.push_str(text);
        }
    }
}

fn timestamp_now() -> String {
    Local::now().format("%H:%M:%S").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accumulator_replaces_interim_source_and_keeps_committed_source() {
        let mut accumulator = TranscriptAccumulator::new();
        accumulator.update_source_interim("Hel");
        assert_eq!(accumulator.entry(false).source, "Hel");

        accumulator.update_source_interim("Hello");
        assert_eq!(accumulator.entry(false).source, "Hello");

        accumulator.commit_source("Hello world");
        accumulator.update_source_interim(" next");
        assert_eq!(accumulator.entry(false).source, "Hello world next");

        accumulator.finalize_source_interim();
        accumulator.update_translation("你好", false);
        assert_eq!(accumulator.entry(false).source, "Hello world next");
        assert_eq!(accumulator.translation, "你好");
        assert!(!accumulator.entry(false).is_final);
    }
}
