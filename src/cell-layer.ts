import * as THREE from "three";
import type { NeuralSnapshot } from "./protocol";
import { interpolatePublishedValue } from "./render-layers";

export type CellLayerMode = "cell" | "electricity";

const RESTING_VOLTS = -0.07;
const SPIKE_THRESHOLD_VOLTS = -0.045;
const EXCITATORY_COLOR = new THREE.Color(0x31c8ff);
const INHIBITORY_COLOR = new THREE.Color(0xc879ff);
const SPIKE_COLOR = new THREE.Color(0xffffff);

export function voltsToMillivolts(value: number): number {
  return value * 1_000;
}

export function amperesToPicoamperes(value: number): number {
  return value * 1e12;
}

export function membraneActivation(volts: number): number {
  return THREE.MathUtils.clamp(
    (volts - RESTING_VOLTS) / (SPIKE_THRESHOLD_VOLTS - RESTING_VOLTS),
    0,
    1,
  );
}

export function mean(values: Float32Array): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export interface ReceptorCurrentTotals {
  ampa: number;
  nmda: number;
  gabaa: number;
  gabab: number;
}

export function receptorCurrentTotals(snapshot: NeuralSnapshot): ReceptorCurrentTotals {
  const absoluteMean = (values: Float32Array): number => {
    if (values.length === 0) return 0;
    let total = 0;
    for (const value of values) total += Math.abs(value);
    return total / values.length;
  };
  return {
    ampa: absoluteMean(snapshot.cellPatch.ampaAmperes),
    nmda: absoluteMean(snapshot.cellPatch.nmdaAmperes),
    gabaa: absoluteMean(snapshot.cellPatch.gabaaAmperes),
    gabab: absoluteMean(snapshot.cellPatch.gababAmperes),
  };
}

function cellPosition(index: number): THREE.Vector3 {
  const row = Math.floor(index / 4);
  const column = index % 4;
  return new THREE.Vector3(
    (column - 1.5) * 0.58 + (row % 2) * 0.1,
    0.78 - row * 0.72,
    (column % 2) * 0.2 - 0.1,
  );
}

export class CellRenderLayer {
  readonly group = new THREE.Group();
  private readonly somata: THREE.InstancedMesh;
  private readonly electricHalos: THREE.InstancedMesh;
  private readonly dendrites: THREE.LineSegments;
  private readonly boundary: THREE.Mesh;
  private readonly matrix = new THREE.Matrix4();
  private readonly color = new THREE.Color();
  private mode: CellLayerMode = "cell";

