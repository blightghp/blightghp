import * as THREE from "three";
import type { NeuralSnapshot } from "../protocol";
import { interpolatePublishedValue } from "./brain-layer";
import {
  declareVisual,
  disposeObjectTree,
  mountLayer,
} from "./render-types";
import type {
  InterpolatedSnapshot,
  RenderContext,
  RenderLayer,
  RenderTopology,
} from "./render-types";
import { projectionColorToken, VISUAL_COLORS } from "./visual-tokens";

export const CORTICAL_LAYER_LABELS = ["L1", "L2", "L3", "L4", "L5", "L6"] as const;
export type LaminarLod = "low" | "medium" | "high";
export type SimulationView = "overview" | "laminar" | "cell" | "electricity" | "synapse";

export function parseLaminarLod(value: unknown): LaminarLod | undefined {
  return value === "low" || value === "medium" || value === "high"
    ? value
    : undefined;
}

export function parseSimulationView(value: unknown): SimulationView | undefined {
  return value === "overview" ||
    value === "laminar" ||
    value === "cell" ||
    value === "electricity" ||
    value === "synapse"
    ? value
    : undefined;
}

export interface LaminarProjection {
  source: number;
  target: number;
  kind: "recurrent" | "feedforward" | "feedback" | "thalamocortical" | "reticular";
}

export const LAMINAR_PROJECTIONS: readonly LaminarProjection[] = [
  { source: 0, target: 0, kind: "recurrent" },
  { source: 1, target: 1, kind: "recurrent" },
  { source: 2, target: 2, kind: "recurrent" },
  { source: 3, target: 3, kind: "recurrent" },
  { source: 4, target: 4, kind: "recurrent" },
  { source: 5, target: 5, kind: "recurrent" },
  { source: 6, target: 3, kind: "thalamocortical" },
  { source: 3, target: 1, kind: "feedforward" },
  { source: 3, target: 2, kind: "feedforward" },
  { source: 1, target: 4, kind: "feedforward" },
  { source: 2, target: 4, kind: "feedforward" },
  { source: 4, target: 5, kind: "feedback" },
  { source: 5, target: 0, kind: "feedback" },
  { source: 5, target: 3, kind: "feedback" },
  { source: 6, target: 7, kind: "reticular" },
] as const;

export function projectionBudget(lod: LaminarLod): number {
  if (lod === "low") return 6;
  if (lod === "medium") return 11;
  return LAMINAR_PROJECTIONS.length;
}

export interface LaminarLodCost {
  stateValuesRead: number;
  fixedDrawCalls: number;
  projectionDrawCalls: number;
  totalDrawCalls: number;
}

export function laminarLodCost(lod: LaminarLod): LaminarLodCost {
  const projectionDrawCalls = projectionBudget(lod);
  const fixedDrawCalls = 14;
  return {
    stateValuesRead: 17,
    fixedDrawCalls,
    projectionDrawCalls,
    totalDrawCalls: fixedDrawCalls + projectionDrawCalls * 2,
  };
}

export interface AxonalLifecycle {
  progress: number;
  opacity: number;
}

export function axonalLifecycle(
  projectionIndex: number,
  timeSeconds: number,
  sourceActivity: number,
): AxonalLifecycle {
  const period = 1.25 + (projectionIndex % 7) * 0.11;
  const phase = (projectionIndex * 0.381_966_011_25) % 1;
  const progress = ((timeSeconds / period + phase) % 1 + 1) % 1;
  const envelope = Math.sin(Math.PI * progress) ** 2;
  return {
    progress,
    opacity: Math.max(0, Math.min(1, sourceActivity)) * envelope,
  };
}

function layerY(index: number): number {
  return 2.25 - index * 0.82;
}

function projectionPoint(index: number): THREE.Vector3 {
  if (index === 6) return new THREE.Vector3(-0.38, -3.15, 0);
  if (index === 7) return new THREE.Vector3(0.58, -3.15, 0);
  return new THREE.Vector3(0, layerY(index), 0);
}

export class LaminarRenderLayer implements RenderLayer {
  readonly group = new THREE.Group();
  private readonly excitatoryMeshes: THREE.Mesh[] = [];
  private readonly inhibitoryMeshes: THREE.Mesh[] = [];
  private readonly projectionLines: THREE.Line[] = [];
  private readonly projectionPulses: THREE.Mesh[] = [];
  private readonly projectionCurves: THREE.Curve<THREE.Vector3>[] = [];
  private readonly relayMesh: THREE.Mesh;
  private readonly trnMesh: THREE.Mesh;
  private lod: LaminarLod = "medium";

