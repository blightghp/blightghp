import * as THREE from "three";
import { ANATOMY_IDS } from "../anatomy";
import type { NeuralSnapshot } from "../protocol";
import { interpolatePublishedValue } from "./brain-layer";
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

export const NEURON_CELL_COUNT = 12;
export const NEURON_PRESENTATION_STREAM = 0x4e455552;

const RESTING_VOLTS = -0.07;
const SPIKE_THRESHOLD_VOLTS = -0.045;
const MIN_COMPARTMENT_VOLTS = -0.12;
const MAX_COMPARTMENT_VOLTS = 0.06;
const CURRENT_CEILING_AMPERES = 180e-12;
const ADAPTATION_CEILING_AMPERES = 200e-12;
const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;

export interface NeuronMorphology {
  readonly seed: number;
  readonly cellId: number;
  readonly dendriteSegments: Float32Array;
  readonly dendritePathPositions: Float32Array;
  readonly axonPoints: Float32Array;
  readonly ranvierNodes: Float32Array;
  readonly hash: string;
}

export interface NeuronCellObservables {
  readonly cellId: number;
  readonly kind: "excitatory" | "inhibitory";
  readonly somaVolts: number;
  readonly dendriteProximalVolts: number;
  readonly dendriteDistalVolts: number;
  readonly adaptationAmperes: number;
  readonly ampaAmperes: number;
  readonly nmdaAmperes: number;
  readonly gabaaAmperes: number;
  readonly gababAmperes: number;
  readonly stampedEventOffsetsSeconds: readonly number[];
}

export interface NeuronViewCost {
  readonly totalDrawCalls: number;
  readonly stateValuesPerSnapshot: number;
  readonly geometryRebuildsPerFrame: number;
}

interface ReceptorCurrentVisual {
  readonly name: "ampa" | "nmda" | "gabaa" | "gabab";
  readonly mesh: THREE.Mesh;
  readonly basePosition: THREE.Vector3;
  readonly color: THREE.Color;
}

export function parseCellId(value: unknown): number | undefined {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && /^\d+$/.test(value)
      ? Number(value)
      : Number.NaN;
  return Number.isInteger(parsed) && parsed >= 0 && parsed < NEURON_CELL_COUNT
    ? parsed
    : undefined;
}

export function neuronViewCost(): NeuronViewCost {
  return {
    totalDrawCalls: 10,
    stateValuesPerSnapshot: 9,
    geometryRebuildsPerFrame: 0,
  };
}

function randomU32(seed: number, cellId: number, ordinal: number): number {
  let value = Math.imul(
    (NEURON_PRESENTATION_STREAM ^ Math.imul(cellId, 0x85ebca77) ^ ordinal) >>> 0,
    0xd2a80a3f,
  );
  value = (value + (seed >>> 0)) >>> 0;
  value ^= value >>> 9;
  value = (value + 0xa884f197) >>> 0;
  value ^= value >>> 11;
  value = Math.imul(value, 0x6c736f4b);
  value ^= value >>> 13;
  value = (value + 0xb79f3abb) >>> 0;
  value ^= value >>> 15;
  value = Math.imul(value, 0x1b56c4f5);
  value ^= value >>> 17;
  return value >>> 0;
}

function randomUnit(seed: number, cellId: number, ordinal: number): number {
  return randomU32(seed, cellId, ordinal) / 4_294_967_296;
}

function hashMorphology(
  seed: number,
  cellId: number,
  arrays: readonly Float32Array[],
): string {
  let hash = FNV_OFFSET;
  const update = (byte: number): void => {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * FNV_PRIME);
  };
  for (const value of [seed >>> 0, cellId >>> 0, NEURON_PRESENTATION_STREAM]) {
    update(value & 0xff);
    update((value >>> 8) & 0xff);
    update((value >>> 16) & 0xff);
    update((value >>> 24) & 0xff);
  }
  for (const array of arrays) {
    const length = array.length >>> 0;
    update(length & 0xff);
    update((length >>> 8) & 0xff);
    update((length >>> 16) & 0xff);
    update((length >>> 24) & 0xff);
    const floatBytes = new DataView(new ArrayBuffer(Float32Array.BYTES_PER_ELEMENT));
    for (const value of array) {
      floatBytes.setFloat32(0, value, true);
      for (let byte = 0; byte < Float32Array.BYTES_PER_ELEMENT; byte += 1) {
        update(floatBytes.getUint8(byte));
      }
    }
  }
  return hash.toString(16).padStart(16, "0");
}

