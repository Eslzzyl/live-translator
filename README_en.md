# Live Translator

Real-time desktop subtitle translation and speech transcription tool. Captures system speaker output or microphone input directly, streaming real-time bilingual subtitles or plain-text transcription via bidirectional Gemini Live connections.

Designed for watching streams without subtitles, untranslated videos, cross-lingual meetings, and online lectures.

[English](README_en.md) | [简体中文](README.md)

[![Tauri v2](https://img.shields.io/badge/Tauri-v2-24C8DB?style=flat-square)](https://v2.tauri.app/)
[![Rust](https://img.shields.io/badge/Rust-2021-DEA584?style=flat-square)](https://www.rust-lang.org/)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?style=flat-square)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square)](https://www.typescriptlang.org/)

---

<!-- Screenshot: main window and floating caption window -->
<p align="center">
  <img src="https://github-imagebed.eslzzyl.eu.org/live-translator/preview.jpg" alt="Live Translator Preview" width="820" />
</p>

---

## Features

- **Dual Modes: Live Translation & Transcription**
  - Translation mode: Powered by `models/gemini-3.5-live-translate-preview`. Displays source transcription and target translation simultaneously, with real-time interim updates and finalized sentences.
  - Transcription mode: Powered by `models/gemini-3.5-transcribe-live`. Focuses purely on speech-to-text with "Verbatim" and "Smart" formatting styles.

- **Driver-Free Audio Capture**
  - Windows: Captures default playback output directly via WASAPI Loopback.
  - macOS: Uses native CoreAudio Tap on macOS 14.6+ without third-party virtual audio drivers like BlackHole.
  - Linux: Connects to PipeWire or PulseAudio monitor channels out of the box.
  - Supports selecting System Audio, Microphone, or Dual-Source Mixing.

- **Always-on-Top Transparent Overlay**
  - Independent borderless floating window that stays on top of full-screen media players and meeting software.
  - Smooth line entrance and text transitions to avoid jarring jumps; supports adjustable background opacity (0.1 - 1.0) and font size (12px - 96px).

- **Automatic System Proxy Detection**
  - Automatically reads system proxy settings across Windows, macOS, and Linux to establish HTTP CONNECT TLS tunnels without manual environment variable setup.

- **Local Encryption & In-Memory Privacy**
  - API keys are encrypted with ChaCha20-Poly1305 and stored in the local app config directory (with `0600` permissions on Unix); can also be passed directly via the `GEMINI_API_KEY` environment variable.
  - Transcripts reside solely in volatile memory during the current session, rendered via a virtualized list, and are wiped when the application exits; can be exported to a `.txt` file at any time.

- **Internationalization & Themes**
  - Interface available in Simplified Chinese and English.
  - Supports dark, light, and system theme modes with 5 built-in color schemes: Zinc, Midnight, Nord, Forest, and Sepia.
  - Model audio playback is isolated by default to prevent feedback loops.

---

## Quick Start

### Prerequisites

- Node.js >= 20.19.0
- pnpm
- Rust >= 1.77.2
- OS dependencies:
  - Windows: WebView2 (pre-installed on Windows 10/11)
  - macOS: >= 14.6 (for native system audio tap)
  - Linux: `libwebkit2gtk-4.1-dev`, `libssl-dev`, `libasound2-dev`

### Running Locally

1. Clone the repository and install dependencies:

   ```bash
   git clone https://github.com/Eslzzyl/live-translator.git
   cd live-translator
   pnpm install
   ```

2. Start the development environment:

   ```bash
   pnpm tauri dev
   ```

3. Setup & Usage:
   - Open Settings and save your Gemini API key (obtainable from [Google AI Studio](https://aistudio.google.com/)), or set the `GEMINI_API_KEY` environment variable.
   - Select your audio source and mode (Translation or Transcription).
   - Click start, and open the floating caption window to overlay it on top of your video or meeting.

---

## Platform Support

| Operating System | Audio Capture         | Permissions & Notes                                                                                         |
| :--------------- | :-------------------- | :---------------------------------------------------------------------------------------------------------- |
| **Windows**      | WASAPI Loopback       | Works out of the box. Captures the default output device directly.                                          |
| **macOS**        | CoreAudio Tap         | Requires macOS 14.6+. On first capture, allow the system prompt for audio and screen recording permissions. |
| **Linux**        | PulseAudio / PipeWire | Works out of the box. Connects to the monitor channel of the active audio server.                           |
