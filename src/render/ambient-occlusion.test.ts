import { describe, expect, it } from "vitest";
import {
  ambientOcclusionDecision,
  estimateHalfResolutionAmbientOcclusionTextureBytes,
  HALF_RESOLUTION_AMBIENT_OCCLUSION_SCALE,
  sameAmbientOcclusionDecision,
} from "./ambient-occlusion";

const safeCinemaOverview = {
  renderProfile: "cinema",
  activeView: "overview",
  materialProfile: "realistic-illustrative",
  clippingEnabled: false,
  highContrast: false,
  webglSafe: true,
} as const;

describe("R10-E half-resolution GTAO policy", () => {
  it("enables only the safe realistic overview in cinema", () => {
    expect(ambientOcclusionDecision(safeCinemaOverview)).toEqual({
      enabled: true,
      scale: HALF_RESOLUTION_AMBIENT_OCCLUSION_SCALE,
    });
  });

  it.each([
    [{ ...safeCinemaOverview, renderProfile: "baseline" }, "baseline-profile"],
    [{ ...safeCinemaOverview, renderProfile: "enhanced" }, "enhanced-budget"],
    [{ ...safeCinemaOverview, activeView: "cell" }, "non-overview-view"],
    [{ ...safeCinemaOverview, materialProfile: "schematic" }, "schematic-material"],
    [{ ...safeCinemaOverview, clippingEnabled: true }, "clipping-active"],
    [{ ...safeCinemaOverview, highContrast: true }, "high-contrast"],
    [{ ...safeCinemaOverview, webglSafe: false }, "webgl-safety-fallback"],
  ] as const)("fails closed for %s", (input, reason) => {
    expect(ambientOcclusionDecision(input)).toEqual({
      enabled: false,
      scale: HALF_RESOLUTION_AMBIENT_OCCLUSION_SCALE,
      reason,
    });
  });

  it("accounts for exactly half-resolution targets and stable decisions", () => {
    expect(estimateHalfResolutionAmbientOcclusionTextureBytes(100, 50, 1)).toBe(67_768);
    expect(estimateHalfResolutionAmbientOcclusionTextureBytes(100, 50, 2)).toBe(172_768);
    const enabled = ambientOcclusionDecision(safeCinemaOverview);
    const disabled = ambientOcclusionDecision({ ...safeCinemaOverview, clippingEnabled: true });
    expect(sameAmbientOcclusionDecision(enabled, { ...enabled })).toBe(true);
    expect(sameAmbientOcclusionDecision(disabled, { ...disabled })).toBe(true);
    expect(sameAmbientOcclusionDecision(enabled, disabled)).toBe(false);
  });
});
