import { describe, expect, it } from "vitest";
import { meanAbsoluteWeight, PopulationFiringRate } from "./observables";

describe("meanAbsoluteWeight", () => {
  it("averages absolute magnitude regardless of sign", () => {
    expect(meanAbsoluteWeight([0.5, -0.5, 0.25, -0.25])).toBeCloseTo(0.375, 12);
  });

  it("returns zero for an empty population", () => {
    expect(meanAbsoluteWeight([])).toBe(0);
  });
});

describe("PopulationFiringRate", () => {
  it("converges to the analytic rate for a constant spike count", () => {
    const rate = new PopulationFiringRate(100, 1 / 60, 0.2);
    let last = 0;
    for (let tick = 0; tick < 120; tick += 1) last = rate.sample(2);

    // 2 disparos/tick a 60 Hz numa população de 100 => 2 * 60 / 100 = 1.2 Hz.
    expect(last).toBeCloseTo(1.2, 6);
  });

  it("reports zero for a silent population", () => {
    const rate = new PopulationFiringRate(50, 1 / 60, 0.2);
    for (let tick = 0; tick < 30; tick += 1) expect(rate.sample(0)).toBe(0);
  });

  it("ramps up honestly while the window is still filling", () => {
    const rate = new PopulationFiringRate(10, 1 / 60, 1 / 6);
    // Janela de 10 ticks a 60 Hz; um único disparo no primeiro tick.
    const afterFirstTick = rate.sample(1);
    expect(afterFirstTick).toBeCloseTo(1 / (1 / 60) / 10, 12);
    for (let tick = 0; tick < 8; tick += 1) rate.sample(0);
    const afterWindowFull = rate.sample(0);
    expect(afterWindowFull).toBeCloseTo(0.6, 12);
  });

  it("forgets samples once they leave the sliding window", () => {
    const rate = new PopulationFiringRate(10, 1 / 60, 1 / 6);
    rate.sample(10);
    for (let tick = 0; tick < 10; tick += 1) rate.sample(0);
    expect(rate.sample(0)).toBe(0);
  });

  it("returns to zero after reset", () => {
    const rate = new PopulationFiringRate(10, 1 / 60, 0.1);
    rate.sample(5);
    rate.sample(5);
    rate.reset();
    expect(rate.sample(0)).toBe(0);
  });

  it("rejects a non-physical configuration", () => {
    expect(() => new PopulationFiringRate(0, 1 / 60, 0.2)).toThrow(RangeError);
    expect(() => new PopulationFiringRate(10, 0, 0.2)).toThrow(RangeError);
    expect(() => new PopulationFiringRate(10, 1 / 60, 0)).toThrow(RangeError);
  });
});
