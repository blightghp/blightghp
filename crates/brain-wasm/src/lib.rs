#![forbid(unsafe_code)]

use brain_engine::{
    CorticalLayer, LaminarConfig, LaminarEngine, Seconds, ENGINE_SCHEMA_VERSION, LAYER_COUNT,
};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct WasmLaminarEngine {
    inner: LaminarEngine,
}

#[wasm_bindgen]
impl WasmLaminarEngine {
    /// Creates the Wasm-facing engine with a fixed step in seconds.
    ///
    /// # Errors
    ///
    /// Returns a JavaScript error when the step is not positive and finite.
    #[wasm_bindgen(constructor)]
    pub fn new(dt_seconds: f64) -> Result<Self, JsValue> {
        let config = LaminarConfig {
            dt: Seconds::try_new(dt_seconds)
                .map_err(|error| JsValue::from_str(&error.to_string()))?,
            ..LaminarConfig::default()
        };
        LaminarEngine::new(config)
            .map(|inner| Self { inner })
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }

    #[must_use]
    pub fn schema_version() -> u32 {
        ENGINE_SCHEMA_VERSION
    }

    #[must_use]
    pub fn tick(&self) -> u64 {
        self.inner.tick()
    }

    pub fn reset(&mut self) {
        self.inner.reset();
    }

    /// Advances one fixed tick with an external drive applied to layer IV.
    ///
    /// # Errors
    ///
    /// Returns a JavaScript error when the drive is negative or non-finite.
    pub fn step_with_layer_four_drive(&mut self, drive: f64) -> Result<(), JsValue> {
        let mut external_drive = [0.0; LAYER_COUNT];
        external_drive[CorticalLayer::L4.index()] = drive;
        self.inner
            .step(external_drive)
            .map(|_| ())
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }

    #[must_use]
    pub fn excitatory(&self) -> Vec<f64> {
        self.inner.snapshot().excitatory.to_vec()
    }

    #[must_use]
    pub fn inhibitory(&self) -> Vec<f64> {
        self.inner.snapshot().inhibitory.to_vec()
    }
}
