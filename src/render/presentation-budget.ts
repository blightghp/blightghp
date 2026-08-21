import * as THREE from "three";
import type { SimulationView } from "./laminar-layer";
import { visualProvenanceOf } from "./render-types";

export const PRESENTATION_BUDGET_SCHEMA_VERSION = 1 as const;
export const PRESENTATION_VIEWS = [
  "overview",
  "laminar",
  "cell",
  "neuron",
  "electricity",
  "synapse",
] as const satisfies readonly SimulationView[];

export type RenderProfile = "baseline" | "enhanced" | "cinema";
export type RenderProfileGovernorReason = "frame-budget-exceeded";

export interface PresentationBudgetLimits {
  readonly drawCalls: number;
  readonly triangles: number;
  readonly textureBytes: number;
  readonly geometryBytes: number;
  readonly frameMillisecondsP95: number;
}

export function parseRenderProfile(value: unknown): RenderProfile | undefined {
  return value === "baseline" || value === "enhanced" || value === "cinema"
    ? value
    : undefined;
}

export type PresentationBudget = Readonly<
  Record<RenderProfile, Readonly<Record<SimulationView, PresentationBudgetLimits>>>
>;

const MIB = 1024 * 1024;

/**
 * Schema 1 reserves enough memory for the current procedural scene while keeping
 * draw, triangle and cadence limits explicit per view. The audit artifact stores
 * the measured values; these are ceilings, never synthetic performance claims.
 */
export const PRESENTATION_BUDGET: PresentationBudget = {
  baseline: {
    overview: { drawCalls: 54, triangles: 155_000, textureBytes: 96 * MIB, geometryBytes: 24 * MIB, frameMillisecondsP95: 33.4 },
    laminar: { drawCalls: 98, triangles: 16_000, textureBytes: 96 * MIB, geometryBytes: 24 * MIB, frameMillisecondsP95: 33.4 },
    cell: { drawCalls: 26, triangles: 12_000, textureBytes: 96 * MIB, geometryBytes: 24 * MIB, frameMillisecondsP95: 33.4 },
    neuron: { drawCalls: 35, triangles: 8_000, textureBytes: 96 * MIB, geometryBytes: 24 * MIB, frameMillisecondsP95: 33.4 },
    electricity: { drawCalls: 36, triangles: 5_000, textureBytes: 96 * MIB, geometryBytes: 24 * MIB, frameMillisecondsP95: 33.4 },
    synapse: { drawCalls: 42, triangles: 36_000, textureBytes: 96 * MIB, geometryBytes: 24 * MIB, frameMillisecondsP95: 33.4 },
  },
  enhanced: {
    overview: { drawCalls: 64, triangles: 160_000, textureBytes: 160 * MIB, geometryBytes: 24 * MIB, frameMillisecondsP95: 20 },
    laminar: { drawCalls: 110, triangles: 18_000, textureBytes: 160 * MIB, geometryBytes: 24 * MIB, frameMillisecondsP95: 20 },
    cell: { drawCalls: 30, triangles: 14_000, textureBytes: 160 * MIB, geometryBytes: 24 * MIB, frameMillisecondsP95: 20 },
    neuron: { drawCalls: 40, triangles: 10_000, textureBytes: 160 * MIB, geometryBytes: 24 * MIB, frameMillisecondsP95: 20 },
    electricity: { drawCalls: 42, triangles: 7_000, textureBytes: 160 * MIB, geometryBytes: 24 * MIB, frameMillisecondsP95: 20 },
    synapse: { drawCalls: 48, triangles: 40_000, textureBytes: 160 * MIB, geometryBytes: 24 * MIB, frameMillisecondsP95: 20 },
  },
  cinema: {
    overview: { drawCalls: 72, triangles: 180_000, textureBytes: 256 * MIB, geometryBytes: 32 * MIB, frameMillisecondsP95: 50 },
    laminar: { drawCalls: 120, triangles: 22_000, textureBytes: 256 * MIB, geometryBytes: 32 * MIB, frameMillisecondsP95: 50 },
    cell: { drawCalls: 36, triangles: 18_000, textureBytes: 256 * MIB, geometryBytes: 32 * MIB, frameMillisecondsP95: 50 },
    neuron: { drawCalls: 46, triangles: 14_000, textureBytes: 256 * MIB, geometryBytes: 32 * MIB, frameMillisecondsP95: 50 },
    electricity: { drawCalls: 48, triangles: 10_000, textureBytes: 256 * MIB, geometryBytes: 32 * MIB, frameMillisecondsP95: 50 },
    synapse: { drawCalls: 54, triangles: 48_000, textureBytes: 256 * MIB, geometryBytes: 32 * MIB, frameMillisecondsP95: 50 },
  },
};

