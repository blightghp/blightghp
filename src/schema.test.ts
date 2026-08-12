import { describe, expect, it } from "vitest";
import {
  brainSettingsSchema,
  presentationPreferencesSchema,
  runControlsSchema,
  scientificPresetSelectionSchema,
} from "./schema";

describe("brainSettingsSchema", () => {
  it("applies safe defaults", () => {
    expect(brainSettingsSchema.parse({})).toMatchObject({
      rotationSpeed: 0.55,
      pulseCount: 140,
      stimulusIntensity: 0.5,
      learningRate: 0.004,
      snapshotCadence: 1,
      showLeftHemi: true,
    });
  });

  it("rejects unsafe renderer values", () => {
    expect(() => brainSettingsSchema.parse({ pulseCount: 9999 })).toThrow();
    expect(() => brainSettingsSchema.parse({ learningRate: 0.5 })).toThrow();
    expect(() => brainSettingsSchema.parse({ snapshotCadence: 3 })).toThrow();
  });

  it("keeps presentation, run, and scientific controls in explicit schemas", () => {
    expect(Object.keys(presentationPreferencesSchema.shape)).toContain("rotationSpeed");
    expect(Object.keys(presentationPreferencesSchema.shape)).not.toContain("learningRate");
    expect(Object.keys(runControlsSchema.shape)).toEqual(["pulseSpeed", "snapshotCadence"]);
    expect(Object.keys(scientificPresetSelectionSchema.shape)).toEqual([
      "stimulusIntensity",
      "learningRate",
    ]);
  });
});
