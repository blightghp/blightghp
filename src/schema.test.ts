import { describe, expect, it } from "vitest";
import { brainSettingsSchema } from "./schema";

describe("brainSettingsSchema", () => {
  it("applies safe defaults", () => {
    expect(brainSettingsSchema.parse({})).toMatchObject({
      rotationSpeed: 0.55,
      pulseCount: 140,
      stimulusIntensity: 0.5,
      learningRate: 0.004,
      showLeftHemi: true,
    });
  });

  it("rejects unsafe renderer values", () => {
    expect(() => brainSettingsSchema.parse({ pulseCount: 9999 })).toThrow();
    expect(() => brainSettingsSchema.parse({ learningRate: 0.5 })).toThrow();
  });
});
