import { describe, expect, it } from "vitest";
import { generateBrainData } from "./brain";
import { NeuralSimulation } from "./simulation";

function advance(simulation: NeuralSimulation, steps: number): void {
  for (let step = 0; step < steps; step += 1) {
    simulation.step({ intensity: 0.85, confidence: 0.75 });
  }
}

describe("NeuralSimulation", () => {
  it("preserves the deterministic baseline while time advances by ticks", () => {
    const brain = generateBrainData({ seed: 81, surfaceNodesPerHemisphere: 80, innerNodesPerHemisphere: 12 });
    const simulation = new NeuralSimulation(brain);
    simulation.setPlasticity(0);

    advance(simulation, 240);
    const snapshot = simulation.snapshot();

    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.tick).toBe(240);
    expect(snapshot.timeSeconds).toBe(4);
    expect(snapshot.firingRate).toBeCloseTo(0.4723127035830619, 12);
    expect(snapshot.spikes).toBe(4);
    expect(snapshot.meanWeight).toBeCloseTo(0.48537014700331776, 12);
    expect(snapshot.potentials).toBeInstanceOf(Float32Array);
    expect(snapshot.activations).toBeInstanceOf(Float32Array);
    expect(snapshot.weights).toBeInstanceOf(Float32Array);
    expect(snapshot.potentials.reduce((sum, value) => sum + value, 0)).toBeCloseTo(
      12.53614605218172,
      10,
    );
    expect(snapshot.activations.reduce((sum, value) => sum + value, 0)).toBeCloseTo(
      25.917198099195957,
      10,
    );
    expect(Array.from(snapshot.weights.slice(0, 4))).toEqual([
      0.4454757273197174,
      0.6178703308105469,
      0.3769550025463104,
      0.39162495732307434,
    ]);
    const enginePotential = simulation.potentials[0];
    snapshot.potentials[0] = 99;
    expect(simulation.potentials[0]).toBe(enginePotential);
  });

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
    expect(simulation.tick).toBe(0);
    expect(simulation.time).toBe(0);
  });

  it("compacts in-flight signals into parallel arrays of one length", () => {
    const brain = generateBrainData({ seed: 4, surfaceNodesPerHemisphere: 70, innerNodesPerHemisphere: 10 });
    const simulation = new NeuralSimulation(brain);
    simulation.setPlasticity(0);

    advance(simulation, 30);
    const { signals } = simulation.snapshot();

    expect(signals.synapseIds.length).toBeGreaterThan(0);
    expect(signals.progress).toHaveLength(signals.synapseIds.length);
    expect(signals.strength).toHaveLength(signals.synapseIds.length);
    expect(signals.inhibitory).toHaveLength(signals.synapseIds.length);
    for (let index = 0; index < signals.synapseIds.length; index += 1) {
      expect(signals.synapseIds[index]).toBeLessThan(brain.synapses.length);
      expect(signals.progress[index]).toBeGreaterThanOrEqual(0);
      expect(signals.progress[index]).toBeLessThan(1);
      expect(signals.strength[index]).toBeGreaterThanOrEqual(0);
      expect([0, 1]).toContain(signals.inhibitory[index]);
    }
  });

  it("reports an empty signal batch before anything spikes", () => {
    const brain = generateBrainData({ seed: 4, surfaceNodesPerHemisphere: 40, innerNodesPerHemisphere: 6 });
    const simulation = new NeuralSimulation(brain);
    const { signals } = simulation.snapshot();

    expect(signals.synapseIds.length).toBe(0);
    expect(signals.progress.length).toBe(0);
    expect(signals.strength.length).toBe(0);
    expect(signals.inhibitory.length).toBe(0);
  });
});
