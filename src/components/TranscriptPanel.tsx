import { useState } from "react";
import { Copy, Download, Eye, EyeOff, ListFilter, PanelTop, Search, Trash2 } from "lucide-react";
import { filterTranscript } from "../lib/transcript";
import type { AudioSource, SessionStatus, TranscriptEntry } from "../types";

const AUDIO_SOURCE_LABEL: Record<AudioSource, string> = {
  system: "系统声音",
  microphone: "麦克风",
  mixed: "系统声音 + 麦克风",
};

export function TranscriptPanel({
  entries,
  session,
  audioSource,
  showOriginal,
  onToggleOriginal,
  onOpenCaption,
  onClear,
  onCopy,
  onExport,
}: {
  entries: TranscriptEntry[];
  session: SessionStatus;
  audioSource: AudioSource;
  showOriginal: boolean;
  onToggleOriginal: () => void;
  onOpenCaption: () => void;
  onClear: () => void;
  onCopy: (entries: TranscriptEntry[]) => void;
  onExport: (entries: TranscriptEntry[]) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = filterTranscript(entries, query);

  return (
    <section className="workspace-card">
      <div className="workspace-toolbar">
        <div>
          <div className="section-title">实时字幕</div>
          <div className="section-caption">本次会话 · {entries.length} 条记录</div>
        </div>
        <div className="toolbar-actions">
          <label className="search-box">
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索字幕"
            />
          </label>
          <button
            className="toolbar-button"
            onClick={onToggleOriginal}
            title={showOriginal ? "隐藏原文" : "显示原文"}
          >
            {showOriginal ? <Eye size={16} /> : <EyeOff size={16} />}原文
          </button>
          <button className="toolbar-button" onClick={onOpenCaption}>
            <PanelTop size={16} />
            打开浮窗
          </button>
          <button
            className="icon-button subtle"
            onClick={onClear}
            aria-label="清空记录"
            title="清空记录"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      <div className="transcript-list">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <ListFilter size={21} />
            </div>
            <h2>{query ? "没有找到匹配字幕" : "准备好开始了吗？"}</h2>
            <p>
              {query
                ? "换一个关键词试试。"
                : "点击“开始翻译”，字幕会出现在这里。浮窗可以叠加在视频上方。"}
            </p>
          </div>
        ) : (
          filtered.map((entry) => (
            <article
              className={"transcript-row " + (entry.is_final ? "final" : "partial")}
              key={entry.id}
            >
              <time>{entry.timestamp}</time>
              <div className="transcript-content">
                <div className="translation-line">{entry.translation || "……"}</div>
                {showOriginal && <div className="source-line">{entry.source}</div>}
              </div>
              {!entry.is_final && <span className="live-label">实时</span>}
            </article>
          ))
        )}
      </div>
      <footer className="workspace-footer">
        <div className="footer-status">
          <span className={"audio-bars " + (session.state === "listening" ? "active" : "")}>
            <i />
            <i />
            <i />
            <i />
          </span>
          {session.state === "listening"
            ? `正在接收${AUDIO_SOURCE_LABEL[audioSource]}`
            : `${AUDIO_SOURCE_LABEL[audioSource]}未启动`}
        </div>
        <div className="footer-actions">
          <button
            className="text-button"
            onClick={() => void onCopy(filtered)}
            disabled={filtered.length === 0}
          >
            <Copy size={15} />
            复制字幕
          </button>
          <button
            className="text-button"
            onClick={() => void onExport(filtered)}
            disabled={filtered.length === 0}
          >
            <Download size={15} />
            导出
          </button>
        </div>
      </footer>
    </section>
  );
}
