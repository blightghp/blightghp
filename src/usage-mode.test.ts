import { describe, expect, it } from "vitest";
import {
  DEFAULT_USAGE_MODE,
  isUsageModeControlVisible,
  parseUsageMode,
  USAGE_MODE_DEFINITIONS,
  USAGE_MODES,
  visibleUsageModeControlGroups,
} from "./usage-mode";

describe("usage mode policy", () => {
  it("defaults to the short guided journey", () => {
    expect(DEFAULT_USAGE_MODE).toBe("guided");
    expect(USAGE_MODE_DEFINITIONS[DEFAULT_USAGE_MODE].label).toBe("Guiado");
  });

  it("parses only declared modes", () => {
    expect(parseUsageMode("guided")).toBe("guided");
    expect(parseUsageMode("explorer")).toBe("explorer");
    expect(parseUsageMode("laboratory")).toBe("laboratory");
    expect(parseUsageMode("lab")).toBeUndefined();
    expect(parseUsageMode(" Guided")).toBeUndefined();
    expect(parseUsageMode(undefined)).toBeUndefined();
  });

  it("makes controls cumulative without changing the engine policy", () => {
    expect(visibleUsageModeControlGroups("guided")).toEqual(["guided"]);
    expect(visibleUsageModeControlGroups("explorer")).toEqual([
      "guided",
      "explorer",
    ]);
    expect(visibleUsageModeControlGroups("laboratory")).toEqual(USAGE_MODES);

    expect(isUsageModeControlVisible("guided", "explorer")).toBe(false);
    expect(isUsageModeControlVisible("explorer", "laboratory")).toBe(false);
    expect(isUsageModeControlVisible("laboratory", "guided")).toBe(true);
  });
});