export function generateNeuronMorphology(seed: number, cellId: number): NeuronMorphology {
  const selectedCell = parseCellId(cellId);
  if (selectedCell === undefined) throw new Error("cellId fora do patch de 12 células");

  const segments: number[] = [];
  const pathPositions: number[] = [];
  let ordinal = 0;
  const grow = (
    x: number,
    y: number,
    z: number,
    angle: number,
    length: number,
    depth: number,
    pathPosition: number,
  ): void => {
    const jitter = (randomUnit(seed, selectedCell, ordinal++) - 0.5) * 0.22;
    const nextAngle = angle + jitter;
    const nextX = x + Math.cos(nextAngle) * length;
    const nextY = y + Math.sin(nextAngle) * length;
    const nextZ = z + (randomUnit(seed, selectedCell, ordinal++) - 0.5) * 0.18;
    segments.push(x, y, z, nextX, nextY, nextZ);
    const nextPathPosition = 1 - depth / 3;
    pathPositions.push(pathPosition, nextPathPosition);
    if (depth === 0) return;
    const spread = 0.3 + randomUnit(seed, selectedCell, ordinal++) * 0.18;
    grow(
      nextX,
      nextY,
      nextZ,
      nextAngle - spread,
      length * 0.7,
      depth - 1,
      nextPathPosition,
    );
    grow(
      nextX,
      nextY,
      nextZ,
      nextAngle + spread,
      length * 0.66,
      depth - 1,
      nextPathPosition,
    );
  };

  for (let branch = 0; branch < 5; branch += 1) {
    const fan = (branch - 2) * 0.42;
    const length = 0.42 + randomUnit(seed, selectedCell, ordinal++) * 0.16;
    grow(-0.32, -0.03, 0, Math.PI / 2 + fan, length, 2, 0);
  }

  const axon: number[] = [];
  const nodes: number[] = [];
  for (let index = 0; index < 9; index += 1) {
    const x = -0.2 + index * 0.27;
    const y = -0.14 - index * 0.105 + Math.sin(index * 0.72) * 0.06;
    const z = (randomUnit(seed, selectedCell, ordinal++) - 0.5) * 0.09;
    axon.push(x, y, z);
    if (index > 0) nodes.push(x, y, z);
  }

  const dendriteSegments = Float32Array.from(segments);
  const dendritePathPositions = Float32Array.from(pathPositions);
  const axonPoints = Float32Array.from(axon);
  const ranvierNodes = Float32Array.from(nodes);
  return {
    seed: seed >>> 0,
    cellId: selectedCell,
    dendriteSegments,
    dendritePathPositions,
    axonPoints,
    ranvierNodes,
    hash: hashMorphology(seed, selectedCell, [
      dendriteSegments,
      dendritePathPositions,
      axonPoints,
      ranvierNodes,
    ]),
  };
}

export function neuronCellObservables(
  snapshot: NeuralSnapshot,
  cellId: number,
): NeuronCellObservables {
  const selectedCell = parseCellId(cellId);
  if (selectedCell === undefined || selectedCell >= snapshot.cellPatch.membraneVolts.length) {
    throw new Error("célula selecionada ausente do snapshot");
  }
  const stampedEventOffsetsSeconds: number[] = [];
  for (let index = 0; index < snapshot.cellSpikeEvents.cellIds.length; index += 1) {
    if (snapshot.cellSpikeEvents.cellIds[index] === selectedCell) {
      stampedEventOffsetsSeconds.push(snapshot.cellSpikeEvents.timeOffsetsSeconds[index] ?? 0);
    }
  }
  return {
    cellId: selectedCell,
    kind: snapshot.cellPatch.kinds[selectedCell] === 0 ? "excitatory" : "inhibitory",
    somaVolts: snapshot.cellPatch.membraneVolts[selectedCell] ?? RESTING_VOLTS,
    dendriteProximalVolts:
      snapshot.cellPatch.dendriteProximalVolts[selectedCell] ?? RESTING_VOLTS,
    dendriteDistalVolts:
      snapshot.cellPatch.dendriteDistalVolts[selectedCell] ?? RESTING_VOLTS,
    adaptationAmperes: snapshot.cellPatch.adaptationAmperes[selectedCell] ?? 0,
    ampaAmperes: snapshot.cellPatch.ampaAmperes[selectedCell] ?? 0,
    nmdaAmperes: snapshot.cellPatch.nmdaAmperes[selectedCell] ?? 0,
    gabaaAmperes: snapshot.cellPatch.gabaaAmperes[selectedCell] ?? 0,
    gababAmperes: snapshot.cellPatch.gababAmperes[selectedCell] ?? 0,
    stampedEventOffsetsSeconds,
  };
}

