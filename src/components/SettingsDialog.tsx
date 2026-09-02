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
import { SelectMenu } from "./SelectMenu";
import { AUDIO_SOURCE_OPTIONS, LANGUAGE_OPTIONS, type AppSettings } from "../types";

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
      setApiKeyError(String(error));
    }
  }

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
            <div className="eyebrow">PREFERENCES</div>
            <h2 id="settings-title">设置</h2>
          </div>
          <button className="icon-button subtle" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </header>
        <div className="settings-body">
          <SettingSection icon={<Mic size={17} />} title="音频">
            <SettingRow label="默认来源" description="系统声音适合观看视频。">
              <SelectMenu
                className="setting-select-menu"
                value={settings.audio_source}
                options={AUDIO_SOURCE_OPTIONS}
                onChange={(value) => onChange({ audio_source: value })}
                ariaLabel="默认音频来源"
              />
            </SettingRow>
            <SettingRow label="翻译声音" description="默认关闭，避免声音被再次采集。">
              <button
                className={"toggle " + (settings.playback_enabled ? "on" : "")}
                onClick={() => onChange({ playback_enabled: !settings.playback_enabled })}
                aria-pressed={settings.playback_enabled}
              >
                <span />
                <b>{settings.playback_enabled ? "开" : "关"}</b>
              </button>
            </SettingRow>
          </SettingSection>
          <SettingSection icon={<Languages size={17} />} title="语言">
            <SettingRow label="源语言" description="Live Translate 会自动识别输入语音。">
              <span className="setting-static">自动识别</span>
            </SettingRow>
            <SettingRow label="目标语言">
              <SelectMenu
                className="setting-select-menu"
                value={settings.target_language}
                options={LANGUAGE_OPTIONS}
                onChange={(value) => onChange({ target_language: value })}
                ariaLabel="目标语言"
              />
            </SettingRow>
          </SettingSection>
          <SettingSection icon={<PanelTop size={17} />} title="字幕浮窗">
            <SettingRow label="显示原文">
              <button
                className={"toggle " + (settings.show_original ? "on" : "")}
                onClick={() => onChange({ show_original: !settings.show_original })}
                aria-pressed={settings.show_original}
              >
                <span />
                <b>{settings.show_original ? "开" : "关"}</b>
              </button>
            </SettingRow>
            <SettingRow label={"字体大小 " + settings.overlay_font_size + "px"}>
              <input
                className="range-input"
                type="range"
                min="18"
                max="48"
                value={settings.overlay_font_size}
                onChange={(event) => onChange({ overlay_font_size: Number(event.target.value) })}
              />
            </SettingRow>
            <SettingRow label={"背景不透明度 " + Math.round(settings.overlay_opacity * 100) + "%"}>
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
                打开浮窗
              </button>
              <button className="text-button" onClick={onCloseCaption}>
                <X size={15} />
                关闭浮窗
              </button>
            </div>
          </SettingSection>
          <SettingSection icon={<VolumeX size={17} />} title="关于">
            <p className="settings-note">字幕会保留在本次会话中，可从主窗口复制或导出。</p>
          </SettingSection>
          <SettingSection icon={<KeyRound size={17} />} title="Gemini">
            <SettingRow
              label="API Key"
              description={apiKeyConfigured ? "已保存到系统凭据存储。" : "保存后即可开始翻译。"}
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
                      apiKeyConfigured ? "已保存；输入新 Key 以替换" : "粘贴 Gemini API Key"
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
                      "已保存"
                    ) : (
                      "保存"
                    )}
                  </button>
                </div>
                {apiKeySaveState === "saved" && (
                  <small className="api-key-feedback success">
                    <Check size={13} />
                    已保存到系统凭据存储
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
            设置自动保存，音频设置下次会话生效
          </span>
          <button className="primary-button" onClick={onClose}>
            完成
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
