import { describe, expect, it } from "vitest";
import graphModule from "./animate_graph.cjs";

const { sanitizeActivityGraph } = graphModule;

describe("sanitizeActivityGraph", () => {
  it("removes foreignObject content from the remote SVG", () => {
    const source =
      '<svg><foreignObject><div>remote title</div></foreignObject><path /></svg>';
    const sanitized = sanitizeActivityGraph(source);
    expect(sanitized).not.toContain("foreignObject");
    expect(sanitized).toContain("<path");
  });

  it("rejects scripts, handlers and external references", () => {
    expect(() =>
      sanitizeActivityGraph("<svg><script>alert(1)</script></svg>"),
    ).toThrow(/active or external/);
    expect(() =>
      sanitizeActivityGraph('<svg><path onload="alert(1)" /></svg>'),
    ).toThrow(/active or external/);
    expect(() =>
      sanitizeActivityGraph('<svg><use href="https://example.com/x" /></svg>'),
    ).toThrow(/active or external/);
  });

  it("allows local fragment references used by filters", () => {
    expect(
      sanitizeActivityGraph(
        '<svg><defs><filter id="glow" /></defs><path filter="url(#glow)" /></svg>',
      ),
    ).toContain("url(#glow)");
  });
});
