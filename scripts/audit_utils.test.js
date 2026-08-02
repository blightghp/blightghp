import { describe, expect, it } from "vitest";
import { composite, contrastRatio, parseCssColor } from "./audit_utils.js";

describe("visual accessibility audit utilities", () => {
  it("computes WCAG contrast for opaque colors", () => {
    expect(contrastRatio(parseCssColor("rgb(255, 255, 255)"), parseCssColor("rgb(0, 0, 0)")))
      .toBeCloseTo(21, 5);
  });

  it("composites translucent colors before measuring them", () => {
    const result = composite(parseCssColor("rgba(255, 255, 255, 0.5)"), parseCssColor("rgb(0, 0, 0)"));
    expect(result.red).toBeCloseTo(127.5);
    expect(result.alpha).toBe(1);
  });
});
