import { describe, expect, it } from "vitest";
import { FixedStepClock } from "./clock";

describe("FixedStepClock", () => {
  it("schedules the same ticks independently of frame partitioning", () => {
    const split = new FixedStepClock({ stepSeconds: 1 / 60 });
    const joined = new FixedStepClock({ stepSeconds: 1 / 60 });

    split.advanceExact(1 / 30);
    split.advanceExact(1 / 30);
    joined.advanceExact(1 / 15);

    expect(split.targetTick).toBe(4);
    expect(split.targetTick).toBe(joined.targetTick);
    expect(split.interpolationAlpha).toBeCloseTo(joined.interpolationAlpha, 12);
  });

  it("changes scheduled ticks with speed without changing the fixed step", () => {
    const clock = new FixedStepClock({ stepSeconds: 0.01 });

    clock.observe(1000, 2);
    const frame = clock.observe(1025, 2);

    expect(clock.stepSeconds).toBe(0.01);
    expect(frame.targetTick).toBe(5);
    expect(frame.renderTimeSeconds).toBeCloseTo(0.025, 12);
    expect(frame.interpolationAlpha).toBe(0);
  });

  it("limits interactive backlog and reports discarded wall time", () => {
    const clock = new FixedStepClock({
      stepSeconds: 0.01,
      maxInteractiveDeltaSeconds: 0.1,
    });

    clock.observe(0);
    const frame = clock.observe(250);

    expect(frame.targetTick).toBe(10);
    expect(frame.frameDeltaSeconds).toBe(0.1);
    expect(frame.renderTimeSeconds).toBe(0.25);
    expect(frame.droppedFrameSeconds).toBeCloseTo(0.15, 12);
    expect(frame.droppedTotalSeconds).toBeCloseTo(0.15, 12);
  });

  it("advances capture time exactly without the interactive limit", () => {
    const clock = new FixedStepClock({
      stepSeconds: 0.01,
      maxInteractiveDeltaSeconds: 0.1,
    });

    const frame = clock.advanceExact(0.25);

    expect(frame.targetTick).toBe(25);
    expect(frame.droppedFrameSeconds).toBe(0);
    expect(frame.droppedTotalSeconds).toBe(0);
  });

  it("rebases wall time without adding the hidden interval", () => {
    const clock = new FixedStepClock({ stepSeconds: 0.01 });

    clock.observe(100);
    clock.observe(120);
    clock.rebase(1000);
    const frame = clock.observe(1010);

    expect(frame.targetTick).toBe(3);
    expect(frame.renderTimeSeconds).toBeCloseTo(0.03, 12);
  });

  it("synchronizes capture warmup with an existing engine tick", () => {
    const clock = new FixedStepClock({ stepSeconds: 1 / 60 });

    clock.synchronize(40);
    const frame = clock.advanceTicks(120);

    expect(frame.targetTick).toBe(160);
    expect(frame.interpolationAlpha).toBe(0);
  });

  it("rejects invalid temporal parameters", () => {
    expect(() => new FixedStepClock({ stepSeconds: 0 })).toThrow(RangeError);
    const clock = new FixedStepClock({ stepSeconds: 0.01 });

    expect(() => clock.observe(Number.NaN)).toThrow(RangeError);
    expect(() => clock.advanceExact(-1)).toThrow(RangeError);
    expect(() => clock.advanceTicks(0.5)).toThrow(RangeError);
    expect(() => clock.synchronize(-1)).toThrow(RangeError);
  });
});
