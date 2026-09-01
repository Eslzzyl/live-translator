import { useCallback, useEffect, useRef, useState } from "react";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type SessionStatus,
  type TranscriptEntry,
} from "../types";
import { isTauriRuntime } from "../lib/runtime";
import { mergeTranscriptEntry } from "../lib/transcript";

type WindowRole = "main" | "caption";

export function useTranslator(role: WindowRole) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [session, setSession] = useState<SessionStatus>({ state: "idle", active: false });
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const settingsLoaded = useRef(false);

  useEffect(() => {
    if (role === "caption") {
      try {
        const stored = localStorage.getItem("live-transcript-session");
        if (stored) setEntries(JSON.parse(stored) as TranscriptEntry[]);
      } catch {
        // A stale browser preview entry should not stop the caption window.
      }
    }

    if (!isTauriRuntime) {
      settingsLoaded.current = true;
      return;
    }

    let disposed = false;
    let unlisteners: UnlistenFn[] = [];

    void (async () => {
      try {
        const stored = await invoke<AppSettings>("get_settings");
        if (!disposed && stored) setSettings({ ...DEFAULT_SETTINGS, ...stored });
        if (role === "main") {
          const configured = await invoke<boolean>("get_api_key_status");
          if (!disposed) setApiKeyConfigured(configured);
        }
      } catch {
        // The browser preview has no native settings store.
      } finally {
        if (!disposed) settingsLoaded.current = true;
      }

      const events: Promise<UnlistenFn>[] = [];
      if (role === "main") {
        events.push(
          listen<SessionStatus>("session-status", (event) => {
            if (!disposed) setSession(event.payload);
          }),
        );
      }
      events.push(
        listen<TranscriptEntry>("transcript-update", (event) => {
          if (!disposed) {
            setEntries((current) =>
              mergeTranscriptEntry(current, event.payload, role === "main" ? 500 : 8),
            );
          }
        }),
      );
      if (role === "caption") {
        events.push(
          listen<AppSettings>("settings-update", (event) => {
            if (!disposed) setSettings((current) => ({ ...current, ...event.payload }));
          }),
        );
        events.push(
          listen("transcript-clear", () => {
            if (!disposed) setEntries([]);
          }),
        );
      }
      unlisteners = await Promise.all(events);
    })();

    return () => {
      disposed = true;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [role]);

  useEffect(() => {
    try {
      localStorage.setItem("live-transcript-session", JSON.stringify(entries));
    } catch {
      // The transcript remains available in React state if storage is blocked.
    }
  }, [entries]);

  useEffect(() => {
    if (role !== "main" || !isTauriRuntime || !settingsLoaded.current) return;
    void invoke("save_settings", { settings }).catch(() => undefined);
    void emit("settings-update", settings).catch(() => undefined);
  }, [role, settings]);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((current) => ({ ...current, ...patch }));
  }, []);

  const toggleSession = useCallback(async () => {
    if (!isTauriRuntime) {
      setSession((current) => ({
        state: current.state === "listening" ? "idle" : "listening",
        active: current.state !== "listening",
      }));
      return;
    }

    if (session.active) {
      await invoke("stop_translation").catch(() => undefined);
      return;
    }

    setEntries([]);
    if (isTauriRuntime) void emit("transcript-clear").catch(() => undefined);
    await invoke("start_translation", { settings }).catch((error) => {
      setSession({ state: "error", active: false, message: String(error) });
    });
  }, [session.active, settings]);

  const clearEntries = useCallback(() => {
    setEntries([]);
    if (isTauriRuntime) void emit("transcript-clear").catch(() => undefined);
  }, []);

  const saveApiKey = useCallback(async (apiKey: string) => {
    if (!isTauriRuntime) return;
    await invoke("save_api_key", { apiKey });
    const configured = await invoke<boolean>("get_api_key_status");
    if (!configured) throw new Error("API Key 保存后无法从系统凭据存储读取。");
    setApiKeyConfigured(configured);
  }, []);

  return {
    settings,
    session,
    entries,
    apiKeyConfigured,
    updateSettings,
    toggleSession,
    clearEntries,
    saveApiKey,
  };
}
