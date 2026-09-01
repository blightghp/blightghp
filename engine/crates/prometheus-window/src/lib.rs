//! # `prometheus-window`
//!
//! L1 — Window + Frame Loop for the PROMETHEUS engine.

#![forbid(unsafe_code)]
#![deny(missing_docs)]

use prometheus_error::{EngineError, EngineResult};
use prometheus_gpu::RenderContext;
use std::sync::Arc;
use std::time::Instant;
use winit::event_loop::ActiveEventLoop;
use winit::window::Window;

/// Configuration for the application window.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WindowConfig {
    /// Window title.
    pub title: String,
    /// Window width in physical pixels.
    pub width: u32,
    /// Window height in physical pixels.
    pub height: u32,
    /// Whether to enable VSync.
    pub vsync: bool,
}

impl Default for WindowConfig {
    fn default() -> Self {
        Self {
            title: "BRAIN PRO — PROMETHEUS Engine".to_string(),
            width: 1280,
            height: 720,
            vsync: true,
        }
    }
}

/// The main application window holding the surface.
#[derive(Debug)]
pub struct AppWindow {
    /// The winit window instance.
    pub window: Arc<Window>,
    /// The wgpu surface.
    pub surface: wgpu::Surface<'static>,
    /// The current surface configuration.
    pub surface_config: wgpu::SurfaceConfiguration,
}

impl AppWindow {
    /// Creates a new window and sets up the rendering surface.
    ///
    /// # Errors
    /// Returns `EngineError::GraphicsDevice` if window or surface creation fails.
    pub fn new(event_loop: &ActiveEventLoop, config: &WindowConfig, render_ctx: &RenderContext) -> EngineResult<Self> {
        let window_attributes = winit::window::Window::default_attributes()
            .with_title(&config.title)
            .with_inner_size(winit::dpi::PhysicalSize::new(config.width, config.height));

        let window =
            Arc::new(
                event_loop
                    .create_window(window_attributes)
                    .map_err(|_| EngineError::GraphicsDevice {
                        reason: "Failed to create window",
                    })?,
            );

        let surface = render_ctx
            .instance
            .create_surface(window.clone())
            .map_err(|_| EngineError::GraphicsDevice {
                reason: "Failed to create surface",
            })?;

        let present_mode = if config.vsync {
            wgpu::PresentMode::AutoVsync
        } else {
            wgpu::PresentMode::AutoNoVsync
        };

        let mut surface_config = surface
            .get_default_config(&render_ctx.adapter, config.width, config.height)
            .ok_or(EngineError::GraphicsDevice {
                reason: "GPU adapter does not support the window surface",
            })?;
        surface_config.present_mode = present_mode;
        surface_config.desired_maximum_frame_latency = 2;

        surface.configure(&render_ctx.device, &surface_config);

        Ok(Self {
            window,
            surface,
            surface_config,
        })
    }

    /// Resizes the surface to match the new dimensions.
    pub fn resize(&mut self, new_size: winit::dpi::PhysicalSize<u32>, device: &wgpu::Device) {
        if new_size.width > 0 && new_size.height > 0 {
            self.surface_config.width = new_size.width;
            self.surface_config.height = new_size.height;
            self.surface.configure(device, &self.surface_config);
        }
    }

    /// Retrieves the current surface texture for rendering.
    ///
    /// # Errors
    /// Returns `EngineError::GraphicsDevice` when the surface cannot provide a frame.
    pub fn current_texture(&self) -> EngineResult<wgpu::SurfaceTexture> {
        match self.surface.get_current_texture() {
            wgpu::CurrentSurfaceTexture::Success(texture) | wgpu::CurrentSurfaceTexture::Suboptimal(texture) => {
                Ok(texture)
            }
            wgpu::CurrentSurfaceTexture::Timeout | wgpu::CurrentSurfaceTexture::Occluded => {
                Err(EngineError::GraphicsDevice {
                    reason: "Window surface is temporarily unavailable",
                })
            }
            wgpu::CurrentSurfaceTexture::Outdated => Err(EngineError::GraphicsDevice {
                reason: "Window surface configuration is outdated",
            }),
            wgpu::CurrentSurfaceTexture::Lost => Err(EngineError::GraphicsDevice {
                reason: "Window surface was lost",
            }),
            wgpu::CurrentSurfaceTexture::Validation => Err(EngineError::GraphicsDevice {
                reason: "Window surface validation failed",
            }),
        }
    }

    /// Presents a frame acquired by [`Self::current_texture`] after GPU submission.
    pub fn present(&self, queue: &wgpu::Queue, texture: wgpu::SurfaceTexture) {
        queue.present(texture);
    }

    /// Returns the logical size of the window surface.
    #[must_use]
    pub fn size(&self) -> (u32, u32) {
        (self.surface_config.width, self.surface_config.height)
    }
}

/// A precise timer for managing frame loops and deltas.
#[derive(Debug, Clone)]
pub struct FrameTimer {
    /// Total number of frames processed.
    pub frame_count: u64,
    /// Time when the last frame started.
    pub last_instant: Instant,
    /// Time elapsed during the previous frame in seconds.
    pub delta_seconds: f64,
}

impl Default for FrameTimer {
    fn default() -> Self {
        Self {
            frame_count: 0,
            last_instant: Instant::now(),
            delta_seconds: 0.0,
        }
    }
}

impl FrameTimer {
    /// Creates a new FrameTimer.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Advances the timer, updating the delta and frame count.
    pub fn tick(&mut self) {
        let now = Instant::now();
        self.delta_seconds = now.duration_since(self.last_instant).as_secs_f64();
        self.last_instant = now;
        self.frame_count = self.frame_count.saturating_add(1);
    }

    /// Returns the delta time of the previous frame.
    #[must_use]
    pub fn delta(&self) -> f64 {
        self.delta_seconds
    }

    /// Returns the current frames per second (FPS).
    #[must_use]
    pub fn fps(&self) -> f64 {
        if self.delta_seconds > 0.0 {
            1.0 / self.delta_seconds
        } else {
            0.0
        }
    }

    /// Returns the total frame count since start.
    #[must_use]
    pub fn frame_count(&self) -> u64 {
        self.frame_count
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread::sleep;
    use std::time::Duration;

    #[test]
    fn test_frame_timer() {
        let mut timer = FrameTimer::new();
        assert_eq!(timer.frame_count(), 0);
        assert!(timer.delta().abs() <= f64::EPSILON);

        sleep(Duration::from_millis(10));
        timer.tick();

        assert_eq!(timer.frame_count(), 1);
        assert!(timer.delta() >= 0.010);
        assert!(timer.fps() > 0.0);
    }
}
