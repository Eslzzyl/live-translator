import { getCurrentWindow } from "@tauri-apps/api/window";

export const isTauriRuntime = Boolean(
  (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__,
);

export function isCaptionWindow() {
  if (!isTauriRuntime) return false;
  try {
    return getCurrentWindow().label === "caption";
  } catch {
    return false;
  }
}
