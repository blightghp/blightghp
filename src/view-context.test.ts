import { describe, expect, it } from "vitest";
import { anatomicalEntryById } from "./anatomy";
import { VIEW_CONTEXTS, viewContextFor, viewContextSelectionFor } from "./view-context";

describe("UI-034 view context", () => {
  it("declares model, unit, hypothesis and limitation for every simulation view", () => {
    expect(Object.keys(VIEW_CONTEXTS).sort()).toEqual([
      "cell",
      "electricity",
      "laminar",
      "neuron",
      "overview",
      "synapse",
    ]);
    for (const [view, context] of Object.entries(VIEW_CONTEXTS)) {
      expect(viewContextFor(view as keyof typeof VIEW_CONTEXTS)).toBe(context);
      expect(context.label.trim()).not.toBe("");
      expect(context.model.trim()).not.toBe("");
      expect(context.unit.trim()).not.toBe("");
      expect(context.hypothesis.trim()).not.toBe("");
      expect(context.limitation.trim()).not.toBe("");
    }
  });

  it("derives selection hypothesis and limitation from the canonical anatomical catalog", () => {
    const pericyteId = "brain-pro:anatomy/pericyte";
    const pericyte = anatomicalEntryById(pericyteId);
    expect(pericyte).toBeDefined();
    expect(viewContextSelectionFor(pericyte!)).toMatchObject({
      label: "Pericito ilustrativo",
      id: pericyteId,
      hypothesis: expect.stringContaining("pericito"),
      limitation: expect.stringContaining("Não há fluxo"),
    });
  });
});
