import * as THREE from "three";
import type { NeuralSnapshot } from "./protocol";
import { interpolatePublishedValue } from "./render-layers";

export const CORTICAL_LAYER_LABELS = ["L1", "L2", "L3", "L4", "L5", "L6"] as const;
export type LaminarLod = "low" | "medium" | "high";
export type SimulationView = "overview" | "laminar";

export function parseLaminarLod(value: unknown): LaminarLod | undefined {
  return value === "low" || value === "medium" || value === "high"
    ? value
    : undefined;
}

export function parseSimulationView(value: unknown): SimulationView | undefined {
  return value === "overview" || value === "laminar" ? value : undefined;
}

export interface LaminarProjection {
  source: number;
  target: number;
  kind: "feedforward" | "feedback" | "thalamocortical" | "reticular";
}

export const LAMINAR_PROJECTIONS: readonly LaminarProjection[] = [
  { source: 3, target: 1, kind: "feedforward" },
  { source: 3, target: 2, kind: "feedforward" },
  { source: 1, target: 4, kind: "feedforward" },
  { source: 2, target: 4, kind: "feedforward" },
  { source: 4, target: 5, kind: "feedback" },
  { source: 5, target: 0, kind: "feedback" },
  { source: 5, target: 3, kind: "feedback" },
  { source: 6, target: 3, kind: "thalamocortical" },
  { source: 6, target: 7, kind: "reticular" },
] as const;

export function projectionBudget(lod: LaminarLod): number {
  if (lod === "low") return 3;
  if (lod === "medium") return 7;
  return LAMINAR_PROJECTIONS.length;
}

function layerY(index: number): number {
  return 2.25 - index * 0.82;
}

function projectionPoint(index: number): THREE.Vector3 {
  if (index === 6) return new THREE.Vector3(-0.38, -3.15, 0);
  if (index === 7) return new THREE.Vector3(0.58, -3.15, 0);
  return new THREE.Vector3(0, layerY(index), 0);
}

function projectionColor(kind: LaminarProjection["kind"]): number {
  if (kind === "feedforward" || kind === "thalamocortical") return 0x36c8ff;
  if (kind === "feedback") return 0xffb45b;
  return 0xc979ff;
}

export class LaminarRenderLayer {
  readonly group = new THREE.Group();
  private readonly excitatoryMeshes: THREE.Mesh[] = [];
  private readonly inhibitoryMeshes: THREE.Mesh[] = [];
  private readonly projectionLines: THREE.Line[] = [];
  private readonly relayMesh: THREE.Mesh;
  private readonly trnMesh: THREE.Mesh;
  private lod: LaminarLod = "medium";

  constructor() {
    this.group.name = "laminar-column";
    this.group.scale.setScalar(0.5);
    this.group.position.y = 0.15;

    for (let index = 0; index < CORTICAL_LAYER_LABELS.length; index += 1) {
      const radius = 1.02 - index * 0.035;
      const excitatory = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius * 0.96, 0.34, 48, 1, true),
        new THREE.MeshBasicMaterial({
          color: 0x249cff,
          transparent: true,
          opacity: 0.18,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      excitatory.position.y = layerY(index);
      excitatory.name = `${CORTICAL_LAYER_LABELS[index]}-excitatory`;
      this.excitatoryMeshes.push(excitatory);
      this.group.add(excitatory);

      const inhibitory = new THREE.Mesh(
        new THREE.TorusGeometry(radius * 0.62, 0.035, 8, 32),
        new THREE.MeshBasicMaterial({
          color: 0xc979ff,
          transparent: true,
          opacity: 0.2,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      inhibitory.position.y = layerY(index);
      inhibitory.rotation.x = Math.PI / 2;
      inhibitory.name = `${CORTICAL_LAYER_LABELS[index]}-inhibitory`;
      this.inhibitoryMeshes.push(inhibitory);
      this.group.add(inhibitory);
    }

    for (const projection of LAMINAR_PROJECTIONS) {
      const source = projectionPoint(projection.source);
      const target = projectionPoint(projection.target);
      const direction = projection.kind === "feedback" ? 1 : -1;
      const midpoint = source
        .clone()
        .lerp(target, 0.5)
        .add(new THREE.Vector3(direction * 1.15, 0, 0.32));
      const curve = new THREE.QuadraticBezierCurve3(source, midpoint, target);
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(curve.getPoints(20)),
        new THREE.LineBasicMaterial({
          color: projectionColor(projection.kind),
          transparent: true,
          opacity: 0.34,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      line.userData.kind = projection.kind;
      line.userData.source = projection.source;
      line.userData.target = projection.target;
      this.projectionLines.push(line);
      this.group.add(line);
    }

    this.relayMesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.28, 2),
      new THREE.MeshBasicMaterial({
        color: 0x36c8ff,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.relayMesh.position.copy(projectionPoint(6));
    this.relayMesh.name = "thalamic-relay";
    this.group.add(this.relayMesh);

    this.trnMesh = new THREE.Mesh(
      new THREE.TorusGeometry(0.34, 0.065, 12, 36),
      new THREE.MeshBasicMaterial({
        color: 0xc979ff,
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.trnMesh.position.copy(projectionPoint(7));
    this.trnMesh.rotation.x = Math.PI / 2;
    this.trnMesh.name = "thalamic-reticular-nucleus";
    this.group.add(this.trnMesh);
    this.setLod(this.lod);
  }

  setLod(lod: LaminarLod): void {
    this.lod = lod;
    const budget = projectionBudget(lod);
    this.projectionLines.forEach((line, index) => {
      line.visible = index < budget;
    });
    this.inhibitoryMeshes.forEach((mesh) => {
      const material = mesh.material as THREE.MeshBasicMaterial;
      material.opacity = lod === "low" ? 0.12 : 0.2;
    });
  }

  update(
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

    for (const line of this.projectionLines) {
      const source = Number(line.userData.source);
      const activity = source < 6
        ? snapshot.corticothalamic.excitatory[source] ?? 0
        : source === 6
          ? relay
          : trn;
      (line.material as THREE.LineBasicMaterial).opacity = 0.12 + activity * 0.72;
    }
  }
}
