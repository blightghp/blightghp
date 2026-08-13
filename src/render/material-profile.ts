import * as THREE from "three";
import type { SimulationView } from "./laminar-layer";
import {
  declareMaterialEligibility,
  declareVisual,
  setVisualMaterialProfileMetadata,
  visualMaterialEligibilityOf,
  visualPassOf,
  visualProvenanceOf,
  visualSemanticBindingOf,
} from "./render-types";
import type {
  VisualMaterialEligibility,
  VisualMaterialProfile,
  VisualMaterialSurface,
} from "./render-types";

export interface MaterialManifestEntry extends VisualMaterialEligibility {
  readonly objectName: string;
}

export type RealisticIllustrativeManifest = Readonly<
  Record<SimulationView, readonly MaterialManifestEntry[]>
>;

function entry(
  objectName: string,
  surface: VisualMaterialSurface,
  maximumLocalRadius: number,
  opacityRange: readonly [number, number] = [0, 1],
): MaterialManifestEntry {
  return {
    id: `r09-f:${objectName}`,
    objectName,
    surface,
    maximumLocalRadius,
    opacityRange,
    source: "procedural-scene-graph",
  };
}

const LAMINAR_MATTER = Array.from({ length: 6 }, (_, index) => [
  entry(`L${index + 1}-excitatory`, "tissue", 1.2),
  entry(`L${index + 1}-inhibitory`, "membrane", 0.7),
]).flat();

/**
 * No atlas or external texture participates in this manifest. Every entry
 * resolves an existing procedural object and declares a conservative envelope.
 */
export const REALISTIC_ILLUSTRATIVE_MANIFEST: RealisticIllustrativeManifest = {
  overview: [
    entry("leftHemi-shell", "tissue", 2.2, [0.22, 0.5]),
    entry("rightHemi-shell", "tissue", 2.2, [0.22, 0.5]),
    entry("cerebellum-shell", "tissue", 1.2, [0.22, 0.5]),
    entry("stem-shell", "tissue", 1.2, [0.22, 0.5]),
  ],
  laminar: [
    ...LAMINAR_MATTER,
    entry("thalamic-relay", "tissue", 0.8),
    entry("thalamic-reticular-nucleus", "membrane", 0.8),
  ],
  cell: [
    entry("adex-somata", "membrane", 0.3),
    entry("field-boundary", "substrate", 3.2, [0.05, 0.6]),
  ],
  neuron: [entry("resolved-neuron-soma", "membrane", 0.7)],
  electricity: [entry("electrical-board-surface", "substrate", 3.8, [0.1, 1])],
  synapse: [
    entry("presynaptic-bouton", "membrane", 1.6),
    entry("postsynaptic-membrane", "membrane", 2.2),
    entry("vesicular-reserve", "membrane", 0.3),
  ],
};

type MaterialMesh = THREE.Mesh & { material: THREE.Material };

interface ManagedMaterial {
  readonly view: SimulationView;
  readonly root: THREE.Object3D;
  readonly object: MaterialMesh;
  readonly schematic: THREE.Material;
  readonly eligibility: VisualMaterialEligibility;
  physical?: THREE.MeshPhysicalMaterial;
}

export interface MaterialProfileAudit {
  readonly activeProfile: VisualMaterialProfile;
  readonly requestedProfile: VisualMaterialProfile;
  readonly eligibleObjects: number;
  readonly physicalMaterialObjects: number;
  readonly transmissionObjects: number;
  readonly semanticGeometryChanges: number;
  readonly estimatedAdditionalObjectDraws: number;
  readonly estimatedTransmissionPasses: number;
  readonly lightCount: number;
  readonly fallbackReason?: string;
}

function materialColor(source: THREE.Material): THREE.Color {
  const colored = source as THREE.Material & { color?: THREE.Color };
  if (colored.color) return colored.color.clone();
  if (source instanceof THREE.ShaderMaterial) {
    const uniformColor: unknown = source.uniforms.shellColor?.value;
    if (uniformColor instanceof THREE.Color) return uniformColor.clone();
  }
  return new THREE.Color(0x7fa8bf);
}

