import * as THREE from "three";
import { ANATOMY_IDS } from "../anatomy";
import type { BrainData } from "../brain";
import type { NeuralSnapshot } from "../protocol";
import {
  declareAnatomicalBinding,
  declareNonAnatomical,
} from "./anatomical-provenance";
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
  estimateConductanceSiemens,
  GABAA_REVERSAL_VOLTS,
} from "./visual-encoding";

export type ElectricalBoardDetail = "summary" | "cellular" | "events";

export const ELECTRICAL_BOARD_CELL_COUNT = 12;
export const ELECTRICAL_BOARD_CONDUCTANCE_CEILING_SIEMENS = 4e-9;
export const EXCITATORY_REVERSAL_VOLTS = 0;
export const GABAB_REVERSAL_VOLTS = -0.09;

const RESTING_VOLTS = -0.07;
const SPIKE_THRESHOLD_VOLTS = -0.045;
const CURRENT_CEILING_AMPERES = 180e-12;
const BOARD_NORMAL = new THREE.Vector3(0, 0, 1);

export interface ElectricalBoardCost {
  readonly boardDrawCalls: 2;
  readonly nodeDrawCalls: 2;
  readonly voltageDrawCalls: 1;
  readonly conductanceDrawCalls: 1;
  readonly receptorDrawCalls: 0 | 4;
  readonly eventDrawCalls: 0 | 1;
  readonly totalDrawCalls: number;
  readonly stateValuesPerSnapshot: number;
  readonly eventUpdates: "only-when-cellSpikeEventHash-changes";
}

export interface ElectricalBoardObservables {
  readonly meanMembraneVolts: number;
  readonly meanProximalVolts: number;
  readonly meanDistalVolts: number;
  readonly meanProximalDistalDeltaVolts: number;
  readonly netCurrentAmperes: number;
  readonly excitatoryCurrentAmperes: number;
  readonly inhibitoryCurrentAmperes: number;
  readonly effectiveConductanceSiemens: number;
  readonly shuntingCells: number;
  readonly eventCount: number;
  readonly firstEventOffsetSeconds?: number;
  readonly lastEventOffsetSeconds?: number;
}

export interface ElectricalBoardTopologyObservables {
  readonly meanDelaySeconds: number;
  readonly meanAbsoluteGain: number;
  readonly synapseCount: number;
}

interface ReceptorPath {
  readonly name: "ampa" | "nmda" | "gabaa" | "gabab";
  readonly field: string;
  readonly reversalVolts: number;
  readonly color: THREE.Color;
  readonly side: -1 | 1;
  readonly yOffset: number;
  readonly mesh: THREE.InstancedMesh;
}

export function parseElectricalBoardDetail(value: unknown): ElectricalBoardDetail | undefined {
  if (value === "summary" || value === "cellular" || value === "events") return value;
  return undefined;
}

export function electricalBoardCost(detail: ElectricalBoardDetail): ElectricalBoardCost {
  const receptorDrawCalls = detail === "summary" ? 0 : 4;
  const eventDrawCalls = detail === "events" ? 1 : 0;
  return {
    boardDrawCalls: 2,
    nodeDrawCalls: 2,
    voltageDrawCalls: 1,
    conductanceDrawCalls: 1,
    receptorDrawCalls,
    eventDrawCalls,
    totalDrawCalls: 6 + receptorDrawCalls + eventDrawCalls,
    stateValuesPerSnapshot: ELECTRICAL_BOARD_CELL_COUNT * 9,
    eventUpdates: "only-when-cellSpikeEventHash-changes",
  };
}

function safeMean(values: Float32Array): number {
  if (values.length === 0) return 0;
  let total = 0;
  for (let index = 0; index < values.length; index += 1) total += values[index] ?? 0;
  return total / values.length;
}

