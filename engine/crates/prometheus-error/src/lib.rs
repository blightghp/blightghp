#![forbid(unsafe_code)]
//! # `prometheus-error`
//!
//! L0 — Error Taxonomy.
//! Canonical error type for the PROMETHEUS engine.

use thiserror::Error;

/// The class of an error, determining the recovery and degradation strategy.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ErrorClass {
    /// A recoverable failure: the subsystem continues with a placeholder or degraded path.
    Degradable,
    /// A failure that invalidates the current frame, but not the process.
    FrameFatal,
    /// A failure that invalidates the session, requiring a world unload.
    SessionFatal,
}

/// The canonical engine error.
/// Zero heap allocations in hot paths.
#[derive(Debug, Error)]
pub enum EngineError {
    /// A declared API surface that is not yet implemented.
    #[error("[{crate_name}] not implemented: {symbol}")]
    NotImplemented {
        /// The crate name.
        crate_name: &'static str,
        /// The unimplemented symbol.
        symbol: &'static str,
    },

    /// An invalid argument was passed to a function.
    #[error("[{crate_name}] invalid argument in {symbol}: {reason}")]
    InvalidArgument {
        /// The crate name.
        crate_name: &'static str,
        /// The symbol rejecting the input.
        symbol: &'static str,
        /// The reason for rejection.
        reason: &'static str,
    },

    /// A required resource is missing.
    #[error("[{crate_name}] resource missing: {resource}")]
    ResourceMissing {
        /// The crate name.
        crate_name: &'static str,
        /// The missing resource identifier.
        resource: &'static str,
    },

    /// Frame arena allocation failed.
    #[error("arena exhausted: requested {requested}, available {available}")]
    ArenaExhausted {
        /// Requested bytes.
        requested: usize,
        /// Available bytes.
        available: usize,
    },

    /// A failure in the graphics device.
    #[error("graphics device failure: {reason}")]
    GraphicsDevice {
        /// The reason for the failure.
        reason: &'static str,
    },

    /// A VRAM leak was detected.
    #[error("VRAM leak: baseline {baseline}, current {current}")]
    VramLeak {
        /// The baseline bytes.
        baseline: u64,
        /// The current bytes.
        current: u64,
    },

    /// An I/O failure in the asset pipeline.
    #[error("asset IO failure: {reason}")]
    AssetIo {
        /// The reason for the failure.
        reason: &'static str,
    },

    /// A failure in the WASM sandbox.
    #[error("WASM sandbox failure: {reason}")]
    WasmSandbox {
        /// The reason for the failure.
        reason: &'static str,
    },

    /// A serialization contract was violated.
    #[error("[{crate_name}] serialization failure: {reason}")]
    Serialization {
        /// The crate name.
        crate_name: &'static str,
        /// The reason for the failure.
        reason: &'static str,
    },

    /// A concurrency invariant was violated.
    #[error("[{crate_name}] concurrency failure: {reason}")]
    Concurrency {
        /// The crate name.
        crate_name: &'static str,
        /// The reason for the failure.
        reason: &'static str,
    },
}

impl EngineError {
    /// Returns the error class for this error.
    pub fn class(&self) -> ErrorClass {
        match self {
            Self::NotImplemented { .. }
            | Self::ResourceMissing { .. }
            | Self::AssetIo { .. }
            | Self::WasmSandbox { .. } => ErrorClass::Degradable,
            Self::InvalidArgument { .. } | Self::ArenaExhausted { .. } | Self::Serialization { .. } => {
                ErrorClass::FrameFatal
            }
            Self::GraphicsDevice { .. } | Self::VramLeak { .. } | Self::Concurrency { .. } => ErrorClass::SessionFatal,
        }
    }
}

/// A convenient result type used throughout the workspace.
pub type EngineResult<T> = core::result::Result<T, EngineError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_classes() {
        let degradable = EngineError::NotImplemented { crate_name: "test", symbol: "test" };
        assert_eq!(degradable.class(), ErrorClass::Degradable);

        let frame_fatal = EngineError::ArenaExhausted { requested: 100, available: 0 };
        assert_eq!(frame_fatal.class(), ErrorClass::FrameFatal);

        let session_fatal = EngineError::GraphicsDevice { reason: "OOM" };
        assert_eq!(session_fatal.class(), ErrorClass::SessionFatal);
    }

    #[test]
    fn error_is_send_sync_static() {
        fn assert_bounds<T: Send + Sync + 'static>() {}
        assert_bounds::<EngineError>();
    }
}
