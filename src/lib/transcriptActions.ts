import { invoke } from "@tauri-apps/api/core";
import type { SessionMode, TranscriptItem } from "../types";
import { isTauriRuntime } from "./runtime";
import { formatTranscript } from "./transcript";

export async function copyTranscript(entries: TranscriptItem[], mode: SessionMode) {
  await navigator.clipboard.writeText(formatTranscript(entries, mode));
}

export async function exportTranscript(entries: TranscriptItem[], mode: SessionMode) {
  const content = formatTranscript(entries, mode);
  if (isTauriRuntime) {
    await invoke("export_transcript", { content });
    return;
  }

  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "live-transcript-" + new Date().toISOString().slice(0, 10) + ".txt";
  link.click();
  URL.revokeObjectURL(url);
}
