import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { generateBrainData } from "../brain";
import { DiagnosticFallbackHost } from "../wasm-engine-host";
import { CellRenderLayer, setCellPosition } from "./cell-layer";
import {
  generateNeuronMorphology,
  NeuronRenderLayer,
  neuronCellObservables,
  neuronViewCost,
  parseCellId,
} from "./neuron-layer";

function fallbackSnapshot() {
  const topology = generateBrainData({
    seed: 73,
    surfaceNodesPerHemisphere: 20,
    innerNodesPerHemisphere: 3,
  });
  const host = new DiagnosticFallbackHost();
  host.initialize({ type: "initialize", topology }, "neuron-layer-test");
  const snapshot = host.advance({
    type: "advance",
    targetTick: 1,
    stimulus: { intensity: 0, confidence: 0 },
  }).snapshot;
  return { host, snapshot, topology };
}

describe("R09-D resolved neuron", () => {
  it("closes selection to the 12 published patch cells", () => {
    expect(parseCellId(0)).toBe(0);
    expect(parseCellId("11")).toBe(11);
    expect(parseCellId(-1)).toBeUndefined();
    expect(parseCellId(12)).toBeUndefined();
    expect(parseCellId(1.5)).toBeUndefined();
    expect(parseCellId("")).toBeUndefined();
    expect(parseCellId(null)).toBeUndefined();
  });

  it("generates a stable, cell-addressed morphology and geometry hash", () => {
    const first = generateNeuronMorphology(0x51a7c0de, 3);
    const replay = generateNeuronMorphology(0x51a7c0de, 3);
    const otherCell = generateNeuronMorphology(0x51a7c0de, 4);
    expect(first.hash).toMatch(/^[0-9a-f]{16}$/);
    expect(replay.hash).toBe(first.hash);
    expect([...replay.dendriteSegments]).toEqual([...first.dendriteSegments]);
    expect([...replay.axonPoints]).toEqual([...first.axonPoints]);
    expect(otherCell.hash).not.toBe(first.hash);
    expect(first.dendriteSegments.length).toBeGreaterThan(100);
    expect(first.ranvierNodes.length).toBe(24);
  });

  it("reads one selected cell and filters only its stamped events", () => {
    const { host, snapshot } = fallbackSnapshot();
    snapshot.cellPatch.kinds = Uint8Array.from([0, 1, 0]);
    snapshot.cellPatch.membraneVolts = Float32Array.from([-0.06, -0.05, -0.055]);
    snapshot.cellPatch.dendriteVolts = Float32Array.from([-0.069, -0.061, -0.063]);
    snapshot.cellPatch.adaptationAmperes = Float32Array.from([1e-12, 22e-12, 3e-12]);
    snapshot.cellPatch.ampaAmperes = Float32Array.from([4e-12, 12e-12, 6e-12]);
    snapshot.cellPatch.nmdaAmperes = Float32Array.from([2e-12, 8e-12, 3e-12]);
    snapshot.cellPatch.gabaaAmperes = Float32Array.from([-2e-12, -14e-12, -5e-12]);
    snapshot.cellPatch.gababAmperes = Float32Array.from([-1e-12, -4e-12, -2e-12]);
    snapshot.cellSpikeEvents.cellIds = Uint32Array.from([0, 1, 1, 2]);
    snapshot.cellSpikeEvents.timeOffsetsSeconds = Float64Array.from([
      0.001,
      0.002,
      0.004,
      0.006,
    ]);
    const observable = neuronCellObservables(snapshot, 1);
    expect(observable.kind).toBe("inhibitory");
    expect(observable.membraneVolts).toBeCloseTo(-0.05, 6);
    expect(observable.adaptationAmperes).toBeCloseTo(22e-12, 17);
    expect(observable.ampaAmperes).toBeCloseTo(12e-12, 17);
    expect(observable.stampedEventOffsetsSeconds).toEqual([0.002, 0.004]);
    host.dispose();
  });

  it("keeps the event marker off for an unstamped selected cell", () => {
    const { host, snapshot, topology } = fallbackSnapshot();
    const layer = new NeuronRenderLayer(topology.seed);
    layer.setSelectedCell(2);
    snapshot.cellPatch.spiked[2] = 1;
    snapshot.cellSpikeEvents.cellIds = Uint32Array.from([1]);
    snapshot.cellSpikeEvents.timeOffsetsSeconds = Float64Array.from([0.004]);
    snapshot.cellSpikeEvents.hash = "batch-a";
    layer.update({ current: snapshot, alpha: 1 });
    expect(layer.audit().eventMarkerVisible).toBe(false);
    expect(layer.audit().selectedEventCount).toBe(0);

    snapshot.cellSpikeEvents.cellIds = Uint32Array.from([2]);
    snapshot.cellSpikeEvents.hash = "batch-b";
    layer.update({ current: snapshot, alpha: 1 });
    expect(layer.audit().eventMarkerVisible).toBe(true);
    expect(layer.audit().selectedEventCount).toBe(1);
    expect(layer.group.getObjectByName("resolved-neuron-stamped-event")?.visible).toBe(true);
    expect(layer.audit().cost).toEqual(neuronViewCost());
    let renderables = 0;
    layer.group.traverse((object) => {
      if ("material" in object) renderables += 1;
    });
    expect(renderables).toBe(neuronViewCost().totalDrawCalls);
    layer.dispose();
    host.dispose();
  });

  it("orients signed currents relative to the soma on both sides", () => {
    const { host, snapshot, topology } = fallbackSnapshot();
    snapshot.cellPatch.ampaAmperes[0] = 12e-12;
    snapshot.cellPatch.gabaaAmperes[0] = -12e-12;
    const layer = new NeuronRenderLayer(topology.seed);
    layer.update({ current: snapshot, alpha: 1 });
    expect(layer.group.getObjectByName("resolved-neuron-ampa-current")?.rotation.z).toBe(0);
    expect(layer.group.getObjectByName("resolved-neuron-gabaa-current")?.rotation.z).toBe(
      Math.PI * 2,
    );
    layer.dispose();
    host.dispose();
  });

  it("picks the same cell ID rendered by the patch scene", () => {
    const { host, snapshot } = fallbackSnapshot();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const layer = new CellRenderLayer();
    scene.add(layer.group);
    layer.update({ current: snapshot, alpha: 1 });
    scene.updateMatrixWorld(true);
    const position = setCellPosition(new THREE.Vector3(), 6);
    const pointer = position.clone().project(camera);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(pointer.x, pointer.y), camera);
    expect(layer.pickCell(raycaster)).toBe(6);
    layer.dispose();
    host.dispose();
  });

  it("changes presentation without mutating any engine hash", () => {
    const { host, snapshot, topology } = fallbackSnapshot();
    const before = { ...snapshot.diagnostics };
    const layer = new NeuronRenderLayer(topology.seed);
    layer.setSelectedCell(8);
    layer.update({ current: snapshot, alpha: 1 });
    layer.setSelectedCell(3);
    layer.update({ current: snapshot, alpha: 1 });
    expect(snapshot.diagnostics).toEqual(before);
    layer.dispose();
    host.dispose();
  });
});
