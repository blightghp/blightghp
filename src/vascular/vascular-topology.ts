import { z } from "zod";
import {
  ANATOMICAL_CATALOG,
  anatomicalBreadcrumbs,
  anatomicalEntryById,
} from "../anatomy";
import type { AnatomicalCatalog, AnatomyView } from "../anatomy";
import embeddedTopology from "./vascular-topology-v1.json";

const MAX_TOPOLOGY_BYTES = 128 * 1024;
const SEGMENT_ID_PATTERN = /^brain-pro:vascular\/[a-z0-9][a-z0-9-]*$/;
const VASCULAR_ROOT_ID = "brain-pro:anatomy/vascular-system";

const pointSchema = z.tuple([
  z.number().finite().min(-10).max(10),
  z.number().finite().min(-10).max(10),
  z.number().finite().min(-10).max(10),
]);

const segmentSchema = z.object({
  id: z.string().regex(SEGMENT_ID_PATTERN).max(160),
  catalogId: z.string().min(1).max(180),
  class: z.enum(["arterial", "capillary", "venous"]),
  branchOrder: z.number().int().min(0).max(12),
  side: z.enum(["left", "right", "midline"]),
  lodTier: z.number().int().min(0).max(2),
  views: z.array(z.enum(["overview", "laminar", "cell", "neuron", "synapse"]))
    .min(1).max(5),
  upstreamIds: z.array(z.string().regex(SEGMENT_ID_PATTERN)).max(16),
  downstreamIds: z.array(z.string().regex(SEGMENT_ID_PATTERN)).max(16),
  anastomosis: z.boolean(),
  directionCue: z.enum(["taper", "chevron", "none"]),
  controlPoints: z.array(pointSchema).min(2).max(12),
  radiusProfile: z.tuple([
    z.number().finite().positive().max(0.25),
    z.number().finite().positive().max(0.25),
  ]),
}).strict();

export const vascularTopologySchema = z.object({
  schemaVersion: z.literal(1),
  contractId: z.literal("brain-pro-vascular"),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  segments: z.array(segmentSchema).min(1).max(256),
}).strict();

export type VascularClass = z.infer<typeof segmentSchema>["class"];
export type VascularSegment = z.infer<typeof segmentSchema>;
export type VascularTopology = z.infer<typeof vascularTopologySchema>;

export type VascularTopologyIssueCode =
  | "duplicate-id"
  | "unknown-catalog-id"
  | "catalog-outside-vascular-root"
  | "missing-segment-reference"
  | "asymmetric-edge"
  | "invalid-class-transition"
  | "arterial-does-not-reach-capillary"
  | "venous-does-not-reach-sink"
  | "invalid-anastomosis-cycle"
  | "invalid-branch-order"
  | "orphan-segment"
  | "catalog-view-mismatch";

export interface VascularTopologyIssue {
  readonly code: VascularTopologyIssueCode;
  readonly id: string;
  readonly detail: string;
}

export interface VascularTopologyAudit {
  readonly schemaVersion: 1;
  readonly contractId: "brain-pro-vascular";
  readonly version: string;
  readonly geometryHash: string;
  readonly segments: number;
  readonly classes: Readonly<Record<VascularClass, number>>;
  readonly views: Readonly<Record<Exclude<AnatomyView, "electricity">, number>>;
  readonly anastomosisSegments: number;
  readonly sinks: number;
  readonly maximumControlPoints: number;
  readonly issues: readonly VascularTopologyIssue[];
  readonly contractReady: boolean;
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson(record[key])}`
  ).join(",")}}`;
}

function fnv1a64(value: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte);
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}

function duplicateIds(segments: readonly VascularSegment[]): readonly string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const segment of segments) {
    if (seen.has(segment.id)) duplicates.add(segment.id);
    seen.add(segment.id);
  }
  return [...duplicates].sort();
}

function hasReachable(
  start: VascularSegment,
  byId: ReadonlyMap<string, VascularSegment>,
  predicate: (segment: VascularSegment) => boolean,
): boolean {
  const pending = [...start.downstreamIds];
  const visited = new Set<string>([start.id]);
  while (pending.length > 0) {
    const id = pending.pop();
    if (!id || visited.has(id)) continue;
    visited.add(id);
    const segment = byId.get(id);
    if (!segment) continue;
    if (predicate(segment)) return true;
    pending.push(...segment.downstreamIds);
  }
  return false;
}