  constructor(private readonly cellCount = 12) {
    this.group.name = "cell-patch-resolution-map";

    this.somata = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.15, 2),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.82,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
      cellCount,
    );
    this.somata.name = "adex-somata";
    this.somata.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.somata);

    this.electricHalos = new THREE.InstancedMesh(
      new THREE.TorusGeometry(0.22, 0.018, 8, 28),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.58,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
      cellCount,
    );
    this.electricHalos.name = "receptor-current-halos";
    this.electricHalos.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.electricHalos);

    const dendritePositions = new Float32Array(cellCount * 3 * 2 * 3);
    let offset = 0;
    for (let index = 0; index < cellCount; index += 1) {
      const position = cellPosition(index);
      for (const direction of [-1, 0, 1]) {
        dendritePositions.set([position.x, position.y, position.z], offset);
        offset += 3;
        dendritePositions.set([
          position.x + direction * 0.21,
          position.y + 0.34,
          position.z + (direction === 0 ? 0.16 : -0.06),
        ], offset);
        offset += 3;
      }
    }
    const dendriteGeometry = new THREE.BufferGeometry();
    dendriteGeometry.setAttribute("position", new THREE.BufferAttribute(dendritePositions, 3));
    this.dendrites = new THREE.LineSegments(
      dendriteGeometry,
      new THREE.LineBasicMaterial({
        color: 0x4ac9ff,
        transparent: true,
        opacity: 0.24,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.dendrites.name = "passive-dendrites";
    this.group.add(this.dendrites);

    this.boundary = new THREE.Mesh(
      new THREE.TorusGeometry(1.66, 0.018, 8, 96),
      new THREE.MeshBasicMaterial({
        color: 0x2d91ff,
        transparent: true,
        opacity: 0.24,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.boundary.name = "field-boundary";
    this.boundary.rotation.x = Math.PI / 2;
    this.group.add(this.boundary);
    this.setMode("cell");
  }

  setMode(mode: CellLayerMode): void {
    this.mode = mode;
    this.electricHalos.visible = mode === "electricity";
    (this.dendrites.material as THREE.LineBasicMaterial).opacity =
      mode === "cell" ? 0.32 : 0.12;
  }

  update(
    snapshot: NeuralSnapshot,
    previous: NeuralSnapshot | undefined,
    alpha: number,
  ): void {
    const count = Math.min(this.cellCount, snapshot.cellPatch.membraneVolts.length);
    const totals = receptorCurrentTotals(snapshot);
    const totalCurrent = totals.ampa + totals.nmda + totals.gabaa + totals.gabab;
    for (let index = 0; index < count; index += 1) {
      const position = cellPosition(index);
      const voltage = interpolatePublishedValue(
        snapshot.cellPatch.membraneVolts[index] ?? RESTING_VOLTS,
        previous?.cellPatch.membraneVolts[index],
        alpha,
      );
      const activation = membraneActivation(voltage);
      const spiked = snapshot.cellPatch.spiked[index] === 1;
      const scale = spiked ? 1.55 : 0.88 + activation * 0.38;
      this.matrix.compose(
        position,
        new THREE.Quaternion(),
        new THREE.Vector3(scale, scale, scale),
      );
      this.somata.setMatrixAt(index, this.matrix);
      const base = snapshot.cellPatch.kinds[index] === 0
        ? EXCITATORY_COLOR
        : INHIBITORY_COLOR;
      this.color.copy(spiked ? SPIKE_COLOR : base).lerp(SPIKE_COLOR, activation * 0.34);
      this.somata.setColorAt(index, this.color);

      const cellCurrent = Math.abs(snapshot.cellPatch.ampaAmperes[index] ?? 0) +
        Math.abs(snapshot.cellPatch.nmdaAmperes[index] ?? 0) +
        Math.abs(snapshot.cellPatch.gabaaAmperes[index] ?? 0) +
        Math.abs(snapshot.cellPatch.gababAmperes[index] ?? 0);
      const currentScale = 0.78 + Math.min(1.1, cellCurrent * 1e10);
      this.matrix.compose(
        position,
        new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)),
        new THREE.Vector3(currentScale, currentScale, currentScale),
      );
      this.electricHalos.setMatrixAt(index, this.matrix);
      const excitation = Math.abs(snapshot.cellPatch.ampaAmperes[index] ?? 0) +
        Math.abs(snapshot.cellPatch.nmdaAmperes[index] ?? 0);
      this.electricHalos.setColorAt(
        index,
        excitation >= cellCurrent - excitation ? EXCITATORY_COLOR : INHIBITORY_COLOR,
      );
    }
    this.somata.instanceMatrix.needsUpdate = true;
    if (this.somata.instanceColor) this.somata.instanceColor.needsUpdate = true;
    this.electricHalos.instanceMatrix.needsUpdate = true;
    if (this.electricHalos.instanceColor) this.electricHalos.instanceColor.needsUpdate = true;
    const activity = membraneActivation(mean(snapshot.cellPatch.membraneVolts));
    const currentActivity = Math.min(1, totalCurrent * 2.5e10);
    (this.boundary.material as THREE.MeshBasicMaterial).opacity =
      0.14 + (this.mode === "electricity" ? currentActivity : activity) * 0.5;
  }
}
