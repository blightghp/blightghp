import { describe, expect, it } from "vitest";
import { generateBrainData } from "./brain";
import { buildSynapseCsr, incomingRow, outgoingRow, SynapseEndpoints } from "./network";

describe("buildSynapseCsr", () => {
  it("orders each row by (endpoint, id) for a known small topology", () => {
    const synapses: SynapseEndpoints[] = [
      { from: 0, to: 2 }, // id 0
      { from: 0, to: 1 }, // id 1
      { from: 1, to: 2 }, // id 2
      { from: 0, to: 1 }, // id 3, duplicate destination, breaks the tie by id
      { from: 2, to: 0 }, // id 4
    ];

    const csr = buildSynapseCsr(3, synapses);

    expect(Array.from(csr.outgoingOffsets)).toEqual([0, 3, 4, 5]);
    expect(Array.from(outgoingRow(csr, 0))).toEqual([1, 3, 0]);
    expect(Array.from(outgoingRow(csr, 1))).toEqual([2]);
    expect(Array.from(outgoingRow(csr, 2))).toEqual([4]);

    expect(Array.from(csr.incomingOffsets)).toEqual([0, 1, 3, 5]);
    expect(Array.from(incomingRow(csr, 0))).toEqual([4]);
    expect(Array.from(incomingRow(csr, 1))).toEqual([1, 3]);
    expect(Array.from(incomingRow(csr, 2))).toEqual([0, 2]);
  });

  it("leaves nodes without synapses as empty rows", () => {
    const csr = buildSynapseCsr(2, [{ from: 0, to: 0 }]);
    expect(Array.from(outgoingRow(csr, 1))).toEqual([]);
    expect(Array.from(incomingRow(csr, 1))).toEqual([]);
  });

  it("matches the naive grouping used before the CSR, only reordered", () => {
    const brain = generateBrainData({ seed: 23, surfaceNodesPerHemisphere: 60, innerNodesPerHemisphere: 8 });
    const csr = buildSynapseCsr(brain.nodes.length, brain.synapses);

    const naiveOutgoing: number[][] = Array.from({ length: brain.nodes.length }, () => []);
    const naiveIncoming: number[][] = Array.from({ length: brain.nodes.length }, () => []);
    brain.synapses.forEach((synapse, id) => {
      naiveOutgoing[synapse.from].push(id);
      naiveIncoming[synapse.to].push(id);
    });

    for (let node = 0; node < brain.nodes.length; node += 1) {
      expect(new Set(outgoingRow(csr, node))).toEqual(new Set(naiveOutgoing[node]));
      expect(new Set(incomingRow(csr, node))).toEqual(new Set(naiveIncoming[node]));
    }
  });

  it("sorts every row by destination or source, then by synapse id", () => {
    const brain = generateBrainData({ seed: 23, surfaceNodesPerHemisphere: 60, innerNodesPerHemisphere: 8 });
    const csr = buildSynapseCsr(brain.nodes.length, brain.synapses);

    for (let node = 0; node < brain.nodes.length; node += 1) {
      const outgoing = outgoingRow(csr, node);
      for (let i = 1; i < outgoing.length; i += 1) {
        const previous = brain.synapses[outgoing[i - 1]];
        const current = brain.synapses[outgoing[i]];
        expect(previous.to < current.to || (previous.to === current.to && outgoing[i - 1] < outgoing[i])).toBe(
          true,
        );
      }

      const incoming = incomingRow(csr, node);
      for (let i = 1; i < incoming.length; i += 1) {
        const previous = brain.synapses[incoming[i - 1]];
        const current = brain.synapses[incoming[i]];
        expect(
          previous.from < current.from || (previous.from === current.from && incoming[i - 1] < incoming[i]),
        ).toBe(true);
      }
    }
  });

  it("keeps every offset within the synapse buffer and covers every id exactly once per direction", () => {
    const brain = generateBrainData({ seed: 5, surfaceNodesPerHemisphere: 40, innerNodesPerHemisphere: 6 });
    const csr = buildSynapseCsr(brain.nodes.length, brain.synapses);

    expect(csr.outgoingOffsets[0]).toBe(0);
    expect(csr.outgoingOffsets[csr.nodeCount]).toBe(csr.synapseCount);
    expect(csr.incomingOffsets[0]).toBe(0);
    expect(csr.incomingOffsets[csr.nodeCount]).toBe(csr.synapseCount);
    for (let node = 0; node < csr.nodeCount; node += 1) {
      expect(csr.outgoingOffsets[node]).toBeLessThanOrEqual(csr.outgoingOffsets[node + 1]);
      expect(csr.incomingOffsets[node]).toBeLessThanOrEqual(csr.incomingOffsets[node + 1]);
    }

    expect(new Set(csr.outgoingSynapseIds).size).toBe(csr.synapseCount);
    expect(new Set(csr.incomingSynapseIds).size).toBe(csr.synapseCount);
  });

  it("is deterministic across repeated builds from the same topology", () => {
    const brain = generateBrainData({ seed: 5, surfaceNodesPerHemisphere: 40, innerNodesPerHemisphere: 6 });
    const first = buildSynapseCsr(brain.nodes.length, brain.synapses);
    const second = buildSynapseCsr(brain.nodes.length, brain.synapses);

    expect(Array.from(first.outgoingSynapseIds)).toEqual(Array.from(second.outgoingSynapseIds));
    expect(Array.from(first.incomingSynapseIds)).toEqual(Array.from(second.incomingSynapseIds));
  });
});
