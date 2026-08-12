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
import { COLOR_TOKENS, VISUAL_COLORS } from "./visual-tokens";
import {
  cellCurrentState,
  currentDirectionColor,
  currentDirectionEuler,
  currentMagnitudeScale,
  encodeStateColor,
  signedMean,
} from "./visual-encoding";

export type CellLayerMode = "cell" | "electricity";

const RESTING_VOLTS = -0.07;
const SPIKE_THRESHOLD_VOLTS = -0.045;
const EXCITATORY_COLOR = COLOR_TOKENS.excitatory;
const INHIBITORY_COLOR = COLOR_TOKENS.inhibitory;
const SPIKE_COLOR = COLOR_TOKENS.white;

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

export function markStampedSpikeCells(target: Uint8Array, cellIds: Uint32Array): void {
  target.fill(0);
  for (const cellId of cellIds) {
    if (cellId < target.length) target[cellId] = 1;
  }
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
  return {
    ampa: signedMean(snapshot.cellPatch.ampaAmperes),
    nmda: signedMean(snapshot.cellPatch.nmdaAmperes),
    gabaa: signedMean(snapshot.cellPatch.gabaaAmperes),
    gabab: signedMean(snapshot.cellPatch.gababAmperes),
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

export class CellRenderLayer implements RenderLayer {
  readonly group = new THREE.Group();
  private readonly somata: THREE.InstancedMesh;
  private readonly electricHalos: THREE.InstancedMesh;
  private readonly dendrites: THREE.LineSegments;
  private readonly boundary: THREE.Mesh;
  private readonly matrix = new THREE.Matrix4();
  private readonly color = new THREE.Color();
  private readonly stampedSpikes: Uint8Array;
  private mode: CellLayerMode = "cell";

  constructor(private readonly cellCount = 12) {
    this.stampedSpikes = new Uint8Array(cellCount);
    this.group.name = "cell-patch-resolution-map";

    this.somata = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.15, 2),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.82,
        blending: THREE.NormalBlending,
        depthWrite: true,
      }),
      cellCount,
    );
    this.somata.name = "adex-somata";
    this.somata.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    declareVisual(this.somata, "matter", "state", {
      field: "cellPatch.{kinds,membraneVolts} + cellSpikeEvents.cellIds",
      unit: "class/V/event",
      transform: "class to aspect ratio; voltage/spike to scale and luminance",
      redundancy: ["shape", "size", "label"],
    });
    this.group.add(this.somata);

    this.electricHalos = new THREE.InstancedMesh(
      new THREE.TorusGeometry(0.22, 0.018, 8, 28),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.38,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
      cellCount,
    );
    this.electricHalos.name = "receptor-current-halos";
    this.electricHalos.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    declareVisual(this.electricHalos, "emission", "state", {
      field: "cellPatch.{ampa,nmda,gabaa,gabab}Amperes",
      unit: "A",
      transform: "signed current to ring plane; magnitude to scale",
      redundancy: ["orientation", "size", "label"],
    });
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
        color: VISUAL_COLORS.dendrite,
        transparent: true,
        opacity: 0.24,
        blending: THREE.NormalBlending,
        depthWrite: true,
      }),
    );
    this.dendrites.name = "passive-dendrites";
    declareVisual(this.dendrites, "matter", "topology");
    this.group.add(this.dendrites);

    this.boundary = new THREE.Mesh(
      new THREE.TorusGeometry(1.66, 0.018, 8, 96),
      new THREE.MeshBasicMaterial({
        color: VISUAL_COLORS.fieldBoundary,
        transparent: true,
        opacity: 0.24,
        blending: THREE.NormalBlending,
        depthWrite: true,
      }),
    );
    this.boundary.name = "field-boundary";
    this.boundary.rotation.x = Math.PI / 2;
    declareVisual(this.boundary, "matter", "state", {
      field: "cellPatch.blend",
      unit: "fraction",
      transform: "patch activity/current magnitude to boundary opacity",
      redundancy: ["position", "label"],
    });
    this.group.add(this.boundary);
    this.setMode("cell");
  }

  setMode(mode: CellLayerMode): void {
    this.mode = mode;
    this.electricHalos.visible = mode === "electricity";
    (this.dendrites.material as THREE.LineBasicMaterial).opacity =
      mode === "cell" ? 0.32 : 0.12;
  }

  updateInterpolated(
    snapshot: NeuralSnapshot,
    previous: NeuralSnapshot | undefined,
    alpha: number,
  ): void {
    const count = Math.min(this.cellCount, snapshot.cellPatch.membraneVolts.length);
    markStampedSpikeCells(this.stampedSpikes, snapshot.cellSpikeEvents.cellIds);
    const totals = receptorCurrentTotals(snapshot);
    const totalCurrent = Math.abs(totals.ampa + totals.nmda + totals.gabaa + totals.gabab);
    for (let index = 0; index < count; index += 1) {
      const position = cellPosition(index);
      const voltage = interpolatePublishedValue(
        snapshot.cellPatch.membraneVolts[index] ?? RESTING_VOLTS,
        previous?.cellPatch.membraneVolts[index],
        alpha,
      );
      const activation = membraneActivation(voltage);
      const spiked = this.stampedSpikes[index] === 1;
      const scale = spiked ? 1.55 : 0.88 + activation * 0.38;
      const kindScale = snapshot.cellPatch.kinds[index] === 0
        ? new THREE.Vector3(scale * 0.9, scale * 1.12, scale * 0.9)
        : new THREE.Vector3(scale * 1.08, scale * 0.82, scale * 1.08);
      this.matrix.compose(
        position,
        new THREE.Quaternion(),
        kindScale,
      );
      this.somata.setMatrixAt(index, this.matrix);
      const base = snapshot.cellPatch.kinds[index] === 0
        ? EXCITATORY_COLOR
        : INHIBITORY_COLOR;
      this.color.copy(
        spiked ? SPIKE_COLOR : encodeStateColor(base, activation, 0.34),
      );
      this.somata.setColorAt(index, this.color);

      const current = cellCurrentState(snapshot, index);
      const currentScale = current.direction === "inactive"
        ? 0.0001
        : currentMagnitudeScale(current.magnitudeAmperes);
      this.matrix.compose(
        position,
        new THREE.Quaternion().setFromEuler(currentDirectionEuler(current.direction)),
        new THREE.Vector3(currentScale, currentScale, currentScale),
      );
      this.electricHalos.setMatrixAt(index, this.matrix);
      this.electricHalos.setColorAt(
        index,
        currentDirectionColor(current.direction),
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

  mount(context: RenderContext, _topology: RenderTopology): void {
    mountLayer(this.group, context);
  }

  update(view: InterpolatedSnapshot): void {
    this.updateInterpolated(view.current, view.previous, view.alpha);
  }

  setDetail(_level: number): void {
    // The current cell patch has one fixed geometry budget. This method is the
    // stable hook for the resolved-neuron LOD introduced in 0.9.
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  dispose(): void {
    disposeObjectTree(this.group);
  }
}
