import * as THREE from "three";
import type { BrainData } from "../brain";
import type { NeuralSnapshot } from "../protocol";

export type VisualPass = "matter" | "emission";
export type VisualProvenance = "state" | "topology" | "decoration";
export type VisualRedundancyCue = "shape" | "size" | "orientation" | "position" | "label";

export interface VisualSemanticBinding {
  readonly field: string;
  readonly unit: string;
  readonly transform: string;
  readonly redundancy: readonly VisualRedundancyCue[];
}

export interface RenderContext {
  scene: THREE.Scene;
  camera: THREE.Camera;
  renderer: THREE.WebGLRenderer;
}

export interface RenderTopology {
  brain: BrainData;
}

export interface InterpolatedSnapshot {
  current: NeuralSnapshot;
  previous?: NeuralSnapshot;
  alpha: number;
}

export interface RenderLayer {
  readonly group: THREE.Group;
  mount(context: RenderContext, topology: RenderTopology): void;
  update(view: InterpolatedSnapshot): void;
  setDetail(level: number): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}

export interface VisualProvenanceReport {
  total: number;
  state: number;
  topology: number;
  decoration: number;
  undeclared: number;
}

export interface VisualBindingAudit {
  totalStateObjects: number;
  declaredBindings: number;
  missingBindings: string[];
  missingRedundancy: string[];
}

export type VisualMaterialProfile = "schematic" | "realistic-illustrative";

export type VisualMaterialSurface = "tissue" | "membrane" | "substrate";

export interface VisualMaterialEligibility {
  /** Stable manifest identifier; it is presentation metadata, never a scientific binding. */
  readonly id: string;
  readonly surface: VisualMaterialSurface;
  /** Explicit local-space envelope used to reject an accidentally substituted geometry. */
  readonly maximumLocalRadius: number;
  readonly opacityRange: readonly [number, number];
  readonly source: "procedural-scene-graph";
}

export type VisualClippingParticipation = "include" | "exclude";

export interface VisualMaterialReadinessReport {
  activeProfile: VisualMaterialProfile;
  totalRenderableObjects: number;
  matterObjects: number;
  emissionObjects: number;
  pbrCandidateMeshes: number;
  boundedPbrObjects: number;
  physicalMaterialObjects: number;
  schematicOnlyObjects: number;
  undeclaredObjects: number;
  missingStateBindings: number;
  contractReady: boolean;
}

const PASS_KEY = "visualPass";
const PROVENANCE_KEY = "visualProvenance";
const BINDING_KEY = "visualSemanticBinding";
const MATERIAL_PROFILE_KEY = "visualMaterialProfile";
const MATERIAL_ELIGIBILITY_KEY = "visualMaterialEligibility";
const CLIPPING_PARTICIPATION_KEY = "visualClippingParticipation";
const BLOOM_EXCLUSION_KEY = "selectiveBloomExcluded";

export function declareVisual(
  object: THREE.Object3D,
  pass: VisualPass,
  provenance: VisualProvenance,
  binding?: VisualSemanticBinding,
): void {
  object.userData[PASS_KEY] = pass;
  object.userData[PROVENANCE_KEY] = provenance;
  if (binding) object.userData[BINDING_KEY] = binding;
}

export function visualSemanticBindingOf(
  object: THREE.Object3D,
): VisualSemanticBinding | undefined {
  const value: unknown = object.userData[BINDING_KEY];
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<VisualSemanticBinding>;
  if (
    typeof candidate.field !== "string" ||
    typeof candidate.unit !== "string" ||
    typeof candidate.transform !== "string" ||
    !Array.isArray(candidate.redundancy) ||
    !candidate.redundancy.every((cue) =>
      cue === "shape" || cue === "size" || cue === "orientation" ||
      cue === "position" || cue === "label"
    )
  ) return undefined;
  return candidate as VisualSemanticBinding;
}

export function visualPassOf(object: THREE.Object3D): VisualPass {
  return object.userData[PASS_KEY] === "emission" ? "emission" : "matter";
}

export function visualProvenanceOf(object: THREE.Object3D): VisualProvenance | undefined {
  const value: unknown = object.userData[PROVENANCE_KEY];
  return value === "state" || value === "topology" || value === "decoration"
    ? value
    : undefined;
}

export function declareMaterialEligibility(
  object: THREE.Object3D,
  eligibility: VisualMaterialEligibility,
): void {
  const [minimumOpacity, maximumOpacity] = eligibility.opacityRange;
  if (
    !eligibility.id ||
    !Number.isFinite(eligibility.maximumLocalRadius) ||
    eligibility.maximumLocalRadius <= 0 ||
    !Number.isFinite(minimumOpacity) ||
    !Number.isFinite(maximumOpacity) ||
    minimumOpacity < 0 ||
    maximumOpacity > 1 ||
    minimumOpacity > maximumOpacity
  ) {
    throw new Error("invalid realistic material eligibility declaration");
  }
  object.userData[MATERIAL_ELIGIBILITY_KEY] = eligibility;
}

