import { describe, expect, it } from "vitest";
import { generateBrainData } from "./brain";

describe("generateBrainData", () => {
  it("is deterministic for reproducible GIF captures", () => {
    const first = generateBrainData({ seed: 42, surfaceNodesPerHemisphere: 80, innerNodesPerHemisphere: 10 });
    const second = generateBrainData({ seed: 42, surfaceNodesPerHemisphere: 80, innerNodesPerHemisphere: 10 });

    expect(first.nodes.map((node) => node.toArray())).toEqual(
      second.nodes.map((node) => node.toArray()),
    );
    expect(first.edges).toEqual(second.edges);
    expect(first.paths).toEqual(second.paths);
  });

  it("builds every anatomical region and valid synaptic paths", () => {
    const brain = generateBrainData({ surfaceNodesPerHemisphere: 100, innerNodesPerHemisphere: 20 });

    expect(brain.groups.leftHemi.length).toBeGreaterThan(100);
    expect(brain.groups.rightHemi.length).toBeGreaterThan(100);
    expect(brain.groups.cerebellum.length).toBeGreaterThan(200);
    expect(brain.groups.stem.length).toBeGreaterThan(100);
    expect(brain.paths.length).toBeGreaterThan(200);
    expect(brain.edges.every(([a, b]) => a >= 0 && b < brain.nodes.length)).toBe(true);
  });
});
