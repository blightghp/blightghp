import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { generateBrainData } from "../brain";
import { DiagnosticFallbackHost } from "../wasm-engine-host";
import {
  ElectricalBoardLayer,
  electricalBoardCost,
  electricalBoardObservables,
  electricalBoardTopologyObservables,
  effectiveCellConductanceSiemens,
  parseElectricalBoardDetail,
} from "./electrical-board-layer";

function fallbackSnapshot() {
  const topology = generateBrainData({
    seed: 19,
    surfaceNodesPerHemisphere: 20,
    innerNodesPerHemisphere: 3,
  });
  const host = new DiagnosticFallbackHost();
  host.initialize({ type: "initialize", topology }, "electrical-board-test");
  const snapshot = host.advance({
    type: "advance",
    targetTick: 1,
    stimulus: { intensity: 0, confidence: 0 },
  }).snapshot;
  return { host, snapshot, topology };
}

describe("R09-C electrical board", () => {
  it("keeps three closed presentation levels inside the declared draw budget", () => {
    expect(parseElectricalBoardDetail("summary")).toBe("summary");
    expect(parseElectricalBoardDetail("cellular")).toBe("cellular");
    expect(parseElectricalBoardDetail("events")).toBe("events");
    expect(parseElectricalBoardDetail("solver")).toBeUndefined();
    expect(electricalBoardCost("summary").totalDrawCalls).toBe(6);
    expect(electricalBoardCost("cellular").totalDrawCalls).toBe(10);
    expect(electricalBoardCost("events").totalDrawCalls).toBe(11);
    expect(electricalBoardCost("events").stateValuesPerSnapshot).toBe(108);
  });

  it("derives effective conductance only from published current and driving force", () => {
    const conductance = effectiveCellConductanceSiemens(
      -0.05,
      -0.06,
      -0.065,
      12e-12,
      6e-12,
      -1e-12,
      -3e-12,
    );
    expect(conductance).toBeCloseTo(
      12e-12 / 0.065 + 6e-12 / 0.065 + -1e-12 / -0.01 + -3e-12 / -0.04,
      14,
    );
  });

  it("publishes a textual-equivalent observable set with units supplied by the UI", () => {
    const { host, snapshot } = fallbackSnapshot();
    snapshot.cellPatch.membraneVolts = Float32Array.from([-0.06, -0.05]);
    snapshot.cellPatch.dendriteProximalVolts = Float32Array.from([-0.069, -0.06]);
    snapshot.cellPatch.dendriteDistalVolts = Float32Array.from([-0.071, -0.065]);
    snapshot.cellPatch.ampaAmperes = Float32Array.from([12e-12, 8e-12]);
    snapshot.cellPatch.nmdaAmperes = Float32Array.from([4e-12, 2e-12]);
    snapshot.cellPatch.gabaaAmperes = Float32Array.from([-20e-12, -1e-12]);
    snapshot.cellPatch.gababAmperes = Float32Array.from([-3e-12, -3e-12]);
    snapshot.cellSpikeEvents.cellIds = Uint32Array.from([1, 0]);
    snapshot.cellSpikeEvents.timeOffsetsSeconds = Float64Array.from([0.001, 0.004]);
    const observables = electricalBoardObservables(snapshot);
    expect(observables.meanMembraneVolts).toBeCloseTo(-0.055, 6);
    expect(observables.meanProximalVolts).toBeCloseTo(-0.0645, 6);
    expect(observables.meanDistalVolts).toBeCloseTo(-0.068, 6);
    expect(observables.meanProximalDistalDeltaVolts).toBeCloseTo(0.0035, 6);
    expect(observables.excitatoryCurrentAmperes).toBeCloseTo(13e-12, 18);
    expect(observables.inhibitoryCurrentAmperes).toBeCloseTo(-13.5e-12, 18);
    expect(observables.netCurrentAmperes).toBeCloseTo(-0.5e-12, 18);
    expect(observables.effectiveConductanceSiemens).toBeGreaterThan(0);
    expect(observables.shuntingCells).toBe(1);
    expect(observables.eventCount).toBe(2);
    expect(observables.firstEventOffsetSeconds).toBe(0.001);
    expect(observables.lastEventOffsetSeconds).toBe(0.004);
    host.dispose();
  });

  it("reads macro delay and gain from topology without relabelling them as patch values", () => {
    const topology = generateBrainData({
      seed: 31,
      surfaceNodesPerHemisphere: 20,
      innerNodesPerHemisphere: 3,
    });
    const observables = electricalBoardTopologyObservables(topology);
    const expectedDelay = topology.synapses.reduce((sum, synapse) => sum + synapse.delay, 0) /
      topology.synapses.length;
    expect(observables.synapseCount).toBe(topology.synapses.length);
    expect(observables.meanDelaySeconds).toBeCloseTo(expectedDelay, 14);
    expect(observables.meanAbsoluteGain).toBeGreaterThan(0);
  });

  it("uses a separate scene graph and updates event matrices only for a new stamped batch", () => {
    const { host, snapshot } = fallbackSnapshot();
    const layer = new ElectricalBoardLayer();
    layer.update({ current: snapshot, alpha: 1 });
    const events = layer.group.getObjectByName("electrical-stamped-events") as THREE.InstancedMesh;
    const firstVersion = events.instanceMatrix.version;
    layer.update({ current: snapshot, alpha: 1 });
    expect(events.instanceMatrix.version).toBe(firstVersion);
    snapshot.cellSpikeEvents.hash = `${snapshot.cellSpikeEvents.hash}-next`;
    layer.update({ current: snapshot, alpha: 1 });
    expect(events.instanceMatrix.version).toBe(firstVersion + 1);
    expect(layer.group.getObjectByName("adex-somata")).toBeUndefined();
    layer.setBoardDetail("events");
    expect(events.visible).toBe(true);
    expect(layer.audit().cost.totalDrawCalls).toBe(11);
    layer.dispose();
    host.dispose();
  });
});
