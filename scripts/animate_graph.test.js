import { describe, expect, it, vi } from "vitest";
import graphModule from "./animate_graph.cjs";

const {
  GRAPH_TITLE,
  GRAPH_USERNAME,
  contributionWindow,
  fetchContributionCalendar,
  normalizeContributionDays,
  renderContributionGraph,
} = graphModule;

const calendar = {
  weeks: [{
    contributionDays: [
      { date: "2026-08-30", contributionCount: 0 },
      { date: "2026-08-31", contributionCount: 2 },
      { date: "2026-09-01", contributionCount: 5 },
    ],
  }],
};

describe("contribution graph", () => {
  it("keeps the profile identity stable", () => {
    expect(GRAPH_TITLE).toBe("CONTRIBUIÇÕES");
    expect(GRAPH_USERNAME).toBe("blightghp");
  });

  it("uses an inclusive 365-day UTC window", () => {
    expect(contributionWindow(new Date("2026-09-01T12:00:00-04:00"))).toEqual({
      from: "2025-09-02T00:00:00.000Z",
      to: "2026-09-01T23:59:59.999Z",
    });
  });

  it("normalizes, sorts and validates GitHub contribution days", () => {
    expect(normalizeContributionDays(calendar)).toEqual([
      { date: "2026-08-30", count: 0 },
      { date: "2026-08-31", count: 2 },
      { date: "2026-09-01", count: 5 },
    ]);
    expect(() => normalizeContributionDays({ weeks: [] })).toThrow(/number/);
    expect(() => normalizeContributionDays({
      weeks: [{ contributionDays: [
        { date: "2026-09-01", contributionCount: -1 },
      ] }],
    })).toThrow(/count/);
  });

  it("renders a self-contained, accessible SVG", () => {
    const days = normalizeContributionDays(calendar);
    const svg = renderContributionGraph({ days, total: 7 });
    expect(svg).toContain('aria-labelledby="graph-title graph-desc"');
    expect(svg).toContain("7 contribuições públicas");
    expect(svg).toContain("prefers-reduced-motion");
    expect(svg).toContain('class="activity-line"');
    expect(svg).not.toMatch(/<script|foreignObject|(?:href|url\()\s*=\s*["']?https?:/i);
  });

  it("queries GitHub GraphQL and derives the total from validated days", async () => {
    const json = vi.fn().mockResolvedValue({
      data: {
        user: {
          contributionsCollection: {
            contributionCalendar: { ...calendar, totalContributions: 999 },
          },
        },
      },
    });
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json });

    await expect(fetchContributionCalendar({
      token: "test-token",
      now: new Date("2026-09-01T12:00:00Z"),
      fetchImpl,
    })).resolves.toEqual({
      days: normalizeContributionDays(calendar),
      total: 7,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
