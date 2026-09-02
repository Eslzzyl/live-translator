# Live Translator

跨平台实时字幕翻译桌面应用的初版。它面向观看无字幕外语直播或视频的场景：

- 通过 Gemini Live Translate 接收系统音频或麦克风音频。
- 同时显示原文转写和中文翻译，支持实时更新和最终句。
- 支持历史字幕搜索、复制、导出，以及独立置顶字幕浮窗。
- 默认丢弃模型返回音频；在设置中启用后，可以通过默认扬声器播放。
- 设置写入应用配置目录，Gemini API Key 写入系统凭据存储。
- Gemini WebSocket 自动遵循 Windows、macOS、Linux 的系统代理设置；未启用系统代理时直连。

## 目录结构

前端按功能拆分为 components、hooks、lib、styles。Rust 后端按边界拆分为：

- models.rs：前后端共享的数据模型。
- settings.rs：配置和字幕导出。
- credentials.rs：系统凭据存储。
- audio.rs：CPAL 音频采集、混音和可选播放。
- gemini.rs：Gemini Live WebSocket 协议和字幕事件解析。
- session.rs：会话线程、重连和生命周期。
- commands.rs：Tauri 命令与运行状态。

## 开发

```text
pnpm install
pnpm tauri dev
```

打开设置，保存 Gemini API Key，然后选择音频来源并开始翻译。

系统声音采集使用 CPAL 的跨平台设备接口。Windows 优先使用 WASAPI 对当前默认输出设备进行回录，也兼容“立体声混音”等输入设备；Linux 可选择 PipeWire/PulseAudio monitor 输入；macOS 通常需要 BlackHole 等虚拟音频设备。麦克风采集使用 CPAL 的跨平台默认输入设备。

## 验证

```text
pnpm build
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```
