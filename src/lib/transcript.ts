import type { TranscriptEntry } from "../types";

export function formatTranscript(entries: TranscriptEntry[]) {
  return entries
    .map((entry) => entry.timestamp + "\n" + entry.translation + "\n" + entry.source)
    .join("\n\n");
}

export function filterTranscript(entries: TranscriptEntry[], query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return entries;
  return entries.filter((entry) =>
    (entry.source + " " + entry.translation).toLocaleLowerCase().includes(normalized),
  );
}

export function mergeTranscriptEntry(
  entries: TranscriptEntry[],
  incoming: TranscriptEntry,
  limit = 500,
) {
  const next = entries.filter((entry) => entry.id !== incoming.id);
  return [...next, incoming].slice(-limit);
}
