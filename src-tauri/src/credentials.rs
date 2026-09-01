const SERVICE: &str = "com.eslzzyl.live-translator";
const USERNAME: &str = "gemini-api-key";

pub fn read_api_key() -> Result<Option<String>, String> {
    if let Ok(value) = std::env::var("GEMINI_API_KEY") {
        if !value.trim().is_empty() {
            return Ok(Some(value));
        }
    }

    let entry = keyring::Entry::new(SERVICE, USERNAME)
        .map_err(|error| format!("无法访问系统凭据存储：{error}"))?;
    match entry.get_password() {
        Ok(value) if !value.trim().is_empty() => Ok(Some(value)),
        Ok(_) => Ok(None),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(format!("无法读取 Gemini API Key：{error}")),
    }
}

pub fn save_api_key(value: &str) -> Result<(), String> {
    let value = value.trim();
    if value.is_empty() {
        return Err("API Key 不能为空。".into());
    }

    let entry = keyring::Entry::new(SERVICE, USERNAME)
        .map_err(|error| format!("无法访问系统凭据存储：{error}"))?;
    entry
        .set_password(value)
        .map_err(|error| format!("无法保存 Gemini API Key：{error}"))
}
