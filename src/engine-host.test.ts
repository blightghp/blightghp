import { describe, expect, it } from "vitest";
import { generateBrainData } from "./brain";
import { EngineHost } from "./engine-host";
import type { EngineFaultEvent, EngineReadyEvent, EngineSnapshotEvent } from "./protocol";

const STIMULUS = { intensity: 0.85, confidence: 0.75 };

function freshHost() {
  const topology = generateBrainData({
    seed: 81,
    surfaceNodesPerHemisphere: 80,
    innerNodesPerHemisphere: 12,
  });
  const host = new EngineHost();
  host.handle({ type: "initialize", topology, seed: topology.seed });
  return host;
}

describe("EngineHost", () => {
  it("answers initialize with ready at tick zero", () => {
    const topology = generateBrainData({ seed: 3, surfaceNodesPerHemisphere: 60, innerNodesPerHemisphere: 8 });
    const host = new EngineHost();
    const events = host.handle({ type: "initialize", topology, seed: topology.seed });

    expect(events).toHaveLength(1);
    expect((events[0] as EngineReadyEvent).type).toBe("ready");
    expect((events[0] as EngineReadyEvent).tick).toBe(0);
  });

  it("advances to the requested tick and reports it in the snapshot", () => {
    const host = freshHost();
    const events = host.handle({ type: "advance", targetTick: 120, stimulus: STIMULUS });

    expect(events).toHaveLength(1);
    const snapshotEvent = events[0] as EngineSnapshotEvent;
    expect(snapshotEvent.type).toBe("snapshot");
    expect(snapshotEvent.snapshot.tick).toBe(120);
  });

  it("produces the same snapshots for the same command sequence", () => {
    const first = freshHost();
    const second = freshHost();

    const firstSnapshots = [
      first.handle({ type: "advance", targetTick: 60, stimulus: STIMULUS }),
      first.handle({ type: "advance", targetTick: 180, stimulus: STIMULUS }),
    ].map((events) => (events[0] as EngineSnapshotEvent).snapshot);

    const secondSnapshots = [
      second.handle({ type: "advance", targetTick: 60, stimulus: STIMULUS }),
      second.handle({ type: "advance", targetTick: 180, stimulus: STIMULUS }),
    ].map((events) => (events[0] as EngineSnapshotEvent).snapshot);

    expect(firstSnapshots).toEqual(secondSnapshots);
  });

  it("does not drop or duplicate ticks when advance is split differently", () => {
    const chunked = freshHost();
    const single = freshHost();

    let chunkedEvents: ReturnType<EngineHost["handle"]> = [];
    for (const targetTick of [40, 90, 150, 240]) {
      chunkedEvents = chunked.handle({ type: "advance", targetTick, stimulus: STIMULUS });
    }
    const chunkedSnapshot = (chunkedEvents[0] as EngineSnapshotEvent).snapshot;

    const singleSnapshot = (
      single.handle({ type: "advance", targetTick: 240, stimulus: STIMULUS })[0] as EngineSnapshotEvent
    ).snapshot;

    expect(chunkedSnapshot).toEqual(singleSnapshot);
  });

  it("applies learningRate carried on advance before stepping", () => {
    const plastic = freshHost();
    const frozen = freshHost();

    const plasticWeights = (
      plastic.handle({ type: "advance", targetTick: 480, stimulus: STIMULUS, learningRate: 0.02 })[0] as EngineSnapshotEvent
    ).snapshot.weights;
    const frozenWeights = (
      frozen.handle({ type: "advance", targetTick: 480, stimulus: STIMULUS })[0] as EngineSnapshotEvent
    ).snapshot.weights;

    expect(Array.from(plasticWeights)).not.toEqual(Array.from(frozenWeights));
  });

  it("rejects advance before initialize", () => {
    const host = new EngineHost();
    const events = host.handle({ type: "advance", targetTick: 10, stimulus: STIMULUS });

    expect((events[0] as EngineFaultEvent).type).toBe("fault");
    expect((events[0] as EngineFaultEvent).code).toBe("not-initialized");
  });

  it("rejects an advance target that would rewind the engine", () => {
    const host = freshHost();
    host.handle({ type: "advance", targetTick: 100, stimulus: STIMULUS });
    const events = host.handle({ type: "advance", targetTick: 40, stimulus: STIMULUS });

    expect((events[0] as EngineFaultEvent).type).toBe("fault");
    expect((events[0] as EngineFaultEvent).code).toBe("tick-regression");
  });

  it("resets to tick zero and the original weights without a new seed", () => {
    const host = freshHost();
    host.handle({ type: "advance", targetTick: 200, stimulus: STIMULUS });
    const readyEvents = host.handle({ type: "reset" });
    const snapshotEvents = host.handle({ type: "advance", targetTick: 0, stimulus: STIMULUS });

    expect((readyEvents[0] as EngineReadyEvent).tick).toBe(0);
    expect(snapshotEvents).toHaveLength(1);
    expect((snapshotEvents[0] as EngineSnapshotEvent).snapshot.tick).toBe(0);
  });

  it("reseeds noise on reset when a new seed is given", () => {
    const withoutReseed = freshHost();
    withoutReseed.handle({ type: "reset" });
    const baseline = (
      withoutReseed.handle({ type: "advance", targetTick: 200, stimulus: STIMULUS })[0] as EngineSnapshotEvent
    ).snapshot;

    const reseeded = freshHost();
    reseeded.handle({ type: "reset", seed: 999 });
    const reseededSnapshot = (
      reseeded.handle({ type: "advance", targetTick: 200, stimulus: STIMULUS })[0] as EngineSnapshotEvent
    ).snapshot;

    expect(reseededSnapshot.firingRate).not.toBe(baseline.firingRate);
  });

  it("rejects reset before initialize", () => {
    const host = new EngineHost();
    const events = host.handle({ type: "reset" });

    expect((events[0] as EngineFaultEvent).code).toBe("not-initialized");
  });

  it("clears state on dispose so later commands fault", () => {
    const host = freshHost();
    host.handle({ type: "dispose" });
    const events = host.handle({ type: "advance", targetTick: 10, stimulus: STIMULUS });

    expect((events[0] as EngineFaultEvent).code).toBe("not-initialized");
  });
});
