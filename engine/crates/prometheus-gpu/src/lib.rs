//! # `prometheus-gpu`
//!
//! L2 — GPU Abstraction for the PROMETHEUS engine.

#![forbid(unsafe_code)]
#![deny(missing_docs)]

use prometheus_error::{EngineError, EngineResult};
use prometheus_render_graph::{
    CompiledGraph, PassId, QueueDomain, ResourceId, SlotAssignment, TextureDesc, TextureFormat, TextureUsages,
};

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
            Err(EngineError::VramLeak {
                baseline: 0,
                current: self.live_bytes(),
            })
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
            ..wgpu::InstanceDescriptor::new_without_display_handle()
        });

        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                compatible_surface: None,
                force_fallback_adapter: false,
                apply_limit_buckets: false,
            })
            .await
            .map_err(|_| EngineError::GraphicsDevice {
                reason: "Failed to request GPU adapter",
            })?;

        let (device, queue) = adapter
            .request_device(&wgpu::DeviceDescriptor {
                label: Some("prometheus_device"),
                required_features: wgpu::Features::empty(),
                required_limits: wgpu::Limits::default(),
                ..Default::default()
            })
            .await
            .map_err(|_| EngineError::GraphicsDevice {
                reason: "Failed to request GPU device",
            })?;

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
    pub fn create_buffer(&mut self, _label: &str, desc: &wgpu::BufferDescriptor) -> EngineResult<wgpu::Buffer> {
        let buffer = self.device.create_buffer(desc);
        self.ledger.track_buffer(desc.size);
        Ok(buffer)
    }

    /// Creates a texture and tracks its memory.
    ///
    /// # Errors
    /// Always returns `Ok` with the `wgpu::Texture`.
    pub fn create_texture(&mut self, _label: &str, desc: &wgpu::TextureDescriptor) -> EngineResult<wgpu::Texture> {
        let texture = self.device.create_texture(desc);
        let bytes_per_pixel = 4_u64;
        let size = u64::from(desc.size.width)
            .saturating_mul(u64::from(desc.size.height))
            .saturating_mul(u64::from(desc.size.depth_or_array_layers))
            .saturating_mul(bytes_per_pixel);
        self.ledger.track_texture(size);
        Ok(texture)
    }
}

/// A view supplied by the application for an imported render-graph resource.
///
/// The view format and dimensions must match the logical descriptor used when
/// the resource was imported into the graph.
pub struct ImportedTexture<'view> {
    /// Logical resource identifier obtained from its graph handle.
    pub resource: ResourceId,
    /// Native view made available to passes that access the resource.
    pub view: &'view wgpu::TextureView,
}

/// Resource lookup provided to a pass-recording callback.
///
/// The executor owns transient textures and borrows imported views from the
/// caller. A callback may obtain a view for any resource declared in its pass.
pub struct PassResources<'executor, 'view> {
    assignments: &'executor [SlotAssignment],
    pool: &'executor [PooledTexture],
    imported: &'executor [ImportedTexture<'view>],
}

impl PassResources<'_, '_> {
    /// Returns the native texture view associated with a logical resource.
    #[must_use]
    pub fn texture_view(&self, resource: ResourceId) -> Option<&wgpu::TextureView> {
        if let Some(imported) = self.imported.iter().find(|binding| binding.resource == resource) {
            return Some(imported.view);
        }

        let assignment = self
            .assignments
            .iter()
            .find(|assignment| assignment.resource == resource)?;
        let key = PoolKey::from(*assignment);
        self.pool
            .iter()
            .find(|texture| texture.key == key)
            .map(|texture| &texture.view)
    }
}

/// Counts of physical transient textures currently cached by the executor.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RenderGraphPoolStats {
    /// Number of cached physical textures.
    pub textures: usize,
    /// Conservative byte estimate for cached textures.
    pub bytes: u64,
}

/// Submission metadata returned after the executor records a frame.
#[derive(Debug)]
pub struct RenderGraphFrameSubmission {
    /// Identifier returned by the `wgpu` queue submission.
    pub submission: wgpu::SubmissionIndex,
    /// Number of active graph passes submitted in declaration order.
    pub active_passes: usize,
    /// Number of abstract transitions accounted for by the compiled plan.
    pub planned_barriers: usize,
    /// Number of declared cross-queue dependencies serialized on WebGPU's queue.
    pub cross_queue_dependencies: usize,
}

/// Converts a compiled render-graph plan into cached `wgpu` textures and one command submission.
///
/// WebGPU exposes one queue rather than independent graphics and compute queues.
/// The executor therefore records active passes in deterministic declaration order;
/// `SyncToken`s remain observable plan data and are conservatively serialized by
/// that ordering. `wgpu` performs physical resource-state transitions internally.
pub struct RenderGraphExecutor {
    pool: Vec<PooledTexture>,
    required_keys: Vec<PoolKey>,
}

