import { describe, expect, it } from "vitest";
import { brainSettingsSchema } from "./schema";

describe("brainSettingsSchema", () => {
  it("applies safe defaults", () => {
    expect(brainSettingsSchema.parse({})).toMatchObject({
      rotationSpeed: 0.55,
      pulseCount: 140,
      showLeftHemi: true,
    });
  });

  it("rejects unsafe renderer values", () => {
    expect(() => brainSettingsSchema.parse({ pulseCount: 9999 })).toThrow();
  });
});
