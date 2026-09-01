import * as THREE from "three";
import {
  ANATOMICAL_CATALOG,
  anatomicalEntryById,
} from "../anatomy";
import type { AnatomicalCatalog } from "../anatomy";
import { anatomicalDeclarationOf } from "./anatomical-provenance";
import { visualProvenanceOf } from "./render-types";
import type { VisualProvenance } from "./render-types";

export type SelectionHighlightStatus = "idle" | "ready" | "unknown-entry" | "no-match";

export type SelectionHighlightTreatment = "emissive" | "rim" | "textual-fallback" | "mixed";

export interface SelectionHighlightTarget {
  readonly entryId: string;
  readonly objectName: string;
  readonly objectUuid: string;
  /** The controller accepts direct declarations only; it never inherits an ancestor binding. */
  readonly directBinding: true;
  readonly provenance: VisualProvenance;
  readonly materialCount: number;
  readonly highlightedMaterialCount: number;
  readonly textualFallbackMaterialCount: number;
  readonly treatment: SelectionHighlightTreatment;
}

/** A deliberately small report for the UI status line and audit artifacts. */
export interface SelectionHighlightAudit {
  readonly entryId?: string;
  readonly status: SelectionHighlightStatus;
  readonly targetCount: number;
  readonly highlightedMaterials: number;
  readonly emissiveMaterials: number;
  readonly rimMaterials: number;
  readonly textualFallbackMaterials: number;
  /** This controller never creates, replaces, or clones a material. */
  readonly materialAllocations: 0;
  readonly renderActive: boolean;
}

export interface SelectionHighlightControllerOptions {
  readonly catalog?: AnatomicalCatalog;
  readonly emissiveColor?: number;
  readonly emissiveIntensity?: number;
  readonly rimColor?: number;
  readonly rimIntensity?: number;
}

export type SelectionHighlightCandidates = THREE.Object3D | readonly THREE.Object3D[];

type RenderableObject = THREE.Object3D & {
  material: THREE.Material | THREE.Material[];
};

type MutableTreatment = Exclude<SelectionHighlightTreatment, "textual-fallback" | "mixed">;

interface TargetCandidate {
  readonly object: RenderableObject;
  readonly provenance: VisualProvenance;
  readonly materials: readonly THREE.Material[];
}

interface MaterialResolution {
  readonly material: THREE.Material;
  readonly objects: Set<RenderableObject>;
  treatment: MutableTreatment | undefined;
  hasTextualFallback: boolean;
}

interface MaterialPlan {
  readonly material: THREE.Material;
  readonly objects: readonly RenderableObject[];
  readonly treatment: MutableTreatment;
}

interface ResolvedTarget {
  readonly object: RenderableObject;
  readonly info: SelectionHighlightTarget;
}

interface SavedColor {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
}

interface SavedMaterial {
  readonly material: THREE.Material;
  readonly treatment: MutableTreatment;
  readonly color: SavedColor;
  readonly intensity?: number;
}

interface ColorPropertyMaterial extends THREE.Material {
  emissive?: THREE.Color;
  emissiveIntensity?: number;
  rimColor?: THREE.Color;
  rimIntensity?: number;
}

const DEFAULT_EMISSIVE_COLOR = 0xffc857;
const DEFAULT_EMISSIVE_INTENSITY = 0.88;
const DEFAULT_RIM_COLOR = 0xffd27a;
const DEFAULT_RIM_INTENSITY = 0.78;

function clampColor(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return THREE.MathUtils.clamp(Math.round(value as number), 0, 0xffffff);
}

function nonNegative(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Math.max(0, value as number) : fallback;
}

function materialList(object: RenderableObject): readonly THREE.Material[] {
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  return materials.filter((material) => material.visible);
}

function isRenderable(object: THREE.Object3D): object is RenderableObject {
  if (!("material" in object)) return false;
  const material = (object as Partial<RenderableObject>).material;
  return material instanceof THREE.Material || Array.isArray(material);
}

