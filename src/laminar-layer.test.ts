import { describe, expect, it } from "vitest";
import {
  CORTICAL_LAYER_LABELS,
  LAMINAR_PROJECTIONS,
  laminarLodCost,
  parseLaminarLod,
  parseSimulationView,
  projectionBudget,
  axonalLifecycle,
} from "./render/laminar-layer";

describe("laminar presentation contract", () => {
  it("keeps six stable cortical labels", () => {
    expect(CORTICAL_LAYER_LABELS).toEqual(["L1", "L2", "L3", "L4", "L5", "L6"]);
  });

  it("reports the static presentation cost of each LOD", () => {
    expect(laminarLodCost("low")).toEqual({
      stateValuesRead: 17,
      fixedDrawCalls: 14,
      projectionDrawCalls: 6,
      totalDrawCalls: 26,
    });
    expect(laminarLodCost("medium").totalDrawCalls).toBe(36);
    expect(laminarLodCost("high").totalDrawCalls).toBe(44);
  });

  it("rejects view and LOD values outside their closed contracts", () => {
    expect(parseLaminarLod("high")).toBe("high");
    expect(parseLaminarLod("maximum")).toBeUndefined();
    expect(parseSimulationView("laminar")).toBe("laminar");
    expect(parseSimulationView("cell")).toBe("cell");
    expect(parseSimulationView("neuron")).toBe("neuron");
    expect(parseSimulationView("electricity")).toBe("electricity");
    expect(parseSimulationView("synapse")).toBe("synapse");
    expect(parseSimulationView("layers")).toBeUndefined();
  });

  it("uses bounded, monotonic LOD projection budgets", () => {
    expect(projectionBudget("low")).toBe(6);
    expect(projectionBudget("medium")).toBe(11);
    expect(projectionBudget("high")).toBe(LAMINAR_PROJECTIONS.length);
    expect(projectionBudget("low")).toBeLessThan(projectionBudget("medium"));
    expect(projectionBudget("medium")).toBeLessThan(projectionBudget("high"));
  });

  it("gives every cortical layer a recurrent axonal curve and an independent lifecycle", () => {
    for (let layer = 0; layer < 6; layer += 1) {
      expect(LAMINAR_PROJECTIONS).toContainEqual({
        source: layer,
        target: layer,
        kind: "recurrent",
      });
    }
    const phases = LAMINAR_PROJECTIONS.map((_, index) =>
      axonalLifecycle(index, 0, 0.8).progress,
    );
    expect(new Set(phases).size).toBe(LAMINAR_PROJECTIONS.length);
    expect(axonalLifecycle(2, 0.5, 2).opacity).toBeLessThanOrEqual(1);
  });

  it("declares every visual path inside the layer, relay and TRN domain", () => {
    for (const projection of LAMINAR_PROJECTIONS) {
      expect(projection.source).toBeGreaterThanOrEqual(0);
      expect(projection.source).toBeLessThanOrEqual(7);
      expect(projection.target).toBeGreaterThanOrEqual(0);
      expect(projection.target).toBeLessThanOrEqual(7);
    }
    expect(
      LAMINAR_PROJECTIONS.some(
        (projection) =>
          projection.kind === "thalamocortical" &&
          projection.source === 6 &&
          projection.target === 3,
      ),
    ).toBe(true);
  });
});