impl RenderGraphExecutor {
    /// Creates an executor with no cached transient textures.
    #[must_use]
    pub const fn new() -> Self {
        Self {
            pool: Vec::new(),
            required_keys: Vec::new(),
        }
    }

    /// Creates an executor pre-sized for a stable maximum number of pool slots.
    #[must_use]
    pub fn with_capacity(logical_pool_slots: usize) -> Self {
        Self {
            pool: Vec::with_capacity(logical_pool_slots),
            required_keys: Vec::with_capacity(logical_pool_slots),
        }
    }

    /// Returns the current physical texture cache footprint.
    #[must_use]
    pub fn pool_stats(&self) -> RenderGraphPoolStats {
        let bytes = self
            .pool
            .iter()
            .fold(0_u64, |total, texture| total.saturating_add(texture.bytes));
        RenderGraphPoolStats {
            textures: self.pool.len(),
            bytes,
        }
    }

    /// Records all active graph passes and submits the resulting command buffer.
    ///
    /// `record` owns pipeline-specific work. It receives a resolver for logical
    /// resource views and a single frame encoder. Returning an error prevents
    /// the encoder from being submitted.
    pub fn execute<'view, F>(
        &mut self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        plan: &CompiledGraph<'_>,
        imported: &[ImportedTexture<'view>],
        mut record: F,
    ) -> EngineResult<RenderGraphFrameSubmission>
    where
        F: for<'resources> FnMut(
            PassId,
            &PassResources<'resources, 'view>,
            &mut wgpu::CommandEncoder,
        ) -> EngineResult<()>,
    {
        validate_imports(plan, imported)?;
        self.synchronize_pool(device, plan)?;

        let resources = PassResources {
            assignments: plan.slots(),
            pool: &self.pool,
            imported,
        };
        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("prometheus_render_graph_frame"),
        });
        for pass in plan.active_passes() {
            record(*pass, &resources, &mut encoder)?;
        }

        let submission = queue.submit([encoder.finish()]);
        Ok(RenderGraphFrameSubmission {
            submission,
            active_passes: plan.active_passes().len(),
            planned_barriers: plan.barriers().len(),
            cross_queue_dependencies: plan.tokens().len(),
        })
    }

    fn synchronize_pool(&mut self, device: &wgpu::Device, plan: &CompiledGraph<'_>) -> EngineResult<()> {
        self.required_keys.clear();
        for assignment in plan.slots() {
            let key = PoolKey::from(*assignment);
            if !self.required_keys.contains(&key) {
                self.required_keys.push(key);
            }
        }

        let required = &self.required_keys;
        self.pool.retain(|texture| required.contains(&texture.key));
        for key in self.required_keys.iter().copied() {
            if !self.pool.iter().any(|texture| texture.key == key) {
                self.pool.push(PooledTexture::new(device, key)?);
            }
        }
        Ok(())
    }
}

impl Default for RenderGraphExecutor {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
struct PoolKey {
    slot: u16,
    desc: TextureDesc,
    domain: QueueDomain,
}

impl From<SlotAssignment> for PoolKey {
    fn from(assignment: SlotAssignment) -> Self {
        Self {
            slot: assignment.slot,
            desc: assignment.desc,
            domain: assignment.domain,
        }
    }
}

struct PooledTexture {
    key: PoolKey,
    _texture: wgpu::Texture,
    view: wgpu::TextureView,
    bytes: u64,
}

impl PooledTexture {
    fn new(device: &wgpu::Device, key: PoolKey) -> EngineResult<Self> {
        if key.desc.width == 0 || key.desc.height == 0 {
            return Err(graph_argument_error(
                "RenderGraphExecutor::execute",
                "render graph texture dimensions must be non-zero",
            ));
        }

        let texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("prometheus_render_graph_transient"),
            size: wgpu::Extent3d {
                width: key.desc.width,
                height: key.desc.height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu_format(key.desc.format),
            usage: wgpu_usage(key.desc.usages)?,
            view_formats: &[],
        });
        let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
        Ok(Self {
            key,
            _texture: texture,
            view,
            bytes: texture_byte_size(key.desc)?,
        })
    }
}

fn validate_imports(plan: &CompiledGraph<'_>, imported: &[ImportedTexture<'_>]) -> EngineResult<()> {
    for required in plan.imported_resources() {
        let matches = imported.iter().filter(|binding| binding.resource == *required).count();
        if matches != 1 {
            return Err(graph_argument_error(
                "RenderGraphExecutor::execute",
                "each active imported resource requires exactly one texture view",
            ));
        }
    }

    if imported
        .iter()
        .any(|binding| !plan.imported_resources().contains(&binding.resource))
    {
        return Err(graph_argument_error(
            "RenderGraphExecutor::execute",
            "an imported texture view does not belong to the compiled graph",
        ));
    }
    Ok(())
}