export interface PresentationFrameSample {
  readonly view: SimulationView;
  readonly frameMilliseconds: number;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly textureBytes: number;
  readonly geometryBytes: number;
}

export interface RenderProfileGovernorOptions {
  readonly initialProfile?: RenderProfile;
  readonly consecutiveOverBudgetFrames?: number;
  readonly recoveryFrames?: number;
  readonly recoveryRatio?: number;
}

export interface RenderProfileGovernorAudit {
  readonly profile: RenderProfile;
  readonly reason?: RenderProfileGovernorReason;
  readonly consecutiveOverBudgetFrames: number;
  readonly recoveryFrames: number;
  readonly recoveryAvailable: boolean;
  readonly transitions: number;
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && (value ?? 0) > 0 ? value as number : fallback;
}

function validSample(sample: PresentationFrameSample): boolean {
  return PRESENTATION_VIEWS.includes(sample.view) &&
    [
      sample.frameMilliseconds,
      sample.drawCalls,
      sample.triangles,
      sample.textureBytes,
      sample.geometryBytes,
    ].every((value) => Number.isFinite(value) && value >= 0);
}

export class RenderProfileGovernor {
  private profileValue: RenderProfile;
  private reasonValue: RenderProfileGovernorReason | undefined;
  private overBudgetFrames = 0;
  private underBudgetRecoveryFrames = 0;
  private transitionCount = 0;
  private readonly overBudgetThreshold: number;
  private readonly recoveryThreshold: number;
  private readonly recoveryRatio: number;

  constructor(
    private readonly budget: PresentationBudget = PRESENTATION_BUDGET,
    options: RenderProfileGovernorOptions = {},
  ) {
    this.profileValue = options.initialProfile ?? "enhanced";
    this.overBudgetThreshold = positiveInteger(options.consecutiveOverBudgetFrames, 12);
    this.recoveryThreshold = positiveInteger(options.recoveryFrames, 90);
    this.recoveryRatio = THREE.MathUtils.clamp(options.recoveryRatio ?? 0.78, 0.1, 1);
  }

  profile(): RenderProfile {
    return this.profileValue;
  }

  observe(sample: PresentationFrameSample): RenderProfileGovernorAudit {
    if (!validSample(sample)) throw new Error("invalid presentation budget sample");
    const limit = this.budget[this.profileValue][sample.view];
    if (this.profileValue === "enhanced") {
      if (sample.frameMilliseconds > limit.frameMillisecondsP95) {
        this.overBudgetFrames += 1;
      } else {
        this.overBudgetFrames = 0;
      }
      if (this.overBudgetFrames >= this.overBudgetThreshold) {
        this.profileValue = "baseline";
        this.reasonValue = "frame-budget-exceeded";
        this.overBudgetFrames = 0;
        this.underBudgetRecoveryFrames = 0;
        this.transitionCount += 1;
      }
    } else if (this.profileValue === "baseline" && this.reasonValue) {
      const baselineLimit = this.budget.baseline[sample.view].frameMillisecondsP95;
      if (sample.frameMilliseconds <= baselineLimit * this.recoveryRatio) {
        this.underBudgetRecoveryFrames = Math.min(
          this.recoveryThreshold,
          this.underBudgetRecoveryFrames + 1,
        );
      } else {
        this.underBudgetRecoveryFrames = Math.max(0, this.underBudgetRecoveryFrames - 1);
      }
    }
    return this.audit();
  }

