import * as THREE from "three";
import type { SimulationView } from "./laminar-layer";
import { ProceduralNormalMapCache } from "./procedural-textures";
import type { ProceduralNormalMapProvider, ProceduralNormalMapType } from "./procedural-textures";
import {
  declareMaterialEligibility,
  declareVisual,
  setVisualMaterialProfileMetadata,
  visualMaterialEligibilityOf,
  visualPassOf,
  visualProvenanceOf,
  visualSemanticBindingOf,
  isVascularTopologyObject,
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

function semanticGeometryIdentity(geometry: THREE.BufferGeometry): string {
  const family = geometry.userData.presentationGeometryFamily;
  return typeof family === "string" && family.length > 0 ? `family:${family}` : `uuid:${geometry.uuid}`;
}

interface PhysicalMaterialRecord {
  readonly view: SimulationView;
  readonly object: MaterialMesh;
  readonly schematic: THREE.Material;
  readonly eligibility: VisualMaterialEligibility;
}

interface ManagedMaterial extends PhysicalMaterialRecord {
  readonly root: THREE.Object3D;
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
  readonly environmentMapActive: boolean;
  readonly environmentMapWidth: number;
  readonly environmentMapHeight: number;
  readonly estimatedEnvironmentTextureBytes: number;
  readonly proceduralNormalMapTextures: number;
  readonly estimatedProceduralTextureBytes: number;
  readonly estimatedOwnedTextureBytes: number;
  readonly generatedPresentationUvAttributes: number;
  readonly fallbackReason?: string;
}

export interface MaterialProfileManagerOptions {
  readonly renderer?: THREE.WebGLRenderer;
  /** Test seam: externally owned resources are never disposed by the manager. */
  readonly environmentTexture?: THREE.Texture;
  readonly normalMapProvider?: ProceduralNormalMapProvider;
  readonly physicalMaterialFactory?: (
    record: Readonly<{
      view: SimulationView;
      object: MaterialMesh;
      schematic: THREE.Material;
      eligibility: VisualMaterialEligibility;
    }>,
    normalMapProvider: ProceduralNormalMapProvider,
  ) => THREE.MeshPhysicalMaterial;
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

interface SurfaceParams {
  roughness: number;
  transmission: number;
  thickness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  sheen: number;
  sheenRoughness: number;
  sheenColor: number;
  ior: number;
}

const R10_E_ENVIRONMENT_WIDTH = 128;
const R10_E_ENVIRONMENT_HEIGHT = 64;

function clampByte(value: number): number {
  return Math.round(THREE.MathUtils.clamp(value, 0, 1) * 255);
}

function wrappedDistance(value: number, center: number): number {
  const distance = Math.abs(value - center);
  return Math.min(distance, 1 - distance);
}

/**
 * Creates the small, deterministic studio source consumed once by PMREM. It
 * contains only a neutral sky/ground gradient and broad key/fill panels; no
 * URL, bitmap asset, or scene geometry participates in the environment.
 */
export function createR10EProceduralEnvironmentSource(): THREE.DataTexture {
  const pixels = new Uint8Array(R10_E_ENVIRONMENT_WIDTH * R10_E_ENVIRONMENT_HEIGHT * 4);
  for (let y = 0; y < R10_E_ENVIRONMENT_HEIGHT; y += 1) {
    const v = y / (R10_E_ENVIRONMENT_HEIGHT - 1);
    const horizonWeight = THREE.MathUtils.smoothstep(v, 0, 0.52);
    const groundWeight = THREE.MathUtils.smoothstep(v, 0.48, 1);
    const baseRed = THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(0.105, 0.285, horizonWeight),
      0.055,
      groundWeight,
    );
    const baseGreen = THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(0.125, 0.235, horizonWeight),
      0.052,
      groundWeight,
    );
    const baseBlue = THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(0.17, 0.205, horizonWeight),
      0.064,
      groundWeight,
    );
    for (let x = 0; x < R10_E_ENVIRONMENT_WIDTH; x += 1) {
      const u = x / (R10_E_ENVIRONMENT_WIDTH - 1);
      const key = Math.exp(
        -((wrappedDistance(u, 0.18) / 0.105) ** 2 + ((v - 0.46) / 0.31) ** 2) * 3.2,
      );
      const fill = Math.exp(
        -((wrappedDistance(u, 0.72) / 0.16) ** 2 + ((v - 0.5) / 0.38) ** 2) * 3.2,
      );
      const horizon = Math.exp(-(((v - 0.49) / 0.13) ** 2));
      const index = (y * R10_E_ENVIRONMENT_WIDTH + x) * 4;
      pixels[index] = clampByte(baseRed + key * 0.62 + fill * 0.09 + horizon * 0.055);
      pixels[index + 1] = clampByte(baseGreen + key * 0.46 + fill * 0.14 + horizon * 0.04);
      pixels[index + 2] = clampByte(baseBlue + key * 0.32 + fill * 0.24 + horizon * 0.025);
      pixels[index + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(
    pixels,
    R10_E_ENVIRONMENT_WIDTH,
    R10_E_ENVIRONMENT_HEIGHT,
    THREE.RGBAFormat,
  );
  texture.name = "r10-e-procedural-studio-equirectangular";
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function sphericalUvAttribute(geometry: THREE.BufferGeometry): THREE.BufferAttribute {
  const positions = geometry.getAttribute("position");
  const values = new Float32Array(positions.count * 2);
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const z = positions.getZ(index);
    const radius = Math.max(Number.EPSILON, Math.sqrt(x * x + y * y + z * z));
    values[index * 2] = Math.atan2(z, x) / (Math.PI * 2) + 0.5;
    values[index * 2 + 1] = Math.asin(THREE.MathUtils.clamp(y / radius, -1, 1)) / Math.PI + 0.5;
  }
  return new THREE.BufferAttribute(values, 2);
}

export function surfaceParameters(surface: VisualMaterialSurface): SurfaceParams {
  if (surface === "membrane") {
    return {
      roughness: 0.32,
      transmission: 0.22,
      thickness: 0.06,
      clearcoat: 0.28,
      clearcoatRoughness: 0.35,
      sheen: 0.18,
      sheenRoughness: 0.75,
      sheenColor: 0xe8d4c0,
      ior: 1.4,
    };
  }
  if (surface === "tissue") {
    return {
      roughness: 0.52,
      transmission: 0.1,
      thickness: 0.12,
      clearcoat: 0.12,
      clearcoatRoughness: 0.55,
      sheen: 0.25,
      sheenRoughness: 0.85,
      sheenColor: 0xd4a080,
      ior: 1.38,
    };
  }
  return {
    roughness: 0.72,
    transmission: 0,
    thickness: 0,
    clearcoat: 0.06,
    clearcoatRoughness: 0.85,
    sheen: 0,
    sheenRoughness: 0,
    sheenColor: 0x000000,
    ior: 1.5,
  };
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

function normalMapType(record: PhysicalMaterialRecord): ProceduralNormalMapType | undefined {
  if (record.eligibility.surface === "tissue") return "cortical";
  if (record.eligibility.surface === "substrate") return undefined;
  return record.object.name === "vesicular-reserve" ? "vesicle" : "membrane";
}

function createPhysicalMaterial(
  record: PhysicalMaterialRecord,
  normalMapProvider: ProceduralNormalMapProvider,
): THREE.MeshPhysicalMaterial {
  const parameters = surfaceParameters(record.eligibility.surface);
  const textureType = normalMapType(record);
  const material = new THREE.MeshPhysicalMaterial({
    color: materialColor(record.schematic),
    roughness: parameters.roughness,
    metalness: 0,
    transmission: parameters.transmission,
    thickness: parameters.thickness,
    clearcoat: parameters.clearcoat,
    clearcoatRoughness: parameters.clearcoatRoughness,
    sheen: parameters.sheen,
    sheenRoughness: parameters.sheenRoughness,
    sheenColor: parameters.sheenColor,
    ior: parameters.ior,
    attenuationColor: materialColor(record.schematic),
    attenuationDistance: 1.8,
    vertexColors: Boolean(record.object.geometry.getAttribute("color")),
    normalMap: textureType ? normalMapProvider.get(textureType) : null,
    normalScale: new THREE.Vector2(
      record.eligibility.surface === "tissue" ? 0.3 : 0.15,
      record.eligibility.surface === "tissue" ? 0.3 : 0.15,
    ),
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

function textureDimensions(texture: THREE.Texture | undefined): { width: number; height: number } {
  const image: unknown = texture?.image;
  if (!image || typeof image !== "object") return { width: 0, height: 0 };
  const candidate = image as { width?: unknown; height?: unknown };
  return {
    width: typeof candidate.width === "number" ? candidate.width : 0,
    height: typeof candidate.height === "number" ? candidate.height : 0,
  };
}

function estimatedTextureBytes(texture: THREE.Texture | undefined): number {
  const { width, height } = textureDimensions(texture);
  const bytesPerChannel = texture?.type === THREE.FloatType
    ? 4
    : texture?.type === THREE.HalfFloatType
      ? 2
      : 1;
  return width * height * 4 * bytesPerChannel;
}

export class RealisticIllustrativeMaterialManager {
  private readonly managed: ManagedMaterial[] = [];
  private readonly roots = new Set<THREE.Object3D>();
  private readonly originalGeometryIds = new Map<THREE.Object3D, string>();
  private readonly generatedUvAttributes = new Map<THREE.BufferGeometry, THREE.BufferAttribute>();
  private readonly lightRig = new THREE.Group();
  private readonly environmentTexture: THREE.Texture | undefined;
  private readonly ownsEnvironmentTexture: boolean;
  private readonly normalMapProvider: ProceduralNormalMapProvider;
  private readonly ownsNormalMapProvider: boolean;
  private readonly physicalMaterialFactory: NonNullable<
    MaterialProfileManagerOptions["physicalMaterialFactory"]
  >;
  private resourceFailureReason: string | undefined;
  private activeProfile: VisualMaterialProfile = "schematic";
  private requestedProfile: VisualMaterialProfile = "schematic";
  private contextAvailable = true;
  private highContrast = false;
  private fallbackReason: string | undefined;
  private disposed = false;

  constructor(
    private readonly scene: THREE.Scene,
    options: MaterialProfileManagerOptions = {},
  ) {
    this.normalMapProvider = options.normalMapProvider ?? new ProceduralNormalMapCache();
    this.ownsNormalMapProvider = !options.normalMapProvider;
    this.physicalMaterialFactory = options.physicalMaterialFactory ?? createPhysicalMaterial;
    if (options.environmentTexture) {
      this.environmentTexture = options.environmentTexture;
      this.ownsEnvironmentTexture = false;
    } else if (options.renderer) {
      let generator: THREE.PMREMGenerator | undefined;
      let source: THREE.DataTexture | undefined;
      let generated: THREE.Texture | undefined;
      try {
        generator = new THREE.PMREMGenerator(options.renderer);
        source = createR10EProceduralEnvironmentSource();
        generated = generator.fromEquirectangular(source).texture;
        generated.name = "r10-e-procedural-studio-pmrem";
      } catch (error) {
        generated?.dispose();
        this.resourceFailureReason = error instanceof Error
          ? `environment-map-failure: ${error.message}`
          : "environment-map-failure";
      } finally {
        source?.dispose();
        generator?.dispose();
      }
      this.environmentTexture = generated;
      this.ownsEnvironmentTexture = Boolean(generated);
    } else {
      this.environmentTexture = undefined;
      this.ownsEnvironmentTexture = false;
      this.resourceFailureReason = "environment-map-renderer-unavailable";
    }
    this.lightRig.name = "realistic-illustrative-light-rig";
    this.lightRig.userData.epistemicClass = "DECORATION";
    const hemisphere = new THREE.HemisphereLight(0xbdd4e6, 0x171018, 0.82);
    const key = new THREE.DirectionalLight(0xffdfc2, 2.05);
    const fill = new THREE.DirectionalLight(0x8aa7ca, 0.52);
    const rim = new THREE.DirectionalLight(0xffc9ae, 0.94);
    key.position.set(3.8, 4.5, 5.7);
    fill.position.set(-4.5, 1.8, -3.4);
    rim.position.set(-2.8, 3.2, -5.4);
    for (const light of [hemisphere, key, fill, rim]) {
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
      if (!record.object.geometry.getAttribute("uv")) {
        const uv = sphericalUvAttribute(record.object.geometry);
        record.object.geometry.setAttribute("uv", uv);
        this.generatedUvAttributes.set(record.object.geometry, uv);
      }
      record.object.castShadow = false;
      record.object.receiveShadow = false;
      declareMaterialEligibility(record.object, record.eligibility);
      this.originalGeometryIds.set(record.object, semanticGeometryIdentity(record.object.geometry));
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
      if (record.physical) copyDynamicState(record.schematic, record.physical, record.eligibility);
    }
  }

  profile(): VisualMaterialProfile {
    return this.activeProfile;
  }

  audit(view?: SimulationView): MaterialProfileAudit {
    const records = view
      ? this.managed.filter((record) => record.view === view)
      : this.managed;
    const physical = records.filter(
      (record) => record.object.material instanceof THREE.MeshPhysicalMaterial,
    );
    const environmentSize = textureDimensions(this.environmentTexture);
    const environmentBytes = estimatedTextureBytes(this.environmentTexture);
    const normalMapBytes = this.normalMapProvider.estimatedBytes();
    return {
      activeProfile: this.activeProfile,
      requestedProfile: this.requestedProfile,
      eligibleObjects: records.filter((record) => visualMaterialEligibilityOf(record.object))
        .length,
      physicalMaterialObjects: physical.length,
      transmissionObjects: physical.filter(
        (record) => (record.object.material as THREE.MeshPhysicalMaterial).transmission > 0,
      ).length,
      semanticGeometryChanges: records.filter(
        (record) => this.originalGeometryIds.get(record.object) !==
          semanticGeometryIdentity(record.object.geometry),
      ).length,
      estimatedAdditionalObjectDraws: physical.filter((record) => {
        const material = record.object.material as THREE.MeshPhysicalMaterial;
        return material.transparent && material.side === THREE.DoubleSide && !material.forceSinglePass;
      }).length,
      estimatedTransmissionPasses: physical.some(
        (record) => (record.object.material as THREE.MeshPhysicalMaterial).transmission > 0,
      ) ? 1 : 0,
      lightCount: this.lightRig.children.length,
      environmentMapActive: this.scene.environment === this.environmentTexture,
      environmentMapWidth: environmentSize.width,
      environmentMapHeight: environmentSize.height,
      estimatedEnvironmentTextureBytes: environmentBytes,
      proceduralNormalMapTextures: this.normalMapProvider.count(),
      estimatedProceduralTextureBytes: normalMapBytes,
      estimatedOwnedTextureBytes: environmentBytes + normalMapBytes,
      generatedPresentationUvAttributes: new Set(
        records
          .map((record) => record.object.geometry)
          .filter((geometry) => this.generatedUvAttributes.has(geometry)),
      ).size,
      ...(this.fallbackReason ? { fallbackReason: this.fallbackReason } : {}),
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.activateSchematic();
    for (const record of this.managed) record.physical?.dispose();
    for (const [geometry, attribute] of this.generatedUvAttributes) {
      if (geometry.getAttribute("uv") === attribute) geometry.deleteAttribute("uv");
    }
    this.generatedUvAttributes.clear();
    this.managed.length = 0;
    this.originalGeometryIds.clear();
    this.roots.clear();
    this.lightRig.removeFromParent();
    if (this.ownsNormalMapProvider) this.normalMapProvider.dispose();
    if (this.ownsEnvironmentTexture) this.environmentTexture?.dispose();
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
      if (this.resourceFailureReason) throw new Error(this.resourceFailureReason);
      if (!this.environmentTexture) throw new Error("environment-map-unavailable");
      for (const record of this.managed) {
        if (!record.physical) {
          record.physical = this.physicalMaterialFactory(record, this.normalMapProvider);
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
      this.scene.environment = this.environmentTexture;
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
        record.object.material = record.schematic;
      }
    }
    this.activeProfile = "schematic";
    this.scene.environment = null;
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
  readonly isolateVascular: boolean;
}

/** Applies presentation-only multipliers for exactly one render and restores them afterwards. */
export class PresentationMaterialEffects {
  private state: PresentationEffectsState = {
    opacity: 1,
    xray: false,
    isolateMatter: false,
    isolateVascular: false,
  };
  private readonly saved = new Map<THREE.Material, SavedPresentationMaterial>();
  private readonly materialCache = new Map<
    THREE.Object3D,
    {
      revision: number;
      records: Array<{
        object: THREE.Object3D & { material: THREE.Material | THREE.Material[] };
        matter: boolean;
      }>;
    }
  >();
  private cacheBuilds = 0;

  setState(update: Partial<PresentationEffectsState>): void {
    this.state = {
      opacity: THREE.MathUtils.clamp(update.opacity ?? this.state.opacity, 0.08, 1),
      xray: update.xray ?? this.state.xray,
      isolateMatter: update.isolateMatter ?? this.state.isolateMatter,
      isolateVascular: update.isolateVascular ?? this.state.isolateVascular,
    };
  }

  beforeRender(root: THREE.Object3D, sceneRevision = 0): void {
    if (this.saved.size > 0) throw new Error("presentation effects were not restored");
    const cached = this.cachedMaterials(root, sceneRevision);
    for (const { object: renderable, matter } of cached) {
      const materials = Array.isArray(renderable.material)
        ? renderable.material
        : [renderable.material];
      for (const material of materials) {
        if (this.saved.has(material)) continue;
        this.saved.set(material, {
          material,
          opacity: material.opacity,
          transparent: material.transparent,
          depthWrite: material.depthWrite,
        });
        const isolationMultiplier = this.state.isolateMatter && !matter ? 0.16 : 1;
        const vascularIsolationMultiplier =
          this.state.isolateVascular && matter && !isVascularTopologyObject(renderable) ? 0.12 : 1;
        const matterOpacity = matter ? this.state.opacity : 1;
        const xrayMultiplier = this.state.xray && matter ? 0.28 : 1;
        material.opacity *= isolationMultiplier * vascularIsolationMultiplier *
          matterOpacity * xrayMultiplier;
        if (material.opacity < 1) material.transparent = true;
        if (this.state.xray && matter) material.depthWrite = false;
      }
    }
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

  invalidate(root?: THREE.Object3D): void {
    if (root) this.materialCache.delete(root);
    else this.materialCache.clear();
  }

  cacheAudit(): { readonly roots: number; readonly records: number; readonly builds: number } {
    return {
      roots: this.materialCache.size,
      records: [...this.materialCache.values()].reduce(
        (total, cached) => total + cached.records.length,
        0,
      ),
      builds: this.cacheBuilds,
    };
  }

  private cachedMaterials(
    root: THREE.Object3D,
    revision: number,
  ): Array<{
    object: THREE.Object3D & { material: THREE.Material | THREE.Material[] };
    matter: boolean;
  }> {
    const cached = this.materialCache.get(root);
    if (cached?.revision === revision) return cached.records;
    const records: Array<{
      object: THREE.Object3D & { material: THREE.Material | THREE.Material[] };
      matter: boolean;
    }> = [];
    root.traverse((object) => {
      if (!("material" in object)) return;
      records.push({
        object: object as THREE.Object3D & {
          material: THREE.Material | THREE.Material[];
        },
        matter: visualPassOf(object) === "matter",
      });
    });
    this.materialCache.set(root, { revision, records });
    this.cacheBuilds += 1;
    return records;
  }
}
