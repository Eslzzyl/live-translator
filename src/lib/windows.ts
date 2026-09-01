import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "./runtime";

export async function openCaptionWindow(): Promise<boolean> {
  if (!isTauriRuntime) return false;

  await invoke("open_caption_window");
  return true;
}

export async function closeCaptionWindow() {
  if (!isTauriRuntime) return;
  await invoke("close_caption_window");
}

export async function closeCurrentCaptionWindow() {
  if (!isTauriRuntime) return;
  await invoke("close_caption_window");
}
