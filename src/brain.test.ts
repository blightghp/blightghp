import { test, describe, expect, it } from "vitest";
import { generateBrainData } from "./brain";

describe("generateBrainData", () => {
  const CONFIG = {
    surfaceNodesPerHemisphere: 80,
    innerNodesPerHemisphere: 10,
  };

  it("is deterministic for reproducible GIF captures", () => {
    const first = generateBrainData({ seed: 42, ...CONFIG });
    const second = generateBrainData({ seed: 42, ...CONFIG });

    expect(first.nodes.length).toBe(second.nodes.length);
    first.nodes.forEach((node, i) => {
      expect(node.x).toBeCloseTo(second.nodes[i].x, 5);
      expect(node.y).toBeCloseTo(second.nodes[i].y, 5);
      expect(node.z).toBeCloseTo(second.nodes[i].z, 5);
    });

    expect(first.edges).toEqual(second.edges);
    expect(first.synapses).toEqual(second.synapses);
    expect(first.paths).toEqual(second.paths);
    expect(first.neuronKindByNode).toEqual(second.neuronKindByNode);
  });

  // realizando teste unitario de regras de negocio
  test("valida integridade geométrica dos nós gerados para o cérebro", () => {
    const data = generateBrainData({});

    // 1. Verifica se a lista de nós existe e não está vazia
    expect(data.nodes).toBeDefined();
    expect(data.nodes.length).toBeGreaterThan(0);

    // 2. Garante que as coordenadas (x, y, z) de cada nó são números válidos (não são NaN)
    data.nodes.forEach((node) => {
      expect(Number.isNaN(node.x)).toBe(false);
      expect(Number.isNaN(node.y)).toBe(false);
      expect(Number.isNaN(node.z)).toBe(false);
    });

    // 3. Valida se a região 'cerebellum' foi atribuída
    const regions = Object.values(data.regionByNode);
    expect(regions).toContain("cerebellum");
  });
});