function isEffectivelyVisible(object: THREE.Object3D): boolean {
  for (let cursor: THREE.Object3D | null = object; cursor; cursor = cursor.parent) {
    if (!cursor.visible) return false;
  }
  return true;
}

function colorOf(material: THREE.Material, property: "emissive" | "rimColor"): THREE.Color | undefined {
  const candidate = material as ColorPropertyMaterial;
  const color = candidate[property];
  return color instanceof THREE.Color ? color : undefined;
}

function intensityOf(
  material: THREE.Material,
  property: "emissiveIntensity" | "rimIntensity",
): number | undefined {
  const value = (material as ColorPropertyMaterial)[property];
  return typeof value === "number" ? value : undefined;
}

function setIntensity(
  material: THREE.Material,
  property: "emissiveIntensity" | "rimIntensity",
  value: number,
): void {
  (material as ColorPropertyMaterial)[property] = value;
}

function copyColor(color: THREE.Color): SavedColor {
  return { red: color.r, green: color.g, blue: color.b };
}

function restoreColor(color: THREE.Color, saved: SavedColor): void {
  color.setRGB(saved.red, saved.green, saved.blue);
}

function isStateColorOnlyMaterial(
  provenance: VisualProvenance,
  material: THREE.Material,
): boolean {
  return provenance === "state" && (
    material instanceof THREE.MeshBasicMaterial ||
    material instanceof THREE.LineBasicMaterial ||
    material instanceof THREE.PointsMaterial
  );
}

function preferredTreatment(material: THREE.Material): MutableTreatment | undefined {
  if (colorOf(material, "emissive")) return "emissive";
  if (colorOf(material, "rimColor")) return "rim";
  return undefined;
}

function treatmentForCounts(
  materials: readonly THREE.Material[],
  resolutions: ReadonlyMap<THREE.Material, MaterialResolution>,
): SelectionHighlightTreatment {
  const treatments = new Set<SelectionHighlightTreatment>();
  for (const material of materials) {
    const treatment = resolutions.get(material)?.treatment;
    treatments.add(treatment ?? "textual-fallback");
  }
  if (treatments.size === 1) return treatments.values().next().value ?? "textual-fallback";
  return "mixed";
}

/**
 * Mutates existing presentation-capable material properties for a single render
 * only. Anatomical matches are direct object declarations, never inferred from
 * a parent group, and state-only color materials remain untouched.
 */
export class SelectionHighlightController {
  private readonly catalog: AnatomicalCatalog;
  private readonly emissiveColor: number;
  private readonly emissiveIntensity: number;
  private readonly rimColor: number;
  private readonly rimIntensity: number;
  private entryId: string | undefined;
  private status: SelectionHighlightStatus = "idle";
  private selectedTargets: readonly ResolvedTarget[] = [];
  private materialPlans: readonly MaterialPlan[] = [];
  private readonly saved = new Map<THREE.Material, SavedMaterial>();
  private renderActive = false;

  constructor(options: SelectionHighlightControllerOptions = {}) {
    this.catalog = options.catalog ?? ANATOMICAL_CATALOG;
    this.emissiveColor = clampColor(options.emissiveColor, DEFAULT_EMISSIVE_COLOR);
    this.emissiveIntensity = nonNegative(options.emissiveIntensity, DEFAULT_EMISSIVE_INTENSITY);
    this.rimColor = clampColor(options.rimColor, DEFAULT_RIM_COLOR);
    this.rimIntensity = nonNegative(options.rimIntensity, DEFAULT_RIM_INTENSITY);
  }

  /** Resolves visible, direct catalog bindings without mutating a material. */
  setEntry(
    entryId: string | undefined,
    candidates: SelectionHighlightCandidates,
  ): SelectionHighlightAudit {
    return this.setSelection(entryId, candidates);
  }