  constructor() {
    this.group.name = "laminar-column";
    this.group.scale.setScalar(0.43);
    this.group.position.y = -0.08;

    for (let index = 0; index < CORTICAL_LAYER_LABELS.length; index += 1) {
      const radius = 1.02 - index * 0.035;
      const excitatory = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius * 0.96, 0.34, 48, 1, true),
        new THREE.MeshBasicMaterial({
          color: VISUAL_COLORS.excitatory,
          transparent: true,
          opacity: 0.18,
          blending: THREE.NormalBlending,
          depthWrite: true,
          side: THREE.DoubleSide,
        }),
      );
      excitatory.position.y = layerY(index);
      excitatory.name = `${CORTICAL_LAYER_LABELS[index]}-excitatory`;
      declareVisual(excitatory, "matter", "state", {
        field: `corticothalamic.excitatory[${index}]`,
        unit: "normalized activity",
        transform: "activity to opacity on cylinder",
        redundancy: ["shape", "position", "label"],
      });
      this.excitatoryMeshes.push(excitatory);
      this.group.add(excitatory);

      const inhibitory = new THREE.Mesh(
        new THREE.TorusGeometry(radius * 0.62, 0.035, 8, 32),
        new THREE.MeshBasicMaterial({
          color: VISUAL_COLORS.inhibitory,
          transparent: true,
          opacity: 0.2,
          blending: THREE.NormalBlending,
          depthWrite: true,
        }),
      );
      inhibitory.position.y = layerY(index);
      inhibitory.rotation.x = Math.PI / 2;
      inhibitory.name = `${CORTICAL_LAYER_LABELS[index]}-inhibitory`;
      declareVisual(inhibitory, "matter", "state", {
        field: `corticothalamic.inhibitory[${index}]`,
        unit: "normalized activity",
        transform: "activity to opacity on torus",
        redundancy: ["shape", "position", "label"],
      });
      this.inhibitoryMeshes.push(inhibitory);
      this.group.add(inhibitory);
    }

    for (const projection of LAMINAR_PROJECTIONS) {
      const source = projectionPoint(projection.source);
      const target = projectionPoint(projection.target);
      const direction = projection.kind === "feedback" || projection.kind === "recurrent" ? 1 : -1;
      const lateral = 1.05 + (this.projectionCurves.length % 3) * 0.18;
      const firstControl = source.clone().add(new THREE.Vector3(direction * lateral, 0.18, 0.42));
      const secondControl = target.clone().add(new THREE.Vector3(direction * lateral, -0.18, -0.34));
      const curve = new THREE.CubicBezierCurve3(source, firstControl, secondControl, target);
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(curve.getPoints(32)),
        new THREE.LineBasicMaterial({
          color: projectionColorToken(projection.kind),
          transparent: true,
          opacity: 0.34,
          blending: THREE.NormalBlending,
          depthWrite: true,
        }),
      );
      line.userData.kind = projection.kind;
      line.userData.source = projection.source;
      line.userData.target = projection.target;
      declareVisual(line, "matter", "state", {
        field: `projection.${projection.source}->${projection.target}`,
        unit: "declared pathway activity",
        transform: "source/target curve and kind token",
        redundancy: ["position", "label"],
      });
      this.projectionLines.push(line);
      this.projectionCurves.push(curve);
      this.group.add(line);

      const pulse = new THREE.Mesh(
        new THREE.SphereGeometry(0.045, 10, 8),
        new THREE.MeshBasicMaterial({
          color: projectionColorToken(projection.kind),
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      pulse.name = `axonal-pulse-${this.projectionPulses.length}`;
      declareVisual(pulse, "emission", "state", {
        field: `projection.${projection.source}->${projection.target}.phase`,
        unit: "cycle fraction",
        transform: "phase to curve position and scale",
        redundancy: ["position", "size"],
      });
      this.projectionPulses.push(pulse);
      this.group.add(pulse);
    }

    this.relayMesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.28, 2),
      new THREE.MeshBasicMaterial({
        color: VISUAL_COLORS.excitatory,
        transparent: true,
        opacity: 0.5,
        blending: THREE.NormalBlending,
        depthWrite: true,
      }),
    );
    this.relayMesh.position.copy(projectionPoint(6));
    this.relayMesh.name = "thalamic-relay";
    declareVisual(this.relayMesh, "matter", "state", {
      field: "corticothalamic.relay",
      unit: "normalized activity",
      transform: "activity to icosahedron opacity/scale",
      redundancy: ["shape", "position", "label"],
    });
    this.group.add(this.relayMesh);

    this.trnMesh = new THREE.Mesh(
      new THREE.TorusGeometry(0.34, 0.065, 12, 36),
      new THREE.MeshBasicMaterial({
        color: VISUAL_COLORS.inhibitory,
        transparent: true,
        opacity: 0.45,
        blending: THREE.NormalBlending,
        depthWrite: true,
      }),
    );
    this.trnMesh.position.copy(projectionPoint(7));
    this.trnMesh.rotation.x = Math.PI / 2;
    this.trnMesh.name = "thalamic-reticular-nucleus";
    declareVisual(this.trnMesh, "matter", "state", {
      field: "corticothalamic.trn",
      unit: "normalized activity",
      transform: "activity to torus opacity/scale",
      redundancy: ["shape", "position", "label"],
    });
    this.group.add(this.trnMesh);
    this.setLod(this.lod);
  }

  setLod(lod: LaminarLod): void {
    this.lod = lod;
    const budget = projectionBudget(lod);
    this.projectionLines.forEach((line, index) => {
      line.visible = index < budget;
      this.projectionPulses[index].visible = index < budget;
    });
    this.inhibitoryMeshes.forEach((mesh) => {
      const material = mesh.material as THREE.MeshBasicMaterial;
      material.opacity = lod === "low" ? 0.12 : 0.2;
    });
  }

  updateInterpolated(
    snapshot: NeuralSnapshot,
    previous: NeuralSnapshot | undefined,
    alpha: number,
  ): void {
    for (let index = 0; index < CORTICAL_LAYER_LABELS.length; index += 1) {
      const excitatory = interpolatePublishedValue(
        snapshot.corticothalamic.excitatory[index] ?? 0,
        previous?.corticothalamic.excitatory[index],
        alpha,
      );
      const inhibitory = interpolatePublishedValue(
        snapshot.corticothalamic.inhibitory[index] ?? 0,
        previous?.corticothalamic.inhibitory[index],
        alpha,
      );
      const excitatoryMesh = this.excitatoryMeshes[index];
      const inhibitoryMesh = this.inhibitoryMeshes[index];
      (excitatoryMesh.material as THREE.MeshBasicMaterial).opacity =
        0.1 + excitatory * 0.68;
      (inhibitoryMesh.material as THREE.MeshBasicMaterial).opacity =
        (this.lod === "low" ? 0.08 : 0.12) + inhibitory * 0.62;
      excitatoryMesh.scale.set(0.96 + excitatory * 0.12, 1, 0.96 + excitatory * 0.12);
      inhibitoryMesh.scale.setScalar(0.92 + inhibitory * 0.18);
    }

    const relay = interpolatePublishedValue(
      snapshot.corticothalamic.relay,
      previous?.corticothalamic.relay,
      alpha,
    );
    const trn = interpolatePublishedValue(
      snapshot.corticothalamic.trn,
      previous?.corticothalamic.trn,
      alpha,
    );
    this.relayMesh.scale.setScalar(0.82 + relay * 0.65);
    this.trnMesh.scale.setScalar(0.86 + trn * 0.5);
    (this.relayMesh.material as THREE.MeshBasicMaterial).opacity = 0.24 + relay * 0.7;
    (this.trnMesh.material as THREE.MeshBasicMaterial).opacity = 0.22 + trn * 0.68;

    this.projectionLines.forEach((line, index) => {
      const source = Number(line.userData.source);
      const activity = source < 6
        ? snapshot.corticothalamic.excitatory[source] ?? 0
        : source === 6
          ? relay
          : trn;
      const lifecycle = axonalLifecycle(index, snapshot.timeSeconds, activity);
      (line.material as THREE.LineBasicMaterial).opacity = 0.12 + activity * 0.58;
      const pulse = this.projectionPulses[index];
      pulse.position.copy(this.projectionCurves[index].getPoint(lifecycle.progress));
      (pulse.material as THREE.MeshBasicMaterial).opacity = lifecycle.opacity;
      pulse.scale.setScalar(0.72 + lifecycle.opacity * 0.72);
    });
  }

  mount(context: RenderContext, _topology: RenderTopology): void {
    mountLayer(this.group, context);
  }

  update(view: InterpolatedSnapshot): void {
    this.updateInterpolated(view.current, view.previous, view.alpha);
  }

  setDetail(level: number): void {
    this.setLod(level <= 0 ? "low" : level >= 2 ? "high" : "medium");
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  dispose(): void {
    disposeObjectTree(this.group);
  }
}