function allowedClassTransition(from: VascularClass, to: VascularClass): boolean {
  return from === to ||
    (from === "arterial" && to === "capillary") ||
    (from === "capillary" && to === "venous");
}

function hasValidAnastomosisCycle(
  segments: readonly VascularSegment[],
  byId: ReadonlyMap<string, VascularSegment>,
): boolean {
  const cycle = segments.filter((segment) => segment.anastomosis);
  if (cycle.length < 3) return false;
  const cycleIds = new Set(cycle.map((segment) => segment.id));
  for (const segment of cycle) {
    const neighbors = new Set(
      [...segment.upstreamIds, ...segment.downstreamIds].filter((id) => cycleIds.has(id)),
    );
    if (neighbors.size !== 2) return false;
  }
  const visited = new Set<string>();
  const pending = [cycle[0].id];
  while (pending.length > 0) {
    const id = pending.pop();
    if (!id || visited.has(id)) continue;
    visited.add(id);
    const segment = byId.get(id);
    if (!segment) continue;
    pending.push(
      ...[...segment.upstreamIds, ...segment.downstreamIds].filter((next) => cycleIds.has(next)),
    );
  }
  return visited.size === cycle.length;
}

/** Parses the bounded topology object and rejects unknown fields. */
export function parseVascularTopology(value: unknown): VascularTopology {
  return vascularTopologySchema.parse(value);
}

/** Parses a local topology JSON payload after enforcing the SEC-021 byte limit. */
export function parseVascularTopologyJson(json: string): VascularTopology {
  if (new TextEncoder().encode(json).byteLength > MAX_TOPOLOGY_BYTES) {
    throw new Error(`vascular topology exceeds ${MAX_TOPOLOGY_BYTES} bytes`);
  }
  let value: unknown;
  try {
    value = JSON.parse(json) as unknown;
  } catch {
    throw new Error("vascular topology is not valid JSON");
  }
  return parseVascularTopology(value);
}

/** Validates cross-record, catalog and graph invariants for the vascular contract. */
export function validateVascularTopology(
  topology: VascularTopology,
  catalog: AnatomicalCatalog = ANATOMICAL_CATALOG,
): readonly VascularTopologyIssue[] {
  const issues: VascularTopologyIssue[] = [];
  const byId = new Map(topology.segments.map((segment) => [segment.id, segment] as const));
  for (const id of duplicateIds(topology.segments)) {
    issues.push({ code: "duplicate-id", id, detail: "segment IDs must be unique" });
  }
  for (const segment of topology.segments) {
    const catalogEntry = anatomicalEntryById(segment.catalogId, catalog);
    if (!catalogEntry) {
      issues.push({ code: "unknown-catalog-id", id: segment.id, detail: segment.catalogId });
    } else {
      const ancestors = anatomicalBreadcrumbs(catalogEntry.id, catalog).map((entry) => entry.id);
      if (!ancestors.includes(VASCULAR_ROOT_ID)) {
        issues.push({
          code: "catalog-outside-vascular-root",
          id: segment.id,
          detail: segment.catalogId,
        });
      }
      for (const view of segment.views) {
        if (!catalogEntry.views.includes(view)) {
          issues.push({ code: "catalog-view-mismatch", id: segment.id, detail: view });
        }
      }
    }
    if (segment.upstreamIds.length === 0 && segment.downstreamIds.length === 0) {
      issues.push({ code: "orphan-segment", id: segment.id, detail: "no graph edge" });
    }
    for (const downstreamId of segment.downstreamIds) {
      const downstream = byId.get(downstreamId);
      if (!downstream) {
        issues.push({ code: "missing-segment-reference", id: segment.id, detail: downstreamId });
        continue;
      }
      if (!downstream.upstreamIds.includes(segment.id)) {
        issues.push({ code: "asymmetric-edge", id: segment.id, detail: downstreamId });
      }
      if (!allowedClassTransition(segment.class, downstream.class)) {
        issues.push({
          code: "invalid-class-transition",
          id: segment.id,
          detail: `${segment.class}->${downstream.class}`,
        });
      }
      if (
        segment.class === "arterial" && downstream.class === "arterial" &&
        downstream.branchOrder < segment.branchOrder
      ) {
        issues.push({ code: "invalid-branch-order", id: segment.id, detail: downstreamId });
      }
      if (
        segment.class === "venous" && downstream.class === "venous" &&
        downstream.branchOrder > segment.branchOrder
      ) {
        issues.push({ code: "invalid-branch-order", id: segment.id, detail: downstreamId });
      }
    }
    for (const upstreamId of segment.upstreamIds) {
      const upstream = byId.get(upstreamId);
      if (!upstream) {
        issues.push({ code: "missing-segment-reference", id: segment.id, detail: upstreamId });
      } else if (!upstream.downstreamIds.includes(segment.id)) {
        issues.push({ code: "asymmetric-edge", id: segment.id, detail: upstreamId });
      }
    }
    if (
      segment.class === "arterial" &&
      !hasReachable(segment, byId, (candidate) => candidate.class === "capillary")
    ) {
      issues.push({
        code: "arterial-does-not-reach-capillary",
        id: segment.id,
        detail: "no downstream capillary",
      });
    }
    if (
      segment.class === "venous" &&
      !hasReachable(
        segment,
        byId,
        (candidate) => candidate.class === "venous" && candidate.downstreamIds.length === 0,
      ) && segment.downstreamIds.length > 0
    ) {
      issues.push({
        code: "venous-does-not-reach-sink",
        id: segment.id,
        detail: "no downstream sink",
      });
    }
  }
  if (!hasValidAnastomosisCycle(topology.segments, byId)) {
    issues.push({
      code: "invalid-anastomosis-cycle",
      id: topology.contractId,
      detail: "anastomosis segments must form exactly one closed ring",
    });
  }
  return issues.sort((left, right) =>
    left.code.localeCompare(right.code) || left.id.localeCompare(right.id) ||
    left.detail.localeCompare(right.detail)
  );
}

