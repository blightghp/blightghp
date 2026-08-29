import * as THREE from "three";

export const TONE_MAPPING_MODES = ["aces", "agx", "neutral"] as const;

export type ToneMappingMode = (typeof TONE_MAPPING_MODES)[number];

export type ToneMappingSafetyFallback =
  | "high-contrast"
  | "webgl-context-lost"
  | "webgl-shader-compilation-failure";

export interface ToneMappingRenderer {
  toneMapping: THREE.ToneMapping;
  toneMappingExposure: number;
}

export interface ToneMappingPreset {
  readonly rendererToneMapping: THREE.ToneMapping;
  readonly exposure: number;
}

export interface ToneMappingAudit {
  readonly requestedMode: ToneMappingMode;
  readonly effectiveMode: ToneMappingMode;
  readonly requestedExposure: number;
  readonly effectiveExposure: number;
  readonly fallbackReason?: ToneMappingSafetyFallback | "invalid-request";
}

export const MINIMUM_TONE_MAPPING_EXPOSURE = 0.5;
export const MAXIMUM_TONE_MAPPING_EXPOSURE = 1.5;

const PRESETS: Readonly<Record<ToneMappingMode, ToneMappingPreset>> = {
  aces: {
    rendererToneMapping: THREE.ACESFilmicToneMapping,
    exposure: 1,
  },
  agx: {
    rendererToneMapping: THREE.AgXToneMapping,
    exposure: 1,
  },
  neutral: {
    rendererToneMapping: THREE.NeutralToneMapping,
    exposure: 1,
  },
};

export function parseToneMappingMode(value: unknown): ToneMappingMode | undefined {
  if (typeof value !== "string") return undefined;
  const candidate = value.trim().toLowerCase();
  return TONE_MAPPING_MODES.find((mode) => mode === candidate);
}

export function toneMappingPreset(mode: ToneMappingMode): ToneMappingPreset {
  return PRESETS[mode];
}

export function sanitizeToneMappingExposure(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return THREE.MathUtils.clamp(value, MINIMUM_TONE_MAPPING_EXPOSURE, MAXIMUM_TONE_MAPPING_EXPOSURE);
}

/**
 * Keeps R10-E tone mapping explicitly reversible. The requested candidate is
 * retained while accessibility or WebGL safety conditions temporarily force
 * the known ACES baseline.
 */
export class ToneMappingController {
  private requestedModeValue: ToneMappingMode;
  private effectiveModeValue: ToneMappingMode;
  private requestedExposureValue: number;
  private effectiveExposureValue: number;
  private safetyFallback: ToneMappingSafetyFallback | undefined;
  private invalidRequest = false;

  constructor(
    private readonly renderer: ToneMappingRenderer,
    initialMode: ToneMappingMode = "agx",
  ) {
    this.requestedModeValue = initialMode;
    this.effectiveModeValue = initialMode;
    this.requestedExposureValue = toneMappingPreset(initialMode).exposure;
    this.effectiveExposureValue = this.requestedExposureValue;
    this.apply();
  }

  setRequested(mode: unknown, exposure?: unknown): ToneMappingMode {
    const parsed = parseToneMappingMode(mode);
    this.invalidRequest = !parsed;
    this.requestedModeValue = parsed ?? "aces";
    const preset = toneMappingPreset(this.requestedModeValue);
    this.requestedExposureValue = sanitizeToneMappingExposure(
      exposure ?? preset.exposure,
      preset.exposure,
    );
    this.apply();
    return this.effectiveModeValue;
  }

  setSafetyFallback(reason: ToneMappingSafetyFallback | undefined): ToneMappingMode {
    this.safetyFallback = reason;
    this.apply();
    return this.effectiveModeValue;
  }

  audit(): ToneMappingAudit {
    return {
      requestedMode: this.requestedModeValue,
      effectiveMode: this.effectiveModeValue,
      requestedExposure: this.requestedExposureValue,
      effectiveExposure: this.effectiveExposureValue,
      ...(
        this.safetyFallback
          ? { fallbackReason: this.safetyFallback }
          : this.invalidRequest
            ? { fallbackReason: "invalid-request" as const }
            : {}
      ),
    };
  }

  private apply(): void {
    const effectiveMode = this.safetyFallback ? "aces" : this.requestedModeValue;
    const effectiveExposure = this.safetyFallback
      ? toneMappingPreset("aces").exposure
      : this.requestedExposureValue;
    const preset = toneMappingPreset(effectiveMode);
    this.renderer.toneMapping = preset.rendererToneMapping;
    this.renderer.toneMappingExposure = effectiveExposure;
    this.effectiveModeValue = effectiveMode;
    this.effectiveExposureValue = effectiveExposure;
  }
}
