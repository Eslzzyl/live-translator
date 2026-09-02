import {
  Check,
  CircleAlert,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  LoaderCircle,
  Mic,
  PanelTop,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SelectMenu } from "./SelectMenu";
import { formatAppError } from "../lib/errors";
import {
  AUDIO_SOURCE_OPTIONS,
  COLOR_THEME_OPTIONS,
  THEME_MODE_OPTIONS,
  UI_LANGUAGE_OPTIONS,
  type AppSettings,
} from "../types";

type ApiKeySaveState = "idle" | "saving" | "saved" | "error";

export function SettingsDialog({
  settings,
  onChange,
  onClose,
  apiKeyConfigured,
  onSaveApiKey,
}: {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
  onClose: () => void;
  apiKeyConfigured: boolean;
  onSaveApiKey: (apiKey: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [apiKey, setApiKey] = useState("");
  const [showApiKeyText, setShowApiKeyText] = useState(false);
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
  const uiLanguageOptions = UI_LANGUAGE_OPTIONS.map(([value, key]) => [value, t(key)] as const);
  const themeModeOptions = THEME_MODE_OPTIONS.map(([value, key]) => [value, t(key)] as const);
  const colorThemeOptions = COLOR_THEME_OPTIONS.map((item) => [item.id, t(item.nameKey)] as const);

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
          <h2 id="settings-title">{t("settings.title")}</h2>
          <button className="icon-button subtle" onClick={onClose} aria-label={t("settings.close")}>
            <X size={17} />
          </button>
        </header>

        <div className="settings-body">
          <SettingSection icon={<KeyRound size={15} />} title={t("settings.gemini")}>
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
                  <div className="api-key-input-container">
                    <input
                      className="setting-input"
                      type={showApiKeyText ? "text" : "password"}
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
                    {apiKey && (
                      <button
                        type="button"
                        className="api-key-toggle-btn"
                        onClick={() => setShowApiKeyText((prev) => !prev)}
                        title={showApiKeyText ? t("settings.hideApiKey") : t("settings.showApiKey")}
                        aria-label={
                          showApiKeyText ? t("settings.hideApiKey") : t("settings.showApiKey")
                        }
                      >
                        {showApiKeyText ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    className="primary-button compact-btn"
                    disabled={!apiKey.trim() || apiKeySaveState === "saving"}
                    onClick={() => void handleSaveApiKey()}
                  >
                    {apiKeySaveState === "saving" ? (
                      <LoaderCircle className="spin" size={13} />
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

          <SettingSection icon={<Mic size={15} />} title={t("settings.audio")}>
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
                type="button"
                className={"toggle " + (settings.playback_enabled ? "on" : "")}
                onClick={() => onChange({ playback_enabled: !settings.playback_enabled })}
                aria-pressed={settings.playback_enabled}
              >
                <span />
                <b>{settings.playback_enabled ? t("settings.on") : t("settings.off")}</b>
              </button>
            </SettingRow>
          </SettingSection>

          <SettingSection icon={<PanelTop size={15} />} title={t("settings.caption")}>
            <SettingRow label={t("settings.showOriginal")}>
              <button
                type="button"
                className={"toggle " + (settings.show_original ? "on" : "")}
                onClick={() => onChange({ show_original: !settings.show_original })}
                aria-pressed={settings.show_original}
              >
                <span />
                <b>{settings.show_original ? t("settings.on") : t("settings.off")}</b>
              </button>
            </SettingRow>
            <SettingRow label={t("settings.fontSize")}>
              <div className="slider-control">
                <input
                  className="range-input"
                  type="range"
                  min="18"
                  max="48"
                  value={settings.overlay_font_size}
                  onChange={(event) => onChange({ overlay_font_size: Number(event.target.value) })}
                />
                <span className="slider-value">{settings.overlay_font_size}px</span>
              </div>
            </SettingRow>
            <SettingRow label={t("settings.opacity")}>
              <div className="slider-control">
                <input
                  className="range-input"
                  type="range"
                  min="0.45"
                  max="1"
                  step="0.01"
                  value={settings.overlay_opacity}
                  onChange={(event) => onChange({ overlay_opacity: Number(event.target.value) })}
                />
                <span className="slider-value">{Math.round(settings.overlay_opacity * 100)}%</span>
              </div>
            </SettingRow>
          </SettingSection>

          <SettingSection icon={<Globe size={15} />} title={t("settings.general")}>
            <SettingRow label={t("theme.mode.label")}>
              <SelectMenu
                className="setting-select-menu"
                value={settings.theme_mode}
                options={themeModeOptions}
                onChange={(value) => onChange({ theme_mode: value })}
                ariaLabel={t("theme.mode.label")}
              />
            </SettingRow>
            <SettingRow label={t("theme.color.label")}>
              <SelectMenu
                className="setting-select-menu"
                value={settings.color_theme}
                options={colorThemeOptions}
                onChange={(value) => onChange({ color_theme: value })}
                ariaLabel={t("theme.color.label")}
              />
            </SettingRow>
            <SettingRow label={t("settings.interfaceLanguage")}>
              <SelectMenu
                className="setting-select-menu"
                value={settings.ui_language}
                options={uiLanguageOptions}
                onChange={(value) => onChange({ ui_language: value })}
                ariaLabel={t("settings.interfaceLanguage")}
              />
            </SettingRow>
          </SettingSection>
        </div>

        <footer className="dialog-footer">
          <span className="auto-save-label">
            <Check size={14} />
            {t("settings.autoSaveNotice")}
          </span>
          <button type="button" className="secondary-button" onClick={onClose}>
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
      <h3 className="setting-section-title">
        <span className="setting-section-icon">{icon}</span>
        <span>{title}</span>
      </h3>
      <div className="setting-section-content">{children}</div>
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
      <div className="setting-row-text">
        <strong className="setting-row-label">{label}</strong>
        {description && <small className="setting-row-desc">{description}</small>}
      </div>
      <div className="setting-row-control">{children}</div>
    </div>
  );
}
