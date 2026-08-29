import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  MAXIMUM_TONE_MAPPING_EXPOSURE,
  MINIMUM_TONE_MAPPING_EXPOSURE,
  ToneMappingController,
  parseToneMappingMode,
  sanitizeToneMappingExposure,
  toneMappingPreset,
} from "./tone-mapping";

function rendererFixture(): { toneMapping: THREE.ToneMapping; toneMappingExposure: number } {
  return {
    toneMapping: THREE.NoToneMapping,
    toneMappingExposure: 0,
  };
}

describe("R10-E reversible tone mapping", () => {
  it("selects the bounded AgX, Neutral and ACES presets", () => {
    const renderer = rendererFixture();
    const controller = new ToneMappingController(renderer);
    expect(renderer).toEqual({ toneMapping: THREE.AgXToneMapping, toneMappingExposure: 1 });

    expect(controller.setRequested("neutral", 0.72)).toBe("neutral");
    expect(renderer).toEqual({ toneMapping: THREE.NeutralToneMapping, toneMappingExposure: 0.72 });
    expect(toneMappingPreset("aces").rendererToneMapping).toBe(THREE.ACESFilmicToneMapping);
  });

  it("rejects malformed settings and clamps exposure to a finite envelope", () => {
    expect(parseToneMappingMode(" AgX ")).toBe("agx");
    expect(parseToneMappingMode("filmic")).toBeUndefined();
    expect(sanitizeToneMappingExposure(Number.NaN, 1)).toBe(1);
    expect(sanitizeToneMappingExposure(-2, 1)).toBe(MINIMUM_TONE_MAPPING_EXPOSURE);
    expect(sanitizeToneMappingExposure(9, 1)).toBe(MAXIMUM_TONE_MAPPING_EXPOSURE);

    const renderer = rendererFixture();
    const controller = new ToneMappingController(renderer);
    expect(controller.setRequested("unsupported", Number.POSITIVE_INFINITY)).toBe("aces");
    expect(renderer).toEqual({ toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1 });
    expect(controller.audit().fallbackReason).toBe("invalid-request");
  });

  it("forces ACES atomically for safety while retaining the requested candidate", () => {
    const renderer = rendererFixture();
    const controller = new ToneMappingController(renderer);
    controller.setRequested("agx", 0.92);

    expect(controller.setSafetyFallback("high-contrast")).toBe("aces");
    expect(controller.audit()).toMatchObject({
      requestedMode: "agx",
      effectiveMode: "aces",
      requestedExposure: 0.92,
      effectiveExposure: 1,
      fallbackReason: "high-contrast",
    });
    expect(renderer).toEqual({ toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1 });

    expect(controller.setSafetyFallback(undefined)).toBe("agx");
    expect(renderer).toEqual({ toneMapping: THREE.AgXToneMapping, toneMappingExposure: 0.92 });
  });
});
