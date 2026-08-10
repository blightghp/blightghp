import * as THREE from "three";
import type { BrainData } from "../brain";
import type { NeuralSnapshot } from "../protocol";

export type VisualPass = "matter" | "emission";
export type VisualProvenance = "state" | "topology" | "decoration";

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

const PASS_KEY = "visualPass";
const PROVENANCE_KEY = "visualProvenance";

export function declareVisual(
  object: THREE.Object3D,
  pass: VisualPass,
  provenance: VisualProvenance,
): void {
  object.userData[PASS_KEY] = pass;
  object.userData[PROVENANCE_KEY] = provenance;
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
