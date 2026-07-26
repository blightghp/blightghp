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
    expect(first.synapses).toEqual(second.synapses);
    expect(first.paths).toEqual(second.paths);
    expect(first.neuronKindByNode).toEqual(second.neuronKindByNode);
  });

  it("builds every anatomical region and valid synaptic paths", () => {
    const brain = generateBrainData({ surfaceNodesPerHemisphere: 100, innerNodesPerHemisphere: 20 });

    expect(brain.groups.leftHemi.length).toBeGreaterThan(100);
    expect(brain.groups.rightHemi.length).toBeGreaterThan(100);
    expect(brain.groups.cerebellum.length).toBeGreaterThan(200);
    expect(brain.groups.stem.length).toBeGreaterThan(100);
    expect(brain.paths.length).toBeGreaterThan(200);
    expect(brain.edges.every(([a, b]) => a >= 0 && b < brain.nodes.length)).toBe(true);
    expect(brain.synapses).toHaveLength(brain.edges.length * 2);
    expect(brain.paths.every((path) => new Set(path).size === path.length)).toBe(true);
    expect(brain.synapses.some((synapse) => synapse.weight < 0)).toBe(true);
    expect(brain.synapses.some((synapse) => synapse.weight > 0)).toBe(true);
  });

  it("builds a deterministic symmetric cortical field graph and projection", () => {
    const surfaceNodesPerHemisphere = 48;
    const brain = generateBrainData({
      seed: 22,
      surfaceNodesPerHemisphere,
      innerNodesPerHemisphere: 9,
    });
    const field = brain.corticalField;

    expect(field.nodeIndices).toHaveLength(surfaceNodesPerHemisphere * 2);
    expect(field.rowOffsets).toHaveLength(field.nodeIndices.length + 1);
    expect(field.rowOffsets[field.rowOffsets.length - 1]).toBe(field.neighbors.length);
    expect(field.edgeLengths).toHaveLength(field.neighbors.length);
    expect(Math.min(...field.edgeLengths)).toBeGreaterThan(0);

    for (let vertex = 0; vertex < field.nodeIndices.length; vertex += 1) {
      expect(field.vertexByNode[field.nodeIndices[vertex]]).toBe(vertex);
      const neighbors = field.neighbors.slice(
        field.rowOffsets[vertex],
        field.rowOffsets[vertex + 1],
      );
      expect(neighbors.length).toBeGreaterThanOrEqual(6);
      for (const neighbor of neighbors) {
        const reverse = field.neighbors.slice(
          field.rowOffsets[neighbor],
          field.rowOffsets[neighbor + 1],
        );
        expect(Array.from(reverse)).toContain(vertex);
      }
    }

    expect(brain.groups.leftHemi.every((node) => field.vertexByNode[node] >= 0)).toBe(true);
    expect(brain.groups.rightHemi.every((node) => field.vertexByNode[node] >= 0)).toBe(true);
    expect(brain.groups.cerebellum.every((node) => field.vertexByNode[node] === -1)).toBe(true);
    expect(brain.groups.stem.every((node) => field.vertexByNode[node] === -1)).toBe(true);
  });
});