function makeArrowGeometry(): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-0.18, -0.04);
  shape.lineTo(0.06, -0.04);
  shape.lineTo(0.06, -0.095);
  shape.lineTo(0.2, 0);
  shape.lineTo(0.06, 0.095);
  shape.lineTo(0.06, 0.04);
  shape.lineTo(-0.18, 0.04);
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

function currentFor(
  snapshot: NeuralSnapshot,
  receptor: ReceptorCurrentVisual["name"],
  cellId: number,
): number {
  if (receptor === "ampa") return snapshot.cellPatch.ampaAmperes[cellId] ?? 0;
  if (receptor === "nmda") return snapshot.cellPatch.nmdaAmperes[cellId] ?? 0;
  if (receptor === "gabaa") return snapshot.cellPatch.gabaaAmperes[cellId] ?? 0;
  return snapshot.cellPatch.gababAmperes[cellId] ?? 0;
}

function geometryFrom(values: Float32Array): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(values, 3));
  return geometry;
}

export function dendriteVoltageAtPathPosition(
  somaVolts: number,
  proximalVolts: number,
  distalVolts: number,
  pathPosition: number,
): number {
  const position = THREE.MathUtils.clamp(pathPosition, 0, 1);
  return position <= 0.5
    ? THREE.MathUtils.lerp(somaVolts, proximalVolts, position * 2)
    : THREE.MathUtils.lerp(proximalVolts, distalVolts, (position - 0.5) * 2);
}

function dendriteGeometryFrom(morphology: NeuronMorphology): THREE.BufferGeometry {
  const geometry = geometryFrom(morphology.dendriteSegments);
  const vertexCount = morphology.dendriteSegments.length / 3;
  const colors = new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3);
  colors.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("color", colors);
  return geometry;
}

export class NeuronRenderLayer implements RenderLayer {
  readonly group = new THREE.Group();
  private readonly soma: THREE.Mesh;
  private readonly dendrites: THREE.LineSegments;
  private readonly axon: THREE.Line;
  private readonly ranvierNodes: THREE.InstancedMesh;
  private readonly adaptationRing: THREE.Mesh;
  private readonly receptorCurrents: ReceptorCurrentVisual[];
  private readonly eventMarker: THREE.Mesh;
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private readonly color = new THREE.Color();
  private morphology: NeuronMorphology;
  private selectedCellId = 0;
  private lastEventKey: string | undefined;
  private selectedEventCount = 0;

