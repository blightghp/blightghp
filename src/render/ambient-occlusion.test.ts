import { describe, expect, it } from "vitest";
import {
  ambientOcclusionDecision,
  estimateHalfResolutionAmbientOcclusionTextureBytes,
  HALF_RESOLUTION_AMBIENT_OCCLUSION_SCALE,
  sameAmbientOcclusionDecision,
} from "./ambient-occlusion";

const safeOverview = {
  renderProfile: "enhanced",
  activeView: "overview",
  materialProfile: "realistic-illustrative",
  clippingEnabled: false,
  highContrast: false,
  webglSafe: true,
} as const;

describe("R10-E half-resolution GTAO policy", () => {
  it("enables only the safe realistic overview outside baseline", () => {
    expect(ambientOcclusionDecision(safeOverview)).toEqual({
      enabled: true,
      scale: HALF_RESOLUTION_AMBIENT_OCCLUSION_SCALE,
    });
    expect(ambientOcclusionDecision({ ...safeOverview, renderProfile: "cinema" })).toMatchObject({
      enabled: true,
      scale: 0.5,
    });
  });

  it.each([
    [{ ...safeOverview, renderProfile: "baseline" }, "baseline-profile"],
    [{ ...safeOverview, activeView: "cell" }, "non-overview-view"],
    [{ ...safeOverview, materialProfile: "schematic" }, "schematic-material"],
    [{ ...safeOverview, clippingEnabled: true }, "clipping-active"],
    [{ ...safeOverview, highContrast: true }, "high-contrast"],
    [{ ...safeOverview, webglSafe: false }, "webgl-safety-fallback"],
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
    const enabled = ambientOcclusionDecision(safeOverview);
    const disabled = ambientOcclusionDecision({ ...safeOverview, clippingEnabled: true });
    expect(sameAmbientOcclusionDecision(enabled, { ...enabled })).toBe(true);
    expect(sameAmbientOcclusionDecision(disabled, { ...disabled })).toBe(true);
    expect(sameAmbientOcclusionDecision(enabled, disabled)).toBe(false);
  });
});
