use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use chacha20poly1305::aead::{Aead, AeadCore, KeyInit, OsRng};
use chacha20poly1305::{ChaCha20Poly1305, Nonce};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

use crate::models::AppError;

const API_KEY_FILE_NAME: &str = "api-key";
const FILE_VERSION: u8 = 1;
const NONCE_LENGTH: usize = 12;
const FIXED_KEY_MATERIAL: &[u8] = b"live-translator";
static NEXT_TEMP_FILE_ID: AtomicU64 = AtomicU64::new(0);

fn api_key_path(app: &AppHandle) -> Result<PathBuf, AppError> {
    let directory = app
        .path()
        .app_config_dir()
        .map_err(|error| AppError::with_detail("credentials.path", error.to_string()))?;
    fs::create_dir_all(&directory)
        .map_err(|error| AppError::with_detail("credentials.directory", error.to_string()))?;
    restrict_directory_permissions(&directory)
        .map_err(|error| AppError::with_detail("credentials.directory", error.to_string()))?;
    Ok(directory.join(API_KEY_FILE_NAME))
}

pub fn read_api_key(app: &AppHandle) -> Result<Option<String>, AppError> {
    if let Ok(value) = std::env::var("GEMINI_API_KEY") {
        let value = value.trim();
        if !value.is_empty() {
            return Ok(Some(value.to_owned()));
        }
    }

    let path = api_key_path(app)?;
    read_api_key_file(&path)
        .map_err(|error| AppError::with_detail("credentials.read_failed", error.to_string()))
}

pub fn save_api_key(app: &AppHandle, value: &str) -> Result<(), AppError> {
    let value = value.trim();
    if value.is_empty() {
        return Err(AppError::new("credentials.empty_key"));
    }

    let path = api_key_path(app)?;
    write_api_key_file(&path, value)
        .map_err(|error| AppError::with_detail("credentials.save_failed", error.to_string()))
}

fn read_api_key_file(path: &Path) -> io::Result<Option<String>> {
    match fs::read_to_string(path) {
        Ok(value) => {
            if value.trim().is_empty() {
                Ok(None)
            } else {
                let value = decrypt_api_key(value.trim())?;
                let value = value.trim();
                if value.is_empty() {
                    Ok(None)
                } else {
                    Ok(Some(value.to_owned()))
                }
            }
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error),
    }
}

fn write_api_key_file(path: &Path, value: &str) -> io::Result<()> {
    let encrypted_value = encrypt_api_key(value)?;
    let temp_path = temporary_path(path);
    let result = (|| {
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        restrict_file_permissions(&mut options);

        let mut file = options.open(&temp_path)?;
        file.write_all(encrypted_value.as_bytes())?;
        file.sync_all()?;
        drop(file);

        replace_file(&temp_path, path)
    })();

    if result.is_err() {
        let _ = fs::remove_file(&temp_path);
    }
    result
}

fn cipher() -> ChaCha20Poly1305 {
    let key = Sha256::digest(FIXED_KEY_MATERIAL);
    ChaCha20Poly1305::new_from_slice(&key).expect("SHA-256 output must be a valid cipher key")
}

fn encrypt_api_key(value: &str) -> io::Result<String> {
    let nonce = ChaCha20Poly1305::generate_nonce(&mut OsRng);
    let ciphertext = cipher()
        .encrypt(&nonce, value.as_bytes())
        .map_err(|_| invalid_api_key_file())?;

    let mut payload = Vec::with_capacity(1 + NONCE_LENGTH + ciphertext.len());
    payload.push(FILE_VERSION);
    payload.extend_from_slice(nonce.as_slice());
    payload.extend_from_slice(&ciphertext);
    Ok(STANDARD.encode(payload))
}

fn decrypt_api_key(value: &str) -> io::Result<String> {
    let payload = STANDARD.decode(value).map_err(|_| invalid_api_key_file())?;
    if payload.len() <= 1 + NONCE_LENGTH || payload[0] != FILE_VERSION {
        return Err(invalid_api_key_file());
    }

    let nonce = Nonce::from_slice(&payload[1..1 + NONCE_LENGTH]);
    let plaintext = cipher()
        .decrypt(nonce, &payload[1 + NONCE_LENGTH..])
        .map_err(|_| invalid_api_key_file())?;
    String::from_utf8(plaintext).map_err(|_| invalid_api_key_file())
}

fn invalid_api_key_file() -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, "invalid API key file")
}

fn temporary_path(path: &Path) -> PathBuf {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    let id = NEXT_TEMP_FILE_ID.fetch_add(1, Ordering::Relaxed);
    path.with_file_name(format!(".{API_KEY_FILE_NAME}.{timestamp}.{id}.tmp"))
}

#[cfg(unix)]
fn restrict_directory_permissions(path: &Path) -> io::Result<()> {
    use std::os::unix::fs::PermissionsExt;

    fs::set_permissions(path, fs::Permissions::from_mode(0o700))
}

#[cfg(not(unix))]
fn restrict_directory_permissions(_path: &Path) -> io::Result<()> {
    Ok(())
}

#[cfg(unix)]
fn restrict_file_permissions(options: &mut OpenOptions) {
    use std::os::unix::fs::OpenOptionsExt;

    options.mode(0o600);
}

#[cfg(not(unix))]
fn restrict_file_permissions(_options: &mut OpenOptions) {}

#[cfg(unix)]
fn replace_file(temp_path: &Path, path: &Path) -> io::Result<()> {
    fs::rename(temp_path, path)
}

#[cfg(not(unix))]
fn replace_file(temp_path: &Path, path: &Path) -> io::Result<()> {
    match fs::remove_file(path) {
        Ok(()) => {}
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(error) => return Err(error),
    }
    fs::rename(temp_path, path)
}

#[cfg(test)]
mod tests {
    use super::{read_api_key_file, write_api_key_file};
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn saves_and_reads_trimmed_api_key() {
        let directory = test_directory();
        fs::create_dir_all(&directory).expect("test directory should be created");
        let path = directory.join("api-key");

        write_api_key_file(&path, "test-key").expect("api key should be saved");

        assert_ne!(
            fs::read_to_string(&path).expect("encrypted api key should be readable"),
            "test-key"
        );
        assert_eq!(
            read_api_key_file(&path).expect("api key should be read"),
            Some("test-key".into())
        );
        cleanup(directory);
    }

    #[test]
    fn missing_or_empty_api_key_is_unconfigured() {
        let directory = test_directory();
        fs::create_dir_all(&directory).expect("test directory should be created");
        let path = directory.join("api-key");

        assert_eq!(
            read_api_key_file(&path).expect("missing key should be readable"),
            None
        );
        fs::write(&path, " \n").expect("empty file should be written");
        assert_eq!(
            read_api_key_file(&path).expect("empty file should be readable"),
            None
        );
        cleanup(directory);
    }

    #[test]
    fn rejects_invalid_api_key_file() {
        let directory = test_directory();
        fs::create_dir_all(&directory).expect("test directory should be created");
        let path = directory.join("api-key");

        fs::write(&path, "not encrypted").expect("invalid file should be written");

        assert!(read_api_key_file(&path).is_err());
        cleanup(directory);
    }

    fn test_directory() -> PathBuf {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after Unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("live-translator-credentials-{timestamp}"))
    }

    fn cleanup(path: PathBuf) {
        fs::remove_dir_all(path).expect("test directory should be removed");
    }
}
