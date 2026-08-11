import { describe, expect, it } from "vitest";
import type { NeuralSnapshot } from "../protocol";
import {
  concentrationActivity,
  recaptureActivity,
  releaseActivity,
} from "./synapse-layer";

function chemicalSnapshot(options: {
  timeSeconds?: number;
  releaseMoles?: [number, number];
  releaseTimes?: [number, number];
  clearedMoles?: [number, number];
} = {}): NeuralSnapshot {
  return {
    chemical: {
      timeSeconds: options.timeSeconds ?? 1,
      latestReleaseMoles: new Float64Array(options.releaseMoles ?? [0, 0]),
      latestReleaseTimeSeconds: new Float64Array(options.releaseTimes ?? [-1, -1]),
      clearedMoles: new Float64Array(options.clearedMoles ?? [0, 0]),
    },
  } as NeuralSnapshot;
}

describe("published chemical visual encoding", () => {
  it("maps concentration monotonically into a bounded particle density", () => {
    expect(concentrationActivity(0)).toBe(0);
    expect(concentrationActivity(1)).toBeGreaterThan(0);
    expect(concentrationActivity(10)).toBeGreaterThan(concentrationActivity(1));
    expect(concentrationActivity(Number.POSITIVE_INFINITY)).toBe(0);
    expect(concentrationActivity(1e9)).toBe(1);
  });

  it("shows release only when amount and event time were published", () => {
    expect(releaseActivity(chemicalSnapshot(), 0)).toBe(0);
    const active = chemicalSnapshot({
      timeSeconds: 1.005,
      releaseMoles: [2e-19, 0],
      releaseTimes: [1, -1],
    });
    expect(releaseActivity(active, 0)).toBeGreaterThan(0);
    expect(releaseActivity(active, 1)).toBe(0);
    expect(releaseActivity(chemicalSnapshot({
      timeSeconds: 1.1,
      releaseMoles: [2e-19, 0],
      releaseTimes: [1, -1],
    }), 0)).toBe(0);
  });

  it("derives recapture only from a positive published clearance delta", () => {
    const previous = chemicalSnapshot({ clearedMoles: [1e-20, 0] });
    const current = chemicalSnapshot({ clearedMoles: [3e-20, 0] });
    expect(recaptureActivity(current, previous, 0)).toBeGreaterThan(0);
    expect(recaptureActivity(previous, current, 0)).toBe(0);
    expect(recaptureActivity(current, undefined, 0)).toBe(0);
  });
});