export function effectiveCellConductanceSiemens(
  somaVolts: number,
  proximalVolts: number,
  distalVolts: number,
  ampaAmperes: number,
  nmdaAmperes: number,
  gabaaAmperes: number,
  gababAmperes: number,
): number {
  return estimateConductanceSiemens(
    ampaAmperes,
    EXCITATORY_REVERSAL_VOLTS,
    distalVolts,
  ) + estimateConductanceSiemens(
    nmdaAmperes,
    EXCITATORY_REVERSAL_VOLTS,
    distalVolts,
  ) + estimateConductanceSiemens(
    gabaaAmperes,
    GABAA_REVERSAL_VOLTS,
    proximalVolts,
  ) + estimateConductanceSiemens(
    gababAmperes,
    GABAB_REVERSAL_VOLTS,
    somaVolts,
  );
}

export function electricalBoardObservables(
  snapshot: NeuralSnapshot,
): ElectricalBoardObservables {
  const patch = snapshot.cellPatch;
  const count = patch.membraneVolts.length;
  let netCurrentAmperes = 0;
  let excitatoryCurrentAmperes = 0;
  let inhibitoryCurrentAmperes = 0;
  let effectiveConductance = 0;
  let shuntingCells = 0;
  for (let index = 0; index < count; index += 1) {
    const ampa = patch.ampaAmperes[index] ?? 0;
    const nmda = patch.nmdaAmperes[index] ?? 0;
    const gabaa = patch.gabaaAmperes[index] ?? 0;
    const gabab = patch.gababAmperes[index] ?? 0;
    const soma = patch.membraneVolts[index] ?? RESTING_VOLTS;
    const proximal = patch.dendriteProximalVolts[index] ?? RESTING_VOLTS;
    const distal = patch.dendriteDistalVolts[index] ?? RESTING_VOLTS;
    const gabaaConductance = estimateConductanceSiemens(
      gabaa,
      GABAA_REVERSAL_VOLTS,
      proximal,
    );
    excitatoryCurrentAmperes += ampa + nmda;
    inhibitoryCurrentAmperes += gabaa + gabab;
    netCurrentAmperes += ampa + nmda + gabaa + gabab;
    effectiveConductance += effectiveCellConductanceSiemens(
      soma,
      proximal,
      distal,
      ampa,
      nmda,
      gabaa,
      gabab,
    );
    if (gabaaConductance >= 10e-12 && Math.abs(proximal - GABAA_REVERSAL_VOLTS) <= 0.003) {
      shuntingCells += 1;
    }
  }
  const divisor = Math.max(1, count);
  const offsets = snapshot.cellSpikeEvents.timeOffsetsSeconds;
  return {
    meanMembraneVolts: safeMean(patch.membraneVolts),
    meanProximalVolts: safeMean(patch.dendriteProximalVolts),
    meanDistalVolts: safeMean(patch.dendriteDistalVolts),
    meanProximalDistalDeltaVolts:
      safeMean(patch.dendriteProximalVolts) - safeMean(patch.dendriteDistalVolts),
    netCurrentAmperes: netCurrentAmperes / divisor,
    excitatoryCurrentAmperes: excitatoryCurrentAmperes / divisor,
    inhibitoryCurrentAmperes: inhibitoryCurrentAmperes / divisor,
    effectiveConductanceSiemens: effectiveConductance / divisor,
    shuntingCells,
    eventCount: snapshot.cellSpikeEvents.cellIds.length,
    firstEventOffsetSeconds: offsets.length > 0 ? offsets[0] : undefined,
    lastEventOffsetSeconds: offsets.length > 0 ? offsets[offsets.length - 1] : undefined,
  };
}

export function electricalBoardTopologyObservables(
  topology: BrainData,
): ElectricalBoardTopologyObservables {
  if (topology.synapses.length === 0) {
    return { meanDelaySeconds: 0, meanAbsoluteGain: 0, synapseCount: 0 };
  }
  let delay = 0;
  let gain = 0;
  for (const synapse of topology.synapses) {
    delay += synapse.delay;
    gain += Math.abs(synapse.weight);
  }
  return {
    meanDelaySeconds: delay / topology.synapses.length,
    meanAbsoluteGain: gain / topology.synapses.length,
    synapseCount: topology.synapses.length,
  };
}

