//! # `prometheus-gpu`
//!
//! L2 — GPU Abstraction for the PROMETHEUS engine.

#![forbid(unsafe_code)]
#![deny(missing_docs)]

use prometheus_error::{EngineError, EngineResult};

/// Tracks the active VRAM resources.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct VramLedger {
    /// Number of active buffers.
    pub buffer_count: u64,
    /// Total bytes allocated for buffers.
    pub buffer_bytes: u64,
    /// Number of active textures.
    pub texture_count: u64,
    /// Total bytes allocated for textures.
    pub texture_bytes: u64,
}

impl VramLedger {
    /// Tracks a newly created buffer.
    pub fn track_buffer(&mut self, size: u64) {
        self.buffer_count = self.buffer_count.saturating_add(1);
        self.buffer_bytes = self.buffer_bytes.saturating_add(size);
    }

    /// Releases a tracked buffer.
    pub fn release_buffer(&mut self, size: u64) {
        self.buffer_count = self.buffer_count.saturating_sub(1);
        self.buffer_bytes = self.buffer_bytes.saturating_sub(size);
    }

    /// Tracks a newly created texture.
    pub fn track_texture(&mut self, size: u64) {
        self.texture_count = self.texture_count.saturating_add(1);
        self.texture_bytes = self.texture_bytes.saturating_add(size);
    }

    /// Releases a tracked texture.
    pub fn release_texture(&mut self, size: u64) {
        self.texture_count = self.texture_count.saturating_sub(1);
        self.texture_bytes = self.texture_bytes.saturating_sub(size);
    }

    /// Returns the total number of live resources.
    #[must_use]
    pub fn live_resources(&self) -> u64 {
        self.buffer_count.saturating_add(self.texture_count)
    }

    /// Returns the total bytes in use by resources.
    #[must_use]
    pub fn live_bytes(&self) -> u64 {
        self.buffer_bytes.saturating_add(self.texture_bytes)
    }

    /// Asserts that all resources have been released.
    ///
    /// # Errors
    /// Returns `EngineError::VramLeak` if any resource is still alive.
    pub fn assert_baseline(&self) -> EngineResult<()> {
        if self.live_resources() > 0 {
            Err(EngineError::VramLeak { baseline: 0, current: self.live_bytes() })
        } else {
            Ok(())
        }
    }
}

/// The core rendering context holding the device and queue.
#[derive(Debug)]
pub struct RenderContext {
    /// The wgpu instance.
    pub instance: wgpu::Instance,
    /// The wgpu adapter.
    pub adapter: wgpu::Adapter,
    /// The wgpu device.
    pub device: wgpu::Device,
    /// The wgpu queue.
    pub queue: wgpu::Queue,
    /// VRAM ledger instance.
    pub vram_ledger: VramLedger,
}

impl RenderContext {
    /// Creates a new render context.
    ///
    /// # Errors
    /// Returns `EngineError::GraphicsDevice` if creation fails.
    pub async fn new(backends: wgpu::Backends) -> EngineResult<Self> {
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
            backends,
            ..Default::default()
        });

        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                compatible_surface: None,
                force_fallback_adapter: false,
            })
            .await
            .ok_or(EngineError::GraphicsDevice { reason: "Failed to request GPU adapter" })?;

        let (device, queue) = adapter
            .request_device(
                &wgpu::DeviceDescriptor {
                    label: Some("prometheus_device"),
                    required_features: wgpu::Features::empty(),
                    required_limits: wgpu::Limits::default(),
                },
                None,
            )
            .await
            .map_err(|_| EngineError::GraphicsDevice { reason: "Failed to request GPU device" })?;

        Ok(Self {
            instance,
            adapter,
            device,
            queue,
            vram_ledger: VramLedger::default(),
        })
    }

    /// Returns the associated device.
    #[must_use]
    pub fn device(&self) -> &wgpu::Device {
        &self.device
    }

    /// Returns the associated queue.
    #[must_use]
    pub fn queue(&self) -> &wgpu::Queue {
        &self.queue
    }
}

/// A factory for creating GPU resources safely and tracking them.
#[derive(Debug)]
pub struct ResourceFactory<'a> {
    device: &'a wgpu::Device,
    ledger: &'a mut VramLedger,
}

impl<'a> ResourceFactory<'a> {
    /// Creates a new resource factory.
    #[must_use]
    pub fn new(device: &'a wgpu::Device, ledger: &'a mut VramLedger) -> Self {
        Self { device, ledger }
    }

    /// Creates a buffer and tracks its memory.
    ///
    /// # Errors
    /// Always returns `Ok` with the `wgpu::Buffer`.
    pub fn create_buffer(&mut self, label: &str, desc: &wgpu::BufferDescriptor) -> EngineResult<wgpu::Buffer> {
        let buffer = self.device.create_buffer(desc);
        self.ledger.track_buffer(desc.size);
        let _ = label; // Suppress unused for now
        Ok(buffer)
    }

    /// Creates a texture and tracks its memory.
    ///
    /// # Errors
    /// Always returns `Ok` with the `wgpu::Texture`.
    pub fn create_texture(&mut self, label: &str, desc: &wgpu::TextureDescriptor) -> EngineResult<wgpu::Texture> {
        let texture = self.device.create_texture(desc);
        
        let bytes_per_pixel = 4; // Simplified assumption for demonstration
        let size = desc.size.width as u64 * desc.size.height as u64 * desc.size.depth_or_array_layers as u64 * bytes_per_pixel;
        self.ledger.track_texture(size);
        let _ = label;
        
        Ok(texture)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vram_ledger_tracking() {
        let mut ledger = VramLedger::default();
        ledger.track_buffer(1024);
        assert_eq!(ledger.live_resources(), 1);
        assert_eq!(ledger.live_bytes(), 1024);

        ledger.track_texture(2048);
        assert_eq!(ledger.live_resources(), 2);
        assert_eq!(ledger.live_bytes(), 3072);

        ledger.release_buffer(1024);
        assert_eq!(ledger.live_resources(), 1);
        assert_eq!(ledger.live_bytes(), 2048);

        ledger.release_texture(2048);
        assert_eq!(ledger.live_resources(), 0);
        assert_eq!(ledger.live_bytes(), 0);

        assert!(ledger.assert_baseline().is_ok());
    }

    #[test]
    fn test_vram_ledger_leak() {
        let mut ledger = VramLedger::default();
        ledger.track_buffer(1024);
        assert!(ledger.assert_baseline().is_err());
    }
}
