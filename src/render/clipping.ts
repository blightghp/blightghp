import * as THREE from "three";
import type { BrainData } from "../brain";
import { declareNonAnatomical } from "./anatomical-provenance";
import type { SimulationView } from "./laminar-layer";
import {
  declareVisual,
  excludeFromSelectiveBloom,
  visualClippingParticipationOf,
} from "./render-types";

export type CutOrientation = "coronal" | "sagittal" | "axial" | "oblique";

export interface CutPlaneState {
  readonly enabled: boolean;
  readonly orientation: CutOrientation;
  readonly slab: boolean;
  /** Signed offset in procedural scene units. */
  readonly position: number;
  readonly slabThickness: number;
  readonly obliqueAzimuthDegrees: number;
  readonly obliqueElevationDegrees: number;
}

export const DEFAULT_CUT_PLANE_STATE: CutPlaneState = {
  enabled: false,
  orientation: "coronal",
  slab: false,
  position: 0,
  slabThickness: 0.42,
  obliqueAzimuthDegrees: 38,
  obliqueElevationDegrees: 24,
};

export function parseCutOrientation(value: unknown): CutOrientation | undefined {
  return value === "coronal" || value === "sagittal" || value === "axial" ||
      value === "oblique"
    ? value
    : undefined;
}

export function cutNormal(state: CutPlaneState): THREE.Vector3 {
  if (state.orientation === "coronal") return new THREE.Vector3(0, 0, 1);
  if (state.orientation === "sagittal") return new THREE.Vector3(1, 0, 0);
  if (state.orientation === "axial") return new THREE.Vector3(0, 1, 0);
  const azimuth = THREE.MathUtils.degToRad(state.obliqueAzimuthDegrees);
  const elevation = THREE.MathUtils.degToRad(state.obliqueElevationDegrees);
  return new THREE.Vector3(
    Math.cos(elevation) * Math.cos(azimuth),
    Math.sin(elevation),
    Math.cos(elevation) * Math.sin(azimuth),
  ).normalize();
}

/** Three.js keeps the positive half-space of every local clipping plane. */
export function createCutPlanes(state: CutPlaneState): THREE.Plane[] {
  if (!state.enabled) return [];
  const normal = cutNormal(state);
  if (!state.slab) return [new THREE.Plane(normal, -state.position)];
  const halfThickness = state.slabThickness * 0.5;
  const lower = state.position - halfThickness;
  const upper = state.position + halfThickness;
  return [
    new THREE.Plane(normal, -lower),
    new THREE.Plane(normal.clone().negate(), upper),
  ];
}

function boundedState(update: Partial<CutPlaneState>, current: CutPlaneState): CutPlaneState {
  return {
    enabled: update.enabled ?? current.enabled,
    orientation: parseCutOrientation(update.orientation) ?? current.orientation,
    slab: update.slab ?? current.slab,
    position: THREE.MathUtils.clamp(update.position ?? current.position, -2.4, 2.4),
    slabThickness: THREE.MathUtils.clamp(
      update.slabThickness ?? current.slabThickness,
      0.04,
      4.8,
    ),
    obliqueAzimuthDegrees: THREE.MathUtils.clamp(
      update.obliqueAzimuthDegrees ?? current.obliqueAzimuthDegrees,
      -180,
      180,
    ),
    obliqueElevationDegrees: THREE.MathUtils.clamp(
      update.obliqueElevationDegrees ?? current.obliqueElevationDegrees,
      -89,
      89,
    ),
  };
}

type StencilSource = THREE.Mesh & { material: THREE.Material | THREE.Material[] };

interface StencilPair {
  readonly source: StencilSource;
  readonly back: StencilSource;
  readonly front: StencilSource;
  readonly backMaterial: THREE.MeshBasicMaterial;
  readonly frontMaterial: THREE.MeshBasicMaterial;
}

