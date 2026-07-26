import { describe, expect, it } from "vitest";
import {
  CORTICAL_LAYER_LABELS,
  LAMINAR_PROJECTIONS,
  laminarLodCost,
  parseLaminarLod,
  parseSimulationView,
  projectionBudget,
} from "./laminar-layer";

describe("laminar presentation contract", () => {
  it("keeps six stable cortical labels", () => {
    expect(CORTICAL_LAYER_LABELS).toEqual(["L1", "L2", "L3", "L4", "L5", "L6"]);
  });

  it("reports the static presentation cost of each LOD", () => {
    expect(laminarLodCost("low")).toEqual({
      stateValuesRead: 17,
      fixedDrawCalls: 14,
      projectionDrawCalls: 3,
      totalDrawCalls: 17,
    });
    expect(laminarLodCost("medium").totalDrawCalls).toBe(21);
    expect(laminarLodCost("high").totalDrawCalls).toBe(23);
  });

  it("rejects view and LOD values outside their closed contracts", () => {
    expect(parseLaminarLod("high")).toBe("high");
    expect(parseLaminarLod("maximum")).toBeUndefined();
    expect(parseSimulationView("laminar")).toBe("laminar");
    expect(parseSimulationView("layers")).toBeUndefined();
  });

  it("uses bounded, monotonic LOD projection budgets", () => {
    expect(projectionBudget("low")).toBe(3);
    expect(projectionBudget("medium")).toBe(7);
    expect(projectionBudget("high")).toBe(LAMINAR_PROJECTIONS.length);
    expect(projectionBudget("low")).toBeLessThan(projectionBudget("medium"));
    expect(projectionBudget("medium")).toBeLessThan(projectionBudget("high"));
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
