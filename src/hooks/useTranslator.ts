import { useCallback, useEffect, useRef, useState } from "react";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import {
  DEFAULT_SETTINGS,
  DEFAULT_SESSION_STATUS,
  type AppSettings,
  type SessionStatus,
  type TranscriptEntry,
  type TranscriptItem,
  type TranscriptionSegment,
} from "../types";
import { createAppError, toAppError } from "../lib/errors";
import { isTauriRuntime } from "../lib/runtime";
import { mergeTranscriptEntry, mergeTranscriptionSegment } from "../lib/transcript";

type WindowRole = "main" | "caption";

export function useTranslator(role: WindowRole) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [entries, setEntries] = useState<TranscriptItem[]>([]);
  const [liveTranscription, setLiveTranscription] = useState<TranscriptionSegment | null>(null);
  const [session, setSession] = useState<SessionStatus>(DEFAULT_SESSION_STATUS);
  const [audioLevel, setAudioLevel] = useState(0);
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const settingsLoaded = useRef(false);
  const activeSessionId = useRef<number | null>(null);

  useEffect(() => {
    if (!isTauriRuntime) {
      settingsLoaded.current = true;
      return;
    }

    let disposed = false;
    let unlisteners: UnlistenFn[] = [];

    void (async () => {
      let loadedSettings = DEFAULT_SETTINGS;
      try {
        const stored = await invoke<AppSettings>("get_settings");
        if (stored) loadedSettings = { ...DEFAULT_SETTINGS, ...stored };
        if (loadedSettings.session_mode === "transcription") {
          loadedSettings = { ...loadedSettings, playback_enabled: false };
        }
        if (!disposed) setSettings(loadedSettings);
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
      events.push(
        listen<SessionStatus>("session-status", (event) => {
          if (!disposed) {
            activeSessionId.current = event.payload.session_id ?? activeSessionId.current;
            setSession(event.payload);
            if (event.payload.state !== "listening") {
              setAudioLevel(0);
            }
          }
        }),
      );
      if (role === "main") {
        events.push(
          listen<number>("audio-level", (event) => {
            if (!disposed) setAudioLevel(event.payload);
          }),
        );
      }
      events.push(
        listen<TranscriptEntry>("transcript-update", (event) => {
          if (!disposed) {
            setEntries((current) =>
              mergeTranscriptEntry(current, event.payload, role === "main" ? null : 8),
            );
          }
        }),
      );
      events.push(
        listen<TranscriptionSegment>("transcription-update", (event) => {
          if (disposed) return;
          if (
            activeSessionId.current !== null &&
            event.payload.session_id !== activeSessionId.current
          ) {
            return;
          }
          activeSessionId.current ??= event.payload.session_id;
          if (event.payload.is_final) {
            setEntries((current) =>
              mergeTranscriptionSegment(current, event.payload, role === "caption" ? 4 : null),
            );
            setLiveTranscription((current) => (current?.id === event.payload.id ? null : current));
          } else {
            setLiveTranscription(event.payload);
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
            if (!disposed) {
              setEntries([]);
              setLiveTranscription(null);
            }
          }),
        );
      }
      unlisteners = await Promise.all(events);

      if (role === "caption" && loadedSettings.session_mode === "transcription") {
        const tail = await invoke<TranscriptionSegment[]>("get_transcription_tail").catch(() => []);
        if (!disposed && tail.length > 0) {
          activeSessionId.current = tail[0].session_id;
          setEntries(tail.filter((entry) => entry.is_final));
          setLiveTranscription(tail.find((entry) => !entry.is_final) ?? null);
        }
      }
    })();

    return () => {
      disposed = true;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [role]);

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
        mode: settings.session_mode,
      }));
      return;
    }

    if (session.active) {
      await invoke("stop_translation").catch(() => undefined);
      return;
    }

    setEntries([]);
    setLiveTranscription(null);
    activeSessionId.current = null;
    void invoke("clear_transcription").catch(() => undefined);
    if (isTauriRuntime) void emit("transcript-clear").catch(() => undefined);
    await invoke("start_translation", { settings }).catch((error) => {
      setSession({
        state: "error",
        active: false,
        mode: settings.session_mode,
        error: toAppError(error),
      });
    });
  }, [session.active, settings]);

  const clearEntries = useCallback(() => {
    setEntries([]);
    setLiveTranscription(null);
    if (isTauriRuntime) void invoke("clear_transcription").catch(() => undefined);
    if (isTauriRuntime) void emit("transcript-clear").catch(() => undefined);
  }, []);

  const saveApiKey = useCallback(async (apiKey: string) => {
    if (!isTauriRuntime) return;
    await invoke("save_api_key", { apiKey });
    const configured = await invoke<boolean>("get_api_key_status");
    if (!configured) throw createAppError("credentials.readback_failed");
    setApiKeyConfigured(configured);
  }, []);

  return {
    settings,
    session,
    entries,
    liveTranscription,
    audioLevel,
    apiKeyConfigured,
    updateSettings,
    toggleSession,
    clearEntries,
    saveApiKey,
  };
}
