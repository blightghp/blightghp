import { describe, expect, it } from "vitest";
import { generateBrainData } from "./brain";
import { PopulationField } from "./field";

describe("PopulationField", () => {
  it("initializes zero fields and updates upon neuron spikes", () => {
    const brain = generateBrainData({ seed: 42, surfaceNodesPerHemisphere: 50, innerNodesPerHemisphere: 10 });
    const field = new PopulationField(brain);

    expect(field.eField.reduce((a, b) => a + b, 0)).toBe(0);
    expect(field.iField.reduce((a, b) => a + b, 0)).toBe(0);

    const spiked = new Uint8Array(brain.nodes.length);
    spiked[0] = 1;
    field.step(spiked, brain.neuronKindByNode, 0.016);

    expect(field.eField[0]).toBeGreaterThan(0);
    expect(field.waveActivity[0]).toBeGreaterThan(0);
  });

  it("diffuses excitatory and inhibitory activity across spatial neighbors", () => {
    const brain = generateBrainData({ seed: 12, surfaceNodesPerHemisphere: 60, innerNodesPerHemisphere: 10 });
    const field = new PopulationField(brain);

    const spiked = new Uint8Array(brain.nodes.length);
    spiked[5] = 1;
    field.step(spiked, brain.neuronKindByNode, 0.016);

    const initialSum = field.eField.reduce((a, b) => a + b, 0);

    for (let step = 0; step < 10; step += 1) {
      field.step(new Uint8Array(brain.nodes.length), brain.neuronKindByNode, 0.016);
    }

    const neighborSum = field.eField.reduce((a, b) => a + b, 0);
    expect(neighborSum).toBeLessThan(initialSum); // test decay & diffusion
  });

  it("provides deterministic coupling currents and resets state cleanly", () => {
    const brain = generateBrainData({ seed: 99, surfaceNodesPerHemisphere: 40, innerNodesPerHemisphere: 8 });
    const field = new PopulationField(brain);

    const spiked = new Uint8Array(brain.nodes.length);
    spiked[2] = 1;
    field.step(spiked, brain.neuronKindByNode, 0.016);

    const currentBefore = field.getCouplingCurrent(2);
    expect(currentBefore).not.toBe(0);

    field.reset();
    expect(field.eField.reduce((a, b) => a + b, 0)).toBe(0);
    expect(field.iField.reduce((a, b) => a + b, 0)).toBe(0);
    expect(field.getCouplingCurrent(2)).toBe(0);
  });
});
