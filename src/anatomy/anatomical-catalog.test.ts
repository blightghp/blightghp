import { describe, expect, it } from "vitest";
import {
  ANATOMICAL_CATALOG,
  anatomicalBreadcrumbs,
  anatomicalDepth,
  anatomicalEntryById,
  anatomicalSourceOf,
  anatomicalTransformOf,
  auditAnatomicalCatalog,
  parseAnatomicalCatalog,
  parseAnatomicalCatalogJson,
  searchAnatomy,
  validateAnatomicalCatalog,
} from "./anatomical-catalog";
import type { AnatomicalCatalog } from "./anatomical-catalog";

function mutableCatalog(): AnatomicalCatalog {
  return JSON.parse(JSON.stringify(ANATOMICAL_CATALOG)) as AnatomicalCatalog;
}

describe("anatomical catalog schema 1", () => {
  it("ships a complete immutable procedural catalog without external assets", () => {
    const audit = auditAnatomicalCatalog();
    expect(audit).toMatchObject({
      schemaVersion: 1,
      catalogId: "brain-pro-anatomy",
      version: "1.0.0",
      roots: 1,
      externalAssets: 0,
      contractReady: true,
      issues: [],
    });
    expect(audit.entries).toBeGreaterThanOrEqual(28);
    expect(audit.hash).toMatch(/^[a-f0-9]{16}$/);
    expect(Object.isFrozen(ANATOMICAL_CATALOG)).toBe(true);
    expect(Object.isFrozen(ANATOMICAL_CATALOG.entries)).toBe(true);
  });

  it("resolves source, license and coordinate transform for every entry", () => {
    for (const entry of ANATOMICAL_CATALOG.entries) {
      const source = anatomicalSourceOf(entry);
      const transform = anatomicalTransformOf(entry);
      expect(source.licenseId).toBe(ANATOMICAL_CATALOG.license.id);
      expect(source.locator).toBeTruthy();
      expect(source.version).toBeTruthy();
      expect(transform.coordinateSystem).toBeTruthy();
      expect(transform.scale).toBeTruthy();
      expect(transform.orientation).toBeTruthy();
      expect(entry.evidence.claim).toBeTruthy();
      expect(entry.evidence.limitations.length).toBeGreaterThan(0);
    }
  });

  it("searches labels and synonyms without depending on accents or case", () => {
    expect(searchAnatomy("talamo")[0]?.id).toBe("brain-pro:anatomy/thalamus");
    expect(searchAnatomy("NÓ DE RANVIER")[0]?.id).toBe("brain-pro:anatomy/ranvier-node");
    expect(searchAnatomy("cell body")[0]?.id).toBe("brain-pro:anatomy/soma");
    expect(searchAnatomy("L4", { view: "laminar" })[0]?.id)
      .toBe("brain-pro:anatomy/cortical-layer-4");
    expect(searchAnatomy("hemisfério", { laterality: "left" })).toHaveLength(1);
    expect(searchAnatomy("", { limit: 3 })).toHaveLength(3);
  });

  it("builds stable breadcrumbs and depth", () => {
    const id = "brain-pro:anatomy/receptor-site";
    expect(anatomicalBreadcrumbs(id).map((entry) => entry.label)).toEqual([
      "Encéfalo procedural",
      "Cérebro procedural",
      "Neocórtex didático",
      "Patch celular didático",
      "Neurônio resolvido ilustrativo",
      "Sinapse química representativa",
      "Membrana pós-sináptica",
      "Sítios receptores representativos",
    ]);
    expect(anatomicalDepth(id)).toBe(7);
    expect(anatomicalEntryById("brain-pro:anatomy/missing")).toBeUndefined();
  });

  it("rejects malformed, oversized and unknown-field imports", () => {
    expect(() => parseAnatomicalCatalogJson("{"))
      .toThrow("anatomical catalog is not valid JSON");
    expect(() => parseAnatomicalCatalogJson(" ".repeat(256 * 1024 + 1)))
      .toThrow("anatomical catalog exceeds");
    const value = mutableCatalog() as AnatomicalCatalog & { unexpected?: boolean };
    value.unexpected = true;
    expect(() => parseAnatomicalCatalog(value)).toThrow();
  });

  it("requires a SHA-256 digest for an external source", () => {
    const value = mutableCatalog();
    value.sources[0] = {
      ...value.sources[0],
      kind: "external-asset",
      externalAsset: true,
      assetSha256: null,
    };
    expect(() => parseAnatomicalCatalog(value)).toThrow("external assets require");
  });

  it("reports duplicate IDs, missing links and hierarchy cycles deterministically", () => {
    const value = mutableCatalog();
    value.entries.push({ ...value.entries[0] });
    value.entries[1] = { ...value.entries[1], sourceId: "missing-source" };
    value.entries[2] = { ...value.entries[2], parentId: value.entries[2].id };
    expect(validateAnatomicalCatalog(value).map((issue) => issue.code)).toEqual([
      "duplicate-entry",
      "missing-source",
      "parent-cycle",
    ]);
  });
});

