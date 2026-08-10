import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  classifyCellCurrent,
  currentDirectionEuler,
  currentMagnitudeScale,
  decodeStateColor,
  encodeStateColor,
  estimateConductanceSiemens,
  signedMean,
} from "./visual-encoding";

describe("signed current visual encoding", () => {
  it("preserves the sign instead of averaging absolute current", () => {
    expect(signedMean(new Float32Array([3e-12, -1e-12]))).toBeCloseTo(1e-12, 18);
    expect(signedMean(new Float32Array([-4e-12, -2e-12]))).toBeCloseTo(-3e-12, 18);
  });

  it("derives active GABA-A shunt from published current and voltage", () => {
    const volts = -0.068;
    const conductance = 0.75e-9;
    const current = conductance * (-0.07 - volts);
    expect(estimateConductanceSiemens(current, -0.07, volts)).toBeCloseTo(conductance, 18);
    expect(classifyCellCurrent(current, Math.abs(current), volts, current).direction).toBe("shunting");
    expect(classifyCellCurrent(-20e-12, 20e-12, -0.05, -20e-12).direction).toBe(
      "hyperpolarizing",
    );
    expect(classifyCellCurrent(20e-12, 20e-12, -0.05, 0).direction).toBe("depolarizing");
  });

  it("uses different ring planes as a color-independent direction cue", () => {
    const inward = currentDirectionEuler("depolarizing").toArray();
    const outward = currentDirectionEuler("hyperpolarizing").toArray();
    const shunt = currentDirectionEuler("shunting").toArray();
    expect(inward).not.toEqual(outward);
    expect(outward).not.toEqual(shunt);
    expect(shunt).not.toEqual(inward);
  });

  it("bounds emission size even under currents above the visual ceiling", () => {
    expect(currentMagnitudeScale(0)).toBe(0.82);
    expect(currentMagnitudeScale(10)).toBeLessThanOrEqual(1.28);
  });

  it("recovers scalar state from the exact material ramp", () => {
    const base = new THREE.Color(0x247fc4);
    for (const state of [0, 0.125, 0.5, 0.875, 1]) {
      const encoded = encodeStateColor(base, state);
      expect(decodeStateColor(encoded, base)).toBeCloseTo(state, 12);
    }
  });
});