export function visualMaterialEligibilityOf(
  object: THREE.Object3D,
): VisualMaterialEligibility | undefined {
  const value: unknown = object.userData[MATERIAL_ELIGIBILITY_KEY];
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<VisualMaterialEligibility>;
  if (
    typeof candidate.id !== "string" ||
    (candidate.surface !== "tissue" &&
      candidate.surface !== "membrane" &&
      candidate.surface !== "substrate") ||
    typeof candidate.maximumLocalRadius !== "number" ||
    !Array.isArray(candidate.opacityRange) ||
    candidate.source !== "procedural-scene-graph"
  ) return undefined;
  return candidate as VisualMaterialEligibility;
}

export function setVisualMaterialProfileMetadata(
  root: THREE.Object3D,
  profile: VisualMaterialProfile,
): void {
  root.userData[MATERIAL_PROFILE_KEY] = profile;
}

export function visualMaterialProfileOf(root: THREE.Object3D): VisualMaterialProfile {
  return root.userData[MATERIAL_PROFILE_KEY] === "realistic-illustrative"
    ? "realistic-illustrative"
    : "schematic";
}

export function declareClippingParticipation(
  object: THREE.Object3D,
  participation: VisualClippingParticipation,
): void {
  object.userData[CLIPPING_PARTICIPATION_KEY] = participation;
}

export function visualClippingParticipationOf(
  object: THREE.Object3D,
): VisualClippingParticipation {
  return object.userData[CLIPPING_PARTICIPATION_KEY] === "exclude" ? "exclude" : "include";
}

export function excludeFromSelectiveBloom(object: THREE.Object3D): void {
  object.userData[BLOOM_EXCLUSION_KEY] = true;
}

export function isExcludedFromSelectiveBloom(object: THREE.Object3D): boolean {
  return object.userData[BLOOM_EXCLUSION_KEY] === true;
}

export function auditVisualProvenance(root: THREE.Object3D): VisualProvenanceReport {
  const report: VisualProvenanceReport = {
    total: 0,
    state: 0,
    topology: 0,
    decoration: 0,
    undeclared: 0,
  };
  root.traverse((object) => {
    if (!("material" in object)) return;
    report.total += 1;
    const provenance = visualProvenanceOf(object);
    if (provenance) report[provenance] += 1;
    else report.undeclared += 1;
  });
  return report;
}

export function auditVisualBindings(root: THREE.Object3D): VisualBindingAudit {
  const report: VisualBindingAudit = {
    totalStateObjects: 0,
    declaredBindings: 0,
    missingBindings: [],
    missingRedundancy: [],
  };
  root.traverse((object) => {
    if (!("material" in object) || visualProvenanceOf(object) !== "state") return;
    report.totalStateObjects += 1;
    const name = object.name || object.type;
    const binding = visualSemanticBindingOf(object);
    if (!binding) {
      report.missingBindings.push(name);
      return;
    }
    report.declaredBindings += 1;
    if (binding.redundancy.length === 0) report.missingRedundancy.push(name);
  });
  return report;
}

export function auditVisualMaterialReadiness(
  root: THREE.Object3D,
): VisualMaterialReadinessReport {
  const provenance = auditVisualProvenance(root);
  const bindings = auditVisualBindings(root);
  const report: VisualMaterialReadinessReport = {
    activeProfile: visualMaterialProfileOf(root),
    totalRenderableObjects: 0,
    matterObjects: 0,
    emissionObjects: 0,
    pbrCandidateMeshes: 0,
    boundedPbrObjects: 0,
    physicalMaterialObjects: 0,
    schematicOnlyObjects: 0,
    undeclaredObjects: provenance.undeclared,
    missingStateBindings: bindings.missingBindings.length,
    contractReady: false,
  };
  root.traverse((object) => {
    if (!("material" in object)) return;
    report.totalRenderableObjects += 1;
    if (visualPassOf(object) === "emission") {
      report.emissionObjects += 1;
      report.schematicOnlyObjects += 1;
      return;
    }
    report.matterObjects += 1;
    const renderable = object as THREE.Object3D & { geometry?: THREE.BufferGeometry };
    const eligibility = visualMaterialEligibilityOf(object);
    if (
      object instanceof THREE.Mesh &&
      renderable.geometry?.getAttribute("normal") &&
      eligibility
    ) {
      report.pbrCandidateMeshes += 1;
      report.boundedPbrObjects += 1;
    } else {
      report.schematicOnlyObjects += 1;
    }
    const material = (object as THREE.Mesh).material;
    if (
      material instanceof THREE.MeshPhysicalMaterial ||
      (Array.isArray(material) && material.some((entry) => entry instanceof THREE.MeshPhysicalMaterial))
    ) {
      report.physicalMaterialObjects += 1;
    }
  });
  report.contractReady = report.totalRenderableObjects > 0 &&
    report.undeclaredObjects === 0 &&
    report.missingStateBindings === 0;
  return report;
}

export function mountLayer(
  group: THREE.Group,
  context: RenderContext,
): void {
  if (group.parent !== context.scene) context.scene.add(group);
}

export function disposeObjectTree(root: THREE.Object3D): void {
  root.removeFromParent();
  root.traverse((object) => {
    const renderable = object as THREE.Object3D & {
      geometry?: THREE.BufferGeometry;
      material?: THREE.Material | THREE.Material[];
    };
    renderable.geometry?.dispose();
    if (Array.isArray(renderable.material)) {
      renderable.material.forEach((material) => material.dispose());
    } else {
      renderable.material?.dispose();
    }
  });
}
