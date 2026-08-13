import { z } from "zod";
import embeddedCatalog from "./catalog-v1.json";

const MAX_CATALOG_BYTES = 256 * 1024;
const MAX_SEARCH_RESULTS = 64;
const ID_PATTERN = /^brain-pro:anatomy\/[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)*$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

const viewSchema = z.enum([
  "overview",
  "laminar",
  "cell",
  "neuron",
  "electricity",
  "synapse",
]);

const licenseSchema = z.object({
  id: z.string().min(1).max(80),
  expression: z.string().min(1).max(120),
  holder: z.string().min(1).max(160),
  note: z.string().min(1).max(500),
}).strict();

const sourceSchema = z.object({
  id: z.string().min(1).max(100),
  kind: z.enum(["procedural-generator", "model-contract", "external-asset"]),
  locator: z.string().min(1).max(240),
  version: z.string().min(1).max(40),
  licenseId: z.string().min(1).max(80),
  externalAsset: z.boolean(),
  assetSha256: z.string().regex(SHA256_PATTERN).nullable(),
}).strict().superRefine((source, context) => {
  if (source.externalAsset && source.assetSha256 === null) {
    context.addIssue({
      code: "custom",
      path: ["assetSha256"],
      message: "external assets require a SHA-256 digest",
    });
  }
  if (!source.externalAsset && source.kind === "external-asset") {
    context.addIssue({
      code: "custom",
      path: ["externalAsset"],
      message: "external-asset sources must set externalAsset=true",
    });
  }
  if (source.externalAsset && source.kind !== "external-asset") {
    context.addIssue({
      code: "custom",
      path: ["kind"],
      message: "sources with externalAsset=true must use kind=external-asset",
    });
  }
});

const transformSchema = z.object({
  id: z.string().min(1).max(100),
  coordinateSystem: z.string().min(1).max(120),
  handedness: z.enum(["left", "right"]),
  upAxis: z.enum(["+X", "-X", "+Y", "-Y", "+Z", "-Z"]),
  unit: z.string().min(1).max(120),
  scale: z.string().min(1).max(240),
  orientation: z.string().min(1).max(240),
  description: z.string().min(1).max(500),
}).strict();

const evidenceSchema = z.object({
  level: z.enum([
    "PROCEDURAL",
    "ILLUSTRATIVE",
    "DIDACTIC",
    "FENOMENOLOGICAL",
    "MODEL_BOUND",
    "REFERENCE_GROUNDED",
    "CALIBRATED",
  ]),
  claim: z.string().min(1).max(500),
  limitations: z.array(z.string().min(1).max(320)).min(1).max(12),
}).strict();

const entrySchema = z.object({
  id: z.string().regex(ID_PATTERN).max(160),
  parentId: z.string().regex(ID_PATTERN).max(160).nullable(),
  label: z.string().min(1).max(120),
  synonyms: z.array(z.string().min(1).max(120)).max(32),
  laterality: z.enum(["left", "right", "bilateral", "midline", "unspecified", "not-applicable"]),
  scale: z.enum(["encephalon", "region", "column", "patch", "neuron", "synapse", "receptor"]),
  views: z.array(viewSchema).min(1).max(6),
  sourceId: z.string().min(1).max(100),
  transformId: z.string().min(1).max(100),
  evidence: evidenceSchema,
}).strict();

export const anatomicalCatalogSchema = z.object({
  schemaVersion: z.literal(1),
  catalogId: z.literal("brain-pro-anatomy"),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  license: licenseSchema,
  sources: z.array(sourceSchema).min(1).max(128),
  transforms: z.array(transformSchema).min(1).max(128),
  entries: z.array(entrySchema).min(1).max(512),
}).strict();

export type AnatomyView = z.infer<typeof viewSchema>;
export type AnatomicalCatalog = z.infer<typeof anatomicalCatalogSchema>;
export type AnatomicalCatalogEntry = z.infer<typeof entrySchema>;
export type AnatomicalSource = z.infer<typeof sourceSchema>;
export type AnatomicalTransform = z.infer<typeof transformSchema>;
export type AnatomicalLaterality = AnatomicalCatalogEntry["laterality"];

