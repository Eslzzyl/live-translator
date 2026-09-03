# Live Translator

桌面端实时字幕与语音转写工具。直接捕获系统发声或麦克风输入，通过 Gemini Live 的双向流式连接，实时输出双语对照字幕或纯文本转写。

面向无字幕外语直播、生肉视频观看、跨国音视频会议等日常场景设计。

[English](README_en.md) | [简体中文](README.md)

[![Tauri v2](https://img.shields.io/badge/Tauri-v2-24C8DB?style=flat-square)](https://v2.tauri.app/)
[![Rust](https://img.shields.io/badge/Rust-2021-DEA584?style=flat-square)](https://www.rust-lang.org/)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?style=flat-square)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square)](https://www.typescriptlang.org/)

---

<!-- 截图位置：主窗口与置顶字幕浮窗 -->
<p align="center">
  <img src="https://github-imagebed.eslzzyl.eu.org/live-translator/preview.jpg" alt="Live Translator 界面预览" width="820" />
</p>

---

## 主要功能

- **实时翻译与纯转写双模式**
  - 翻译模式：基于 `models/gemini-3.5-live-translate-preview`，同时展示原文转写与目标语言翻译，支持流式实时修正与最终断句。
  - 转写模式：基于 `models/gemini-3.5-transcribe-live`，专注语音转文字，支持“原样转写”与“智能整理”双重样式。

- **无需安装虚拟声卡**
  - Windows：通过 WASAPI 回环（Loopback）直接采集当前默认输出设备发声。
  - macOS：基于 macOS 14.6+ 原生 CoreAudio Tap 录制系统声音，无需安装 BlackHole 等虚拟声卡驱动。
  - Linux：支持接入 PipeWire 或 PulseAudio 的 Monitor 监听声道。
  - 输入源支持选择“系统声音”、“麦克风”或两者“双流混音”。

- **置顶透明字幕窗**
  - 独立的无边框浮窗，始终置顶在全屏播放器或会议软件上方。
  - 文本采用平滑位移动画与流式渐显，减少字幕跳动感；可在设置中实时调整背景透明度（0.1 ~ 1.0）与字体大小（12px ~ 96px）。

- **系统代理自适应**
  - 自动读取并遵循 Windows / macOS / Linux 的系统代理设置并建立 TLS 隧道，代理环境下无需手动配置额外参数。

- **本地加密与临时内存存储**
  - API Key 采用 ChaCha20-Poly1305 加密存放在本地应用配置目录（Unix 权限为 `0600`），不存明文；也支持直接通过环境变量 `GEMINI_API_KEY` 传入。
  - 字幕历史仅保存在当前会话的内存中，长列表采用虚拟滚动渲染，关闭应用自动清空，不向本地持久化写盘；需要留存时可随时一键导出为 TXT。

- **多语言与主题外观**
  - 提供简体中文与英文界面。
  - 支持深色、浅色及跟随系统，内置 Zinc、Midnight、Nord、Forest、Sepia 五套主题配色。
  - 默认隔离模型合成音频回放，避免回放声音被麦克风或扬声器回环二次采集。

---

## 快速开始

### 运行环境

- Node.js >= 20.19.0
- pnpm
- Rust >= 1.77.2
- 系统依赖：
  - Windows: WebView2（系统自带）
  - macOS: >= 14.6（用于原生系统声音录制）
  - Linux: `libwebkit2gtk-4.1-dev`, `libssl-dev`, `libasound2-dev`

### 本地运行

1. 克隆仓库并安装依赖：

   ```bash
   git clone https://github.com/Eslzzyl/live-translator.git
   cd live-translator
   pnpm install
   ```

2. 启动开发环境：

   ```bash
   pnpm tauri dev
   ```

3. 使用步骤：
   - 打开设置，保存你的 Gemini API Key（可在 [Google AI Studio](https://aistudio.google.com/) 获取），或直接配置环境变量 `GEMINI_API_KEY`。
   - 选择声音来源与工作模式（翻译或转写）。
   - 点击开始，打开字幕浮窗即可悬浮在视频或会议界面上使用。

---

## 平台支持

| 操作系统    | 采集机制              | 权限与说明                                                                                   |
| :---------- | :-------------------- | :------------------------------------------------------------------------------------------- |
| **Windows** | WASAPI Loopback       | 开箱即用，直接捕获默认输出设备发声。                                                         |
| **macOS**   | CoreAudio Tap         | 需要 macOS 14.6 或更高版本。首次使用系统声音采集时，请在系统弹窗中允许“音频与屏幕录制”权限。 |
| **Linux**   | PulseAudio / PipeWire | 开箱即用，自动接入默认音频服务的 Monitor 通道。                                              |
