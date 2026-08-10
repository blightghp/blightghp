import { describe, expect, it } from "vitest";
import {
  composeNodeActivity,
  interpolatePublishedValue,
} from "./render/brain-layer";

describe("render activity composition", () => {
  it("interpolates only between published values and clamps presentation alpha", () => {
    expect(interpolatePublishedValue(1, 0, 0)).toBe(0);
    expect(interpolatePublishedValue(1, 0, 0.25)).toBe(0.25);
    expect(interpolatePublishedValue(1, 0, 1)).toBe(1);
    expect(interpolatePublishedValue(1, 0, -2)).toBe(0);
    expect(interpolatePublishedValue(1, 0, 3)).toBe(1);
    expect(interpolatePublishedValue(0.4, undefined, 0.5)).toBe(0.4);
  });

  it("does not double-count spike and field representations", () => {
    expect(composeNodeActivity(0.8, 0.6)).toBe(0.8);
    expect(composeNodeActivity(0.2, 1)).toBe(0.7);
    expect(composeNodeActivity(0.8, 0.6)).toBeLessThan(0.8 + 0.6 * 0.7);
  });
});
