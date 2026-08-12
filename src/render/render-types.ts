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

const PASS_KEY = "visualPass";
const PROVENANCE_KEY = "visualProvenance";
const BINDING_KEY = "visualSemanticBinding";

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
