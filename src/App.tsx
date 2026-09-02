import { useEffect, useState } from "react";
import { CircleHelp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BrandHeader } from "./components/BrandHeader";
import { CaptionWindow } from "./components/CaptionWindow";
import { ControlBar } from "./components/ControlBar";
import { SettingsDialog } from "./components/SettingsDialog";
import { TranscriptPanel } from "./components/TranscriptPanel";
import { useTranslator } from "./hooks/useTranslator";
import { useTheme } from "./hooks/useTheme";
import { copyTranscript, exportTranscript } from "./lib/transcriptActions";
import { closeCaptionWindow, openCaptionWindow } from "./lib/windows";
import { formatAppError } from "./lib/errors";
import { isCaptionWindow, isTauriRuntime } from "./lib/runtime";
import "./styles/app.css";

function App() {
  const captionWindow = isCaptionWindow();
  const { i18n, t } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const translator = useTranslator(captionWindow ? "caption" : "main");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [windowError, setWindowError] = useState("");

  useEffect(() => {
    if (i18n.language !== translator.settings.ui_language) {
      void i18n.changeLanguage(translator.settings.ui_language);
    }
    document.documentElement.lang = translator.settings.ui_language;
    document.title = t("app.documentTitle");
  }, [i18n, t, translator.settings.ui_language]);

  if (captionWindow) {
    return <CaptionWindow settings={translator.settings} entries={translator.entries} />;
  }

  async function handleOpenCaption() {
    setWindowError("");
    try {
      const opened = await openCaptionWindow();
      if (opened || !isTauriRuntime) setOverlayOpen(true);
    } catch (error) {
      setWindowError(formatAppError(error, t, "errors.windowCaptionShow"));
    }
  }

  async function handleCloseCaption() {
    setWindowError("");
    try {
      await closeCaptionWindow();
      setOverlayOpen(false);
    } catch (error) {
      setWindowError(formatAppError(error, t, "errors.windowCaptionClose"));
    }
  }

  return (
    <main className="app-shell">
      <BrandHeader
        session={translator.session}
        theme={theme}
        onToggleTheme={toggleTheme}
        onSettings={() => setSettingsOpen(true)}
      />
      <ControlBar
        settings={translator.settings}
        session={translator.session}
        onChange={translator.updateSettings}
        onToggleSession={() => void translator.toggleSession()}
      />
      {translator.session.state === "error" && (
        <div className="error-banner">
          <CircleHelp size={17} />
          {formatAppError(translator.session.error, t, "errors.connectionFallback")}
        </div>
      )}
      {windowError && (
        <div className="error-banner">
          <CircleHelp size={17} />
          {windowError}
        </div>
      )}
      <TranscriptPanel
        entries={translator.entries}
        session={translator.session}
        audioSource={translator.settings.audio_source}
        showOriginal={translator.settings.show_original}
        onToggleOriginal={() =>
          translator.updateSettings({ show_original: !translator.settings.show_original })
        }
        onOpenCaption={() => void handleOpenCaption()}
        onClear={translator.clearEntries}
        onCopy={(entries) => void copyTranscript(entries)}
        onExport={(entries) => void exportTranscript(entries)}
      />
      {settingsOpen && (
        <SettingsDialog
          settings={translator.settings}
          onChange={translator.updateSettings}
          onClose={() => setSettingsOpen(false)}
          onOpenCaption={() => void handleOpenCaption()}
          onCloseCaption={() => void handleCloseCaption()}
          apiKeyConfigured={translator.apiKeyConfigured}
          onSaveApiKey={translator.saveApiKey}
        />
      )}
      {overlayOpen && !isTauriRuntime && (
        <div className="browser-overlay-preview">
          <button onClick={() => setOverlayOpen(false)} aria-label={t("settings.closeCaption")}>
            ×
          </button>
          <strong>{t("app.captionPreviewTitle")}</strong>
          <span>{t("app.captionPreviewDescription")}</span>
        </div>
      )}
    </main>
  );
}

export default App;