  /** @deprecated Use setEntry; retained for a descriptive programmatic call site. */
  setSelection(
    entryId: string | undefined,
    candidates: SelectionHighlightCandidates,
  ): SelectionHighlightAudit {
    this.assertNotRendering();
    const normalizedEntryId = entryId?.trim();
    if (!normalizedEntryId) {
      this.reset();
      return this.audit();
    }
    this.entryId = normalizedEntryId;
    this.selectedTargets = [];
    this.materialPlans = [];
    if (!anatomicalEntryById(normalizedEntryId, this.catalog)) {
      this.status = "unknown-entry";
      return this.audit();
    }

    const targetCandidates = this.collectTargets(normalizedEntryId, candidates);
    if (targetCandidates.length === 0) {
      this.status = "no-match";
      return this.audit();
    }
    const resolutions = this.resolveMaterials(targetCandidates);
    this.materialPlans = [...resolutions.values()]
      .filter((resolution): resolution is MaterialResolution & { treatment: MutableTreatment } =>
        resolution.treatment !== undefined
      )
      .map((resolution) => ({
        material: resolution.material,
        objects: [...resolution.objects],
        treatment: resolution.treatment,
      }));
    this.selectedTargets = targetCandidates.map(({ object, provenance, materials }) => {
      const highlightedMaterialCount = materials.filter(
        (material) => resolutions.get(material)?.treatment !== undefined,
      ).length;
      return {
        object,
        info: {
          entryId: normalizedEntryId,
          objectName: object.name || object.type,
          objectUuid: object.uuid,
          directBinding: true,
          provenance,
          materialCount: materials.length,
          highlightedMaterialCount,
          textualFallbackMaterialCount: materials.length - highlightedMaterialCount,
          treatment: treatmentForCounts(materials, resolutions),
        },
      };
    });
    this.status = "ready";
    return this.audit();
  }

  clear(): SelectionHighlightAudit {
    this.assertNotRendering();
    this.reset();
    return this.audit();
  }

  /** Applies the prepared accent to existing material properties for this render. */
  beforeRender(): void {
    if (this.renderActive) throw new Error("selection highlight was not restored");
    this.renderActive = true;
    try {
      for (const plan of this.materialPlans) {
        if (!this.isPlanRenderable(plan)) continue;
        const saved = this.saveMaterial(plan);
        this.saved.set(plan.material, saved);
        this.applyMaterial(plan);
      }
    } catch (error) {
      this.afterRender();
      throw error;
    }
  }

  /** Restores every property changed by beforeRender, including the original color object. */
  afterRender(): void {
    for (const saved of this.saved.values()) this.restoreMaterial(saved);
    this.saved.clear();
    this.renderActive = false;
  }

  targets(): readonly SelectionHighlightTarget[] {
    return this.selectedTargets.map(({ info }) => info);
  }

  /** The first direct renderable target, suitable as a DOM preview anchor. */
  anchor(): SelectionHighlightTarget | undefined {
    return this.selectedTargets[0]?.info;
  }

  /** The matching renderable for projected DOM placement; it is never cloned. */
  anchorObject(): THREE.Object3D | undefined {
    return this.selectedTargets[0]?.object;
  }

  audit(): SelectionHighlightAudit {
    let emissiveMaterials = 0;
    let rimMaterials = 0;
    for (const plan of this.materialPlans) {
      if (plan.treatment === "emissive") emissiveMaterials += 1;
      else rimMaterials += 1;
    }
    const targetCount = this.selectedTargets.length;
    const highlightedMaterials = emissiveMaterials + rimMaterials;
    const totalTargetMaterials = this.selectedTargets.reduce(
      (total, target) => total + target.info.materialCount,
      0,
    );
    return {
      ...(this.entryId ? { entryId: this.entryId } : {}),
      status: this.status,
      targetCount,
      highlightedMaterials,
      emissiveMaterials,
      rimMaterials,
      textualFallbackMaterials: totalTargetMaterials - highlightedMaterials,
      materialAllocations: 0,
      renderActive: this.renderActive,
    };
  }

