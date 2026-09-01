//! # prometheus-core
//!
//! Public facade for the **PROMETHEUS** engine — the native rendering backend
//! of BRAIN PRO. This crate re-exports all engine subsystems through a single,
//! version-controlled API surface.
//!
//! ## Architecture
//!
//! The PROMETHEUS engine follows a strict layered architecture inherited from
//! the Unrail Motor:
//!
//! | Layer | Crates | Purpose |
//! |:-----:|--------|---------|
//! | **L0** | `error`, `math`, `alloc` | Zero-dependency foundation |
//! | **L1** | `ecs`, `window` | Data substrate & platform |
//! | **L2** | `gpu`, `render-graph` | Hardware abstraction and frame planning |
//! | **L4** | `core` (this crate) | Public facade |
//!
//! ## Invariant: Scientific Core Isolation (GFX-001)
//!
//! The rendering engine **never** modifies the scientific state of `brain-engine`.
//! All data flows unidirectionally: `brain-engine` → `prometheus-core` (read-only).
//! The 5 golden 64-bit state hashes remain invariant regardless of visual fidelity.

// ============================================================================
// Explicit re-exports (no glob imports — ADR-0014 pattern)
// ============================================================================

/// Error taxonomy and result types for engine operations.
pub mod error {
    pub use prometheus_error::{EngineError, EngineResult, ErrorClass};
}

/// Spatial math primitives with GPU-ready memory layouts.
pub mod math {
    pub use prometheus_math::{Aabb, Mat3, Mat4, Quat, Transform, Vec2, Vec3, Vec4, EPSILON, GRAVITY_Y};
}

/// Pre-allocated arena memory for zero-allocation frame ticks.
pub mod alloc {
    pub use prometheus_alloc::{ArenaEnd, ArenaMarker, FrameArena, DEFAULT_FRAME_ARENA_BYTES};
}

/// Archetypal Entity Component System with column-first access.
pub mod ecs {
    pub use prometheus_ecs::{
        Archetype, ArchetypeSignature, Chunk, CommandBuffer, Component, ComponentId, Entity, QueryPlan, World,
    };
}

/// GPU hardware abstraction over wgpu with VRAM leak tracking.
pub mod gpu {
    pub use prometheus_gpu::{
        ImportedTexture, PassResources, RenderContext, RenderGraphExecutor, RenderGraphFrameSubmission,
        RenderGraphPoolStats, ResourceFactory, VramLedger,
    };
}

/// Deterministic, pre-allocated render-graph planning.
pub mod render_graph {
    pub use prometheus_render_graph::{
        AccessId, Barrier, BarrierState, CapacityKind, CompiledGraph, GraphCapacity, GraphError, GraphStats,
        PassBuilder, PassId, PassLabel, Queue, QueueDomain, Readable, RenderGraph, ResourceId, ResourceLabel,
        SlotAssignment, SyncToken, TexHandle, TextureDesc, TextureFormat, TextureRef, TextureUsages, Undefined,
        WritableTextureState, Written,
    };
}

/// Window management and frame timing.
pub mod window {
    pub use prometheus_window::{AppWindow, FrameTimer, WindowConfig};
}

// ============================================================================
// Engine Version
// ============================================================================

/// Engine version string, derived from workspace Cargo.toml.
pub const ENGINE_VERSION: &str = env!("CARGO_PKG_VERSION");

/// Engine name constant.
pub const ENGINE_NAME: &str = "PROMETHEUS";

// ============================================================================
// Test Harness Utilities
// ============================================================================

/// Test utilities for verifying engine invariants.
///
/// These are available in all build configurations (not just `#[cfg(test)]`)
/// because they are used by integration tests and CI audit scripts.
pub mod testkit {
    use std::sync::atomic::{AtomicU64, Ordering};

    /// Global allocation counter for verifying zero-allocation hot paths.
    ///
    /// # Usage
    ///
    /// ```rust,ignore
    /// use prometheus_core::testkit::AllocationProbe;
    ///
    /// let probe = AllocationProbe::snapshot();
    /// // ... execute hot-path code ...
    /// probe.assert_no_alloc();
    /// ```
    #[derive(Debug)]
    pub struct AllocationProbe {
        alloc_count_at_snapshot: u64,
        bytes_at_snapshot: u64,
    }

    /// Global counters (incremented by a custom global allocator if installed).
    static ALLOC_COUNT: AtomicU64 = AtomicU64::new(0);
    static ALLOC_BYTES: AtomicU64 = AtomicU64::new(0);