function setBoardPosition(target: THREE.Vector3, index: number): THREE.Vector3 {
  const row = Math.floor(index / 4);
  const column = index % 4;
  return target.set((column - 1.5) * 0.68, 0.76 - row * 0.72, 0);
}

function makeArrowGeometry(): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-0.25, -0.035);
  shape.lineTo(0.09, -0.035);
  shape.lineTo(0.09, -0.09);
  shape.lineTo(0.27, 0);
  shape.lineTo(0.09, 0.09);
  shape.lineTo(0.09, 0.035);
  shape.lineTo(-0.25, 0.035);
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

function makeGridGeometry(): THREE.BufferGeometry {
  const segments: number[] = [];
  for (let x = -1.55; x <= 1.551; x += 0.31) {
    segments.push(x, -1.14, -0.025, x, 1.14, -0.025);
  }
  for (let y = -1.14; y <= 1.141; y += 0.285) {
    segments.push(-1.55, y, -0.025, 1.55, y, -0.025);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(segments, 3));
  return geometry;
}

function currentAt(snapshot: NeuralSnapshot, receptor: ReceptorPath["name"], index: number): number {
  if (receptor === "ampa") return snapshot.cellPatch.ampaAmperes[index] ?? 0;
  if (receptor === "nmda") return snapshot.cellPatch.nmdaAmperes[index] ?? 0;
  if (receptor === "gabaa") return snapshot.cellPatch.gabaaAmperes[index] ?? 0;
  return snapshot.cellPatch.gababAmperes[index] ?? 0;
}

export class ElectricalBoardLayer implements RenderLayer {
  readonly group = new THREE.Group();
  private readonly excitatoryNodes: THREE.InstancedMesh;
  private readonly inhibitoryNodes: THREE.InstancedMesh;
  private readonly voltageBars: THREE.InstancedMesh;
  private readonly conductanceRings: THREE.InstancedMesh;
  private readonly eventMarkers: THREE.InstancedMesh;
  private readonly receptorPaths: ReceptorPath[];
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private readonly color = new THREE.Color();
  private readonly stampedEvents = new Uint8Array(ELECTRICAL_BOARD_CELL_COUNT);
  private lastEventHash: string | undefined;
  private detail: ElectricalBoardDetail = "cellular";

  constructor() {
    this.group.name = "electrical-board";

    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(3.25, 2.42),
      new THREE.MeshBasicMaterial({
        color: 0x071728,
        transparent: true,
        opacity: 0.72,
        blending: THREE.NormalBlending,
        depthWrite: true,
      }),
    );
    board.name = "electrical-board-surface";
    board.position.z = -0.08;
    declareVisual(board, "matter", "decoration");
    declareNonAnatomical(board, "The electrical board is a didactic presentation substrate.");
    this.group.add(board);

    const grid = new THREE.LineSegments(
      makeGridGeometry(),
      new THREE.LineBasicMaterial({
        color: 0x285a78,
        transparent: true,
        opacity: 0.24,
        blending: THREE.NormalBlending,
        depthWrite: true,
      }),
    );
    grid.name = "electrical-board-grid";
    declareVisual(grid, "matter", "decoration");
    declareNonAnatomical(grid, "The electrical grid is a didactic presentation guide.");
    this.group.add(grid);

