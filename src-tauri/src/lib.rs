use std::sync::atomic::AtomicBool;
use std::sync::Arc;

mod audio;
mod commands;
mod credentials;
mod gemini;
mod models;
mod network;
mod session;
mod settings;
mod windows;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    network::initialize_tls();
    let state = commands::AppState::new();
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .max_file_size(5_000_000)
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepAll)
                .timezone_strategy(tauri_plugin_log::TimezoneStrategy::UseLocal)
                .build(),
        )
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::save_settings,
            commands::export_transcript,
            commands::get_api_key_status,
            commands::save_api_key,
            commands::start_translation,
            commands::stop_translation,
            commands::get_transcription_tail,
            commands::clear_transcription,
            windows::open_caption_window,
            windows::close_caption_window
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    let shutdown_requested = Arc::new(AtomicBool::new(false));
    app.run(move |app_handle, event| {
        windows::handle_run_event(app_handle, &event, &shutdown_requested);
    });
}