fn wgpu_format(format: TextureFormat) -> wgpu::TextureFormat {
    match format {
        TextureFormat::Rgba8Unorm => wgpu::TextureFormat::Rgba8Unorm,
    }
}

fn wgpu_usage(usages: TextureUsages) -> EngineResult<wgpu::TextureUsages> {
    const SUPPORTED: u8 = (1 << 0) | (1 << 1) | (1 << 2);
    let bits = usages.bits();
    if bits == 0 || bits & !SUPPORTED != 0 {
        return Err(graph_argument_error(
            "RenderGraphExecutor::execute",
            "render graph texture usage is empty or unsupported",
        ));
    }

    let mut mapped = wgpu::TextureUsages::empty();
    if bits & (1 << 0) != 0 {
        mapped |= wgpu::TextureUsages::RENDER_ATTACHMENT;
    }
    if bits & (1 << 1) != 0 {
        mapped |= wgpu::TextureUsages::TEXTURE_BINDING;
    }
    if bits & (1 << 2) != 0 {
        mapped |= wgpu::TextureUsages::STORAGE_BINDING;
    }
    Ok(mapped)
}

fn texture_byte_size(desc: TextureDesc) -> EngineResult<u64> {
    let bytes_per_texel = match desc.format {
        TextureFormat::Rgba8Unorm => 4_u64,
    };
    u64::from(desc.width)
        .checked_mul(u64::from(desc.height))
        .and_then(|pixels| pixels.checked_mul(bytes_per_texel))
        .ok_or_else(|| {
            graph_argument_error(
                "RenderGraphExecutor::execute",
                "render graph texture byte size overflows u64",
            )
        })
}

const fn graph_argument_error(symbol: &'static str, reason: &'static str) -> EngineError {
    EngineError::InvalidArgument {
        crate_name: "prometheus-gpu",
        symbol,
        reason,
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

    #[test]
    fn render_graph_usage_maps_to_wgpu_30() -> EngineResult<()> {
        let usage = wgpu_usage(TextureUsages::TRANSIENT)?;
        assert!(usage.contains(wgpu::TextureUsages::RENDER_ATTACHMENT));
        assert!(usage.contains(wgpu::TextureUsages::TEXTURE_BINDING));
        assert!(usage.contains(wgpu::TextureUsages::STORAGE_BINDING));
        assert_eq!(wgpu_format(TextureFormat::Rgba8Unorm), wgpu::TextureFormat::Rgba8Unorm);

        let executor = RenderGraphExecutor::with_capacity(3);
        assert_eq!(executor.pool_stats(), RenderGraphPoolStats { textures: 0, bytes: 0 });
        Ok(())
    }

    #[test]
    fn executor_materializes_a_transient_slot_when_an_adapter_is_available() -> Result<(), Box<dyn std::error::Error>> {
        let Ok(context) = pollster::block_on(RenderContext::new(wgpu::Backends::all())) else {
            return Ok(());
        };
        let desc = TextureDesc::new(
            16,
            16,
            TextureFormat::Rgba8Unorm,
            TextureUsages::RENDER_ATTACHMENT.union(TextureUsages::TEXTURE_BINDING),
        );
        let mut graph =
            prometheus_render_graph::RenderGraph::new(prometheus_render_graph::GraphCapacity::desktop_default());
        let output = {
            let mut pass = graph.begin_pass(
                prometheus_render_graph::PassLabel(1),
                prometheus_render_graph::Queue::Graphics,
                true,
            )?;
            let texture = pass.create_texture(desc, prometheus_render_graph::ResourceLabel(1))?;
            let texture = pass.write_color(texture)?;
            pass.finish(texture)?
        };
        let output_id = output.resource_id();
        let plan = graph.compile()?;
        let mut executor = RenderGraphExecutor::with_capacity(plan.stats().logical_pool_slots);
        let mut recorded_passes = 0_usize;
        let submission = executor.execute(
            &context.device,
            &context.queue,
            &plan,
            &[],
            |_pass, resources, _encoder| {
                if resources.texture_view(output_id).is_none() {
                    return Err(EngineError::ResourceMissing {
                        crate_name: "prometheus-gpu",
                        resource: "transient render graph texture",
                    });
                }
                recorded_passes = recorded_passes.saturating_add(1);
                Ok(())
            },
        )?;

        assert_eq!(recorded_passes, 1);
        assert_eq!(submission.active_passes, 1);
        assert_eq!(executor.pool_stats().textures, 1);
        Ok(())
    }
}
