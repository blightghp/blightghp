#![forbid(unsafe_code)]
//! # `prometheus-math`
//!
//! L0 — Spatial Math.
//! Core spatial types for the PROMETHEUS engine, providing SIMD-aligned primitives.

use bytemuck::{Pod, Zeroable};
use core::ops::Deref;

/// A 2-dimensional vector.
#[repr(transparent)]
#[derive(Clone, Copy, Debug, PartialEq, Default, Pod, Zeroable)]
pub struct Vec2(pub glam::Vec2);

impl Deref for Vec2 {
    type Target = glam::Vec2;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl Vec2 {
    /// Returns the x component.
    pub fn x(&self) -> f32 { self.0.x }
    /// Returns the y component.
    pub fn y(&self) -> f32 { self.0.y }
}

/// A 3-dimensional vector.
#[repr(transparent)]
#[derive(Clone, Copy, Debug, PartialEq, Default, Pod, Zeroable)]
pub struct Vec3(pub glam::Vec3);

impl Deref for Vec3 {
    type Target = glam::Vec3;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl Vec3 {
    /// Returns the x component.
    pub fn x(&self) -> f32 { self.0.x }
    /// Returns the y component.
    pub fn y(&self) -> f32 { self.0.y }
    /// Returns the z component.
    pub fn z(&self) -> f32 { self.0.z }
}

/// A 4-dimensional vector.
#[repr(transparent)]
#[derive(Clone, Copy, Debug, PartialEq, Default, Pod, Zeroable)]
pub struct Vec4(pub glam::Vec4);

impl Deref for Vec4 {
    type Target = glam::Vec4;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl Vec4 {
    /// Returns the x component.
    pub fn x(&self) -> f32 { self.0.x }
    /// Returns the y component.
    pub fn y(&self) -> f32 { self.0.y }
    /// Returns the z component.
    pub fn z(&self) -> f32 { self.0.z }
    /// Returns the w component.
    pub fn w(&self) -> f32 { self.0.w }
}

/// A quaternion for rotations.
#[repr(transparent)]
#[derive(Clone, Copy, Debug, PartialEq, Default, Pod, Zeroable)]
pub struct Quat(pub glam::Quat);

impl Deref for Quat {
    type Target = glam::Quat;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

/// A 3x3 matrix.
#[repr(transparent)]
#[derive(Clone, Copy, Debug, PartialEq, Default, Pod, Zeroable)]
pub struct Mat3(pub glam::Mat3);

impl Deref for Mat3 {
    type Target = glam::Mat3;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

/// A 4x4 matrix.
#[repr(transparent)]
#[derive(Clone, Copy, Debug, PartialEq, Default, Pod, Zeroable)]
pub struct Mat4(pub glam::Mat4);

impl Deref for Mat4 {
    type Target = glam::Mat4;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

/// Position, rotation, and scale of an entity in world space.
/// Must be exactly 48 bytes.
#[repr(C, align(16))]
#[derive(Debug, Clone, Copy, PartialEq, Pod, Zeroable)]
pub struct Transform {
    /// The world space position.
    pub position: Vec3,
    /// Padding for alignment.
    pub pad_position: f32,
    /// The rotation.
    pub rotation: Quat,
    /// The non-uniform scale.
    pub scale: Vec3,
    /// Padding for alignment.
    pub pad_scale: f32,
}

impl Default for Transform {
    fn default() -> Self {
        Self {
            position: Vec3(glam::Vec3::ZERO),
            pad_position: 0.0,
            rotation: Quat(glam::Quat::IDENTITY),
            scale: Vec3(glam::Vec3::ONE),
            pad_scale: 0.0,
        }
    }
}

/// An axis-aligned bounding box.
/// Must be exactly 32 bytes.
#[repr(C)]
#[derive(Debug, Clone, Copy, PartialEq, Pod, Zeroable)]
pub struct Aabb {
    /// The minimum extents.
    pub min: Vec3,
    /// Padding for alignment.
    pub pad_min: f32,
    /// The maximum extents.
    pub max: Vec3,
    /// Padding for alignment.
    pub pad_max: f32,
}

/// System-wide epsilon for floating-point comparisons.
pub const EPSILON: f32 = 1.0e-6;

/// Standard gravity acceleration in m/s^2.
pub const GRAVITY_Y: f32 = -9.81;

#[cfg(test)]
mod tests {
    use super::*;
    use core::mem::{size_of, align_of};

    #[test]
    fn test_transform_layout() {
        assert_eq!(size_of::<Transform>(), 48);
        assert_eq!(align_of::<Transform>(), 16);
    }

    #[test]
    fn test_aabb_layout() {
        assert_eq!(size_of::<Aabb>(), 32);
    }

    #[test]
    fn test_pod_safety() {
        // Assert that Pod and Zeroable are implemented correctly
        fn assert_pod<T: Pod + Zeroable>() {}
        assert_pod::<Vec2>();
        assert_pod::<Vec3>();
        assert_pod::<Vec4>();
        assert_pod::<Quat>();
        assert_pod::<Mat3>();
        assert_pod::<Mat4>();
        assert_pod::<Transform>();
        assert_pod::<Aabb>();
    }

    #[test]
    fn test_basic_arithmetic() {
        let v1 = Vec3(glam::Vec3::new(1.0, 2.0, 3.0));
        let v2 = Vec3(glam::Vec3::new(2.0, 3.0, 4.0));
        
        let sum = *v1 + *v2;
        assert_eq!(sum, glam::Vec3::new(3.0, 5.0, 7.0));
    }
}
