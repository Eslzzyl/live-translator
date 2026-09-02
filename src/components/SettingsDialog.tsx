import {
  Check,
  CircleAlert,
  KeyRound,
  Languages,
  LoaderCircle,
  Mic,
  PanelTop,
  VolumeX,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SelectMenu } from "./SelectMenu";
import { formatAppError } from "../lib/errors";
import {
  AUDIO_SOURCE_OPTIONS,
  LANGUAGE_OPTIONS,
  UI_LANGUAGE_OPTIONS,
  type AppSettings,
} from "../types";

type ApiKeySaveState = "idle" | "saving" | "saved" | "error";

export function SettingsDialog({
  settings,
  onChange,
  onClose,
  onOpenCaption,
  onCloseCaption,
  apiKeyConfigured,
  onSaveApiKey,
}: {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
  onClose: () => void;
  onOpenCaption: () => void;
  onCloseCaption: () => void;
  apiKeyConfigured: boolean;
  onSaveApiKey: (apiKey: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [apiKey, setApiKey] = useState("");
  const [apiKeySaveState, setApiKeySaveState] = useState<ApiKeySaveState>("idle");
  const [apiKeyError, setApiKeyError] = useState("");

  async function handleSaveApiKey() {
    if (!apiKey.trim() || apiKeySaveState === "saving") return;

    setApiKeySaveState("saving");
    setApiKeyError("");
    try {
      await onSaveApiKey(apiKey);
      setApiKey("");
      setApiKeySaveState("saved");
    } catch (error) {
      setApiKeySaveState("error");
      setApiKeyError(formatAppError(error, t));
    }
  }

  const audioOptions = AUDIO_SOURCE_OPTIONS.map(([value, key]) => [value, t(key)] as const);
  const languageOptions = LANGUAGE_OPTIONS.map(([value, key]) => [value, t(key)] as const);
  const uiLanguageOptions = UI_LANGUAGE_OPTIONS.map(([value, key]) => [value, t(key)] as const);

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <header className="dialog-header">
          <div>
            <div className="eyebrow">{t("settings.eyebrow")}</div>
            <h2 id="settings-title">{t("settings.title")}</h2>
          </div>
          <button className="icon-button subtle" onClick={onClose} aria-label={t("settings.close")}>
            <X size={18} />
          </button>
        </header>
        <div className="settings-body">
          <SettingSection icon={<Mic size={17} />} title={t("settings.audio")}>
            <SettingRow
              label={t("settings.defaultSource")}
              description={t("settings.defaultSourceDescription")}
            >
              <SelectMenu
                className="setting-select-menu"
                value={settings.audio_source}
                options={audioOptions}
                onChange={(value) => onChange({ audio_source: value })}
                ariaLabel={t("settings.defaultSource")}
              />
            </SettingRow>
            <SettingRow
              label={t("settings.playback")}
              description={t("settings.playbackDescription")}
            >
              <button
                className={"toggle " + (settings.playback_enabled ? "on" : "")}
                onClick={() => onChange({ playback_enabled: !settings.playback_enabled })}
                aria-pressed={settings.playback_enabled}
              >
                <span />
                <b>{settings.playback_enabled ? t("settings.on") : t("settings.off")}</b>
              </button>
            </SettingRow>
          </SettingSection>
          <SettingSection icon={<Languages size={17} />} title={t("settings.language")}>
            <SettingRow label={t("settings.interfaceLanguage")}>
              <SelectMenu
                className="setting-select-menu"
                value={settings.ui_language}
                options={uiLanguageOptions}
                onChange={(value) => onChange({ ui_language: value })}
                ariaLabel={t("settings.interfaceLanguage")}
              />
            </SettingRow>
            <SettingRow
              label={t("settings.sourceLanguage")}
              description={t("settings.sourceLanguageDescription")}
            >
              <span className="setting-static">{t("language.auto")}</span>
            </SettingRow>
            <SettingRow label={t("settings.targetLanguage")}>
              <SelectMenu
                className="setting-select-menu"
                value={settings.target_language}
                options={languageOptions}
                onChange={(value) => onChange({ target_language: value })}
                ariaLabel={t("settings.targetLanguage")}
              />
            </SettingRow>
          </SettingSection>
          <SettingSection icon={<PanelTop size={17} />} title={t("settings.caption")}>
            <SettingRow label={t("settings.showOriginal")}>
              <button
                className={"toggle " + (settings.show_original ? "on" : "")}
                onClick={() => onChange({ show_original: !settings.show_original })}
                aria-pressed={settings.show_original}
              >
                <span />
                <b>{settings.show_original ? t("settings.on") : t("settings.off")}</b>
              </button>
            </SettingRow>
            <SettingRow label={t("settings.fontSize", { size: settings.overlay_font_size })}>
              <input
                className="range-input"
                type="range"
                min="18"
                max="48"
                value={settings.overlay_font_size}
                onChange={(event) => onChange({ overlay_font_size: Number(event.target.value) })}
              />
            </SettingRow>
            <SettingRow
              label={t("settings.opacity", {
                percent: Math.round(settings.overlay_opacity * 100),
              })}
            >
              <input
                className="range-input"
                type="range"
                min="0.45"
                max="1"
                step="0.01"
                value={settings.overlay_opacity}
                onChange={(event) => onChange({ overlay_opacity: Number(event.target.value) })}
              />
            </SettingRow>
            <div className="dialog-inline-actions">
              <button className="secondary-button" onClick={onOpenCaption}>
                <PanelTop size={15} />
                {t("settings.openCaption")}
              </button>
              <button className="text-button" onClick={onCloseCaption}>
                <X size={15} />
                {t("settings.closeCaption")}
              </button>
            </div>
          </SettingSection>
          <SettingSection icon={<VolumeX size={17} />} title={t("settings.about")}>
            <p className="settings-note">{t("settings.aboutNote")}</p>
          </SettingSection>
          <SettingSection icon={<KeyRound size={17} />} title={t("settings.gemini")}>
            <SettingRow
              label={t("settings.apiKey")}
              description={
                apiKeyConfigured
                  ? t("settings.apiKeyConfiguredDescription")
                  : t("settings.apiKeyMissingDescription")
              }
            >
              <div className="api-key-control-wrap">
                <div className="api-key-control">
                  <input
                    className="setting-input"
                    type="password"
                    value={apiKey}
                    onChange={(event) => {
                      setApiKey(event.target.value);
                      setApiKeySaveState("idle");
                      setApiKeyError("");
                    }}
                    placeholder={
                      apiKeyConfigured
                        ? t("settings.apiKeyConfiguredPlaceholder")
                        : t("settings.apiKeyPlaceholder")
                    }
                  />
                  <button
                    className="secondary-button compact"
                    disabled={!apiKey.trim() || apiKeySaveState === "saving"}
                    onClick={() => void handleSaveApiKey()}
                  >
                    {apiKeySaveState === "saving" ? (
                      <LoaderCircle className="spin" size={14} />
                    ) : apiKeySaveState === "saved" ? (
                      t("settings.saved")
                    ) : (
                      t("settings.save")
                    )}
                  </button>
                </div>
                {apiKeySaveState === "saved" && (
                  <small className="api-key-feedback success">
                    <Check size={13} />
                    {t("settings.savedToCredentialStore")}
                  </small>
                )}
                {apiKeySaveState === "error" && (
                  <small className="api-key-feedback error">
                    <CircleAlert size={13} />
                    {apiKeyError}
                  </small>
                )}
              </div>
            </SettingRow>
          </SettingSection>
        </div>
        <footer className="dialog-footer">
          <span>
            <Check size={15} />
            {t("settings.autoSaveNotice")}
          </span>
          <button className="primary-button" onClick={onClose}>
            {t("settings.done")}
          </button>
        </footer>
      </section>
    </div>
  );
}

function SettingSection({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="setting-section">
      <h3>
        <span className="setting-icon">{icon}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="setting-row">
      <div>
        <strong>{label}</strong>
        {description && <small>{description}</small>}
      </div>
      {children}
    </div>
  );
}
