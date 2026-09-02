use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::webview::{PageLoadEvent, WebviewWindowBuilder};
use tauri::{AppHandle, Manager, WebviewUrl};
use tokio::sync::oneshot;
use tokio::time::timeout;

use crate::models::AppError;

const CAPTION_LABEL: &str = "caption";
const MAIN_LABEL: &str = "main";
const CAPTION_LOAD_TIMEOUT: Duration = Duration::from_secs(10);

#[tauri::command]
pub async fn open_caption_window(app: AppHandle) -> Result<(), AppError> {
    if let Some(window) = app.get_webview_window(CAPTION_LABEL) {
        window
            .show()
            .map_err(|error| AppError::with_detail("window.caption_show", error.to_string()))?;
        window
            .set_focus()
            .map_err(|error| AppError::with_detail("window.caption_focus", error.to_string()))?;
        return Ok(());
    }

    let (ready_sender, ready_receiver) = oneshot::channel();
    let ready_sender = Arc::new(Mutex::new(Some(ready_sender)));
    let callback_sender = Arc::clone(&ready_sender);

    WebviewWindowBuilder::new(
        &app,
        CAPTION_LABEL,
        WebviewUrl::App("index.html?window=caption".into()),
    )
    .title("Live Translator")
    .inner_size(760.0, 170.0)
    .min_inner_size(360.0, 100.0)
    .decorations(false)
    .always_on_top(true)
    .resizable(true)
    .skip_taskbar(true)
    .visible(false)
    .on_page_load(move |window, payload| {
        if payload.event() != PageLoadEvent::Finished {
            return;
        }

        let result = window
            .show()
            .map_err(|error| AppError::with_detail("window.caption_show", error.to_string()));
        let sender = callback_sender
            .lock()
            .ok()
            .and_then(|mut sender| sender.take());

        if let Some(sender) = sender {
            let _ = sender.send(result);
        }
    })
    .build()
    .map_err(|error| AppError::with_detail("window.caption_create", error.to_string()))?;

    timeout(CAPTION_LOAD_TIMEOUT, ready_receiver)
        .await
        .map_err(|_| AppError::new("window.caption_load_timeout"))?
        .map_err(|_| AppError::new("window.caption_ready_lost"))?
}

#[tauri::command]
pub fn close_caption_window(app: AppHandle) -> Result<(), AppError> {
    let Some(window) = app.get_webview_window(CAPTION_LABEL) else {
        return Ok(());
    };

    window
        .close()
        .map_err(|error| AppError::with_detail("window.caption_close", error.to_string()))
}

pub fn handle_run_event(app: &AppHandle, event: &tauri::RunEvent, shutdown_requested: &AtomicBool) {
    match event {
        tauri::RunEvent::WindowEvent {
            label,
            event: tauri::WindowEvent::CloseRequested { api, .. },
            ..
        } if label == MAIN_LABEL => {
            if !shutdown_requested.swap(true, Ordering::SeqCst) {
                api.prevent_close();
                close_caption_then_main(app);
            }
        }
        tauri::RunEvent::WindowEvent {
            label,
            event: tauri::WindowEvent::Destroyed,
            ..
        } if label == CAPTION_LABEL && shutdown_requested.load(Ordering::SeqCst) => {
            close_main_after_caption(app);
        }
        tauri::RunEvent::WindowEvent {
            label,
            event: tauri::WindowEvent::Destroyed,
            ..
        } if label == MAIN_LABEL => {
            if let Some(caption) = app.get_webview_window(CAPTION_LABEL) {
                let _ = caption.close();
            } else {
                app.exit(0);
            }
        }
        _ => {}
    }
}

fn close_caption_then_main(app: &AppHandle) {
    if let Some(caption) = app.get_webview_window(CAPTION_LABEL) {
        if let Err(error) = caption.close() {
            eprintln!("failed to close caption window during shutdown: {error}");
            let _ = caption.destroy();
            close_main_after_caption(app);
        }
    } else {
        close_main_after_caption(app);
    }
}

fn close_main_after_caption(app: &AppHandle) {
    if let Some(main) = app.get_webview_window(MAIN_LABEL) {
        if let Err(error) = main.close() {
            eprintln!("failed to close main window during shutdown: {error}");
            let _ = main.destroy();
            app.exit(1);
        }
    } else {
        app.exit(0);
    }
}
