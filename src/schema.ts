import { z } from "zod";

export const presentationPreferencesSchema = z.object({
  rotationSpeed: z.number().min(0).max(3).default(0.55),
  pulseCount: z.number().int().min(10).max(300).default(140),
  bloomStrength: z.number().min(0).max(4).default(1.15),
  bloomRadius: z.number().min(0).max(2).default(0.45),
  showLeftHemi: z.boolean().default(true),
  showRightHemi: z.boolean().default(true),
  showCerebellum: z.boolean().default(true),
  showStem: z.boolean().default(true),
});

export const runControlsSchema = z.object({
  pulseSpeed: z.number().min(0.1).max(3).default(1),
  snapshotCadence: z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(6)]).default(1),
});

export const scientificPresetSelectionSchema = z.object({
  stimulusIntensity: z.number().min(0).max(1).default(0.5),
  learningRate: z.number().min(0).max(0.02).default(0.004),
});

export const brainSettingsSchema = presentationPreferencesSchema
  .merge(runControlsSchema)
  .merge(scientificPresetSelectionSchema);

export type PresentationPreferences = z.infer<typeof presentationPreferencesSchema>;
export type RunControls = z.infer<typeof runControlsSchema>;
export type ScientificPresetSelection = z.infer<typeof scientificPresetSelectionSchema>;
export type BrainSettings = z.infer<typeof brainSettingsSchema>;

export function getInitialBrainSettings(): BrainSettings {
  const params = new URLSearchParams(window.location.search);
  const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const numericParam = (name: string): number | undefined => {
    const value = params.get(name);
    if (value === null || value.trim() === "") return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  return brainSettingsSchema.parse({
    rotationSpeed: numericParam("rotation") ?? (prefersReducedMotion ? 0 : undefined),
    pulseSpeed: numericParam("pulseSpeed"),
    pulseCount: numericParam("pulses"),
    stimulusIntensity: numericParam("stimulus"),
    learningRate: numericParam("learningRate"),
    bloomStrength: numericParam("bloom"),
    bloomRadius: numericParam("bloomRadius"),
    snapshotCadence: numericParam("snapshotCadence"),
  });
}