    this.excitatoryNodes = new THREE.InstancedMesh(
      new THREE.CircleGeometry(0.13, 24),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.9,
        blending: THREE.NormalBlending,
        depthWrite: true,
      }),
      8,
    );
    this.excitatoryNodes.name = "electrical-excitatory-nodes";
    this.excitatoryNodes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    declareVisual(this.excitatoryNodes, "matter", "state", {
      field: "cellPatch.{kinds,membraneVolts}",
      unit: "class/V",
      transform: "excitatory class to circle; membrane voltage to radius and luminance",
      redundancy: ["shape", "size", "label"],
    });
    declareAnatomicalBinding(this.excitatoryNodes, ANATOMY_IDS.soma);
    this.group.add(this.excitatoryNodes);

    this.inhibitoryNodes = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.23, 0.23),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.9,
        blending: THREE.NormalBlending,
        depthWrite: true,
      }),
      4,
    );
    this.inhibitoryNodes.name = "electrical-inhibitory-nodes";
    this.inhibitoryNodes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    declareVisual(this.inhibitoryNodes, "matter", "state", {
      field: "cellPatch.{kinds,membraneVolts}",
      unit: "class/V",
      transform: "inhibitory class to square; membrane voltage to radius and luminance",
      redundancy: ["shape", "size", "label"],
    });
    declareAnatomicalBinding(this.inhibitoryNodes, ANATOMY_IDS.soma);
    this.group.add(this.inhibitoryNodes);

    this.voltageBars = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.035, 0.25),
      new THREE.MeshBasicMaterial({
        color: VISUAL_COLORS.white,
        transparent: true,
        opacity: 0.74,
        blending: THREE.NormalBlending,
        depthWrite: true,
      }),
      ELECTRICAL_BOARD_CELL_COUNT,
    );
    this.voltageBars.name = "electrical-voltage-bars";
    this.voltageBars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    declareVisual(this.voltageBars, "matter", "state", {
      field: "cellPatch.membraneVolts",
      unit: "V",
      transform: "rest-to-threshold interval to anchored bar height",
      redundancy: ["size", "position", "label"],
    });
    declareNonAnatomical(
      this.voltageBars,
      "Voltage bars are quantitative state gauges, not anatomical structures.",
    );
    this.group.add(this.voltageBars);

    this.conductanceRings = new THREE.InstancedMesh(
      new THREE.RingGeometry(0.17, 0.19, 30),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.58,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
      ELECTRICAL_BOARD_CELL_COUNT,
    );
    this.conductanceRings.name = "electrical-effective-conductance";
    this.conductanceRings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    declareVisual(this.conductanceRings, "emission", "state", {
      field: "derived Σ Iᵣ/(Eᵣ−Vcompartment) from routed cellPatch receptor currents",
      unit: "S",
      transform: "effective conductance to ring radius; GABA-A reversal proximity to shunt token",
      redundancy: ["size", "shape", "label"],
    });
    declareNonAnatomical(
      this.conductanceRings,
      "Effective-conductance rings are derived state gauges, not anatomy.",
    );
    this.group.add(this.conductanceRings);

    const arrowGeometry = makeArrowGeometry();
    const pathDefinitions = [
      ["ampa", "cellPatch.ampaAmperes", EXCITATORY_REVERSAL_VOLTS, COLOR_TOKENS.ampa, -1, 0.16],
      ["nmda", "cellPatch.nmdaAmperes", EXCITATORY_REVERSAL_VOLTS, COLOR_TOKENS.nmda, -1, -0.16],
      ["gabaa", "cellPatch.gabaaAmperes", GABAA_REVERSAL_VOLTS, COLOR_TOKENS.gabaa, 1, 0.16],
      ["gabab", "cellPatch.gababAmperes", GABAB_REVERSAL_VOLTS, COLOR_TOKENS.gabab, 1, -0.16],
    ] as const;
    this.receptorPaths = pathDefinitions.map(
      ([name, field, reversalVolts, color, side, yOffset]) => {
        const mesh = new THREE.InstancedMesh(
          arrowGeometry.clone(),
          new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 0.55,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
          ELECTRICAL_BOARD_CELL_COUNT,
        );
        mesh.name = `electrical-${name}-paths`;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        declareVisual(mesh, "emission", "state", {
          field,
          unit: "A",
          transform: "signed current to arrow direction; magnitude to arrow thickness and luminance",
          redundancy: ["orientation", "size", "position", "label"],
        });
        declareNonAnatomical(
          mesh,
          "Signed receptor-current paths are model-state projections, not anatomy.",
        );
        this.group.add(mesh);
        return { name, field, reversalVolts, color, side, yOffset, mesh };
      },
    );
    arrowGeometry.dispose();

    this.eventMarkers = new THREE.InstancedMesh(
      new THREE.RingGeometry(0.22, 0.245, 30),
      new THREE.MeshBasicMaterial({
        color: VISUAL_COLORS.hot,
        transparent: true,
        opacity: 0.78,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
      ELECTRICAL_BOARD_CELL_COUNT,
    );
    this.eventMarkers.name = "electrical-stamped-events";
    this.eventMarkers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    declareVisual(this.eventMarkers, "emission", "state", {
      field: "cellSpikeEvents.{cellIds,timeOffsetsSeconds,hash}",
      unit: "cell/seconds/hash",
      transform: "stamped event membership to static ring marker; refreshed only on event hash change",
      redundancy: ["shape", "size", "label"],
    });
    declareNonAnatomical(
      this.eventMarkers,
      "Stamped-event markers are published event indicators, not anatomy.",
    );
    this.group.add(this.eventMarkers);
    this.setBoardDetail("cellular");
  }

  setBoardDetail(detail: ElectricalBoardDetail): void {
    this.detail = detail;
    const showReceptors = detail !== "summary";
    for (const path of this.receptorPaths) path.mesh.visible = showReceptors;
    this.eventMarkers.visible = detail === "events";
  }

  audit(): { detail: ElectricalBoardDetail; cost: ElectricalBoardCost } {
    return { detail: this.detail, cost: electricalBoardCost(this.detail) };
  }

  private updateEventMarkers(snapshot: NeuralSnapshot): void {
    if (snapshot.cellSpikeEvents.hash === this.lastEventHash) return;
    this.lastEventHash = snapshot.cellSpikeEvents.hash;
    this.stampedEvents.fill(0);
    for (const cellId of snapshot.cellSpikeEvents.cellIds) {
      if (cellId < this.stampedEvents.length) this.stampedEvents[cellId] = 1;
    }
    for (let index = 0; index < ELECTRICAL_BOARD_CELL_COUNT; index += 1) {
      setBoardPosition(this.position, index);
      this.position.z = 0.055;
      const markerScale = this.stampedEvents[index] === 1 ? 1 : 0.0001;
      this.scale.setScalar(markerScale);
      this.matrix.compose(this.position, this.quaternion.identity(), this.scale);
      this.eventMarkers.setMatrixAt(index, this.matrix);
    }
    this.eventMarkers.instanceMatrix.needsUpdate = true;
  }

  update(view: InterpolatedSnapshot): void {
    const snapshot = view.current;
    const count = Math.min(
      ELECTRICAL_BOARD_CELL_COUNT,
      snapshot.cellPatch.membraneVolts.length,
    );
    let excitatoryIndex = 0;
    let inhibitoryIndex = 0;
    for (let index = 0; index < count; index += 1) {
      setBoardPosition(this.position, index);
      const membrane = snapshot.cellPatch.membraneVolts[index] ?? RESTING_VOLTS;
      const activation = THREE.MathUtils.clamp(
        (membrane - RESTING_VOLTS) / (SPIKE_THRESHOLD_VOLTS - RESTING_VOLTS),
        0,
        1,
      );
      const nodeScale = 0.82 + activation * 0.42;
      this.scale.setScalar(nodeScale);
      this.matrix.compose(this.position, this.quaternion.identity(), this.scale);
      const isExcitatory = snapshot.cellPatch.kinds[index] === 0;
      const node = isExcitatory ? this.excitatoryNodes : this.inhibitoryNodes;
      const instanceIndex = isExcitatory ? excitatoryIndex++ : inhibitoryIndex++;
      node.setMatrixAt(instanceIndex, this.matrix);
      this.color.copy(isExcitatory ? COLOR_TOKENS.excitatory : COLOR_TOKENS.inhibitory);
      this.color.lerp(COLOR_TOKENS.white, activation * 0.62);
      node.setColorAt(instanceIndex, this.color);

      this.position.x += 0.21;
      this.position.z = 0.025;
      const barHeight = 0.08 + activation * 0.92;
      this.scale.set(1, barHeight, 1);
      this.matrix.compose(this.position, this.quaternion.identity(), this.scale);
      this.voltageBars.setMatrixAt(index, this.matrix);

      const proximal = snapshot.cellPatch.dendriteProximalVolts[index] ?? RESTING_VOLTS;
      const distal = snapshot.cellPatch.dendriteDistalVolts[index] ?? RESTING_VOLTS;
      const ampa = snapshot.cellPatch.ampaAmperes[index] ?? 0;
      const nmda = snapshot.cellPatch.nmdaAmperes[index] ?? 0;
      const gabaa = snapshot.cellPatch.gabaaAmperes[index] ?? 0;
      const gabab = snapshot.cellPatch.gababAmperes[index] ?? 0;
      const conductance = effectiveCellConductanceSiemens(
        membrane,
        proximal,
        distal,
        ampa,
        nmda,
        gabaa,
        gabab,
      );
      const conductanceScale = 0.7 + Math.min(
        0.65,
        conductance / ELECTRICAL_BOARD_CONDUCTANCE_CEILING_SIEMENS,
      );
      setBoardPosition(this.position, index);
      this.position.z = 0.035;
      this.scale.setScalar(conductanceScale);
      this.matrix.compose(this.position, this.quaternion.identity(), this.scale);
      this.conductanceRings.setMatrixAt(index, this.matrix);
      const gabaaConductance = estimateConductanceSiemens(
        gabaa,
        GABAA_REVERSAL_VOLTS,
        proximal,
      );
      const shunting = gabaaConductance >= 10e-12 &&
        Math.abs(proximal - GABAA_REVERSAL_VOLTS) <= 0.003;
      this.conductanceRings.setColorAt(
        index,
        shunting ? COLOR_TOKENS.shunting : COLOR_TOKENS.featured,
      );

      for (const receptor of this.receptorPaths) {
        const current = currentAt(snapshot, receptor.name, index);
        setBoardPosition(this.position, index);
        this.position.x += receptor.side * 0.34;
        this.position.y += receptor.yOffset;
        this.position.z = 0.045;
        const pointsTowardNode = current >= 0;
        const baseRotation = receptor.side < 0 ? 0 : Math.PI;
        const rotation = pointsTowardNode ? baseRotation : baseRotation + Math.PI;
        this.quaternion.setFromAxisAngle(BOARD_NORMAL, rotation);
        const magnitude = Math.min(1, Math.abs(current) / CURRENT_CEILING_AMPERES);
        this.scale.set(0.72 + magnitude * 0.48, 0.45 + magnitude * 1.4, 1);
        this.matrix.compose(this.position, this.quaternion, this.scale);
        receptor.mesh.setMatrixAt(index, this.matrix);
        this.color.copy(receptor.color).lerp(COLOR_TOKENS.white, magnitude * 0.58);
        receptor.mesh.setColorAt(index, this.color);
      }
    }
    this.excitatoryNodes.count = excitatoryIndex;
    this.inhibitoryNodes.count = inhibitoryIndex;
    this.excitatoryNodes.instanceMatrix.needsUpdate = true;
    this.inhibitoryNodes.instanceMatrix.needsUpdate = true;
    if (this.excitatoryNodes.instanceColor) this.excitatoryNodes.instanceColor.needsUpdate = true;
    if (this.inhibitoryNodes.instanceColor) this.inhibitoryNodes.instanceColor.needsUpdate = true;
    this.voltageBars.instanceMatrix.needsUpdate = true;
    this.conductanceRings.instanceMatrix.needsUpdate = true;
    if (this.conductanceRings.instanceColor) this.conductanceRings.instanceColor.needsUpdate = true;
    for (const receptor of this.receptorPaths) {
      receptor.mesh.instanceMatrix.needsUpdate = true;
      if (receptor.mesh.instanceColor) receptor.mesh.instanceColor.needsUpdate = true;
    }
    this.updateEventMarkers(snapshot);
  }

  mount(context: RenderContext, _topology: RenderTopology): void {
    mountLayer(this.group, context);
  }

  setDetail(level: number): void {
    this.setBoardDetail(level <= 0 ? "summary" : level >= 2 ? "events" : "cellular");
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  dispose(): void {
    disposeObjectTree(this.group);
  }
}