  private collectTargets(
    entryId: string,
    candidates: SelectionHighlightCandidates,
  ): readonly TargetCandidate[] {
    const roots: readonly THREE.Object3D[] = Array.isArray(candidates)
      ? candidates
      : [candidates];
    const visited = new Set<THREE.Object3D>();
    const targets: TargetCandidate[] = [];
    for (const root of roots) {
      root.traverse((object) => {
        if (visited.has(object)) return;
        visited.add(object);
        if (!isRenderable(object) || !isEffectivelyVisible(object)) return;
        const declaration = anatomicalDeclarationOf(object);
        const provenance = visualProvenanceOf(object);
        if (
          declaration?.kind !== "catalog-entry" ||
          declaration.entryId !== entryId ||
          !provenance
        ) return;
        const materials = materialList(object);
        if (materials.length === 0) return;
        targets.push({ object, provenance, materials });
      });
    }
    return targets;
  }

  private resolveMaterials(
    targets: readonly TargetCandidate[],
  ): ReadonlyMap<THREE.Material, MaterialResolution> {
    const resolutions = new Map<THREE.Material, MaterialResolution>();
    for (const target of targets) {
      for (const material of target.materials) {
        const existing = resolutions.get(material) ?? {
          material,
          objects: new Set<RenderableObject>(),
          treatment: undefined,
          hasTextualFallback: false,
        };
        existing.objects.add(target.object);
        const treatment = isStateColorOnlyMaterial(target.provenance, material)
          ? undefined
          : preferredTreatment(material);
        if (!treatment) existing.hasTextualFallback = true;
        else if (!existing.treatment) existing.treatment = treatment;
        resolutions.set(material, existing);
      }
    }
    for (const resolution of resolutions.values()) {
      if (resolution.hasTextualFallback) resolution.treatment = undefined;
    }
    return resolutions;
  }

  private isPlanRenderable(plan: MaterialPlan): boolean {
    return plan.material.visible && plan.objects.some((object) =>
      isEffectivelyVisible(object) && materialList(object).includes(plan.material)
    );
  }

  private saveMaterial(plan: MaterialPlan): SavedMaterial {
    const property = plan.treatment === "emissive" ? "emissive" : "rimColor";
    const intensityProperty = plan.treatment === "emissive" ? "emissiveIntensity" : "rimIntensity";
    const color = colorOf(plan.material, property);
    if (!color) throw new Error(`selection highlight property disappeared: ${property}`);
    const intensity = intensityOf(plan.material, intensityProperty);
    return {
      material: plan.material,
      treatment: plan.treatment,
      color: copyColor(color),
      ...(intensity === undefined ? {} : { intensity }),
    };
  }

  private applyMaterial(plan: MaterialPlan): void {
    if (plan.treatment === "emissive") {
      const color = colorOf(plan.material, "emissive");
      if (!color) throw new Error("selection highlight property disappeared: emissive");
      color.setHex(this.emissiveColor);
      if (intensityOf(plan.material, "emissiveIntensity") !== undefined) {
        setIntensity(plan.material, "emissiveIntensity", this.emissiveIntensity);
      }
      return;
    }
    const color = colorOf(plan.material, "rimColor");
    if (!color) throw new Error("selection highlight property disappeared: rimColor");
    color.setHex(this.rimColor);
    if (intensityOf(plan.material, "rimIntensity") !== undefined) {
      setIntensity(plan.material, "rimIntensity", this.rimIntensity);
    }
  }

  private restoreMaterial(saved: SavedMaterial): void {
    const property = saved.treatment === "emissive" ? "emissive" : "rimColor";
    const intensityProperty = saved.treatment === "emissive" ? "emissiveIntensity" : "rimIntensity";
    const color = colorOf(saved.material, property);
    if (color) restoreColor(color, saved.color);
    if (saved.intensity !== undefined) setIntensity(saved.material, intensityProperty, saved.intensity);
  }

  private assertNotRendering(): void {
    if (this.renderActive) throw new Error("selection highlight cannot change during rendering");
  }

  private reset(): void {
    this.entryId = undefined;
    this.status = "idle";
    this.selectedTargets = [];
    this.materialPlans = [];
  }
}
