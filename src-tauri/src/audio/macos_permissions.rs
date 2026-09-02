use block2::StackBlock;
use libloading::{Library, Symbol};
use objc2_core_foundation::{CFRetained, CFString};
use std::{ffi::c_void, sync::OnceLock};

use crate::models::AppError;

const TCC_FRAMEWORK: &str = "/System/Library/PrivateFrameworks/TCC.framework/Versions/A/TCC";
const TCC_SERVICE: &str = "kTCCServiceAudioCapture";

fn load_tcc() -> Option<&'static Library> {
    static LIBRARY: OnceLock<Option<Library>> = OnceLock::new();

    LIBRARY
        .get_or_init(|| unsafe { Library::new(TCC_FRAMEWORK) }.ok())
        .as_ref()
}

fn tcc_service() -> CFRetained<CFString> {
    CFString::from_str(TCC_SERVICE)
}

fn check_system_audio_permission() -> bool {
    let Some(lib) = load_tcc() else {
        return false;
    };

    unsafe {
        let Ok(preflight): Result<
            Symbol<unsafe extern "C" fn(*const c_void, *const c_void) -> i32>,
            _,
        > = lib.get(b"TCCAccessPreflight\0") else {
            return false;
        };
        let service = tcc_service();
        preflight(&*service as *const _ as *const c_void, std::ptr::null()) == 0
    }
}

fn request_system_audio_permission() -> bool {
    let Some(lib) = load_tcc() else {
        return false;
    };

    unsafe {
        let Ok(request): Result<
            Symbol<unsafe extern "C" fn(*const c_void, *const c_void, *const c_void)>,
            _,
        > = lib.get(b"TCCAccessRequest\0") else {
            return false;
        };

        let (tx, rx) = std::sync::mpsc::sync_channel::<bool>(1);
        // TCC copies the block internally. Store the sender pointer as usize
        // so the closure remains Copy and does not double-drop the sender.
        let tx_ptr = Box::into_raw(Box::new(tx)) as usize;
        let completion = StackBlock::new(move |granted: u8| {
            let tx = Box::from_raw(tx_ptr as *mut std::sync::mpsc::SyncSender<bool>);
            let _ = tx.send(granted != 0);
        });
        let service = tcc_service();
        request(
            &*service as *const _ as *const c_void,
            std::ptr::null(),
            &completion as *const _ as *const c_void,
        );
        rx.recv().unwrap_or(false)
    }
}

pub fn ensure_system_audio_permission() -> Result<(), AppError> {
    if check_system_audio_permission() || request_system_audio_permission() {
        return Ok(());
    }

    Err(AppError::new("audio.system_permission_required"))
}
