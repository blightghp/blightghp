import { describe, expect, it } from "vitest";
import { BayesianBelief } from "./inference";

describe("BayesianBelief", () => {
  it("moves the posterior in the direction supported by each observation", () => {
    const belief = new BayesianBelief(0.5);
    const positive = belief.observe(0.9);
    const negative = belief.observe(0.1);

    expect(positive.posterior).toBeGreaterThan(positive.prior);
    expect(negative.posterior).toBeLessThan(negative.prior);
  });

  it("normalizes the competing hypotheses", () => {
    const update = new BayesianBelief(0.35).observe(0.8);
    const alternativePosterior =
      (update.alternativeLikelihood * (1 - update.prior)) / update.evidence;

    expect(update.posterior + alternativePosterior).toBeCloseTo(1, 10);
  });
});