interface StencilPlaneRender {
  readonly plane: THREE.Plane;
  readonly pairs: StencilPair[];
  readonly cap: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
}

const R10_E_CUT_FACE_SHADER_VERSION = "r10-e-cut-face-v1";
const R10_E_CUT_FACE_SHADER_FLAG = "r10eCutFaceShader";

interface R10ECutFaceParameters {
  readonly color: THREE.ColorRepresentation;
  readonly tint: THREE.ColorRepresentation;
  readonly opacity: number;
  readonly patternStrength: number;
  readonly patternScale: number;
}

const R10_E_CUT_FACE_PARAMETERS: R10ECutFaceParameters = {
  color: 0x958b82,
  tint: 0xd8d0c6,
  opacity: 0.86,
  patternStrength: 0.16,
  patternScale: 2.2,
};

type R10ECutFaceShaderSource = Pick<
  THREE.WebGLProgramParametersWithUniforms,
  "vertexShader" | "fragmentShader" | "uniforms"
>;

function boundedCutFaceValue(value: number, minimum: number, maximum: number, fallback: number): number {
  return Number.isFinite(value) ? THREE.MathUtils.clamp(value, minimum, maximum) : fallback;
}

function cutFaceParameters(
  parameters: R10ECutFaceParameters = R10_E_CUT_FACE_PARAMETERS,
): R10ECutFaceParameters {
  return {
    color: parameters.color,
    tint: parameters.tint,
    opacity: boundedCutFaceValue(parameters.opacity, 0.1, 1, 0.86),
    patternStrength: boundedCutFaceValue(parameters.patternStrength, 0, 0.32, 0.16),
    patternScale: boundedCutFaceValue(parameters.patternScale, 0.1, 8, 2.2),
  };
}

function replaceCutFaceShaderAnchor(
  source: string,
  anchor: string,
  replacement: string,
  label: string,
): string {
  if (!source.includes(anchor)) throw new Error(`R10-E cut-face shader anchor is missing: ${label}`);
  return source.replace(anchor, replacement);
}

function ensureR10ECutFaceShaderAnchors(): void {
  const basic = THREE.ShaderLib.basic;
  if (
    !basic.vertexShader.includes("#include <common>") ||
    !basic.vertexShader.includes("#include <worldpos_vertex>") ||
    !basic.fragmentShader.includes("#include <common>") ||
    !basic.fragmentShader.includes("#include <aomap_fragment>")
  ) {
    throw new Error("R10-E cut-face shader contract is incompatible with this Three.js build");
  }
}

