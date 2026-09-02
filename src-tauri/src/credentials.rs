const SERVICE: &str = "com.eslzzyl.live-translator";
const USERNAME: &str = "gemini-api-key";

use crate::models::AppError;

pub fn read_api_key() -> Result<Option<String>, AppError> {
    if let Ok(value) = std::env::var("GEMINI_API_KEY") {
        if !value.trim().is_empty() {
            return Ok(Some(value));
        }
    }

    let entry = keyring::Entry::new(SERVICE, USERNAME)
        .map_err(|error| AppError::with_detail("credentials.read_failed", error.to_string()))?;
    match entry.get_password() {
        Ok(value) if !value.trim().is_empty() => Ok(Some(value)),
        Ok(_) => Ok(None),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(AppError::with_detail(
            "credentials.read_failed",
            error.to_string(),
        )),
    }
}

pub fn save_api_key(value: &str) -> Result<(), AppError> {
    let value = value.trim();
    if value.is_empty() {
        return Err(AppError::new("credentials.empty_key"));
    }

    let entry = keyring::Entry::new(SERVICE, USERNAME)
        .map_err(|error| AppError::with_detail("credentials.save_failed", error.to_string()))?;
    entry
        .set_password(value)
        .map_err(|error| AppError::with_detail("credentials.save_failed", error.to_string()))
}
