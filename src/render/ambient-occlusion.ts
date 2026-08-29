import * as THREE from "three";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import type { RenderProfile } from "./presentation-budget";
import type { SimulationView } from "./laminar-layer";
import {
  visualPassOf,
  visualProvenanceOf,
} from "./render-types";
import type { VisualMaterialProfile } from "./render-types";

/** GTAO is an optional R10-E enhancement and must never allocate in baseline. */
export const HALF_RESOLUTION_AMBIENT_OCCLUSION_SCALE = 0.5 as const;

export type AmbientOcclusionDisableReason =
  | "baseline-profile"
  | "enhanced-budget"
  | "non-overview-view"
  | "schematic-material"
  | "clipping-active"
  | "high-contrast"
  | "webgl-safety-fallback";

export interface AmbientOcclusionPolicyInput {
  readonly renderProfile: RenderProfile;
  readonly activeView: SimulationView;
  readonly materialProfile: VisualMaterialProfile;
  readonly clippingEnabled: boolean;
  readonly highContrast: boolean;
  readonly webglSafe: boolean;
}

export type AmbientOcclusionDecision =
  | {
      readonly enabled: true;
      readonly scale: typeof HALF_RESOLUTION_AMBIENT_OCCLUSION_SCALE;
    }
  | {
      readonly enabled: false;
      readonly scale: typeof HALF_RESOLUTION_AMBIENT_OCCLUSION_SCALE;
      readonly reason: AmbientOcclusionDisableReason;
    };

/**
 * Keeps the experimental pass in a narrow, auditable envelope. GTAO's normal
 * override cannot inherit the local clipping shader, so clipping always wins.
 */
export function ambientOcclusionDecision(
  input: AmbientOcclusionPolicyInput,
): AmbientOcclusionDecision {
  if (!input.webglSafe) {
    return {
      enabled: false,
      scale: HALF_RESOLUTION_AMBIENT_OCCLUSION_SCALE,
      reason: "webgl-safety-fallback",
    };
  }
  if (input.renderProfile === "baseline") {
    return {
      enabled: false,
      scale: HALF_RESOLUTION_AMBIENT_OCCLUSION_SCALE,
      reason: "baseline-profile",
    };
  }
  if (input.renderProfile === "enhanced") {
    return {
      enabled: false,
      scale: HALF_RESOLUTION_AMBIENT_OCCLUSION_SCALE,
      reason: "enhanced-budget",
    };
  }
  if (input.activeView !== "overview") {
    return {
      enabled: false,
      scale: HALF_RESOLUTION_AMBIENT_OCCLUSION_SCALE,
      reason: "non-overview-view",
    };
  }
  if (input.clippingEnabled) {
    return {
      enabled: false,
      scale: HALF_RESOLUTION_AMBIENT_OCCLUSION_SCALE,
      reason: "clipping-active",
    };
  }
  if (input.highContrast) {
    return {
      enabled: false,
      scale: HALF_RESOLUTION_AMBIENT_OCCLUSION_SCALE,
      reason: "high-contrast",
    };
  }
  if (input.materialProfile !== "realistic-illustrative") {
    return {
      enabled: false,
      scale: HALF_RESOLUTION_AMBIENT_OCCLUSION_SCALE,
      reason: "schematic-material",
    };
  }
  return { enabled: true, scale: HALF_RESOLUTION_AMBIENT_OCCLUSION_SCALE };
}

export function sameAmbientOcclusionDecision(
  left: AmbientOcclusionDecision,
  right: AmbientOcclusionDecision,
): boolean {
  return left.enabled === right.enabled && left.scale === right.scale &&
    (!left.enabled && !right.enabled ? left.reason === right.reason : true);
}

function halfResolutionDimension(dimension: number): number {
  const bounded = Number.isFinite(dimension) && dimension > 0 ? dimension : 1;
  return Math.max(1, Math.ceil(bounded * HALF_RESOLUTION_AMBIENT_OCCLUSION_SCALE));
}

/**
 * GTAO owns one RGBA16F normal target, one depth target and two RGBA16F AO
 * targets, plus two deterministic noise textures. This is an accounting
 * estimate rather than a driver allocation claim.
 */
export function estimateHalfResolutionAmbientOcclusionTextureBytes(
  width: number,
  height: number,
  pixelRatio: number,
): number {
  const effectiveWidth = halfResolutionDimension(width * pixelRatio);
  const effectiveHeight = halfResolutionDimension(height * pixelRatio);
  const gBufferBytesPerPixel = 8 + 4;
  const aoBytesPerPixel = 8 * 2;
  const deterministicNoiseBytes = 2 * 64 * 64 * 4;
  return effectiveWidth * effectiveHeight * (gBufferBytesPerPixel + aoBytesPerPixel) +
    deterministicNoiseBytes;
}

/**
 * EffectComposer passes physical target dimensions to `setSize`. This wrapper
 * deliberately halves them so a composer resize cannot silently promote GTAO
 * back to full resolution.
 */
export class HalfResolutionGtaoPass extends GTAOPass {
  private readonly presentationOnlyVisibility = new Map<THREE.Object3D, boolean>();

  constructor(scene: THREE.Scene, camera: THREE.Camera, width: number, height: number) {
    super(
      scene,
      camera,
      halfResolutionDimension(width),
      halfResolutionDimension(height),
    );
    this.output = GTAOPass.OUTPUT.Default;
    this.blendIntensity = 0.72;
    this.updateGtaoMaterial({
      radius: 1.1,
      distanceExponent: 1.45,
      thickness: 0.22,
      distanceFallOff: 1,
      scale: 1,
      samples: 8,
    });
    this.updatePdMaterial({ radius: 4, rings: 1, samples: 8 });
  }

  override setSize(width: number, height: number): void {
    super.setSize(halfResolutionDimension(width), halfResolutionDimension(height));
  }

  override render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
    deltaTime: number,
    maskActive: boolean,
  ): void {
    this.scene.traverse((object) => {
      if (
        object.visible &&
        (visualPassOf(object) === "emission" || visualProvenanceOf(object) === "decoration")
      ) {
        this.presentationOnlyVisibility.set(object, true);
        object.visible = false;
      }
    });
    try {
      super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
    } finally {
      for (const [object, visible] of this.presentationOnlyVisibility) object.visible = visible;
      this.presentationOnlyVisibility.clear();
    }
  }

  override dispose(): void {
    super.dispose();
    // GTAOPass currently leaves this blending material outside its own dispose path.
    this.blendMaterial.dispose();
  }
}
