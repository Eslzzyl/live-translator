use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio_tungstenite::{client_async_tls_with_config, connect_async, tungstenite};

use crate::models::AppError;

const GEMINI_HOST: &str = "generativelanguage.googleapis.com:443";
const MAX_PROXY_RESPONSE_SIZE: usize = 16 * 1024;

type WebSocketConnection = (
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<TcpStream>>,
    tungstenite::handshake::client::Response,
);

#[derive(Debug)]
struct ProxyEndpoint {
    host: String,
    port: u16,
    bypass: String,
}

pub async fn connect_websocket(url: &str) -> Result<WebSocketConnection, AppError> {
    let Some(proxy) = system_proxy()? else {
        return connect_async(url).await.map_err(|error| {
            AppError::with_detail("network.direct_connection_failed", error.to_string())
        });
    };

    if proxy_bypasses_gemini(&proxy.bypass) {
        return connect_async(url).await.map_err(|error| {
            AppError::with_detail("network.direct_connection_failed", error.to_string())
        });
    }

    let mut stream = TcpStream::connect((proxy.host.as_str(), proxy.port))
        .await
        .map_err(|error| {
            AppError::with_detail(
                "network.proxy_connection_failed",
                format!("{}:{}: {error}", proxy.host, proxy.port),
            )
        })?;

    establish_http_tunnel(&mut stream).await?;

    client_async_tls_with_config(url, stream, None, None)
        .await
        .map_err(|error| AppError::with_detail("network.proxy_websocket_failed", error.to_string()))
}

fn system_proxy() -> Result<Option<ProxyEndpoint>, AppError> {
    #[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
    {
        let proxy = sysproxy::Sysproxy::get_system_proxy().map_err(|error| {
            AppError::with_detail("network.proxy_settings_failed", error.to_string())
        })?;
        if !proxy.enable || proxy.host.trim().is_empty() || proxy.port == 0 {
            return Ok(None);
        }
        Ok(Some(ProxyEndpoint {
            host: proxy.host,
            port: proxy.port,
            bypass: proxy.bypass,
        }))
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        Ok(None)
    }
}

async fn establish_http_tunnel(stream: &mut TcpStream) -> Result<(), AppError> {
    let request = format!(
        "CONNECT {GEMINI_HOST} HTTP/1.1\r\nHost: {GEMINI_HOST}\r\nProxy-Connection: Keep-Alive\r\n\r\n"
    );
    stream
        .write_all(request.as_bytes())
        .await
        .map_err(|error| {
            AppError::with_detail("network.proxy_connect_request_failed", error.to_string())
        })?;

    let mut response = Vec::with_capacity(1024);
    let mut chunk = [0_u8; 1024];
    let header_end = loop {
        let count = stream.read(&mut chunk).await.map_err(|error| {
            AppError::with_detail("network.proxy_response_read_failed", error.to_string())
        })?;
        if count == 0 {
            return Err(AppError::new("network.proxy_closed"));
        }
        response.extend_from_slice(&chunk[..count]);
        if let Some(position) = response.windows(4).position(|window| window == b"\r\n\r\n") {
            break position + 4;
        }
        if response.len() > MAX_PROXY_RESPONSE_SIZE {
            return Err(AppError::new("network.proxy_header_too_large"));
        }
    };

    let header = String::from_utf8_lossy(&response[..header_end]);
    let status = header
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|code| code.parse::<u16>().ok());
    if status != Some(200) {
        return Err(AppError::with_detail(
            "network.proxy_status",
            status.map_or_else(|| "invalid status".into(), |code| code.to_string()),
        ));
    }
    Ok(())
}

fn proxy_bypasses_gemini(bypass: &str) -> bool {
    bypass.split([';', ',', ' ', '\t']).any(|raw_rule| {
        let rule = raw_rule.trim().trim_start_matches("<local>").trim();
        if rule.is_empty() {
            return false;
        }
        if rule == "*" {
            return true;
        }
        let rule = rule
            .strip_prefix("*.")
            .or_else(|| rule.strip_prefix('.'))
            .unwrap_or(rule);
        rule.eq_ignore_ascii_case("generativelanguage.googleapis.com")
            || "generativelanguage.googleapis.com".ends_with(&format!(".{rule}"))
    })
}

#[cfg(test)]
mod tests {
    use super::proxy_bypasses_gemini;

    #[test]
    fn bypass_rules_match_gemini_host() {
        assert!(proxy_bypasses_gemini("localhost;*.googleapis.com"));
        assert!(proxy_bypasses_gemini("generativelanguage.googleapis.com"));
        assert!(!proxy_bypasses_gemini("localhost;127.0.0.1"));
    }
}
