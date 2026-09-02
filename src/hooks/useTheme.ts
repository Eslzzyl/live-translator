import { useEffect, useState } from "react";
import type { ColorTheme, Theme, ThemeMode } from "../types";

function getSystemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function useTheme(
  themeMode: ThemeMode = "system",
  colorTheme: ColorTheme = "zinc",
  onUpdateThemeMode?: (mode: ThemeMode) => void,
) {
  const [systemTheme, setSystemTheme] = useState<Theme>(getSystemTheme);
  const theme: Theme = themeMode === "system" ? systemTheme : themeMode;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.colorTheme = colorTheme;
  }, [colorTheme]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
    const handleSystemThemeChange = () => setSystemTheme(mediaQuery.matches ? "light" : "dark");
    mediaQuery.addEventListener("change", handleSystemThemeChange);
    return () => mediaQuery.removeEventListener("change", handleSystemThemeChange);
  }, []);

  const toggleTheme = () => {
    const nextMode: ThemeMode = theme === "dark" ? "light" : "dark";
    if (onUpdateThemeMode) {
      onUpdateThemeMode(nextMode);
    }
  };

  return {
    theme,
    toggleTheme,
  };
}
