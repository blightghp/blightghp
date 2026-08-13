import { describe, expect, it } from "vitest";
import { generateBrainData } from "./brain";
import {
  assertAdvanceWithinEnvelope,
  assertCellSpikeEventBatch,
  assertResourceCounts,
  assertScheduledInputsWithinEnvelope,
  DiagnosticFallbackHost,
  snapshotTransferList,
  WORKER_RESOURCE_LIMITS,
} from "./wasm-engine-host";
import { snapshotBufferEntries } from "./snapshot-layout";

describe("diagnostic Wasm fallback", () => {
  it("publishes an explicit inert snapshot without inventing activity", () => {
    const topology = generateBrainData({
      seed: 91,
      surfaceNodesPerHemisphere: 24,
      innerNodesPerHemisphere: 4,
    });
    const fallback = new DiagnosticFallbackHost();
    const ready = fallback.initialize(
      { type: "initialize", topology, seed: topology.seed },
      new Error("falha de teste"),
    );
    const event = fallback.advance({
      type: "advance",
      targetTick: 12,
      stimulus: { intensity: 1, confidence: 0 },
    });

    expect(ready.runtime).toBe("diagnostic-fallback");
    expect(ready.degraded).toBe(true);
    expect(event.snapshot.tick).toBe(12);
    expect(event.snapshot.diagnostics.stateHash).toBe("unavailable");
    expect(event.snapshot.potentials.every((value) => value === 0)).toBe(true);
    expect(event.snapshot.field.eField.every((value) => value === 0)).toBe(true);
  });

  it("accepts resource limits and rejects the first value above them", () => {
    assertResourceCounts({
      nodes: WORKER_RESOURCE_LIMITS.nodes,
      synapses: WORKER_RESOURCE_LIMITS.synapses,
      fieldVertices: WORKER_RESOURCE_LIMITS.fieldVertices,
      fieldEdges: WORKER_RESOURCE_LIMITS.fieldEdges,
    });
    expect(() =>
      assertResourceCounts({
        nodes: WORKER_RESOURCE_LIMITS.nodes + 1,
        synapses: 0,
        fieldVertices: 0,
        fieldEdges: 0,
      }),
    ).toThrow(/envelope de recursos/);
  });

  it("bounds tick work per Worker command", () => {
    assertAdvanceWithinEnvelope(10, 10 + WORKER_RESOURCE_LIMITS.ticksPerCommand);
    expect(() =>
      assertAdvanceWithinEnvelope(
        10,
        11 + WORKER_RESOURCE_LIMITS.ticksPerCommand,
      ),
    ).toThrow(/trabalho máximo/);
    expect(() => assertAdvanceWithinEnvelope(10, 9)).toThrow(/regressivo/);
  });

  it("lists every compact snapshot buffer for zero-copy Worker transfer", () => {
    const topology = generateBrainData({
      seed: 7,
      surfaceNodesPerHemisphere: 20,
      innerNodesPerHemisphere: 3,
    });
    const fallback = new DiagnosticFallbackHost();
    fallback.initialize({ type: "initialize", topology }, "teste");
    const snapshot = fallback.advance({
      type: "advance",
      targetTick: 1,
      stimulus: { intensity: 0, confidence: 0 },
    }).snapshot;
    const buffers = snapshotTransferList(snapshot);
    const entries = snapshotBufferEntries(snapshot);

    expect(buffers).toHaveLength(37);
    expect(entries).toHaveLength(37);
    expect(new Set(entries.map(({ name }) => name)).size).toBe(entries.length);
    expect(entries.map(({ view }) => view.buffer)).toEqual(buffers);
    expect(new Set(buffers).size).toBe(buffers.length);
    expect(buffers).toContain(snapshot.potentials.buffer);
    expect(buffers).toContain(snapshot.field.waveActivity.buffer);
    expect(buffers).toContain(snapshot.corticothalamic.excitatory.buffer);
    expect(buffers).toContain(snapshot.cellPatch.membraneVolts.buffer);
    expect(buffers).toContain(snapshot.cellPatch.dendriteProximalVolts.buffer);
    expect(buffers).toContain(snapshot.cellPatch.dendriteDistalVolts.buffer);
    expect(buffers).toContain(snapshot.cellPatch.gababAmperes.buffer);
    expect(buffers).toContain(snapshot.cellSpikeEvents.cellIds.buffer);
    expect(buffers).toContain(snapshot.cellSpikeEvents.timeOffsetsSeconds.buffer);
    expect(buffers).toContain(snapshot.chemical.latestReleaseMoles.buffer);
    expect(buffers).toContain(snapshot.chemical.receptorOccupancyFraction.buffer);
    expect(buffers).toContain(snapshot.chemical.clearedMoles.buffer);
  });

  it("validates bounded, canonical cellular event batches", () => {
    expect(() => assertCellSpikeEventBatch({
      schemaVersion: 1,
      startTick: 10,
      endTick: 12,
      cellIds: Uint32Array.from([2, 5, 1]),
      timeOffsetsSeconds: Float64Array.from([0, 0, 0.02]),
      hash: "0123456789abcdef",
    }, 1 / 60)).not.toThrow();
    expect(() => assertCellSpikeEventBatch({
      schemaVersion: 1,
      startTick: 10,
      endTick: 12,
      cellIds: Uint32Array.from([5, 2]),
      timeOffsetsSeconds: Float64Array.from([0, 0]),
      hash: "0123456789abcdef",
    }, 1 / 60)).toThrow(/ordem/);
    expect(() => assertCellSpikeEventBatch({
      schemaVersion: 1,
      startTick: 0,
      endTick: 1,
      cellIds: new Uint32Array(WORKER_RESOURCE_LIMITS.cellSpikeEventsPerSnapshot + 1),
      timeOffsetsSeconds: new Float64Array(
        WORKER_RESOURCE_LIMITS.cellSpikeEventsPerSnapshot + 1,
      ),
      hash: "0123456789abcdef",
    }, 1 / 60)).toThrow(/lote/);
  });

  it("bounds replay input batches and rejects ambiguous addresses", () => {
    expect(() =>
      assertScheduledInputsWithinEnvelope(10, {
        type: "schedule",
        inputs: [
          { tick: 11, sequence: 2, kind: "stimulus", intensity: 0.5, confidence: 0.7 },
        ],
      }),
    ).not.toThrow();
    expect(() =>
      assertScheduledInputsWithinEnvelope(10, {
        type: "schedule",
        inputs: [
          { tick: 11, sequence: 2, kind: "plasticity", learningRate: 0.004 },
          { tick: 11, sequence: 2, kind: "plasticity", learningRate: 0.002 },
        ],
      }),
    ).toThrow(/duplicado/);
  });
});