export interface AnatomicalCatalogIssue {
  readonly code:
    | "duplicate-entry"
    | "duplicate-source"
    | "duplicate-transform"
    | "missing-parent"
    | "parent-cycle"
    | "missing-source"
    | "missing-transform"
    | "missing-license";
  readonly id: string;
  readonly detail: string;
}

export interface AnatomicalCatalogAudit {
  readonly schemaVersion: 1;
  readonly catalogId: "brain-pro-anatomy";
  readonly version: string;
  readonly hash: string;
  readonly entries: number;
  readonly roots: number;
  readonly sources: number;
  readonly transforms: number;
  readonly externalAssets: number;
  readonly evidenceLevels: Readonly<Record<AnatomicalCatalogEntry["evidence"]["level"], number>>;
  readonly issues: readonly AnatomicalCatalogIssue[];
  readonly contractReady: boolean;
}

export interface AnatomicalSearchOptions {
  readonly view?: AnatomyView;
  readonly laterality?: AnatomicalLaterality;
  readonly limit?: number;
}

export const ANATOMY_IDS = {
  encephalon: "brain-pro:anatomy/encephalon",
  cerebrum: "brain-pro:anatomy/cerebrum",
  leftHemisphere: "brain-pro:anatomy/cerebral-hemisphere-left",
  rightHemisphere: "brain-pro:anatomy/cerebral-hemisphere-right",
  cerebellum: "brain-pro:anatomy/cerebellum",
  brainstem: "brain-pro:anatomy/brainstem",
  neocortex: "brain-pro:anatomy/neocortex",
  corticalColumn: "brain-pro:anatomy/cortical-column",
  corticalLayers: [
    "brain-pro:anatomy/cortical-layer-1",
    "brain-pro:anatomy/cortical-layer-2",
    "brain-pro:anatomy/cortical-layer-3",
    "brain-pro:anatomy/cortical-layer-4",
    "brain-pro:anatomy/cortical-layer-5",
    "brain-pro:anatomy/cortical-layer-6",
  ],
  thalamus: "brain-pro:anatomy/thalamus",
  thalamicRelay: "brain-pro:anatomy/thalamic-relay",
  thalamicReticularNucleus: "brain-pro:anatomy/thalamic-reticular-nucleus",
  corticothalamicPathway: "brain-pro:anatomy/corticothalamic-pathway",
  cellPatch: "brain-pro:anatomy/cell-patch",
  neuron: "brain-pro:anatomy/neuron",
  soma: "brain-pro:anatomy/soma",
  dendrite: "brain-pro:anatomy/dendrite",
  dendriteProximal: "brain-pro:anatomy/dendrite-proximal",
  dendriteDistal: "brain-pro:anatomy/dendrite-distal",
  axon: "brain-pro:anatomy/axon",
  ranvierNode: "brain-pro:anatomy/ranvier-node",
  synapse: "brain-pro:anatomy/synapse",
  presynapticBouton: "brain-pro:anatomy/presynaptic-bouton",
  synapticCleft: "brain-pro:anatomy/synaptic-cleft",
  postsynapticMembrane: "brain-pro:anatomy/postsynaptic-membrane",
  vesicleReserve: "brain-pro:anatomy/vesicle-reserve",
  receptorSite: "brain-pro:anatomy/receptor-site",
} as const;

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

function duplicateIds(values: readonly { readonly id: string }[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value.id)) duplicates.add(value.id);
    seen.add(value.id);
  }
  return [...duplicates].sort();
}

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9:-]+/g, " ")
    .trim();
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

/** Parses a catalog object and rejects unknown or out-of-contract fields. */
export function parseAnatomicalCatalog(value: unknown): AnatomicalCatalog {
  return anatomicalCatalogSchema.parse(value);
}

