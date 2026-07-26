import { describe, expect, it } from "vitest";
import { generateBrainData } from "./brain";
import {
  DiagnosticFallbackHost,
  snapshotTransferList,
} from "./wasm-engine-host";

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
      stimulus: { intensity: 1, confidence: 1 },
    });

    expect(ready.runtime).toBe("diagnostic-fallback");
    expect(ready.degraded).toBe(true);
    expect(event.snapshot.tick).toBe(12);
    expect(event.snapshot.diagnostics.stateHash).toBe("unavailable");
    expect(event.snapshot.potentials.every((value) => value === 0)).toBe(true);
    expect(event.snapshot.field.eField.every((value) => value === 0)).toBe(true);
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

    expect(buffers).toHaveLength(11);
    expect(new Set(buffers).size).toBe(buffers.length);
    expect(buffers).toContain(snapshot.potentials.buffer);
    expect(buffers).toContain(snapshot.field.waveActivity.buffer);
  });
});