function sourceOpacity(source: THREE.Material): number {
  if (source instanceof THREE.ShaderMaterial) {
    const value: unknown = source.uniforms.opacity?.value;
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return source.opacity;
}

function surfaceParameters(surface: VisualMaterialSurface): {
  roughness: number;
  transmission: number;
  thickness: number;
  clearcoat: number;
} {
  if (surface === "membrane") {
    return { roughness: 0.38, transmission: 0.18, thickness: 0.045, clearcoat: 0.22 };
  }
  if (surface === "tissue") {
    return { roughness: 0.58, transmission: 0.08, thickness: 0.09, clearcoat: 0.08 };
  }
  return { roughness: 0.78, transmission: 0, thickness: 0, clearcoat: 0.04 };
}

function copyRenderContract(source: THREE.Material, target: THREE.MeshPhysicalMaterial): void {
  target.name = `${source.name || source.type}:realistic-illustrative`;
  target.opacity = sourceOpacity(source);
  target.transparent = source.transparent || target.opacity < 1 || target.transmission > 0;
  target.alphaTest = source.alphaTest;
  target.blending = source.blending;
  target.blendSrc = source.blendSrc;
  target.blendDst = source.blendDst;
  target.blendEquation = source.blendEquation;
  target.depthFunc = source.depthFunc;
  target.depthTest = source.depthTest;
  target.depthWrite = source.depthWrite;
  target.colorWrite = source.colorWrite;
  target.side = source.side;
  target.shadowSide = source.shadowSide;
  target.toneMapped = source.toneMapped;
  target.clippingPlanes = source.clippingPlanes;
  target.clipIntersection = source.clipIntersection;
  target.clipShadows = source.clipShadows;
  target.stencilWrite = source.stencilWrite;
  target.stencilWriteMask = source.stencilWriteMask;
  target.stencilFunc = source.stencilFunc;
  target.stencilRef = source.stencilRef;
  target.stencilFuncMask = source.stencilFuncMask;
  target.stencilFail = source.stencilFail;
  target.stencilZFail = source.stencilZFail;
  target.stencilZPass = source.stencilZPass;
  target.needsUpdate = true;
}

function createPhysicalMaterial(record: ManagedMaterial): THREE.MeshPhysicalMaterial {
  const parameters = surfaceParameters(record.eligibility.surface);
  const material = new THREE.MeshPhysicalMaterial({
    color: materialColor(record.schematic),
    roughness: parameters.roughness,
    metalness: 0,
    transmission: parameters.transmission,
    thickness: parameters.thickness,
    clearcoat: parameters.clearcoat,
    clearcoatRoughness: 0.62,
    ior: 1.38,
    attenuationColor: materialColor(record.schematic),
    attenuationDistance: 1.8,
    vertexColors: Boolean(record.object.geometry.getAttribute("color")),
  });
  material.emissive.copy(material.color).multiplyScalar(0.035);
  material.emissiveIntensity = 0.18;
  copyRenderContract(record.schematic, material);
  return material;
}

function copyDynamicState(
  source: THREE.Material,
  target: THREE.MeshPhysicalMaterial,
  eligibility: VisualMaterialEligibility,
): void {
  target.color.copy(materialColor(source));
  target.attenuationColor.copy(target.color);
  target.opacity = THREE.MathUtils.clamp(
    sourceOpacity(source),
    eligibility.opacityRange[0],
    eligibility.opacityRange[1],
  );
  target.transparent = source.transparent || target.opacity < 1 || target.transmission > 0;
  if (source instanceof THREE.ShaderMaterial) {
    const activity: unknown = source.uniforms.activity?.value;
    const normalized = typeof activity === "number" && Number.isFinite(activity)
      ? THREE.MathUtils.clamp(activity, 0, 1)
      : 0;
    target.opacity *= 0.78 + normalized * 0.22;
    target.emissiveIntensity = 0.12 + normalized * 0.24;
  }
  target.needsUpdate = true;
}

function copyPhysicalStateToSchematic(
  source: THREE.MeshPhysicalMaterial,
  target: THREE.Material,
): void {
  const colored = target as THREE.Material & { color?: THREE.Color };
  colored.color?.copy(source.color);
  target.opacity = source.opacity;
  target.transparent = source.transparent;
  target.depthWrite = source.depthWrite;
  target.needsUpdate = true;
}

export class RealisticIllustrativeMaterialManager {
  private readonly managed: ManagedMaterial[] = [];
  private readonly roots = new Set<THREE.Object3D>();
  private readonly originalGeometryIds = new Map<THREE.Object3D, string>();
  private readonly lightRig = new THREE.Group();
  private activeProfile: VisualMaterialProfile = "schematic";
  private requestedProfile: VisualMaterialProfile = "schematic";
  private contextAvailable = true;
  private highContrast = false;
  private fallbackReason: string | undefined;
  private disposed = false;

  constructor(private readonly scene: THREE.Scene) {
    this.lightRig.name = "realistic-illustrative-light-rig";
    this.lightRig.userData.epistemicClass = "DECORATION";
    const hemisphere = new THREE.HemisphereLight(0xd9efff, 0x07101c, 1.45);
    const key = new THREE.DirectionalLight(0xe8f5ff, 2.25);
    const fill = new THREE.DirectionalLight(0x5b91c8, 0.82);
    key.position.set(3.4, 4.8, 5.6);
    fill.position.set(-4.2, 1.4, -3.1);
    for (const light of [hemisphere, key, fill]) {
      declareVisual(light, "matter", "decoration");
      this.lightRig.add(light);
    }
    this.lightRig.visible = false;
    this.scene.add(this.lightRig);
  }

  registerLayer(
    view: SimulationView,
    root: THREE.Object3D,
    manifest: readonly MaterialManifestEntry[],
  ): void {
    if (this.disposed) throw new Error("material manager is disposed");
    const pending: ManagedMaterial[] = [];
    const seen = new Set<THREE.Object3D>();
    for (const declaration of manifest) {
      const object = root.getObjectByName(declaration.objectName);
      if (!object) throw new Error(`material manifest object is missing: ${declaration.objectName}`);
      if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) {
        throw new Error(`material manifest object is not a single-material mesh: ${declaration.objectName}`);
      }
      if (seen.has(object) || this.managed.some((record) => record.object === object)) {
        throw new Error(`material manifest object is duplicated: ${declaration.objectName}`);
      }
      if (visualPassOf(object) !== "matter" || !visualProvenanceOf(object)) {
        throw new Error(`material manifest object lacks matter provenance: ${declaration.objectName}`);
      }
      if (visualProvenanceOf(object) === "state" && !visualSemanticBindingOf(object)) {
        throw new Error(`state material lacks a semantic binding: ${declaration.objectName}`);
      }
      if (!object.geometry.getAttribute("normal")) {
        throw new Error(`material manifest geometry lacks normals: ${declaration.objectName}`);
      }
      object.geometry.computeBoundingSphere();
      const radius = object.geometry.boundingSphere?.radius;
      if (!radius || radius > declaration.maximumLocalRadius) {
        throw new Error(`material manifest envelope exceeded: ${declaration.objectName}`);
      }
      seen.add(object);
      const { objectName: _objectName, ...eligibility } = declaration;
      pending.push({
        view,
        root,
        object,
        schematic: object.material,
        eligibility,
      });
    }
    for (const record of pending) {
      declareMaterialEligibility(record.object, record.eligibility);
      this.originalGeometryIds.set(record.object, record.object.geometry.uuid);
      this.managed.push(record);
    }
    this.roots.add(root);
    setVisualMaterialProfileMetadata(root, this.activeProfile);
  }

  setEnvironment(options: { contextAvailable?: boolean; highContrast?: boolean }): void {
    if (options.contextAvailable !== undefined) this.contextAvailable = options.contextAvailable;
    if (options.highContrast !== undefined) this.highContrast = options.highContrast;
    this.applyRequestedProfile();
  }

  setProfile(profile: VisualMaterialProfile): VisualMaterialProfile {
    if (this.disposed) throw new Error("material manager is disposed");
    this.requestedProfile = profile;
    this.applyRequestedProfile();
    return this.activeProfile;
  }

  failAtomic(reason: string): void {
    this.contextAvailable = false;
    this.requestedProfile = "schematic";
    this.fallbackReason = reason;
    this.activateSchematic();
  }

  sync(): void {
    if (this.activeProfile !== "realistic-illustrative") return;
    for (const record of this.managed) {
      if (record.schematic instanceof THREE.ShaderMaterial && record.physical) {
        copyDynamicState(record.schematic, record.physical, record.eligibility);
      } else if (record.physical) {
        record.physical.opacity = THREE.MathUtils.clamp(
          record.physical.opacity,
          record.eligibility.opacityRange[0],
          record.eligibility.opacityRange[1],
        );
      }
    }
  }

  profile(): VisualMaterialProfile {
    return this.activeProfile;
  }

  audit(): MaterialProfileAudit {
    const physical = this.managed.filter(
      (record) => record.object.material instanceof THREE.MeshPhysicalMaterial,
    );
    return {
      activeProfile: this.activeProfile,
      requestedProfile: this.requestedProfile,
      eligibleObjects: this.managed.filter((record) => visualMaterialEligibilityOf(record.object))
        .length,
      physicalMaterialObjects: physical.length,
      transmissionObjects: physical.filter(
        (record) => (record.object.material as THREE.MeshPhysicalMaterial).transmission > 0,
      ).length,
      semanticGeometryChanges: this.managed.filter(
        (record) => this.originalGeometryIds.get(record.object) !== record.object.geometry.uuid,
      ).length,
      estimatedAdditionalObjectDraws: 0,
      estimatedTransmissionPasses: physical.some(
        (record) => (record.object.material as THREE.MeshPhysicalMaterial).transmission > 0,
      ) ? 1 : 0,
      lightCount: this.lightRig.children.length,
      ...(this.fallbackReason ? { fallbackReason: this.fallbackReason } : {}),
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.activateSchematic();
    for (const record of this.managed) record.physical?.dispose();
    this.managed.length = 0;
    this.originalGeometryIds.clear();
    this.roots.clear();
    this.lightRig.removeFromParent();
    this.disposed = true;
  }

  private applyRequestedProfile(): void {
    if (!this.contextAvailable) {
      this.fallbackReason ??= "webgl-context-unavailable";
      this.activateSchematic();
      return;
    }
    if (this.highContrast) {
      this.fallbackReason = "high-contrast-requires-schematic";
      this.activateSchematic();
      return;
    }
    if (this.requestedProfile === "schematic") {
      this.fallbackReason = undefined;
      this.activateSchematic();
      return;
    }
    this.activateRealisticIllustrative();
  }

  private activateRealisticIllustrative(): void {
    const created: THREE.MeshPhysicalMaterial[] = [];
    try {
      for (const record of this.managed) {
        if (!record.physical) {
          record.physical = createPhysicalMaterial(record);
          created.push(record.physical);
        }
      }
      for (const record of this.managed) {
        if (!record.physical) throw new Error("realistic material was not created atomically");
        copyDynamicState(record.schematic, record.physical, record.eligibility);
        record.object.material = record.physical;
      }
      this.activeProfile = "realistic-illustrative";
      this.fallbackReason = undefined;
      this.lightRig.visible = true;
      for (const root of this.roots) {
        setVisualMaterialProfileMetadata(root, "realistic-illustrative");
      }
    } catch (error) {
      for (const material of created) material.dispose();
      for (const record of this.managed) {
        if (created.includes(record.physical as THREE.MeshPhysicalMaterial)) {
          record.physical = undefined;
        }
      }
      this.fallbackReason = error instanceof Error ? error.message : "material-profile-failure";
      this.activateSchematic();
    }
  }

  private activateSchematic(): void {
    for (const record of this.managed) {
      if (record.object.material === record.physical && record.physical) {
        if (!(record.schematic instanceof THREE.ShaderMaterial)) {
          copyPhysicalStateToSchematic(record.physical, record.schematic);
        }
        record.object.material = record.schematic;
      }
    }
    this.activeProfile = "schematic";
    this.lightRig.visible = false;
    for (const root of this.roots) setVisualMaterialProfileMetadata(root, "schematic");
  }
}

interface SavedPresentationMaterial {
  readonly material: THREE.Material;
  readonly opacity: number;
  readonly transparent: boolean;
  readonly depthWrite: boolean;
}

export interface PresentationEffectsState {
  readonly opacity: number;
  readonly xray: boolean;
  readonly isolateMatter: boolean;
}

/** Applies presentation-only multipliers for exactly one render and restores them afterwards. */
export class PresentationMaterialEffects {
  private state: PresentationEffectsState = { opacity: 1, xray: false, isolateMatter: false };
  private readonly saved = new Map<THREE.Material, SavedPresentationMaterial>();

  setState(update: Partial<PresentationEffectsState>): void {
    this.state = {
      opacity: THREE.MathUtils.clamp(update.opacity ?? this.state.opacity, 0.08, 1),
      xray: update.xray ?? this.state.xray,
      isolateMatter: update.isolateMatter ?? this.state.isolateMatter,
    };
  }

  beforeRender(root: THREE.Object3D): void {
    if (this.saved.size > 0) throw new Error("presentation effects were not restored");
    root.traverse((object) => {
      if (!("material" in object)) return;
      const renderable = object as THREE.Object3D & {
        material: THREE.Material | THREE.Material[];
      };
      const materials = Array.isArray(renderable.material)
        ? renderable.material
        : [renderable.material];
      const matter = visualPassOf(object) === "matter";
      for (const material of materials) {
        if (this.saved.has(material)) continue;
        this.saved.set(material, {
          material,
          opacity: material.opacity,
          transparent: material.transparent,
          depthWrite: material.depthWrite,
        });
        const isolationMultiplier = this.state.isolateMatter && !matter ? 0.16 : 1;
        const matterOpacity = matter ? this.state.opacity : 1;
        const xrayMultiplier = this.state.xray && matter ? 0.28 : 1;
        material.opacity *= isolationMultiplier * matterOpacity * xrayMultiplier;
        if (material.opacity < 1) material.transparent = true;
        if (this.state.xray && matter) material.depthWrite = false;
      }
    });
  }

  afterRender(): void {
    for (const saved of this.saved.values()) {
      saved.material.opacity = saved.opacity;
      saved.material.transparent = saved.transparent;
      saved.material.depthWrite = saved.depthWrite;
    }
    this.saved.clear();
  }

  audit(): PresentationEffectsState {
    return { ...this.state };
  }
}
