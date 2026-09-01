#![forbid(unsafe_code)]
//! # `prometheus-alloc`
//!
//! Two-ended frame arena for zero-heap-allocation per tick.
//! Pool with frame and level lifetimes, strictly bounds-checked and safe.

use bytemuck::{Pod, Zeroable};
use prometheus_error::{EngineError, EngineResult};
use std::alloc::Layout;

/// Default frame arena size in bytes (16 MiB).
pub const DEFAULT_FRAME_ARENA_BYTES: usize = 16 * 1024 * 1024;

/// Base alignment for the arena storage.
pub const ARENA_BASE_ALIGNMENT: usize = 16;

/// Arena end to allocate from.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArenaEnd {
    /// Frame lifetime (grows from 0 up).
    Frame,
    /// Level lifetime (grows from capacity down).
    Level,
}

/// Opaque marker for rewinding the arena.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ArenaMarker {
    end: ArenaEnd,
    offset: usize,
    generation: u64,
}

#[repr(C, align(16))]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
struct AlignedBlock([u8; ARENA_BASE_ALIGNMENT]);

/// Two-ended bump allocator arena.
#[derive(Debug)]
pub struct FrameArena {
    storage: Vec<AlignedBlock>,
    capacity: usize,
    frame_offset: usize,
    level_offset: usize,
    generation: u64,
}

impl FrameArena {
    /// Create a new arena with the given byte capacity.
    #[must_use]
    pub fn new(capacity: usize) -> Self {
        let blocks = capacity.div_ceil(ARENA_BASE_ALIGNMENT);
        Self {
            storage: vec![AlignedBlock([0; ARENA_BASE_ALIGNMENT]); blocks],
            capacity: blocks * ARENA_BASE_ALIGNMENT,
            frame_offset: 0,
            level_offset: blocks * ARENA_BASE_ALIGNMENT,
            generation: 0,
        }
    }

    /// Safely get the entire storage as a mutable byte slice.
    #[inline]
    fn bytes_mut(&mut self) -> &mut [u8] {
        bytemuck::cast_slice_mut(&mut self.storage)
    }

    /// Internal function to reserve a range of bytes.
    fn reserve(&mut self, end: ArenaEnd, layout: Layout) -> EngineResult<std::ops::Range<usize>> {
        let align = layout.align();
        let size = layout.size();

        if align == 0 || !align.is_power_of_two() {
            return Err(EngineError::InvalidArgument {
                crate_name: "prometheus-alloc",
                symbol: "alloc",
                reason: "Alignment must be a non-zero power of two",
            });
        }

        if align > ARENA_BASE_ALIGNMENT {
            return Err(EngineError::InvalidArgument {
                crate_name: "prometheus-alloc",
                symbol: "alloc",
                reason: "Alignment exceeds arena base alignment",
            });
        }

        match end {
            ArenaEnd::Frame => {
                let current = self.frame_offset;
                let aligned = (current + align - 1) & !(align - 1);
                let new_offset = aligned.checked_add(size).ok_or(EngineError::ArenaExhausted {
                    requested: size,
                    available: self.remaining(),
                })?;

                if new_offset > self.level_offset {
                    return Err(EngineError::ArenaExhausted {
                        requested: size,
                        available: self.remaining(),
                    });
                }

                self.frame_offset = new_offset;
                Ok(aligned..new_offset)
            }
            ArenaEnd::Level => {
                let current = self.level_offset;
                let start = current.checked_sub(size).ok_or(EngineError::ArenaExhausted {
                    requested: size,
                    available: self.remaining(),
                })?;
                let aligned_start = start & !(align - 1);

                if aligned_start < self.frame_offset {
                    return Err(EngineError::ArenaExhausted {
                        requested: size,
                        available: self.remaining(),
                    });
                }

                self.level_offset = aligned_start;
                Ok(aligned_start..(aligned_start + size))
            }
        }
    }

    /// Allocate raw bytes with the specified layout.
    ///
    /// Returns a raw pointer. It is the caller's responsibility to handle it correctly,
    /// but obtaining the pointer itself requires no unsafe code.
    pub fn alloc(&mut self, end: ArenaEnd, layout: Layout) -> EngineResult<*mut u8> {
        let range = self.reserve(end, layout)?;
        let slice = &mut self.bytes_mut()[range];
        Ok(slice.as_mut_ptr())
    }

    /// Allocate a typed slice safely.
    pub fn alloc_slice<T: Pod>(&mut self, end: ArenaEnd, count: usize) -> EngineResult<&mut [T]> {
        let size = count
            .checked_mul(std::mem::size_of::<T>())
            .ok_or(EngineError::InvalidArgument {
                crate_name: "prometheus-alloc",
                symbol: "alloc_slice",
                reason: "Size calculation overflow",
            })?;
        let align = std::mem::align_of::<T>();

        if size == 0 {
            return Err(EngineError::InvalidArgument {
                crate_name: "prometheus-alloc",
                symbol: "alloc_slice",
                reason: "Cannot allocate zero size",
            });
        }

        let layout = Layout::from_size_align(size, align).map_err(|_| EngineError::InvalidArgument {
            crate_name: "prometheus-alloc",
            symbol: "alloc_slice",
            reason: "Invalid layout for type",
        })?;

        let range = self.reserve(end, layout)?;
        let byte_slice = &mut self.bytes_mut()[range];
        Ok(bytemuck::cast_slice_mut(byte_slice))
    }