  request(profile: RenderProfile, captureMode: boolean): RenderProfileGovernorAudit {
    if (profile === "cinema" && !captureMode) {
      throw new Error("cinema render profile requires capture mode");
    }
    if (profile === "enhanced" && this.reasonValue && !this.recoveryAvailable()) {
      throw new Error("enhanced render profile recovery is not available yet");
    }
    if (profile !== this.profileValue) this.transitionCount += 1;
    this.profileValue = profile;
    this.reasonValue = undefined;
    this.overBudgetFrames = 0;
    this.underBudgetRecoveryFrames = 0;
    return this.audit();
  }

  leaveCaptureMode(): RenderProfileGovernorAudit {
    if (this.profileValue === "cinema") {
      this.profileValue = "enhanced";
      this.transitionCount += 1;
    }
    return this.audit();
  }

  audit(): RenderProfileGovernorAudit {
    return {
      profile: this.profileValue,
      ...(this.reasonValue ? { reason: this.reasonValue } : {}),
      consecutiveOverBudgetFrames: this.overBudgetFrames,
      recoveryFrames: this.underBudgetRecoveryFrames,
      recoveryAvailable: this.recoveryAvailable(),
      transitions: this.transitionCount,
    };
  }

  private recoveryAvailable(): boolean {
    return !this.reasonValue || this.underBudgetRecoveryFrames >= this.recoveryThreshold;
  }
}

function percentile(samples: readonly number[], fraction: number): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

interface ViewSamples {
  frames: number[];
  latest?: PresentationFrameSample;
}

export interface PresentationViewBudgetAudit extends PresentationBudgetLimits {
  readonly sampleCount: number;
  readonly frameMillisecondsP50: number;
  readonly measuredFrameMillisecondsP95: number;
  readonly measuredDrawCalls: number;
  readonly measuredTriangles: number;
  readonly measuredTextureBytes: number;
  readonly measuredGeometryBytes: number;
  readonly withinBudget: boolean;
}

export interface PresentationBudgetAudit {
  readonly schemaVersion: typeof PRESENTATION_BUDGET_SCHEMA_VERSION;
  readonly profile: RenderProfile;
  readonly governor: RenderProfileGovernorAudit;
  readonly views: Readonly<Record<SimulationView, PresentationViewBudgetAudit>>;
  readonly contractReady: boolean;
}

export class PresentationBudgetMonitor {
  private readonly samples = new Map<SimulationView, ViewSamples>();

  record(sample: PresentationFrameSample): void {
    if (!validSample(sample)) throw new Error("invalid presentation budget sample");
    const view = this.samples.get(sample.view) ?? { frames: [] };
    view.frames.push(sample.frameMilliseconds);
    if (view.frames.length > 240) view.frames.shift();
    view.latest = sample;
    this.samples.set(sample.view, view);
  }

  reset(): void {
    this.samples.clear();
  }

  audit(
    profile: RenderProfile,
    governor: RenderProfileGovernorAudit,
  ): PresentationBudgetAudit {
    const views = {} as Record<SimulationView, PresentationViewBudgetAudit>;
    for (const view of PRESENTATION_VIEWS) {
      const observed = this.samples.get(view);
      const latest = observed?.latest;
      const limit = this.budgetFor(profile, view);
      const measured = {
        drawCalls: latest?.drawCalls ?? 0,
        triangles: latest?.triangles ?? 0,
        textureBytes: latest?.textureBytes ?? 0,
        geometryBytes: latest?.geometryBytes ?? 0,
        frameMillisecondsP95: percentile(observed?.frames ?? [], 0.95),
      };
      const hasSamples = (observed?.frames.length ?? 0) > 0;
      views[view] = {
        ...limit,
        sampleCount: observed?.frames.length ?? 0,
        frameMillisecondsP50: percentile(observed?.frames ?? [], 0.5),
        measuredFrameMillisecondsP95: measured.frameMillisecondsP95,
        measuredDrawCalls: measured.drawCalls,
        measuredTriangles: measured.triangles,
        measuredTextureBytes: measured.textureBytes,
        measuredGeometryBytes: measured.geometryBytes,
        withinBudget:
          hasSamples &&
          measured.drawCalls <= limit.drawCalls &&
          measured.triangles <= limit.triangles &&
          measured.textureBytes <= limit.textureBytes &&
          measured.geometryBytes <= limit.geometryBytes &&
          measured.frameMillisecondsP95 <= limit.frameMillisecondsP95,
      };
    }
    return {
      schemaVersion: PRESENTATION_BUDGET_SCHEMA_VERSION,
      profile,
      governor,
      views,
      contractReady: PRESENTATION_VIEWS.every((view) => views[view].withinBudget),
    };
  }

