import { describe, expect, it } from "vitest";
import {
  VASCULAR_TOPOLOGY,
  auditVascularTopology,
  parseVascularTopology,
  parseVascularTopologyJson,
  validateVascularTopology,
  vascularSegmentsForCatalogId,
} from "./vascular-topology";
import type { VascularTopology } from "./vascular-topology";

function mutableTopology(): VascularTopology {
  return JSON.parse(JSON.stringify(VASCULAR_TOPOLOGY)) as VascularTopology;
}

describe("vascular topology schema 1", () => {
  it("ships one immutable, closed and deterministic graph", () => {
    const audit = auditVascularTopology();
    expect(audit).toMatchObject({
      schemaVersion: 1,
      contractId: "brain-pro-vascular",
      version: "1.0.0",
      segments: 42,
      classes: { arterial: 21, capillary: 2, venous: 19 },
      anastomosisSegments: 4,
      sinks: 2,
      issues: [],
      contractReady: true,
    });
    expect(audit.geometryHash).toMatch(/^[a-f0-9]{16}$/);
    expect(Object.isFrozen(VASCULAR_TOPOLOGY)).toBe(true);
    expect(Object.isFrozen(VASCULAR_TOPOLOGY.segments)).toBe(true);
  });

  it("keeps graph references symmetric and class transitions explicit", () => {
    const byId = new Map(VASCULAR_TOPOLOGY.segments.map((segment) => [segment.id, segment]));
    for (const segment of VASCULAR_TOPOLOGY.segments) {
      for (const downstreamId of segment.downstreamIds) {
        expect(byId.get(downstreamId)?.upstreamIds).toContain(segment.id);
      }
      expect(segment.controlPoints.length).toBeLessThanOrEqual(12);
      expect(segment.views).not.toContain("electricity");
    }
  });

  it("resolves repeated bilateral geometry through one catalog identity", () => {
    expect(vascularSegmentsForCatalogId("brain-pro:anatomy/capillary-bed"))
      .toHaveLength(2);
    expect(vascularSegmentsForCatalogId("brain-pro:anatomy/missing")).toEqual([]);
  });

  it("rejects malformed, oversized and unknown-field payloads before use", () => {
    expect(() => parseVascularTopologyJson("{")).toThrow("not valid JSON");
    expect(() => parseVascularTopologyJson(" ".repeat(128 * 1024 + 1)))
      .toThrow("exceeds");
    const topology = mutableTopology() as VascularTopology & { unexpected?: boolean };
    topology.unexpected = true;
    expect(() => parseVascularTopology(topology)).toThrow();
  });

  it("reports duplicate IDs, missing references and asymmetric edges", () => {
    const topology = mutableTopology();
    topology.segments.push({ ...topology.segments[0] });
    topology.segments[1] = {
      ...topology.segments[1],
      downstreamIds: [...topology.segments[1].downstreamIds, "brain-pro:vascular/missing"],
    };
    topology.segments[2] = { ...topology.segments[2], downstreamIds: [] };
    const codes = validateVascularTopology(topology).map((issue) => issue.code);
    expect(codes).toContain("duplicate-id");
    expect(codes).toContain("missing-segment-reference");
    expect(codes).toContain("asymmetric-edge");
  });

  it("rejects a broken Willis ring and a catalog view mismatch", () => {
    const topology = mutableTopology();
    const circle = topology.segments.findIndex(
      (segment) => segment.id === "brain-pro:vascular/circle-left",
    );
    topology.segments[circle] = { ...topology.segments[circle], anastomosis: false };
    topology.segments[0] = { ...topology.segments[0], views: ["synapse"] };
    const codes = validateVascularTopology(topology).map((issue) => issue.code);
    expect(codes).toContain("invalid-anastomosis-cycle");
    expect(codes).toContain("catalog-view-mismatch");
  });

  it("rejects invalid branch order and loss of capillary reachability", () => {
    const topology = mutableTopology();
    const pial = topology.segments.findIndex(
      (segment) => segment.id === "brain-pro:vascular/pial-left",
    );
    topology.segments[pial] = { ...topology.segments[pial], branchOrder: 0 };
    const penetrating = topology.segments.findIndex(
      (segment) => segment.id === "brain-pro:vascular/penetrating-left",
    );
    topology.segments[penetrating] = { ...topology.segments[penetrating], downstreamIds: [] };
    const codes = validateVascularTopology(topology).map((issue) => issue.code);
    expect(codes).toContain("invalid-branch-order");
    expect(codes).toContain("arterial-does-not-reach-capillary");
  });
});
