import { isUsageModeControlVisible } from "./usage-mode";
import type { UsageMode } from "./usage-mode";

export interface CommandPaletteCommand {
  readonly id: string;
  readonly label: string;
  readonly category: string;
  readonly keywords: readonly string[];
  readonly minimumMode: UsageMode;
}

export function normalizeCommandPaletteText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

function commandSearchText(command: CommandPaletteCommand): string {
  return normalizeCommandPaletteText(
    [command.label, command.category, ...command.keywords].join(" "),
  );
}

function commandSearchScore(command: CommandPaletteCommand, query: string): number | undefined {
  const label = normalizeCommandPaletteText(command.label);
  const keywords = normalizeCommandPaletteText(command.keywords.join(" "));
  const category = normalizeCommandPaletteText(command.category);
  const words = query.split(/\s+/u).filter(Boolean);
  const haystack = commandSearchText(command);
  if (!words.every((word) => haystack.includes(word))) return undefined;
  if (label === query) return 0;
  if (label.startsWith(query)) return 1;
  if (label.includes(query)) return 2;
  if (keywords.includes(query)) return 3;
  if (category.includes(query)) return 4;
  return 5;
}

export function filterCommandPaletteCommands<T extends CommandPaletteCommand>(
  commands: readonly T[],
  query: string,
  usageMode: UsageMode = "laboratory",
): readonly T[] {
  const normalizedQuery = normalizeCommandPaletteText(query);
  const visibleCommands = commands.filter((command) =>
    isUsageModeControlVisible(usageMode, command.minimumMode),
  );
  if (!normalizedQuery) return [...visibleCommands];

  return visibleCommands
    .map((command, index) => ({
      command,
      index,
      score: commandSearchScore(command, normalizedQuery),
    }))
    .filter((result): result is { command: T; index: number; score: number } =>
      result.score !== undefined,
    )
    .sort((left, right) => left.score - right.score || left.index - right.index)
    .map(({ command }) => command);
}

export function assertCommandPaletteCommands(
  commands: readonly CommandPaletteCommand[],
): void {
  const ids = new Set<string>();
  for (const command of commands) {
    if (!command.id.trim() || ids.has(command.id)) {
      throw new Error(`comando inválido ou duplicado: ${command.id}`);
    }
    ids.add(command.id);
  }
}

export function moveCommandPaletteSelection(
  currentIndex: number,
  offset: number,
  itemCount: number,
): number {
  if (itemCount <= 0) return -1;
  return ((currentIndex + offset) % itemCount + itemCount) % itemCount;
}