  private budgetFor(profile: RenderProfile, view: SimulationView): PresentationBudgetLimits {
    return PRESENTATION_BUDGET[profile][view];
  }
}

export interface PresentationResourceBytes {
  readonly geometryBytes: number;
  readonly textureBytes: number;
}

type Renderable = THREE.Object3D & {
  geometry?: THREE.BufferGeometry;
  material?: THREE.Material | THREE.Material[];
};

function attributeBytes(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): number {
  return attribute instanceof THREE.InterleavedBufferAttribute
    ? attribute.data.array.byteLength
    : attribute.array.byteLength;
}

function textureBytes(texture: THREE.Texture): number {
  const image: unknown = texture.image;
  if (!image || typeof image !== "object") return 0;
  const dimensions = image as { width?: unknown; height?: unknown };
  const width = typeof dimensions.width === "number" ? dimensions.width : 0;
  const height = typeof dimensions.height === "number" ? dimensions.height : 0;
  const bytesPerChannel = texture.type === THREE.FloatType
    ? 4
    : texture.type === THREE.HalfFloatType
      ? 2
      : 1;
  return width * height * 4 * bytesPerChannel;
}

export function measurePresentationResources(root: THREE.Object3D): PresentationResourceBytes {
  const geometries = new Set<THREE.BufferGeometry>();
  const attributeArrays = new Set<ArrayBufferLike>();
  const textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    const renderable = object as Renderable;
    if (renderable.geometry) geometries.add(renderable.geometry);
    const materials = Array.isArray(renderable.material)
      ? renderable.material
      : renderable.material
        ? [renderable.material]
        : [];
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) textures.add(value);
      }
    }
  });
  let geometryBytes = 0;
  for (const geometry of geometries) {
    const attributes = [geometry.index, ...Object.values(geometry.attributes)].filter(
      (attribute): attribute is THREE.BufferAttribute | THREE.InterleavedBufferAttribute =>
        attribute instanceof THREE.BufferAttribute ||
        attribute instanceof THREE.InterleavedBufferAttribute,
    );
    for (const attribute of attributes) {
      const array = attribute instanceof THREE.InterleavedBufferAttribute
        ? attribute.data.array.buffer
        : attribute.array.buffer;
      if (attributeArrays.has(array)) continue;
      attributeArrays.add(array);
      geometryBytes += attributeBytes(attribute);
    }
  }
  return {
    geometryBytes,
    textureBytes: [...textures].reduce((total, texture) => total + textureBytes(texture), 0),
  };
}

export class PresentationResourceCache {
  private readonly roots = new Map<SimulationView, THREE.Object3D>();
  private readonly values = new Map<SimulationView, PresentationResourceBytes>();

  register(view: SimulationView, root: THREE.Object3D): void {
    this.roots.set(view, root);
    this.values.delete(view);
  }

  invalidate(view?: SimulationView): void {
    if (view) this.values.delete(view);
    else this.values.clear();
  }

  measure(view: SimulationView): PresentationResourceBytes {
    const cached = this.values.get(view);
    if (cached) return cached;
    const root = this.roots.get(view);
    if (!root) throw new Error(`presentation resource root is not registered: ${view}`);
    const measured = measurePresentationResources(root);
    this.values.set(view, measured);
    return measured;
  }
}

/** Freezes only local transforms declared as static topology/decoration. */
export function freezeStaticPresentationMatrices(root: THREE.Object3D): number {
  let frozen = 0;
  root.traverse((object) => {
    if (object === root || visualProvenanceOf(object) === "state") return;
    if (visualProvenanceOf(object) !== "topology" && visualProvenanceOf(object) !== "decoration") {
      return;
    }
    object.updateMatrix();
    object.matrixAutoUpdate = false;
    frozen += 1;
  });
  return frozen;
}
