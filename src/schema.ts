import { z } from "zod";

export const brainSettingsSchema = z.object({
  rotationSpeed: z.number().min(0).max(3).default(0.55),
  pulseSpeed: z.number().min(0.1).max(3).default(1),
  pulseCount: z.number().int().min(10).max(300).default(140),
  stimulusIntensity: z.number().min(0).max(1).default(0.5),
  learningRate: z.number().min(0).max(0.02).default(0.004),
  bloomStrength: z.number().min(0).max(4).default(1.15),
  bloomRadius: z.number().min(0).max(2).default(0.45),
  showLeftHemi: z.boolean().default(true),
  showRightHemi: z.boolean().default(true),
  showCerebellum: z.boolean().default(true),
  showStem: z.boolean().default(true),
});

export type BrainSettings = z.infer<typeof brainSettingsSchema>;

export function getInitialBrainSettings(): BrainSettings {
  const params = new URLSearchParams(window.location.search);
  const numericParam = (name: string): number | undefined => {
    const value = params.get(name);
    if (value === null || value.trim() === "") return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  return brainSettingsSchema.parse({
    rotationSpeed: numericParam("rotation"),
    pulseSpeed: numericParam("pulseSpeed"),
    pulseCount: numericParam("pulses"),
    stimulusIntensity: numericParam("stimulus"),
    learningRate: numericParam("learningRate"),
    bloomStrength: numericParam("bloom"),
    bloomRadius: numericParam("bloomRadius"),
  });
}
