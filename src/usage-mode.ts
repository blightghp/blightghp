export const USAGE_MODES = ["guided", "explorer", "laboratory"] as const;

export type UsageMode = (typeof USAGE_MODES)[number];

export interface UsageModeDefinition {
  readonly label: string;
  readonly summary: string;
}

export const DEFAULT_USAGE_MODE: UsageMode = "guided";

export const USAGE_MODE_DEFINITIONS: Readonly<Record<UsageMode, UsageModeDefinition>> = {
  guided: {
    label: "Guiado",
    summary: "Modo guiado: navegação e leituras essenciais; o motor permanece o mesmo.",
  },
  explorer: {
    label: "Explorador",
    summary: "Modo explorador: acrescenta busca, corte, isolamento e comparação visual.",
  },
  laboratory: {
    label: "Laboratório",
    summary:
      "Modo laboratório: acrescenta os ajustes avançados já implementados, com limites declarados.",
  },
};

export function parseUsageMode(value: unknown): UsageMode | undefined {
  if (typeof value !== "string") return undefined;
  return (USAGE_MODES as readonly string[]).includes(value) ? value as UsageMode : undefined;
}

export function isUsageModeControlVisible(
  mode: UsageMode,
  minimumMode: UsageMode,
): boolean {
  return USAGE_MODES.indexOf(mode) >= USAGE_MODES.indexOf(minimumMode);
}

export function visibleUsageModeControlGroups(mode: UsageMode): readonly UsageMode[] {
  return USAGE_MODES.filter((minimumMode) => isUsageModeControlVisible(mode, minimumMode));
}
