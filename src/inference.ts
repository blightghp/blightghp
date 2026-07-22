export interface BayesianUpdate {
  observation: number;
  prior: number;
  likelihood: number;
  alternativeLikelihood: number;
  evidence: number;
  posterior: number;
}

function clampProbability(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export class BayesianBelief {
  private belief: number;

  constructor(initialPrior = 0.35) {
    this.belief = clampProbability(initialPrior);
  }

  observe(observation: number): BayesianUpdate {
    const normalized = clampProbability(observation);
    const prior = this.belief;
    const likelihood = 0.5 + normalized * 0.48;
    const alternativeLikelihood = 0.5 + (1 - normalized) * 0.48;
    const evidence = likelihood * prior + alternativeLikelihood * (1 - prior);
    const posterior = evidence === 0 ? prior : (likelihood * prior) / evidence;

    this.belief = posterior;
    return {
      observation: normalized,
      prior,
      likelihood,
      alternativeLikelihood,
      evidence,
      posterior,
    };
  }

  reset(prior = 0.35): void {
    this.belief = clampProbability(prior);
  }

  get value(): number {
    return this.belief;
  }
}