/** Keeps an illustrative, non-anatomical section pattern in linear shader space. */
export function applyR10ECutFaceShader(
  shader: R10ECutFaceShaderSource,
  parameters: R10ECutFaceParameters = R10_E_CUT_FACE_PARAMETERS,
): void {
  const bounded = cutFaceParameters(parameters);
  shader.uniforms.r10eCutFaceTint = { value: new THREE.Color(bounded.tint) };
  shader.uniforms.r10eCutFacePatternStrength = { value: bounded.patternStrength };
  shader.uniforms.r10eCutFacePatternScale = { value: bounded.patternScale };
  shader.vertexShader = replaceCutFaceShaderAnchor(
    shader.vertexShader,
    "#include <common>",
    `#include <common>
varying vec3 vR10ECutFaceWorldPosition;`,
    "vertex common",
  );
  shader.vertexShader = replaceCutFaceShaderAnchor(
    shader.vertexShader,
    "#include <worldpos_vertex>",
    `#include <worldpos_vertex>
vR10ECutFaceWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
    "vertex model position",
  );
  shader.fragmentShader = replaceCutFaceShaderAnchor(
    shader.fragmentShader,
    "#include <common>",
    `#include <common>
varying vec3 vR10ECutFaceWorldPosition;
uniform vec3 r10eCutFaceTint;
uniform float r10eCutFacePatternStrength;
uniform float r10eCutFacePatternScale;`,
    "fragment common",
  );
  shader.fragmentShader = replaceCutFaceShaderAnchor(
    shader.fragmentShader,
    "#include <aomap_fragment>",
    `#include <aomap_fragment>
vec3 r10eCutFaceCell = floor(vR10ECutFaceWorldPosition * 17.0);
float r10eCutFaceGrain = fract(sin(dot(r10eCutFaceCell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
float r10eCutFaceBand = 0.5 + 0.5 * sin(
  dot(vR10ECutFaceWorldPosition, vec3(1.7, 2.3, 2.9)) * r10eCutFacePatternScale
);
float r10eCutFaceTone = mix(0.92, 1.08, r10eCutFaceBand) +
  (r10eCutFaceGrain - 0.5) * r10eCutFacePatternStrength * 0.2;
vec3 r10eCutFaceBase = mix(diffuseColor.rgb, r10eCutFaceTint, 0.24);
diffuseColor.rgb = clamp(
  r10eCutFaceBase * mix(1.0, r10eCutFaceTone, r10eCutFacePatternStrength),
  0.0,
  1.0
);`,
    "ambient-occlusion modulation",
  );
}

export function createR10ECutFaceMaterial(
  clippingPlanes: THREE.Plane[],
  parameters: R10ECutFaceParameters = R10_E_CUT_FACE_PARAMETERS,
): THREE.MeshBasicMaterial {
  const bounded = cutFaceParameters(parameters);
  ensureR10ECutFaceShaderAnchors();
  const material = new THREE.MeshBasicMaterial({
    color: bounded.color,
    transparent: true,
    opacity: bounded.opacity,
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: true,
    clippingPlanes,
    stencilWrite: true,
    stencilRef: 0,
    stencilFunc: THREE.NotEqualStencilFunc,
    stencilFail: THREE.ReplaceStencilOp,
    stencilZFail: THREE.ReplaceStencilOp,
    stencilZPass: THREE.ReplaceStencilOp,
  });
  material.onBeforeCompile = (shader) => applyR10ECutFaceShader(shader, bounded);
  material.customProgramCacheKey = () => R10_E_CUT_FACE_SHADER_VERSION;
  material.userData.r10eMaterialRegion = "cut-face";
  material.userData[R10_E_CUT_FACE_SHADER_FLAG] = true;
  material.needsUpdate = true;
  return material;
}

function stencilMaterial(
  plane: THREE.Plane,
  side: THREE.Side,
  operation: THREE.StencilOp,
): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthWrite: false,
    depthTest: false,
    side,
    clippingPlanes: [plane],
    stencilWrite: true,
    stencilFunc: THREE.AlwaysStencilFunc,
    stencilFail: operation,
    stencilZFail: operation,
    stencilZPass: operation,
  });
}

function worldVisible(object: THREE.Object3D): boolean {
  let cursor: THREE.Object3D | null = object;
  while (cursor) {
    if (!cursor.visible) return false;
    cursor = cursor.parent;
  }
  return true;
}

/**
 * Dedicated stencil cap pass. Source geometry is shared and never disposed by
 * this class; every material and cap geometry allocated here is owned here.
 */
export class StencilCapPass {
  readonly group = new THREE.Group();
  private renders: StencilPlaneRender[] = [];
  private sources: StencilSource[] = [];
  private coverageDiameter = 8;
  private disposed = false;

  constructor(private readonly scene: THREE.Scene) {
    this.group.name = "r09-f-stencil-caps";
    this.group.userData.epistemicClass = "DECORATION";
    this.scene.add(this.group);
  }

  configure(sources: readonly StencilSource[], planes: readonly THREE.Plane[]): void {
    if (this.disposed) throw new Error("stencil cap pass is disposed");
    const sameShape = sources.length === this.sources.length &&
      sources.every((source, index) => source === this.sources[index]) &&
      planes.length === this.renders.length;
    if (sameShape) {
      for (let index = 0; index < planes.length; index += 1) {
        this.renders[index].plane.copy(planes[index]);
      }
      this.updateCapTransforms();
      return;
    }
    this.releaseRenders();
    this.sources = [...sources];
    this.coverageDiameter = this.computeCoverageDiameter();
    const stablePlanes = planes.map((plane) => plane.clone());
    for (let planeIndex = 0; planeIndex < stablePlanes.length; planeIndex += 1) {
      const plane = stablePlanes[planeIndex];
      const pairs = this.sources.map((source, sourceIndex) => {
        const backMaterial = stencilMaterial(
          plane,
          THREE.BackSide,
          THREE.IncrementWrapStencilOp,
        );
        const frontMaterial = stencilMaterial(
          plane,
          THREE.FrontSide,
          THREE.DecrementWrapStencilOp,
        );
        const back = source.clone(false) as StencilSource;
        const front = source.clone(false) as StencilSource;
        back.material = backMaterial;
        front.material = frontMaterial;
        back.userData = {};
        front.userData = {};
        back.name = `cut-stencil-back-${planeIndex}-${sourceIndex}`;
        front.name = `cut-stencil-front-${planeIndex}-${sourceIndex}`;
        back.matrixAutoUpdate = false;
        front.matrixAutoUpdate = false;
        back.renderOrder = 40 + planeIndex * 4;
        front.renderOrder = 41 + planeIndex * 4;
        declareVisual(back, "matter", "decoration");
        declareVisual(front, "matter", "decoration");
        excludeFromSelectiveBloom(back);
        excludeFromSelectiveBloom(front);
        this.group.add(back, front);
        return { source, back, front, backMaterial, frontMaterial };
      });

      const capMaterial = createR10ECutFaceMaterial(
        stablePlanes.filter((_, index) => index !== planeIndex),
      );
      const cap = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), capMaterial);
      cap.name = `cut-cap-${planeIndex}`;
      cap.renderOrder = 42 + planeIndex * 4;
      cap.onAfterRender = (renderer) => renderer.clearStencil();
      declareVisual(cap, "matter", "decoration");
      declareNonAnatomical(
        cap,
        "Procedural illustrative cut face; it does not encode anatomy, patient data, or state.",
      );
      excludeFromSelectiveBloom(cap);
      this.group.add(cap);
      this.renders.push({ plane, pairs, cap });
    }
    this.update();
  }

  update(): void {
    if (this.disposed) return;
    let anyVisible = false;
    for (const render of this.renders) {
      for (const pair of render.pairs) {
        pair.source.updateWorldMatrix(true, false);
        const visible = worldVisible(pair.source);
        pair.back.visible = visible;
        pair.front.visible = visible;
        pair.back.matrix.copy(pair.source.matrixWorld);
        pair.front.matrix.copy(pair.source.matrixWorld);
        anyVisible ||= visible;
      }
      render.cap.visible = anyVisible;
    }
    this.group.visible = anyVisible && this.renders.length > 0;
    this.updateCapTransforms();
  }

  estimatedDrawCalls(): number {
    if (!this.group.visible) return 0;
    return this.renders.reduce(
      (total, render) =>
        total + render.pairs.filter((pair) => pair.back.visible).length * 2 + 1,
      0,
    );
  }

  cutFaceShaderCaps(): number {
    return this.renders.filter(
      (render) => render.cap.material.userData[R10_E_CUT_FACE_SHADER_FLAG] === true,
    ).length;
  }

  dispose(): void {
    if (this.disposed) return;
    this.releaseRenders();
    this.group.removeFromParent();
    this.disposed = true;
  }

  private computeCoverageDiameter(): number {
    if (this.sources.length === 0) return 8;
    const bounds = new THREE.Box3();
    for (const source of this.sources) bounds.expandByObject(source, true);
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    return Math.max(4, sphere.radius * 4.4);
  }

  private updateCapTransforms(): void {
    const point = new THREE.Vector3();
    const forward = new THREE.Vector3(0, 0, 1);
    for (const render of this.renders) {
      render.plane.coplanarPoint(point);
      render.cap.position.copy(point);
      render.cap.quaternion.setFromUnitVectors(forward, render.plane.normal);
      render.cap.scale.setScalar(this.coverageDiameter * 0.5);
      for (const pair of render.pairs) {
        pair.backMaterial.clippingPlanes = [render.plane];
        pair.frontMaterial.clippingPlanes = [render.plane];
      }
    }
  }

  private releaseRenders(): void {
    for (const render of this.renders) {
      for (const pair of render.pairs) {
        pair.back.removeFromParent();
        pair.front.removeFromParent();
        pair.backMaterial.dispose();
        pair.frontMaterial.dispose();
      }
      render.cap.removeFromParent();
      render.cap.geometry.dispose();
      render.cap.material.dispose();
    }
    this.renders = [];
    this.sources = [];
    this.group.visible = false;
  }
}

interface ClippingLayerRegistration {
  readonly id: SimulationView;
  readonly root: THREE.Object3D;
  readonly optIn: boolean;
  readonly capObjectNames: readonly string[];
}

interface SavedClippingContract {
  readonly clippingPlanes: readonly THREE.Plane[] | null;
  readonly clipIntersection: boolean;
  readonly clipShadows: boolean;
}

export interface ClippingAudit {
  readonly enabled: boolean;
  readonly orientation: CutOrientation;
  readonly slab: boolean;
  readonly planeCount: number;
  readonly registeredLayers: number;
  readonly optedInLayers: number;
  readonly clippedMaterials: number;
  readonly capSources: number;
  readonly cutFaceShaderCaps: number;
  readonly estimatedAdditionalDrawCalls: number;
  readonly maximumAdditionalDrawCalls: number;
}

interface LocalClippingRenderer {
  localClippingEnabled: boolean;
}

const MAXIMUM_CAP_DRAW_CALLS = 18;

export class ClippingSystem {
  private state: CutPlaneState = { ...DEFAULT_CUT_PLANE_STATE };
  private planes: THREE.Plane[] = [];
  private readonly layers = new Map<SimulationView, ClippingLayerRegistration>();
  private readonly layerObjects = new Map<
    SimulationView,
    Array<THREE.Object3D & { material: THREE.Material | THREE.Material[] }>
  >();
  private readonly savedMaterials = new Map<THREE.Material, SavedClippingContract>();
  private readonly capPass: StencilCapPass;
  private activeLayer: SimulationView = "overview";
  private capSources: StencilSource[] = [];
  private disposed = false;
  private readonly previousLocalClippingEnabled: boolean;
  private cacheBuilds = 0;

  constructor(
    private readonly renderer: LocalClippingRenderer,
    scene: THREE.Scene,
  ) {
    this.previousLocalClippingEnabled = renderer.localClippingEnabled;
    this.capPass = new StencilCapPass(scene);
  }

  registerLayer(registration: ClippingLayerRegistration): void {
    if (this.disposed) throw new Error("clipping system is disposed");
    if (this.layers.has(registration.id)) {
      throw new Error(`clipping layer already registered: ${registration.id}`);
    }
    registration.root.userData.visualClippingOptIn = registration.optIn;
    this.layers.set(registration.id, registration);
    this.rebuildLayerCache(registration.id);
    this.refresh();
  }

  setActiveLayer(layer: SimulationView): void {
    if (!this.layers.has(layer)) throw new Error(`clipping layer is not registered: ${layer}`);
    this.activeLayer = layer;
    this.refreshCapSources();
  }

  setState(update: Partial<CutPlaneState>): CutPlaneState {
    if (this.disposed) throw new Error("clipping system is disposed");
    this.state = boundedState(update, this.state);
    this.planes = createCutPlanes(this.state);
    this.refresh();
    return this.getState();
  }

  disable(): void {
    this.setState({ enabled: false });
  }

  getState(): CutPlaneState {
    return { ...this.state };
  }

  primaryPlane(): THREE.Plane | undefined {
    return this.planes[0]?.clone();
  }

  refresh(): void {
    this.renderer.localClippingEnabled = this.state.enabled || this.previousLocalClippingEnabled;
    for (const registration of this.layers.values()) {
      for (const renderable of this.layerObjects.get(registration.id) ?? []) {
        const materials = Array.isArray(renderable.material)
          ? renderable.material
          : [renderable.material];
        const included = registration.optIn && this.state.enabled &&
          visualClippingParticipationOf(renderable) === "include";
        for (const material of materials) {
          if (!this.savedMaterials.has(material)) {
            const inheritedActivePlanes = included && material.clippingPlanes === this.planes;
            this.savedMaterials.set(material, {
              clippingPlanes: inheritedActivePlanes ? null : material.clippingPlanes,
              clipIntersection: inheritedActivePlanes ? false : material.clipIntersection,
              clipShadows: inheritedActivePlanes ? false : material.clipShadows,
            });
          }
          const saved = this.savedMaterials.get(material);
          material.clippingPlanes = included
            ? this.planes
            : (saved?.clippingPlanes as THREE.Plane[] | null | undefined) ?? null;
          material.clipIntersection = included ? false : saved?.clipIntersection ?? false;
          material.clipShadows = included ? false : saved?.clipShadows ?? false;
          material.needsUpdate = true;
        }
      }
    }
    this.refreshCapSources();
  }

  invalidateLayer(layer: SimulationView): void {
    if (!this.layers.has(layer)) throw new Error(`clipping layer is not registered: ${layer}`);
    this.rebuildLayerCache(layer);
    this.refresh();
  }

  update(): void {
    this.capPass.update();
  }

  audit(): ClippingAudit {
    let clippedMaterials = 0;
    for (const registration of this.layers.values()) {
      for (const object of this.layerObjects.get(registration.id) ?? []) {
        const material = object.material;
        const materials = Array.isArray(material) ? material : [material];
        clippedMaterials += materials.filter((entry) => entry.clippingPlanes?.length).length;
      }
    }
    return {
      enabled: this.state.enabled,
      orientation: this.state.orientation,
      slab: this.state.slab,
      planeCount: this.planes.length,
      registeredLayers: this.layers.size,
      optedInLayers: [...this.layers.values()].filter((layer) => layer.optIn).length,
      clippedMaterials,
      capSources: this.capSources.length,
      cutFaceShaderCaps: this.capPass.cutFaceShaderCaps(),
      estimatedAdditionalDrawCalls: this.capPass.estimatedDrawCalls(),
      maximumAdditionalDrawCalls: MAXIMUM_CAP_DRAW_CALLS,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disable();
    for (const [material, saved] of this.savedMaterials) {
      material.clippingPlanes = saved.clippingPlanes as THREE.Plane[] | null;
      material.clipIntersection = saved.clipIntersection;
      material.clipShadows = saved.clipShadows;
      material.needsUpdate = true;
    }
    this.savedMaterials.clear();
    this.layers.clear();
    this.layerObjects.clear();
    this.capPass.dispose();
    this.renderer.localClippingEnabled = this.previousLocalClippingEnabled;
    this.disposed = true;
  }

  private refreshCapSources(): void {
    const registration = this.layers.get(this.activeLayer);
    this.capSources = [];
    if (registration?.optIn && this.state.enabled) {
      for (const name of registration.capObjectNames) {
        const object = registration.root.getObjectByName(name);
        if (object instanceof THREE.Mesh) this.capSources.push(object as StencilSource);
      }
    }
    const estimated = this.capSources.length * 2 * this.planes.length + this.planes.length;
    if (estimated > MAXIMUM_CAP_DRAW_CALLS) {
      this.capSources = this.capSources.slice(
        0,
        Math.max(0, Math.floor((MAXIMUM_CAP_DRAW_CALLS - this.planes.length) / (2 * this.planes.length))),
      );
    }
    this.capPass.configure(this.capSources, this.planes);
  }

  cacheAudit(): { readonly layers: number; readonly objects: number; readonly builds: number } {
    return {
      layers: this.layerObjects.size,
      objects: [...this.layerObjects.values()].reduce(
        (total, objects) => total + objects.length,
        0,
      ),
      builds: this.cacheBuilds,
    };
  }

  private rebuildLayerCache(layer: SimulationView): void {
    const registration = this.layers.get(layer);
    if (!registration) return;
    const objects: Array<
      THREE.Object3D & { material: THREE.Material | THREE.Material[] }
    > = [];
    registration.root.traverse((object) => {
      if (!("material" in object)) return;
      objects.push(object as THREE.Object3D & {
        material: THREE.Material | THREE.Material[];
      });
    });
    this.layerObjects.set(layer, objects);
    this.cacheBuilds += 1;
  }
}

export interface CutPlaneProbeResult {
  readonly available: boolean;
  readonly field: "field.waveActivity";
  readonly unit: "normalized field activity";
  readonly interpolation: "linear between adjacent published snapshots";
  readonly sampling: string;
  readonly sampleCount: number;
  readonly value?: number;
  readonly reason?: string;
}

export function sampleMacroscopicCutProbe(
  view: SimulationView,
  topology: BrainData,
  currentWaveActivity: Float32Array | undefined,
  previousWaveActivity: Float32Array | undefined,
  alpha: number,
  localPlane: THREE.Plane | undefined,
  bandWidth = 0.08,
): CutPlaneProbeResult {
  const base = {
    field: "field.waveActivity" as const,
    unit: "normalized field activity" as const,
    interpolation: "linear between adjacent published snapshots" as const,
  };
  if (view !== "overview") {
    return {
      ...base,
      available: false,
      sampling: "disabled outside the macroscopic cortical field",
      sampleCount: 0,
      reason: "the active view has no declared position-to-macroscopic-field mapping",
    };
  }
  if (!localPlane || !currentWaveActivity) {
    return {
      ...base,
      available: false,
      sampling: "mean on the cut-face band",
      sampleCount: 0,
      reason: "clipping or the published cortical field is unavailable",
    };
  }
  const boundedAlpha = THREE.MathUtils.clamp(alpha, 0, 1);
  const candidates: Array<{ vertex: number; distance: number }> = [];
  for (let vertex = 0; vertex < topology.corticalField.nodeIndices.length; vertex += 1) {
    const node = topology.corticalField.nodeIndices[vertex];
    const distance = Math.abs(localPlane.distanceToPoint(topology.nodes[node]));
    if (distance <= bandWidth) candidates.push({ vertex, distance });
  }
  if (candidates.length === 0) {
    let nearest = { vertex: 0, distance: Number.POSITIVE_INFINITY };
    for (let vertex = 0; vertex < topology.corticalField.nodeIndices.length; vertex += 1) {
      const node = topology.corticalField.nodeIndices[vertex];
      const distance = Math.abs(localPlane.distanceToPoint(topology.nodes[node]));
      if (distance < nearest.distance) nearest = { vertex, distance };
    }
    candidates.push(nearest);
  }
  let total = 0;
  for (const { vertex } of candidates) {
    const current = currentWaveActivity[vertex] ?? 0;
    const previous = previousWaveActivity?.[vertex] ?? current;
    total += previous + (current - previous) * boundedAlpha;
  }
  return {
    ...base,
    available: true,
    sampling:
      `arithmetic mean of published cortical vertices within ±${bandWidth.toFixed(2)} procedural scene units`,
    sampleCount: candidates.length,
    value: total / candidates.length,
  };
}