    /// Reset frame allocator to 0.
    #[inline]
    pub fn reset_frame(&mut self) {
        self.frame_offset = 0;
        self.generation = self.generation.wrapping_add(1);
    }

    /// Reset level allocator to capacity.
    #[inline]
    pub fn reset_level(&mut self) {
        self.level_offset = self.capacity;
        self.generation = self.generation.wrapping_add(1);
    }

    /// Capture current state of an arena end.
    #[must_use]
    #[inline]
    pub fn mark(&self, end: ArenaEnd) -> ArenaMarker {
        let offset = match end {
            ArenaEnd::Frame => self.frame_offset,
            ArenaEnd::Level => self.level_offset,
        };
        ArenaMarker {
            end,
            offset,
            generation: self.generation,
        }
    }

    /// Restore the arena to a previously captured marker.
    #[inline]
    pub fn rewind(&mut self, marker: ArenaMarker) -> EngineResult<()> {
        if marker.generation != self.generation {
            return Err(EngineError::InvalidArgument {
                crate_name: "prometheus-alloc",
                symbol: "rewind",
                reason: "Marker is from an obsolete generation",
            });
        }

        match marker.end {
            ArenaEnd::Frame => {
                if marker.offset > self.frame_offset {
                    return Err(EngineError::InvalidArgument {
                        crate_name: "prometheus-alloc",
                        symbol: "rewind",
                        reason: "Marker offset is ahead of current frame offset",
                    });
                }
                self.frame_offset = marker.offset;
            }
            ArenaEnd::Level => {
                if marker.offset < self.level_offset {
                    return Err(EngineError::InvalidArgument {
                        crate_name: "prometheus-alloc",
                        symbol: "rewind",
                        reason: "Marker offset is ahead of current level offset",
                    });
                }
                self.level_offset = marker.offset;
            }
        }
        Ok(())
    }

    /// Returns the bytes used by the frame allocator.
    #[must_use]
    #[inline]
    pub fn frame_used(&self) -> usize {
        self.frame_offset
    }

    /// Returns the bytes used by the level allocator.
    #[must_use]
    #[inline]
    pub fn level_used(&self) -> usize {
        self.capacity - self.level_offset
    }

    /// Returns the remaining available bytes in the arena.
    #[must_use]
    #[inline]
    pub fn remaining(&self) -> usize {
        self.level_offset.saturating_sub(self.frame_offset)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_alloc_and_read_back() {
        let mut arena = FrameArena::new(1024);

        let slice1 = arena.alloc_slice::<u32>(ArenaEnd::Frame, 4).unwrap();
        slice1.copy_from_slice(&[1, 2, 3, 4]);

        let slice2 = arena.alloc_slice::<u32>(ArenaEnd::Frame, 4).unwrap();
        slice2.copy_from_slice(&[5, 6, 7, 8]);

        assert_eq!(arena.frame_used(), 32);
    }

    #[test]
    fn test_reset_is_o1() {
        let mut arena = FrameArena::new(1024);
        let _ = arena.alloc_slice::<u32>(ArenaEnd::Frame, 10).unwrap();
        assert_eq!(arena.frame_used(), 40);

        arena.reset_frame();
        assert_eq!(arena.frame_used(), 0);
    }

    #[test]
    fn test_arena_exhausted() {
        let mut arena = FrameArena::new(64);
        let err = arena.alloc_slice::<u32>(ArenaEnd::Frame, 20).unwrap_err();
        assert!(matches!(err, EngineError::ArenaExhausted { .. }));
    }

    #[test]
    fn test_mark_and_rewind() {
        let mut arena = FrameArena::new(1024);
        let _ = arena.alloc_slice::<u32>(ArenaEnd::Frame, 2).unwrap();

        let marker = arena.mark(ArenaEnd::Frame);
        let _ = arena.alloc_slice::<u32>(ArenaEnd::Frame, 4).unwrap();

        assert_eq!(arena.frame_used(), 24);

        arena.rewind(marker).unwrap();
        assert_eq!(arena.frame_used(), 8);
    }

    #[test]
    fn test_frame_and_level_dont_overlap() {
        let mut arena = FrameArena::new(128); // 128 bytes total

        // Allocate 64 bytes from frame
        let _ = arena.alloc_slice::<u32>(ArenaEnd::Frame, 16).unwrap();
        assert_eq!(arena.frame_used(), 64);

        // Allocate 64 bytes from level
        let _ = arena.alloc_slice::<u32>(ArenaEnd::Level, 16).unwrap();
        assert_eq!(arena.level_used(), 64);
        assert_eq!(arena.remaining(), 0);

        // Next allocation should fail
        let err = arena.alloc_slice::<u32>(ArenaEnd::Frame, 1).unwrap_err();
        assert!(matches!(err, EngineError::ArenaExhausted { .. }));
    }

    #[test]
    fn test_alignment_correctness() {
        let mut arena = FrameArena::new(128);

        // 1-byte aligned allocation
        let layout = Layout::from_size_align(1, 1).unwrap();
        let ptr1 = arena.alloc(ArenaEnd::Frame, layout).unwrap();

        // 16-byte aligned allocation
        let layout16 = Layout::from_size_align(16, 16).unwrap();
        let ptr2 = arena.alloc(ArenaEnd::Frame, layout16).unwrap();

        assert_eq!(ptr2 as usize % 16, 0);
        // ptr1 was 1 byte, so ptr2 needs 15 bytes padding
        assert_eq!(ptr2 as usize - ptr1 as usize, 16);
    }
}
