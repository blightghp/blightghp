import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import {
  estimateHalfResolutionAmbientOcclusionTextureBytes,
  HalfResolutionGtaoPass,
  HALF_RESOLUTION_AMBIENT_OCCLUSION_SCALE,
  sameAmbientOcclusionDecision,
} from "./ambient-occlusion";
import type { AmbientOcclusionDecision } from "./ambient-occlusion";
import { isExcludedFromSelectiveBloom, visualPassOf } from "./render-types";
import { VISUAL_COLORS } from "./visual-tokens";

type MaterialObject = THREE.Object3D & {
  material: THREE.Material | THREE.Material[];
};

function hasMaterial(object: THREE.Object3D): object is MaterialObject {
  return "material" in object;
}

function worldVisible(object: THREE.Object3D): boolean {
  let cursor: THREE.Object3D | null = object;
  while (cursor) {
    if (!cursor.visible) return false;
    cursor = cursor.parent;
  }
  return true;
}

const COMPOSITE_SHADER = {
  uniforms: {
    baseTexture: { value: null },
    bloomTexture: { value: null },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D baseTexture;
    uniform sampler2D bloomTexture;
    varying vec2 vUv;
    void main() {
      vec4 base = texture2D(baseTexture, vUv);
      vec3 bloom = texture2D(bloomTexture, vUv).rgb;
      gl_FragColor = vec4(base.rgb + bloom, base.a);
    }
  `,
};

export function estimateSelectiveBloomTextureBytes(
  width: number,
  height: number,
  pixelRatio: number,
): number {
  const effectiveWidth = Math.max(1, Math.round(width * pixelRatio));
  const effectiveHeight = Math.max(1, Math.round(height * pixelRatio));
  // Two RGBA16F ping-pong targets in each of the two composers.
  let pixels = effectiveWidth * effectiveHeight * 4;
  let mipWidth = Math.max(1, Math.round(effectiveWidth / 2));
  let mipHeight = Math.max(1, Math.round(effectiveHeight / 2));
  // UnrealBloomPass owns one bright target plus two targets for each of 5 mips.
  pixels += mipWidth * mipHeight;
  for (let mip = 0; mip < 5; mip += 1) {
    pixels += mipWidth * mipHeight * 2;
    mipWidth = Math.max(1, Math.round(mipWidth / 2));
    mipHeight = Math.max(1, Math.round(mipHeight / 2));
  }
  return pixels * 8;
}

/** Keeps the bloom depth mask on the exact local clipping contract used by the base pass. */
export function syncBloomDepthMaskClipping(
  source: THREE.Material,
  depthMask: THREE.MeshBasicMaterial,
): void {
  depthMask.clippingPlanes = source.clippingPlanes;
  depthMask.clipIntersection = source.clipIntersection;
  depthMask.clipShadows = source.clipShadows;
  depthMask.side = source.side;
  depthMask.depthTest = source.depthTest;
  depthMask.depthWrite = source.depthWrite;
  depthMask.depthFunc = source.depthFunc;
}

/**
 * Renders emission into its own bloom target while matter writes the depth mask.
 * The final pass draws the untouched scene and adds only the emission bloom.
 */
export class SelectiveBloomPipeline {
  readonly bloomPass: UnrealBloomPass;
  private readonly bloomComposer: EffectComposer;
  private readonly finalComposer: EffectComposer;
  private readonly depthMaskMaterials = new Map<THREE.Material, THREE.MeshBasicMaterial>();
  private readonly savedMaterials = new Map<MaterialObject, THREE.Material | THREE.Material[]>();
  private readonly savedVisibilities = new Map<THREE.Object3D, boolean>();
  private ambientOcclusionPass: HalfResolutionGtaoPass | undefined;
  private ambientOcclusionState: AmbientOcclusionDecision = {
    enabled: false,
    scale: HALF_RESOLUTION_AMBIENT_OCCLUSION_SCALE,
    reason: "baseline-profile",
  };
  private matterObjects: MaterialObject[] = [];
  private emissionObjects: MaterialObject[] = [];
  private excludedObjects: THREE.Object3D[] = [];
  private sceneRevision = -1;
  private width: number;
  private height: number;
  private pixelRatio: number;
  private directRenders = 0;
  private bloomRenders = 0;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    size: THREE.Vector2,
    strength: number,
    radius: number,
  ) {
    this.width = size.x;
    this.height = size.y;
    this.pixelRatio = renderer.getPixelRatio();
    this.bloomPass = new UnrealBloomPass(size, strength, radius, 0.12);
    const createStencilTarget = (): THREE.WebGLRenderTarget =>
      new THREE.WebGLRenderTarget(size.x, size.y, {
        type: THREE.HalfFloatType,
        depthBuffer: true,
        stencilBuffer: true,
      });
    this.bloomComposer = new EffectComposer(renderer, createStencilTarget());
    this.bloomComposer.renderToScreen = false;
    this.bloomComposer.addPass(new RenderPass(scene, this.camera));
    this.bloomComposer.addPass(this.bloomPass);

    const finalPass = new ShaderPass(
      new THREE.ShaderMaterial({
        uniforms: {
          baseTexture: { value: null },
          bloomTexture: { value: this.bloomComposer.renderTarget2.texture },
        },
        vertexShader: COMPOSITE_SHADER.vertexShader,
        fragmentShader: COMPOSITE_SHADER.fragmentShader,
        defines: {},
      }),
      "baseTexture",
    );
    finalPass.needsSwap = true;
    this.finalComposer = new EffectComposer(renderer, createStencilTarget());
    this.finalComposer.addPass(new RenderPass(scene, this.camera));
    this.finalComposer.addPass(finalPass);
    this.finalComposer.addPass(new OutputPass());
  }

  render(options: { bloomEnabled?: boolean; sceneRevision?: number } = {}): void {
    const revision = options.sceneRevision ?? 0;
    if (revision !== this.sceneRevision) this.rebuildPartitions(revision);
    const bloomEnabled = options.bloomEnabled ?? true;
    if (!bloomEnabled || !this.emissionObjects.some(worldVisible)) {
      this.directRenders += 1;
      this.renderer.render(this.scene, this.camera);
      return;
    }
    for (const object of this.excludedObjects) {
      this.savedVisibilities.set(object, object.visible);
      object.visible = false;
    }
    for (const object of this.matterObjects) {
      this.savedMaterials.set(object, object.material);
      object.material = Array.isArray(object.material)
        ? object.material.map((material) => this.depthMaskFor(material))
        : this.depthMaskFor(object.material);
    }
    try {
      this.bloomComposer.render();
      this.bloomRenders += 1;
    } finally {
      for (const [object, material] of this.savedMaterials) object.material = material;
      this.savedMaterials.clear();
      for (const [object, visible] of this.savedVisibilities) object.visible = visible;
      this.savedVisibilities.clear();
    }
    this.finalComposer.render();
  }

  setSize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.bloomComposer.setSize(width, height);
    this.finalComposer.setSize(width, height);
  }

  setPixelRatio(pixelRatio: number): void {
    this.pixelRatio = pixelRatio;
    this.bloomComposer.setPixelRatio(pixelRatio);
    this.finalComposer.setPixelRatio(pixelRatio);
  }

  /** Adds GTAO only after the policy has ruled out baseline and unsafe modes. */
  setAmbientOcclusion(decision: AmbientOcclusionDecision): void {
    if (sameAmbientOcclusionDecision(this.ambientOcclusionState, decision)) return;
    this.removeAmbientOcclusionPass();
    this.ambientOcclusionState = decision;
    if (!decision.enabled) return;
    const pass = new HalfResolutionGtaoPass(this.scene, this.camera, this.width, this.height);
    this.finalComposer.insertPass(pass, 1);
    this.ambientOcclusionPass = pass;
  }

  invalidateSceneGraph(): void {
    this.sceneRevision = -1;
  }

  audit(): {
    readonly sceneRevision: number;
    readonly matterObjects: number;
    readonly emissionObjects: number;
    readonly excludedObjects: number;
    readonly directRenders: number;
    readonly bloomRenders: number;
    readonly finalOutputPass: true;
    readonly ambientOcclusion: {
      readonly enabled: boolean;
      readonly scale: typeof HALF_RESOLUTION_AMBIENT_OCCLUSION_SCALE;
      readonly width: number;
      readonly height: number;
      readonly reason?: string;
    };
    readonly estimatedOwnedTextureBytes: number;
  } {
    return {
      sceneRevision: this.sceneRevision,
      matterObjects: this.matterObjects.length,
      emissionObjects: this.emissionObjects.length,
      excludedObjects: this.excludedObjects.length,
      directRenders: this.directRenders,
      bloomRenders: this.bloomRenders,
      finalOutputPass: true,
      ambientOcclusion: {
        enabled: this.ambientOcclusionState.enabled,
        scale: this.ambientOcclusionState.scale,
        width: this.ambientOcclusionPass?.width ?? 0,
        height: this.ambientOcclusionPass?.height ?? 0,
        ...(!this.ambientOcclusionState.enabled
          ? { reason: this.ambientOcclusionState.reason }
          : {}),
      },
      estimatedOwnedTextureBytes: estimateSelectiveBloomTextureBytes(
        this.width,
        this.height,
        this.pixelRatio,
      ) + (this.ambientOcclusionPass
        ? estimateHalfResolutionAmbientOcclusionTextureBytes(
            this.width,
            this.height,
            this.pixelRatio,
          )
        : 0),
    };
  }

  dispose(): void {
    this.removeAmbientOcclusionPass();
    for (const material of this.depthMaskMaterials.values()) material.dispose();
    this.depthMaskMaterials.clear();
    this.bloomComposer.dispose();
    this.finalComposer.dispose();
    this.matterObjects = [];
    this.emissionObjects = [];
    this.excludedObjects = [];
  }

  private rebuildPartitions(revision: number): void {
    const matter: MaterialObject[] = [];
    const emission: MaterialObject[] = [];
    const excluded: THREE.Object3D[] = [];
    this.scene.traverse((object) => {
      if (isExcludedFromSelectiveBloom(object)) {
        excluded.push(object);
        return;
      }
      if (!hasMaterial(object)) return;
      if (visualPassOf(object) === "emission") emission.push(object);
      else matter.push(object);
    });
    this.matterObjects = matter;
    this.emissionObjects = emission;
    this.excludedObjects = excluded;
    this.sceneRevision = revision;
  }

  private removeAmbientOcclusionPass(): void {
    if (!this.ambientOcclusionPass) return;
    this.finalComposer.removePass(this.ambientOcclusionPass);
    this.ambientOcclusionPass.dispose();
    this.ambientOcclusionPass = undefined;
  }

  private depthMaskFor(source: THREE.Material): THREE.MeshBasicMaterial {
    let depthMask = this.depthMaskMaterials.get(source);
    if (!depthMask) {
      depthMask = new THREE.MeshBasicMaterial({
        color: VISUAL_COLORS.transparentBlack,
        colorWrite: false,
        depthTest: true,
        depthWrite: true,
      });
      depthMask.name = `${source.name || source.type}:selective-bloom-depth-mask`;
      this.depthMaskMaterials.set(source, depthMask);
    }
    syncBloomDepthMaskClipping(source, depthMask);
    return depthMask;
  }
}
