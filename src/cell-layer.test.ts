import { describe, expect, it } from "vitest";
import {
  amperesToPicoamperes,
  mean,
  membraneActivation,
  voltsToMillivolts,
} from "./render/cell-layer";

describe("cell patch presentation", () => {
  it("converts SI engine values only at the presentation boundary", () => {
    expect(voltsToMillivolts(-0.065)).toBeCloseTo(-65);
    expect(amperesToPicoamperes(42e-12)).toBeCloseTo(42);
  });

  it("bounds the voltage palette and handles empty means", () => {
    expect(membraneActivation(-0.08)).toBe(0);
    expect(membraneActivation(-0.045)).toBe(1);
    expect(membraneActivation(-0.055)).toBeGreaterThan(0);
    expect(mean(new Float32Array())).toBe(0);
    expect(mean(new Float32Array([1, 2, 3]))).toBe(2);
  });
});
