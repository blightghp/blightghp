export const WEBGL_SHADER_COMPILATION_FAILURE = "webgl-shader-compilation-failure" as const;

export interface WebGlShaderFailureTargets {
  readonly toneMapping?: {
    setSafetyFallback(reason: typeof WEBGL_SHADER_COMPILATION_FAILURE): unknown;
  };
  readonly materialProfile?: {
    failAtomic(reason: typeof WEBGL_SHADER_COMPILATION_FAILURE): unknown;
  };
  readonly clipping?: {
    disable(): void;
  };
}

/**
 * A shader compile failure is presentation-only, so fail closed without
 * retaining a clipping cap that might repeatedly request the failed program.
 */
export function failClosedForWebGlShaderCompilation(
  targets: WebGlShaderFailureTargets,
): void {
  targets.toneMapping?.setSafetyFallback(WEBGL_SHADER_COMPILATION_FAILURE);
  targets.materialProfile?.failAtomic(WEBGL_SHADER_COMPILATION_FAILURE);
  targets.clipping?.disable();
}