/** Parses a bounded JSON catalog for future local import workflows. */
export function parseAnatomicalCatalogJson(json: string): AnatomicalCatalog {
  const byteLength = new TextEncoder().encode(json).byteLength;
  if (byteLength > MAX_CATALOG_BYTES) {
    throw new Error(`anatomical catalog exceeds ${MAX_CATALOG_BYTES} bytes`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    throw new Error("anatomical catalog is not valid JSON");
  }
  return parseAnatomicalCatalog(parsed);
}

/** Returns structural issues that cannot be expressed by the JSON schema alone. */
export function validateAnatomicalCatalog(
  catalog: AnatomicalCatalog,
): readonly AnatomicalCatalogIssue[] {
  const issues: AnatomicalCatalogIssue[] = [];
  const entryIds = new Set(catalog.entries.map((entry) => entry.id));
  const sourceIds = new Set(catalog.sources.map((source) => source.id));
  const transformIds = new Set(catalog.transforms.map((transform) => transform.id));

  for (const id of duplicateIds(catalog.entries)) {
    issues.push({ code: "duplicate-entry", id, detail: "semantic IDs must be unique" });
  }
  for (const id of duplicateIds(catalog.sources)) {
    issues.push({ code: "duplicate-source", id, detail: "source IDs must be unique" });
  }
  for (const id of duplicateIds(catalog.transforms)) {
    issues.push({ code: "duplicate-transform", id, detail: "transform IDs must be unique" });
  }
  for (const entry of catalog.entries) {
    if (entry.parentId !== null && !entryIds.has(entry.parentId)) {
      issues.push({ code: "missing-parent", id: entry.id, detail: entry.parentId });
    }
    if (!sourceIds.has(entry.sourceId)) {
      issues.push({ code: "missing-source", id: entry.id, detail: entry.sourceId });
    }
    if (!transformIds.has(entry.transformId)) {
      issues.push({ code: "missing-transform", id: entry.id, detail: entry.transformId });
    }
  }
  for (const source of catalog.sources) {
    if (source.licenseId !== catalog.license.id) {
      issues.push({ code: "missing-license", id: source.id, detail: source.licenseId });
    }
  }

  const byId = new Map(catalog.entries.map((entry) => [entry.id, entry] as const));
  for (const entry of catalog.entries) {
    const visited = new Set<string>();
    let cursor: AnatomicalCatalogEntry | undefined = entry;
    while (cursor?.parentId) {
      if (visited.has(cursor.id)) {
        issues.push({ code: "parent-cycle", id: entry.id, detail: cursor.id });
        break;
      }
      visited.add(cursor.id);
      cursor = byId.get(cursor.parentId);
    }
  }
  return issues.sort((left, right) =>
    left.code.localeCompare(right.code) || left.id.localeCompare(right.id)
  );
}

/** Produces a deterministic audit and FNV-1a fingerprint for the catalog. */
export function auditAnatomicalCatalog(
  catalog: AnatomicalCatalog = ANATOMICAL_CATALOG,
): AnatomicalCatalogAudit {
  const evidenceLevels: Record<AnatomicalCatalogEntry["evidence"]["level"], number> = {
    PROCEDURAL: 0,
    ILLUSTRATIVE: 0,
    DIDACTIC: 0,
    FENOMENOLOGICAL: 0,
    MODEL_BOUND: 0,
    REFERENCE_GROUNDED: 0,
    CALIBRATED: 0,
  };
  for (const entry of catalog.entries) evidenceLevels[entry.evidence.level] += 1;
  const issues = validateAnatomicalCatalog(catalog);
  return {
    schemaVersion: 1,
    catalogId: "brain-pro-anatomy",
    version: catalog.version,
    hash: fnv1a64(canonicalJson(catalog)),
    entries: catalog.entries.length,
    roots: catalog.entries.filter((entry) => entry.parentId === null).length,
    sources: catalog.sources.length,
    transforms: catalog.transforms.length,
    externalAssets: catalog.sources.filter((source) => source.externalAsset).length,
    evidenceLevels,
    issues,
    contractReady: issues.length === 0,
  };
}

/** Finds one catalog entry by its stable semantic ID. */
export function anatomicalEntryById(
  id: string,
  catalog: AnatomicalCatalog = ANATOMICAL_CATALOG,
): AnatomicalCatalogEntry | undefined {
  return catalog.entries.find((entry) => entry.id === id);
}

/** Resolves the root-to-leaf breadcrumb for a stable semantic ID. */
export function anatomicalBreadcrumbs(
  id: string,
  catalog: AnatomicalCatalog = ANATOMICAL_CATALOG,
): readonly AnatomicalCatalogEntry[] {
  const byId = new Map(catalog.entries.map((entry) => [entry.id, entry] as const));
  const result: AnatomicalCatalogEntry[] = [];
  const visited = new Set<string>();
  let cursor = byId.get(id);
  while (cursor && !visited.has(cursor.id)) {
    result.unshift(cursor);
    visited.add(cursor.id);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }
  return result;
}

/** Returns the hierarchy depth of an entry, with a root at depth zero. */
export function anatomicalDepth(
  id: string,
  catalog: AnatomicalCatalog = ANATOMICAL_CATALOG,
): number {
  return Math.max(0, anatomicalBreadcrumbs(id, catalog).length - 1);
}

/** Performs deterministic, accent-insensitive search across IDs, labels and synonyms. */
export function searchAnatomy(
  query: string,
  options: AnatomicalSearchOptions = {},
  catalog: AnatomicalCatalog = ANATOMICAL_CATALOG,
): readonly AnatomicalCatalogEntry[] {
  const normalizedQuery = normalizeSearchText(query.slice(0, 80));
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  const limit = Math.max(1, Math.min(MAX_SEARCH_RESULTS, Math.floor(options.limit ?? MAX_SEARCH_RESULTS)));
  const candidates = catalog.entries.filter((entry) => {
    if (options.view && !entry.views.includes(options.view)) return false;
    if (options.laterality && entry.laterality !== options.laterality) return false;
    return true;
  });
  if (terms.length === 0) return candidates.slice(0, limit);

  return candidates
    .map((entry, index) => {
      const label = normalizeSearchText(entry.label);
      const id = normalizeSearchText(entry.id);
      const synonyms = entry.synonyms.map(normalizeSearchText);
      const haystack = `${id} ${label} ${synonyms.join(" ")}`;
      if (!terms.every((term) => haystack.includes(term))) return undefined;
      let score = 0;
      if (label === normalizedQuery) score += 100;
      if (label.startsWith(normalizedQuery)) score += 40;
      if (synonyms.some((synonym) => synonym === normalizedQuery)) score += 60;
      score += terms.reduce((total, term) => total + (label.includes(term) ? 10 : 1), 0);
      return { entry, index, score };
    })
    .filter((match): match is { entry: AnatomicalCatalogEntry; index: number; score: number } =>
      match !== undefined
    )
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, limit)
    .map((match) => match.entry);
}

/** Resolves the source record inherited by a catalog entry. */
export function anatomicalSourceOf(
  entry: AnatomicalCatalogEntry,
  catalog: AnatomicalCatalog = ANATOMICAL_CATALOG,
): AnatomicalSource {
  const source = catalog.sources.find((candidate) => candidate.id === entry.sourceId);
  if (!source) throw new Error(`unknown anatomical source: ${entry.sourceId}`);
  return source;
}

/** Resolves the coordinate transform inherited by a catalog entry. */
export function anatomicalTransformOf(
  entry: AnatomicalCatalogEntry,
  catalog: AnatomicalCatalog = ANATOMICAL_CATALOG,
): AnatomicalTransform {
  const transform = catalog.transforms.find((candidate) => candidate.id === entry.transformId);
  if (!transform) throw new Error(`unknown anatomical transform: ${entry.transformId}`);
  return transform;
}

const parsedEmbeddedCatalog = parseAnatomicalCatalog(embeddedCatalog);

/** Immutable built-in catalog. It contains metadata only and no external asset. */
export const ANATOMICAL_CATALOG: Readonly<AnatomicalCatalog> = deepFreeze(parsedEmbeddedCatalog);