  constructor(private readonly seed: number) {
    this.group.name = "resolved-neuron";
    this.morphology = generateNeuronMorphology(seed, this.selectedCellId);

    this.soma = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.25, 3),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.88,
        blending: THREE.NormalBlending,
        depthWrite: true,
      }),
    );
    this.soma.name = "resolved-neuron-soma";
    this.soma.position.set(-0.32, -0.03, 0);
    declareVisual(this.soma, "matter", "state", {
      field: "cellPatch.{kinds,membraneVolts}[selectedCellId]",
      unit: "class/V",
      transform: "cell class to aspect ratio; membrane voltage to scale and luminance",
      redundancy: ["shape", "size", "label"],
    });
    declareAnatomicalBinding(this.soma, ANATOMY_IDS.soma);
    this.group.add(this.soma);

    this.dendrites = new THREE.LineSegments(
      dendriteGeometryFrom(this.morphology),
      new THREE.LineBasicMaterial({
        color: VISUAL_COLORS.white,
        vertexColors: true,
        transparent: true,
        opacity: 0.72,
        blending: THREE.NormalBlending,
        depthWrite: true,
      }),
    );
    this.dendrites.name = "resolved-neuron-multicompartment-dendrite";
    declareVisual(this.dendrites, "matter", "state", {
      field:
        "cellPatch.{membraneVolts,dendriteProximalVolts,dendriteDistalVolts}[selectedCellId]",
      unit: "V",
      transform:
        "piecewise-linear soma-to-proximal-to-distal voltage interpolation over deterministic path coordinates",
      redundancy: ["label"],
    });
    declareAnatomicalBinding(this.dendrites, ANATOMY_IDS.dendrite);
    this.group.add(this.dendrites);

    this.axon = new THREE.Line(
      geometryFrom(this.morphology.axonPoints),
      new THREE.LineBasicMaterial({
        color: VISUAL_COLORS.inactive,
        transparent: true,
        opacity: 0.58,
        blending: THREE.NormalBlending,
        depthWrite: true,
      }),
    );
    this.axon.name = "resolved-neuron-illustrative-axon";
    declareVisual(this.axon, "matter", "topology");
    declareAnatomicalBinding(this.axon, ANATOMY_IDS.axon);
    this.group.add(this.axon);

    this.ranvierNodes = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.034, 10, 8),
      new THREE.MeshBasicMaterial({
        color: VISUAL_COLORS.fieldBoundary,
        transparent: true,
        opacity: 0.74,
        blending: THREE.NormalBlending,
        depthWrite: true,
      }),
      8,
    );
    this.ranvierNodes.name = "resolved-neuron-illustrative-nodes";
    declareVisual(this.ranvierNodes, "matter", "topology");
    declareAnatomicalBinding(this.ranvierNodes, ANATOMY_IDS.ranvierNode);
    this.group.add(this.ranvierNodes);

    this.adaptationRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.35, 0.025, 9, 48),
      new THREE.MeshBasicMaterial({
        color: VISUAL_COLORS.shunting,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.adaptationRing.name = "resolved-neuron-adaptation";
    this.adaptationRing.position.copy(this.soma.position);
    declareVisual(this.adaptationRing, "emission", "state", {
      field: "cellPatch.adaptationAmperes[selectedCellId]",
      unit: "A",
      transform: "absolute adaptation current to ring radius and opacity",
      redundancy: ["size", "shape", "label"],
    });
    declareNonAnatomical(
      this.adaptationRing,
      "Adaptation current is a published state indicator, not anatomy.",
    );
    this.group.add(this.adaptationRing);

    const arrowGeometry = makeArrowGeometry();
    const receptors = [
      ["ampa", -0.92, 0.35, COLOR_TOKENS.ampa],
      ["nmda", -0.94, -0.48, COLOR_TOKENS.nmda],
      ["gabaa", 0.3, 0.46, COLOR_TOKENS.gabaa],
      ["gabab", 0.35, -0.54, COLOR_TOKENS.gabab],
    ] as const;
    this.receptorCurrents = receptors.map(([name, x, y, color]) => {
      const mesh = new THREE.Mesh(
        arrowGeometry.clone(),
        new THREE.MeshBasicMaterial({
          transparent: true,
          opacity: 0.68,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      mesh.name = `resolved-neuron-${name}-current`;
      const basePosition = new THREE.Vector3(x, y, 0.08);
      mesh.position.copy(basePosition);
      declareVisual(mesh, "emission", "state", {
        field: `cellPatch.${name}Amperes[selectedCellId]`,
        unit: "A",
        transform: "signed receptor current to arrow direction; magnitude to arrow scale",
        redundancy: ["orientation", "size", "position", "label"],
      });
      declareNonAnatomical(
        mesh,
        "Signed receptor current is a published state arrow, not anatomy.",
      );
      this.group.add(mesh);
      return { name, mesh, basePosition, color };
    });
    arrowGeometry.dispose();

    this.eventMarker = new THREE.Mesh(
      new THREE.RingGeometry(0.065, 0.095, 24),
      new THREE.MeshBasicMaterial({
        color: VISUAL_COLORS.hot,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.eventMarker.name = "resolved-neuron-stamped-event";
    this.eventMarker.visible = false;
    declareVisual(this.eventMarker, "emission", "state", {
      field: "cellSpikeEvents.{cellIds,timeOffsetsSeconds,hash}",
      unit: "cell/seconds/hash",
      transform: "stamped event membership for selected cell to a static axon-node marker",
      redundancy: ["shape", "position", "label"],
    });
    declareNonAnatomical(
      this.eventMarker,
      "The stamped spike marker is an event indicator, not anatomy.",
    );
    this.group.add(this.eventMarker);
    this.applyMorphology();
    this.updateDendriteGradient(RESTING_VOLTS, RESTING_VOLTS, RESTING_VOLTS);
  }

  setSelectedCell(cellId: number): void {
    const selectedCell = parseCellId(cellId);
    if (selectedCell === undefined) throw new Error("cellId fora do patch de 12 células");
    if (selectedCell === this.selectedCellId) return;
    this.selectedCellId = selectedCell;
    this.morphology = generateNeuronMorphology(this.seed, selectedCell);
    this.applyMorphology();
    this.lastEventKey = undefined;
  }

  selection(): { cellId: number; geometryHash: string } {
    return { cellId: this.selectedCellId, geometryHash: this.morphology.hash };
  }

  audit(): {
    selectedCellId: number;
    geometryHash: string;
    eventMarkerVisible: boolean;
    selectedEventCount: number;
    gradientVertexCount: number;
    compartmentLabels: readonly ["soma", "proximal", "distal"];
    cost: NeuronViewCost;
  } {
    return {
      selectedCellId: this.selectedCellId,
      geometryHash: this.morphology.hash,
      eventMarkerVisible: this.eventMarker.visible,
      selectedEventCount: this.selectedEventCount,
      gradientVertexCount: this.morphology.dendritePathPositions.length,
      compartmentLabels: ["soma", "proximal", "distal"],
      cost: neuronViewCost(),
    };
  }

  private applyMorphology(): void {
    this.dendrites.geometry.dispose();
    this.dendrites.geometry = dendriteGeometryFrom(this.morphology);
    this.axon.geometry.dispose();
    this.axon.geometry = geometryFrom(this.morphology.axonPoints);
    const nodes = this.morphology.ranvierNodes;
    const count = Math.min(this.ranvierNodes.instanceMatrix.count, nodes.length / 3);
    for (let index = 0; index < count; index += 1) {
      this.position.fromArray(nodes, index * 3);
      this.matrix.compose(
        this.position,
        this.quaternion.identity(),
        this.scale.setScalar(index % 2 === 0 ? 1 : 0.78),
      );
      this.ranvierNodes.setMatrixAt(index, this.matrix);
    }
    this.ranvierNodes.count = count;
    this.ranvierNodes.instanceMatrix.needsUpdate = true;
  }

  private updateDendriteGradient(
    somaVolts: number,
    proximalVolts: number,
    distalVolts: number,
  ): void {
    const colors = this.dendrites.geometry.getAttribute("color") as THREE.BufferAttribute;
    for (let index = 0; index < this.morphology.dendritePathPositions.length; index += 1) {
      const volts = dendriteVoltageAtPathPosition(
        somaVolts,
        proximalVolts,
        distalVolts,
        this.morphology.dendritePathPositions[index] ?? 0,
      );
      const activation = THREE.MathUtils.clamp(
        (volts - MIN_COMPARTMENT_VOLTS) /
          (MAX_COMPARTMENT_VOLTS - MIN_COMPARTMENT_VOLTS),
        0,
        1,
      );
      this.color.copy(COLOR_TOKENS.inactive).lerp(COLOR_TOKENS.featured, activation);
      colors.setXYZ(index, this.color.r, this.color.g, this.color.b);
    }
    colors.needsUpdate = true;
  }

  private updateStampedEvent(snapshot: NeuralSnapshot): void {
    const eventKey = `${snapshot.cellSpikeEvents.hash}:${this.selectedCellId}`;
    if (eventKey === this.lastEventKey) return;
    this.lastEventKey = eventKey;
    this.selectedEventCount = 0;
    for (let index = 0; index < snapshot.cellSpikeEvents.cellIds.length; index += 1) {
      if (snapshot.cellSpikeEvents.cellIds[index] !== this.selectedCellId) continue;
      this.selectedEventCount += 1;
    }
    this.eventMarker.visible = this.selectedEventCount > 0;
    if (!this.eventMarker.visible) return;
    this.eventMarker.position.fromArray(this.morphology.ranvierNodes, 0);
    this.eventMarker.position.z += 0.05;
  }

  update(view: InterpolatedSnapshot): void {
    const snapshot = view.current;
    if (this.selectedCellId >= snapshot.cellPatch.membraneVolts.length) return;
    const soma = interpolatePublishedValue(
      snapshot.cellPatch.membraneVolts[this.selectedCellId] ?? RESTING_VOLTS,
      view.previous?.cellPatch.membraneVolts[this.selectedCellId],
      view.alpha,
    );
    const proximal = interpolatePublishedValue(
      snapshot.cellPatch.dendriteProximalVolts[this.selectedCellId] ?? RESTING_VOLTS,
      view.previous?.cellPatch.dendriteProximalVolts[this.selectedCellId],
      view.alpha,
    );
    const distal = interpolatePublishedValue(
      snapshot.cellPatch.dendriteDistalVolts[this.selectedCellId] ?? RESTING_VOLTS,
      view.previous?.cellPatch.dendriteDistalVolts[this.selectedCellId],
      view.alpha,
    );
    const activation = THREE.MathUtils.clamp(
      (soma - RESTING_VOLTS) / (SPIKE_THRESHOLD_VOLTS - RESTING_VOLTS),
      0,
      1,
    );
    const excitatory = snapshot.cellPatch.kinds[this.selectedCellId] === 0;
    const somaScale = 0.9 + activation * 0.28;
    this.soma.scale.set(
      somaScale * (excitatory ? 0.9 : 1.08),
      somaScale * (excitatory ? 1.12 : 0.82),
      somaScale,
    );
    this.color.copy(excitatory ? COLOR_TOKENS.excitatory : COLOR_TOKENS.inhibitory);
    this.color.lerp(COLOR_TOKENS.white, activation * 0.52);
    (this.soma.material as THREE.MeshBasicMaterial).color.copy(this.color);
    this.updateDendriteGradient(soma, proximal, distal);

    const adaptation = Math.abs(
      snapshot.cellPatch.adaptationAmperes[this.selectedCellId] ?? 0,
    );
    const adaptationScale = 0.72 + Math.min(0.62, adaptation / ADAPTATION_CEILING_AMPERES);
    this.adaptationRing.scale.setScalar(adaptationScale);
    (this.adaptationRing.material as THREE.MeshBasicMaterial).opacity =
      0.24 + Math.min(0.58, adaptation / ADAPTATION_CEILING_AMPERES);

    for (const receptor of this.receptorCurrents) {
      const current = currentFor(snapshot, receptor.name, this.selectedCellId);
      const magnitude = Math.min(1, Math.abs(current) / CURRENT_CEILING_AMPERES);
      receptor.mesh.position.copy(receptor.basePosition);
      const inwardRotation = receptor.basePosition.x < this.soma.position.x ? 0 : Math.PI;
      receptor.mesh.rotation.z = current >= 0 ? inwardRotation : inwardRotation + Math.PI;
      receptor.mesh.scale.set(0.72 + magnitude * 0.72, 0.62 + magnitude * 1.45, 1);
      (receptor.mesh.material as THREE.MeshBasicMaterial).color
        .copy(receptor.color)
        .lerp(COLOR_TOKENS.white, magnitude * 0.45);
    }
    this.updateStampedEvent(snapshot);
  }

  mount(context: RenderContext, _topology: RenderTopology): void {
    mountLayer(this.group, context);
  }

  setDetail(_level: number): void {
    // Compartment count is scientific state and never changes with visual detail.
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  dispose(): void {
    disposeObjectTree(this.group);
  }
}
