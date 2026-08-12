import type { DirectNeuralStimulus } from "./protocol";

export const NULL_TASK_CONTEXT = 0;

export function directNeuralStimulus(intensity: number): DirectNeuralStimulus {
  if (!Number.isFinite(intensity) || intensity < 0 || intensity > 1) {
    throw new RangeError("intensidade direta deve estar no intervalo [0, 1]");
  }
  return Object.freeze({ intensity, confidence: NULL_TASK_CONTEXT });
}
