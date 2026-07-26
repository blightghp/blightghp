import { describe, expect, it } from "vitest";
import { generateBrainData } from "./brain";
import type { NeuronKind } from "./brain";
import {
  DEFAULT_FIELD_CONFIG,
  PopulationField,
  projectSpikesToField,
} from "./field";

const DT = 1 / 60;

function smallBrain(seed = 42) {
  return generateBrainData({
    seed,
    surfaceNodesPerHemisphere: 36,
    innerNodesPerHemisphere: 8,
  });
}

function silentStep(field: PopulationField, kinds: readonly NeuronKind[], count = 1): void {
  const spiked = new Uint8Array(kinds.length);
  for (let step = 0; step < count; step += 1) field.step(spiked, kinds, DT);
}

describe("PopulationField", () => {
  it("projects every cortical spike once and excludes non-cortical structures", () => {
    const brain = smallBrain();
    const spiked = new Uint8Array(brain.nodes.length);
    const kinds = brain.neuronKindByNode.slice();
    let excitatoryCount = 0;
    let inhibitoryCount = 0;

    for (let node = 0; node < brain.nodes.length; node += 1) {
      if (brain.corticalField.vertexByNode[node] < 0 || node % 7 !== 0) continue;
      spiked[node] = 1;
      kinds[node] = node % 2 === 0 ? "excitatory" : "inhibitory";
      if (kinds[node] === "excitatory") excitatoryCount += 1;
      else inhibitoryCount += 1;
    }
    spiked[brain.groups.cerebellum[0]] = 1;

    const drive = projectSpikesToField(brain.corticalField, spiked, kinds);
    const excitatoryTotal = drive.excitatory.reduce((sum, value) => sum + value, 0);
    const inhibitoryTotal = drive.inhibitory.reduce((sum, value) => sum + value, 0);

    expect(excitatoryTotal).toBeCloseTo(
      excitatoryCount * DEFAULT_FIELD_CONFIG.excitatorySpikeImpulse,
      5,
    );
    expect(inhibitoryTotal).toBeCloseTo(
      inhibitoryCount * DEFAULT_FIELD_CONFIG.inhibitorySpikeImpulse,
      5,
    );
  });

  it("uses the configured conduction delay before activity reaches a neighbor", () => {
    const brain = smallBrain(12);
    const field = new PopulationField(brain, { dtSeconds: DT });
    const sourceVertex = 0;
    const targetVertex = brain.corticalField.neighbors[
      brain.corticalField.rowOffsets[sourceVertex]
    ];
    const sourceNode = brain.corticalField.nodeIndices[sourceVertex];
    const kinds = brain.neuronKindByNode.slice();
    kinds[sourceNode] = "excitatory";
    const delay = field.getConductionDelaySteps(sourceVertex, targetVertex);
    expect(delay).toBeDefined();

    const spiked = new Uint8Array(brain.nodes.length);
    spiked[sourceNode] = 1;
    field.step(spiked, kinds, DT);
    expect(field.eField[targetVertex]).toBe(0);

    silentStep(field, kinds, delay! - 1);
    expect(field.eField[targetVertex]).toBe(0);
    silentStep(field, kinds);
    expect(field.eField[targetVertex]).toBeGreaterThan(0);
  });

  it("maps inner cortical nodes to the field and leaves cerebellum and stem uncoupled", () => {
    const brain = smallBrain(99);
    const field = new PopulationField(brain);
    const innerCorticalNode = brain.groups.leftHemi.find(
      (node) => !brain.corticalField.nodeIndices.includes(node),
    )!;
    const corticalVertex = field.getFieldVertexForNode(innerCorticalNode);
    expect(corticalVertex).toBeGreaterThanOrEqual(0);
    field.eField[corticalVertex] = 0.75;

    expect(field.getCouplingCurrent(innerCorticalNode)).toBeCloseTo(0.06, 6);
    expect(field.getCouplingCurrent(brain.groups.cerebellum[0])).toBe(0);
    expect(field.getCouplingCurrent(brain.groups.stem[0])).toBe(0);
  });

  it("keeps field state finite and bounded under repeated bilateral drive", () => {
    const brain = smallBrain(7);
    const field = new PopulationField(brain);
    const spiked = new Uint8Array(brain.nodes.length);
    for (let node = 0; node < spiked.length; node += 1) {
      spiked[node] = brain.corticalField.vertexByNode[node] >= 0 ? 1 : 0;
    }

    for (let step = 0; step < 240; step += 1) {
      field.step(step % 5 === 0 ? spiked : new Uint8Array(spiked.length), brain.neuronKindByNode, DT);
    }

    for (const state of [field.eField, field.iField, field.waveActivity]) {
      expect(Array.from(state).every(Number.isFinite)).toBe(true);
      expect(Math.min(...state)).toBeGreaterThanOrEqual(0);
    }
    expect(Math.max(...field.eField)).toBeLessThanOrEqual(DEFAULT_FIELD_CONFIG.maxActivity);
    expect(Math.max(...field.iField)).toBeLessThanOrEqual(DEFAULT_FIELD_CONFIG.maxActivity);
    expect(Math.max(...field.waveActivity)).toBeLessThanOrEqual(1);
  });

  it("converges toward a finer-step reference for a delayed propagation scenario", () => {
    const brain = smallBrain(18);
    const run = (dtSeconds: number): Float32Array => {
      const field = new PopulationField(brain, {
        dtSeconds,
        tauESeconds: 0.08,
        propagationEPerSecond: 1.4,
      });
      field.eField[0] = 1;
      const spiked = new Uint8Array(brain.nodes.length);
      const steps = Math.round(0.2 / dtSeconds);
      for (let step = 0; step < steps; step += 1) {
        field.step(spiked, brain.neuronKindByNode, dtSeconds);
      }
      return field.eField.slice();
    };
    const error = (candidate: Float32Array, reference: Float32Array): number =>
      candidate.reduce(
        (sum, value, index) => sum + Math.abs(value - reference[index]),
        0,
      );

    const coarse = run(1 / 60);
    const medium = run(1 / 120);
    const reference = run(1 / 480);
    expect(error(medium, reference)).toBeLessThan(error(coarse, reference));
  });

  it("returns immutable snapshots and resets delayed history", () => {
    const brain = smallBrain(3);
    const field = new PopulationField(brain);
    const sourceNode = brain.corticalField.nodeIndices[0];
    const spiked = new Uint8Array(brain.nodes.length);
    const kinds = brain.neuronKindByNode.slice();
    kinds[sourceNode] = "excitatory";
    spiked[sourceNode] = 1;
    field.step(spiked, kinds, DT);

    const snapshot = field.snapshot();
    const engineValue = field.eField[0];
    snapshot.eField[0] = 99;
    snapshot.nodeIndices[0] = 99;
    expect(field.eField[0]).toBe(engineValue);
    expect(brain.corticalField.nodeIndices[0]).not.toBe(99);

    field.reset();
    silentStep(field, kinds, 20);
    expect(field.eField.reduce((sum, value) => sum + value, 0)).toBe(0);
    expect(field.iField.reduce((sum, value) => sum + value, 0)).toBe(0);
  });

  it("rejects mismatched buffers and variable integration steps", () => {
    const brain = smallBrain(4);
    const field = new PopulationField(brain);
    expect(() =>
      field.step(new Uint8Array(2), brain.neuronKindByNode, DT),
    ).toThrow(/mesmo número de nós/);
    expect(() =>
      field.step(
        new Uint8Array(brain.nodes.length),
        brain.neuronKindByNode,
        DT / 2,
      ),
    ).toThrow(/passo fixo/);
  });
});
