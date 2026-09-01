import { useEffect, useState } from "react";
import type { Theme } from "../types";

const THEME_STORAGE_KEY = "live-translator-theme-preference";

function getSystemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function readPreference(): Theme | "system" {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // Fall back to the operating system when storage is unavailable.
  }
  return "system";
}

export function useTheme() {
  const [preference, setPreference] = useState<Theme | "system">(readPreference);
  const [systemTheme, setSystemTheme] = useState<Theme>(getSystemTheme);
  const theme = preference === "system" ? systemTheme : preference;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
    const handleSystemThemeChange = () => setSystemTheme(mediaQuery.matches ? "light" : "dark");
    mediaQuery.addEventListener("change", handleSystemThemeChange);
    return () => mediaQuery.removeEventListener("change", handleSystemThemeChange);
  }, []);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY) {
        setPreference(event.newValue === "light" || event.newValue === "dark" ? event.newValue : "system");
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  return {
    theme,
    toggleTheme: () => {
      const nextTheme = theme === "dark" ? "light" : "dark";
      setPreference(nextTheme);
      try {
        localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
      } catch {
        // The explicit selection still applies to the current window.
      }
    },
  };
}
