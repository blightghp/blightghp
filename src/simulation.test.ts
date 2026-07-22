import { describe, expect, it } from "vitest";
import { generateBrainData } from "./brain";
import { NeuralSimulation } from "./simulation";

function advance(simulation: NeuralSimulation, steps: number): void {
  for (let step = 0; step < steps; step += 1) {
    simulation.step(1 / 60, { intensity: 0.85, confidence: 0.75 });
  }
}

describe("NeuralSimulation", () => {
  it("produces deterministic activity from the same graph and stimulus", () => {
    const brain = generateBrainData({ seed: 81, surfaceNodesPerHemisphere: 80, innerNodesPerHemisphere: 12 });
    const first = new NeuralSimulation(brain);
    const second = new NeuralSimulation(brain);
    first.setPlasticity(0);
    second.setPlasticity(0);

    advance(first, 240);
    advance(second, 240);

    expect(first.snapshot()).toEqual(second.snapshot());
    expect(first.firingRate).toBeGreaterThan(0);
    expect(Math.max(...first.activations)).toBeGreaterThan(0);
  });

  it("keeps learned weights bounded and restores the initial state", () => {
    const brain = generateBrainData({ seed: 17, surfaceNodesPerHemisphere: 70, innerNodesPerHemisphere: 10 });
    const simulation = new NeuralSimulation(brain);
    const initialWeights = simulation.snapshot().weights;
    simulation.setPlasticity(0.02);

    advance(simulation, 480);
    const learnedWeights = simulation.snapshot().weights;
    const plasticWeights = learnedWeights.filter((weight) => weight > 0);

    expect(learnedWeights).not.toEqual(initialWeights);
    expect(Math.min(...plasticWeights)).toBeGreaterThanOrEqual(0.12);
    expect(Math.max(...plasticWeights)).toBeLessThanOrEqual(0.920001);

    simulation.reset();
    expect(simulation.snapshot().weights).toEqual(initialWeights);
    expect(simulation.time).toBe(0);
  });
});
