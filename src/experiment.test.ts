import { describe, expect, it } from "vitest";
import fixture from "../fixtures/experiments/bayesian-observation-v1.json";
import { directNeuralStimulus, NULL_TASK_CONTEXT } from "./direct-stimulus";
import {
  BayesianExperimentDecoder,
  BayesianObservationEncoder,
  BayesianObservationExperiment,
  EXPERIMENT_SCHEMA_VERSION,
  MAX_EXPERIMENT_OBSERVATIONS,
} from "./experiment";

describe("fronteira de experimento Bayesiano", () => {
  it("reproduz o artefato versionado na ordem canônica", () => {
    const experiment = new BayesianObservationExperiment(fixture.initialPrior);
    const replay = experiment.replay(fixture.observations);

    expect(replay.map(({ sequence }) => sequence)).toEqual([0, 1, 2, 3]);
    expect(replay.map(({ posterior }) => posterior)).toEqual(
      fixture.expectedPosteriors,
    );
    expect(replay.every(({ schemaVersion }) => schemaVersion === fixture.schemaVersion)).toBe(
      true,
    );
  });

  it("mantém o prior no controle nulo", () => {
    const experiment = new BayesianObservationExperiment(fixture.initialPrior);
    const replay = experiment.replay(fixture.nullControl.observations);

    for (const update of replay) {
      expect(update.posterior).toBeCloseTo(fixture.nullControl.expectedPosterior, 14);
    }
  });

  it("não permite que a posterior altere o estímulo enviado ao motor", () => {
    const experiment = new BayesianObservationExperiment();
    const before = directNeuralStimulus(0.7);
    experiment.observe(1);
    experiment.observe(0);
    const after = directNeuralStimulus(0.7);

    expect(after).toEqual(before);
    expect(after.confidence).toBe(NULL_TASK_CONTEXT);
  });

  it("rejeita payloads, schemas e replays fora do envelope", () => {
    const encoder = new BayesianObservationEncoder();
    const decoder = new BayesianExperimentDecoder();

    expect(() => encoder.encode({ sequence: 0, observation: Number.NaN })).toThrow(
      /intervalo/,
    );
    expect(() =>
      encoder.encode({ sequence: MAX_EXPERIMENT_OBSERVATIONS, observation: 0.5 }),
    ).toThrow(/envelope/);
    expect(() =>
      decoder.decode({
        schemaVersion: 2 as typeof EXPERIMENT_SCHEMA_VERSION,
        experiment: "bayesian-observation",
        sequence: 0,
        observation: 0.5,
        update: {
          observation: 0.5,
          prior: 0.35,
          likelihood: 0.74,
          alternativeLikelihood: 0.74,
          evidence: 0.74,
          posterior: 0.35,
        },
      }),
    ).toThrow(/incompatível/);
  });
});
