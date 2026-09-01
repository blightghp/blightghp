import { describe, expect, it } from "vitest";
import {
  assertCommandPaletteCommands,
  filterCommandPaletteCommands,
  moveCommandPaletteSelection,
  normalizeCommandPaletteText,
  type CommandPaletteCommand,
} from "./command-palette";

const commands: readonly CommandPaletteCommand[] = [
  {
    id: "view-laminar",
    label: "Abrir Lâminas",
    category: "Vistas",
    keywords: ["coluna", "l1 l6"],
    minimumMode: "guided",
  },
  {
    id: "search-anatomy",
    label: "Buscar estrutura anatômica",
    category: "Anatomia",
    keywords: ["catalogo", "cerebro"],
    minimumMode: "explorer",
  },
  {
    id: "mode-laboratory",
    label: "Usar modo Laboratório",
    category: "Modos",
    keywords: ["avancado", "parametros"],
    minimumMode: "guided",
  },
];

describe("command palette policy", () => {
  it("normalizes Portuguese accents and whitespace", () => {
    expect(normalizeCommandPaletteText("  LÂMINAS  ")).toBe("laminas");
  });

  it("filters deterministically by labels, categories and keywords", () => {
    expect(filterCommandPaletteCommands(commands, "laminas", "guided")).toEqual([commands[0]]);
    expect(filterCommandPaletteCommands(commands, "catalogo", "laboratory")).toEqual([commands[1]]);
    expect(filterCommandPaletteCommands(commands, "modo laboratorio", "guided")).toEqual([
      commands[2],
    ]);
    expect(filterCommandPaletteCommands(commands, "ausente", "laboratory")).toEqual([]);
    expect(filterCommandPaletteCommands(commands, "", "guided")).toEqual([
      commands[0],
      commands[2],
    ]);
    expect(filterCommandPaletteCommands(commands, "", "explorer")).toEqual(commands);
  });

  it("rejects duplicate command identifiers", () => {
    expect(() => assertCommandPaletteCommands([...commands, commands[0]])).toThrow(/duplicado/);
  });

  it("wraps keyboard selection and closes the empty result set", () => {
    expect(moveCommandPaletteSelection(0, 1, 3)).toBe(1);
    expect(moveCommandPaletteSelection(0, -1, 3)).toBe(2);
    expect(moveCommandPaletteSelection(2, 1, 3)).toBe(0);
    expect(moveCommandPaletteSelection(0, 1, 0)).toBe(-1);
  });
});
