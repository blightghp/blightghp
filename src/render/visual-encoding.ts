import * as THREE from "three";
import type { NeuralSnapshot } from "../protocol";
import { COLOR_TOKENS } from "./visual-tokens";

export type VisualColorMode = "color" | "monochrome";
export type CurrentDirection =
  | "depolarizing"
  | "hyperpolarizing"
  | "shunting"
  | "inactive";

export const GABAA_REVERSAL_VOLTS = -0.07;
export const SHUNT_DRIVING_FORCE_VOLTS = 0.003;
export const ACTIVE_GABAA_SIEMENS = 10e-12;
export const CURRENT_VISUAL_CEILING_AMPERES = 120e-12;

export interface CellCurrentState {
  netAmperes: number;
  magnitudeAmperes: number;
  gabaaConductanceSiemens: number;
  direction: CurrentDirection;
}

export function parseVisualColorMode(value: unknown): VisualColorMode {
  return value === "monochrome" ? "monochrome" : "color";
}

export function signedMean(values: Float32Array): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function estimateConductanceSiemens(
  currentAmperes: number,
  reversalVolts: number,
  membraneVolts: number,
): number {
  const drivingForce = reversalVolts - membraneVolts;
  if (Math.abs(drivingForce) <= Number.EPSILON) return 0;
  return Math.max(0, currentAmperes / drivingForce);
}

export function classifyCellCurrent(
  netAmperes: number,
  magnitudeAmperes: number,
  proximalVolts: number,
  gabaaAmperes: number,
): CellCurrentState {
  const gabaaConductanceSiemens = estimateConductanceSiemens(
    gabaaAmperes,
    GABAA_REVERSAL_VOLTS,
    proximalVolts,
  );
  const shunting =
    gabaaConductanceSiemens >= ACTIVE_GABAA_SIEMENS &&
    Math.abs(proximalVolts - GABAA_REVERSAL_VOLTS) <= SHUNT_DRIVING_FORCE_VOLTS;
  const direction: CurrentDirection = shunting
    ? "shunting"
    : magnitudeAmperes <= Number.EPSILON
      ? "inactive"
      : netAmperes >= 0
        ? "depolarizing"
        : "hyperpolarizing";
  return { netAmperes, magnitudeAmperes, gabaaConductanceSiemens, direction };
}

export function cellCurrentState(snapshot: NeuralSnapshot, index: number): CellCurrentState {
  const ampa = snapshot.cellPatch.ampaAmperes[index] ?? 0;
  const nmda = snapshot.cellPatch.nmdaAmperes[index] ?? 0;
  const gabaa = snapshot.cellPatch.gabaaAmperes[index] ?? 0;
  const gabab = snapshot.cellPatch.gababAmperes[index] ?? 0;
  return classifyCellCurrent(
    ampa + nmda + gabaa + gabab,
    Math.abs(ampa) + Math.abs(nmda) + Math.abs(gabaa) + Math.abs(gabab),
    snapshot.cellPatch.dendriteProximalVolts[index] ?? GABAA_REVERSAL_VOLTS,
    gabaa,
  );
}

export function currentDirectionColor(direction: CurrentDirection): THREE.Color {
  if (direction === "depolarizing") return COLOR_TOKENS.excitatory;
  if (direction === "hyperpolarizing") return COLOR_TOKENS.inhibitory;
  if (direction === "shunting") return COLOR_TOKENS.shunting;
  return COLOR_TOKENS.inactive;
}

export function currentDirectionEuler(direction: CurrentDirection): THREE.Euler {
  return setCurrentDirectionEuler(new THREE.Euler(), direction);
}

export function setCurrentDirectionEuler(
  target: THREE.Euler,
  direction: CurrentDirection,
): THREE.Euler {
  if (direction === "depolarizing") return target.set(0, 0, 0);
  if (direction === "hyperpolarizing") return target.set(0, Math.PI / 2, 0);
  return target.set(Math.PI / 2, 0, 0);
}

export function currentMagnitudeScale(amperes: number): number {
  return 0.82 + Math.min(
    0.46,
    (Math.abs(amperes) / CURRENT_VISUAL_CEILING_AMPERES) * 0.46,
  );
}

/**
 * A bounded base-to-white ramp used wherever color carries a scalar state.
 * Keeping the segment linear makes the state recoverable before tone mapping.
 */
export function encodeStateColor(
  base: THREE.Color,
  normalizedState: number,
  maximumMix = 0.72,
): THREE.Color {
  return base.clone().lerp(
    COLOR_TOKENS.white,
    THREE.MathUtils.clamp(normalizedState, 0, 1) * maximumMix,
  );
}

export function decodeStateColor(
  color: THREE.Color,
  base: THREE.Color,
  maximumMix = 0.72,
): number {
  const white = COLOR_TOKENS.white;
  const direction = white.clone().sub(base);
  const denominator = direction.r * direction.r +
    direction.g * direction.g +
    direction.b * direction.b;
  if (denominator <= Number.EPSILON || maximumMix <= 0) return 0;
  const delta = color.clone().sub(base);
  const projectedMix = (
    delta.r * direction.r + delta.g * direction.g + delta.b * direction.b
  ) / denominator;
  return THREE.MathUtils.clamp(projectedMix / maximumMix, 0, 1);
}
