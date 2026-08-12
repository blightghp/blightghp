import { BayesianBelief } from "./inference";
import type { BayesianUpdate } from "./inference";

export const EXPERIMENT_SCHEMA_VERSION = 1 as const;
export const BAYESIAN_OBSERVATION_EXPERIMENT = "bayesian-observation" as const;
export const MAX_EXPERIMENT_OBSERVATIONS = 4_096;

export interface ExperimentEncoder<RawInput, EncodedInput> {
  encode(input: RawInput): EncodedInput;
}

export interface ExperimentDecoder<EncodedOutput, DecodedOutput> {
  decode(output: EncodedOutput): DecodedOutput;
}

export interface BayesianObservationInput {
  sequence: number;
  observation: number;
}

export interface BayesianObservationRecord {
  schemaVersion: typeof EXPERIMENT_SCHEMA_VERSION;
  experiment: typeof BAYESIAN_OBSERVATION_EXPERIMENT;
  sequence: number;
  observation: number;
}

export interface BayesianExperimentRecord extends BayesianObservationRecord {
  update: BayesianUpdate;
}

export interface BayesianExperimentView extends BayesianUpdate {
  schemaVersion: typeof EXPERIMENT_SCHEMA_VERSION;
  experiment: typeof BAYESIAN_OBSERVATION_EXPERIMENT;
  sequence: number;
}

function probability(name: string, value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} deve estar no intervalo [0, 1]`);
  }
  return value;
}

function sequence(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value >= MAX_EXPERIMENT_OBSERVATIONS) {
    throw new RangeError("sequência do experimento excede o envelope declarado");
  }
  return value;
}

export class BayesianObservationEncoder
  implements ExperimentEncoder<BayesianObservationInput, BayesianObservationRecord>
{
  encode(input: BayesianObservationInput): BayesianObservationRecord {
    return Object.freeze({
      schemaVersion: EXPERIMENT_SCHEMA_VERSION,
      experiment: BAYESIAN_OBSERVATION_EXPERIMENT,
      sequence: sequence(input.sequence),
      observation: probability("observação", input.observation),
    });
  }
}

export class BayesianExperimentDecoder
  implements ExperimentDecoder<BayesianExperimentRecord, BayesianExperimentView>
{
  decode(record: BayesianExperimentRecord): BayesianExperimentView {
    if (
      record.schemaVersion !== EXPERIMENT_SCHEMA_VERSION ||
      record.experiment !== BAYESIAN_OBSERVATION_EXPERIMENT
    ) {
      throw new Error("schema ou identidade de experimento incompatível");
    }
    const update = record.update;
    const decoded = {
      schemaVersion: EXPERIMENT_SCHEMA_VERSION,
      experiment: BAYESIAN_OBSERVATION_EXPERIMENT,
      sequence: sequence(record.sequence),
      observation: probability("observação", update.observation),
      prior: probability("prior", update.prior),
      likelihood: probability("verossimilhança", update.likelihood),
      alternativeLikelihood: probability(
        "verossimilhança alternativa",
        update.alternativeLikelihood,
      ),
      evidence: probability("evidência", update.evidence),
      posterior: probability("posterior", update.posterior),
    } satisfies BayesianExperimentView;
    if (decoded.observation !== record.observation) {
      throw new Error("resultado não corresponde à observação codificada");
    }
    return Object.freeze(decoded);
  }
}

export class BayesianObservationExperiment {
  private readonly initialPrior: number;
  private readonly encoder = new BayesianObservationEncoder();
  private readonly decoder = new BayesianExperimentDecoder();
  private readonly belief: BayesianBelief;
  private nextSequence = 0;

  constructor(initialPrior = 0.35) {
    this.initialPrior = probability("prior inicial", initialPrior);
    this.belief = new BayesianBelief(this.initialPrior);
  }

  observe(observation: number): BayesianExperimentView {
    const input = this.encoder.encode({
      sequence: this.nextSequence,
      observation,
    });
    const output = this.decoder.decode({
      ...input,
      update: this.belief.observe(input.observation),
    });
    this.nextSequence += 1;
    return output;
  }

  replay(observations: readonly number[]): readonly BayesianExperimentView[] {
    if (observations.length > MAX_EXPERIMENT_OBSERVATIONS) {
      throw new RangeError("replay excede o envelope declarado");
    }
    this.reset();
    return Object.freeze(observations.map((observation) => this.observe(observation)));
  }

  reset(): void {
    this.belief.reset(this.initialPrior);
    this.nextSequence = 0;
  }
}
