import {
  isTranscriptionSegment,
  type SessionMode,
  type TranscriptEntry,
  type TranscriptItem,
  type TranscriptionSegment,
} from "../types";

export function formatTranscript(entries: TranscriptItem[], mode: SessionMode) {
  if (mode === "transcription") {
    return entries
      .map((entry) => {
        const text = isTranscriptionSegment(entry) ? entry.text : entry.source;
        return entry.timestamp + "\n" + text;
      })
      .join("\n\n");
  }

  return entries
    .filter((entry): entry is TranscriptEntry => !isTranscriptionSegment(entry))
    .map((entry) => entry.timestamp + "\n" + entry.translation + "\n" + entry.source)
    .join("\n\n");
}

export function filterTranscript(entries: TranscriptItem[], query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return entries;
  return entries.filter((entry) => {
    const text = isTranscriptionSegment(entry)
      ? entry.text
      : entry.source + " " + entry.translation;
    return text.toLocaleLowerCase().includes(normalized);
  });
}

export function mergeTranscriptEntry(
  entries: TranscriptItem[],
  incoming: TranscriptEntry,
  limit: number | null = 500,
) {
  const next = entries.filter((entry) => entry.id !== incoming.id);
  const merged = [...next, incoming];
  return limit === null ? merged : merged.slice(-limit);
}

export function mergeTranscriptionSegment(
  entries: TranscriptItem[],
  incoming: TranscriptionSegment,
  limit: number | null = null,
) {
  const next = entries.filter(
    (entry) => !isTranscriptionSegment(entry) || entry.id !== incoming.id,
  );
  const merged = [...next, incoming];
  return limit === null ? merged : merged.slice(-limit);
}