/** Produces deterministic counts, graph findings and the geometry-domain hash. */
export function auditVascularTopology(
  topology: VascularTopology = VASCULAR_TOPOLOGY,
  catalog: AnatomicalCatalog = ANATOMICAL_CATALOG,
): VascularTopologyAudit {
  const classes: Record<VascularClass, number> = { arterial: 0, capillary: 0, venous: 0 };
  const views: Record<Exclude<AnatomyView, "electricity">, number> = {
    overview: 0,
    laminar: 0,
    cell: 0,
    neuron: 0,
    synapse: 0,
  };
  for (const segment of topology.segments) {
    classes[segment.class] += 1;
    for (const view of segment.views) views[view] += 1;
  }
  const issues = validateVascularTopology(topology, catalog);
  const geometryDomain = topology.segments.map((segment) => ({
    id: segment.id,
    class: segment.class,
    controlPoints: segment.controlPoints,
    radiusProfile: segment.radiusProfile,
  }));
  return {
    schemaVersion: 1,
    contractId: "brain-pro-vascular",
    version: topology.version,
    geometryHash: fnv1a64(canonicalJson(geometryDomain)),
    segments: topology.segments.length,
    classes,
    views,
    anastomosisSegments: topology.segments.filter((segment) => segment.anastomosis).length,
    sinks: topology.segments.filter(
      (segment) => segment.class === "venous" && segment.downstreamIds.length === 0,
    ).length,
    maximumControlPoints: Math.max(...topology.segments.map((segment) => segment.controlPoints.length)),
    issues,
    contractReady: issues.length === 0,
  };
}

/** Returns all graph segments associated with one anatomical catalog ID. */
export function vascularSegmentsForCatalogId(
  catalogId: string,
  topology: VascularTopology = VASCULAR_TOPOLOGY,
): readonly VascularSegment[] {
  return topology.segments.filter((segment) => segment.catalogId === catalogId);
}

const parsedEmbeddedTopology = parseVascularTopology(embeddedTopology);

/** Immutable built-in vascular graph; it contains topology and procedural coordinates only. */
export const VASCULAR_TOPOLOGY: Readonly<VascularTopology> = deepFreeze(parsedEmbeddedTopology);