    impl AllocationProbe {
        /// Capture the current allocation counters.
        #[must_use]
        pub fn snapshot() -> Self {
            Self {
                alloc_count_at_snapshot: ALLOC_COUNT.load(Ordering::SeqCst),
                bytes_at_snapshot: ALLOC_BYTES.load(Ordering::SeqCst),
            }
        }

        /// Returns the number of allocations since the snapshot.
        #[must_use]
        pub fn alloc_count_since(&self) -> u64 {
            ALLOC_COUNT.load(Ordering::SeqCst) - self.alloc_count_at_snapshot
        }

        /// Returns the number of bytes allocated since the snapshot.
        #[must_use]
        pub fn bytes_since(&self) -> u64 {
            ALLOC_BYTES.load(Ordering::SeqCst) - self.bytes_at_snapshot
        }

        /// Panics if any allocation occurred since the snapshot.
        ///
        /// # Panics
        ///
        /// Panics with a descriptive message including allocation count and bytes.
        pub fn assert_no_alloc(&self) {
            let count = self.alloc_count_since();
            let bytes = self.bytes_since();
            assert!(
                count == 0,
                "PROMETHEUS KPI-M2 VIOLATION: {count} allocations ({bytes} bytes) detected in zero-alloc path"
            );
        }

        /// Record an allocation (called by the global allocator hook).
        pub fn record_alloc(bytes: u64) {
            ALLOC_COUNT.fetch_add(1, Ordering::SeqCst);
            ALLOC_BYTES.fetch_add(bytes, Ordering::SeqCst);
        }
    }

    /// Determinism verification harness using BLAKE3 hashing.
    #[derive(Debug)]
    pub struct DeterminismHarness {
        hasher: blake3::Hasher,
    }

    impl DeterminismHarness {
        /// Create a new determinism harness.
        #[must_use]
        pub fn new() -> Self {
            Self {
                hasher: blake3::Hasher::new(),
            }
        }

        /// Feed bytes into the determinism hash.
        pub fn feed(&mut self, data: &[u8]) {
            self.hasher.update(data);
        }

        /// Finalize and return the 256-bit BLAKE3 hash.
        #[must_use]
        pub fn finalize(&self) -> blake3::Hash {
            self.hasher.finalize()
        }

        /// Assert that the hash matches an expected value.
        ///
        /// # Panics
        ///
        /// Panics if the hashes differ, indicating a determinism violation.
        pub fn assert_matches(&self, expected: &blake3::Hash) {
            let actual = self.finalize();
            assert!(
                actual == *expected,
                "PROMETHEUS KPI-D1 VIOLATION: Determinism hash mismatch.\n  Expected: {expected}\n  Actual:   {actual}"
            );
        }
    }

    impl Default for DeterminismHarness {
        fn default() -> Self {
            Self::new()
        }
    }
}

// ============================================================================
// Unit Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn engine_version_is_set() {
        assert!(!ENGINE_VERSION.is_empty());
    }

    #[test]
    fn engine_name_is_prometheus() {
        assert_eq!(ENGINE_NAME, "PROMETHEUS");
    }

    #[test]
    fn allocation_probe_snapshot_is_stable() {
        let probe = testkit::AllocationProbe::snapshot();
        // No allocations between snapshot and check
        assert_eq!(probe.alloc_count_since(), 0);
        assert_eq!(probe.bytes_since(), 0);
    }

    #[test]
    fn determinism_harness_consistent() {
        let mut h1 = testkit::DeterminismHarness::new();
        let mut h2 = testkit::DeterminismHarness::new();
        let data = b"PROMETHEUS determinism test payload";
        h1.feed(data);
        h2.feed(data);
        let hash1 = h1.finalize();
        let hash2 = h2.finalize();
        assert_eq!(hash1, hash2, "Identical inputs must produce identical BLAKE3 hashes");
    }

    #[test]
    fn determinism_harness_detects_divergence() {
        let mut h1 = testkit::DeterminismHarness::new();
        let mut h2 = testkit::DeterminismHarness::new();
        h1.feed(b"payload_a");
        h2.feed(b"payload_b");
        assert_ne!(
            h1.finalize(),
            h2.finalize(),
            "Different inputs must produce different BLAKE3 hashes"
        );
    }

    // Verify that re-exports compile and are accessible
    #[test]
    fn reexports_are_accessible() {
        let _ = error::EngineError::NotImplemented {
            crate_name: "prometheus-core",
            symbol: "test",
        };
        let _ = math::Vec3::default();
        let _ = math::Transform::default();
        let _ = alloc::DEFAULT_FRAME_ARENA_BYTES;
        let _ = ecs::Entity::new(0, 0);
        let _ = ecs::ArchetypeSignature::empty();
        let _ = render_graph::GraphCapacity::desktop_default();
    }
}
