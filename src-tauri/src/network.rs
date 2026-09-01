mod proxy;

pub use proxy::connect_websocket;

pub fn initialize_tls() {
    let _ = rustls::crypto::ring::default_provider().install_default();
}
