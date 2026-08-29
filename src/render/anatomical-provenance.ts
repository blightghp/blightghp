import * as THREE from "three";
import {
  ANATOMICAL_CATALOG,
  anatomicalEntryById,
} from "../anatomy";
import type {
  AnatomicalCatalog,
  AnatomicalCatalogEntry,
} from "../anatomy";
import {
  visualProvenanceOf,
} from "./render-types";
import type { VisualProvenance } from "./render-types";

const ANATOMICAL_DECLARATION_KEY = "anatomicalDeclaration";

export interface AnatomicalBinding {
  readonly kind: "catalog-entry";
  readonly entryId: string;
}

export interface NonAnatomicalDeclaration {
  readonly kind: "not-anatomical";
  readonly reason: string;
}

export type AnatomicalDeclaration = AnatomicalBinding | NonAnatomicalDeclaration;

export interface AnatomicalSceneAudit {
  readonly totalRenderableObjects: number;
  readonly boundObjects: number;
  readonly explicitlyNonAnatomicalObjects: number;
  readonly catalogEntriesReferenced: number;
  readonly missingDeclarations: readonly string[];
  readonly unknownEntryIds: readonly string[];
  readonly missingEvidence: readonly string[];
  readonly contractReady: boolean;
}

/** A raycast hit with enough presentation context for a DOM selection callout. */
export interface AnatomicalPickTarget {
  readonly entry: AnatomicalCatalogEntry;
  readonly object: THREE.Object3D;
  readonly point: THREE.Vector3;
  readonly provenance: VisualProvenance | undefined;
}

/** Binds one renderable object to a stable entry in the anatomical catalog. */
export function declareAnatomicalBinding(
  object: THREE.Object3D,
  entryId: string,
  catalog: AnatomicalCatalog = ANATOMICAL_CATALOG,
): void {
  if (!anatomicalEntryById(entryId, catalog)) {
    throw new Error(`unknown anatomical catalog entry: ${entryId}`);
  }
  object.userData[ANATOMICAL_DECLARATION_KEY] = {
    kind: "catalog-entry",
    entryId,
  } satisfies AnatomicalBinding;
}

/** Marks a renderable object as presentation/model information rather than anatomy. */
export function declareNonAnatomical(
  object: THREE.Object3D,
  reason: string,
): void {
  const normalized = reason.trim();
  if (!normalized) throw new Error("non-anatomical declarations require a reason");
  object.userData[ANATOMICAL_DECLARATION_KEY] = {
    kind: "not-anatomical",
    reason: normalized,
  } satisfies NonAnatomicalDeclaration;
}

/** Returns an object's direct anatomical declaration without inventing inheritance. */
export function anatomicalDeclarationOf(
  object: THREE.Object3D,
): AnatomicalDeclaration | undefined {
  const value: unknown = object.userData[ANATOMICAL_DECLARATION_KEY];
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<AnatomicalDeclaration>;
  if (candidate.kind === "catalog-entry" && typeof candidate.entryId === "string") {
    return candidate as AnatomicalBinding;
  }
  if (candidate.kind === "not-anatomical" && typeof candidate.reason === "string") {
    return candidate as NonAnatomicalDeclaration;
  }
  return undefined;
}

/** Resolves an object's catalog entry when it has an anatomical binding. */
export function anatomicalEntryOf(
  object: THREE.Object3D,
  catalog: AnatomicalCatalog = ANATOMICAL_CATALOG,
): AnatomicalCatalogEntry | undefined {
  const declaration = anatomicalDeclarationOf(object);
  return declaration?.kind === "catalog-entry"
    ? anatomicalEntryById(declaration.entryId, catalog)
    : undefined;
}

/** Resolves the first visible raycast hit that has a direct catalog binding. */
export function pickAnatomicalTarget(
  root: THREE.Object3D,
  raycaster: THREE.Raycaster,
  catalog: AnatomicalCatalog = ANATOMICAL_CATALOG,
): AnatomicalPickTarget | undefined {
  for (const intersection of raycaster.intersectObject(root, true)) {
    let cursor: THREE.Object3D | null = intersection.object;
    let visible = true;
    while (cursor) {
      if (!cursor.visible) {
        visible = false;
        break;
      }
      if (cursor === root) break;
      cursor = cursor.parent;
    }
    if (!visible) continue;
    const entry = anatomicalEntryOf(intersection.object, catalog);
    if (entry) {
      return {
        entry,
        object: intersection.object,
        point: intersection.point.clone(),
        provenance: visualProvenanceOf(intersection.object),
      };
    }
  }
  return undefined;
}

/** Resolves only the catalog entry for callers that do not need render context. */
export function pickAnatomicalEntry(
  root: THREE.Object3D,
  raycaster: THREE.Raycaster,
  catalog: AnatomicalCatalog = ANATOMICAL_CATALOG,
): AnatomicalCatalogEntry | undefined {
  return pickAnatomicalTarget(root, raycaster, catalog)?.entry;
}

/** Audits direct per-object catalog bindings and explicit non-anatomical boundaries. */
export function auditAnatomicalScene(
  root: THREE.Object3D,
  catalog: AnatomicalCatalog = ANATOMICAL_CATALOG,
): AnatomicalSceneAudit {
  let totalRenderableObjects = 0;
  let boundObjects = 0;
  let explicitlyNonAnatomicalObjects = 0;
  const referenced = new Set<string>();
  const missingDeclarations: string[] = [];
  const unknownEntryIds: string[] = [];
  const missingEvidence: string[] = [];
  root.traverse((object) => {
    if (!("material" in object)) return;
    totalRenderableObjects += 1;
    const name = object.name || object.type;
    const declaration = anatomicalDeclarationOf(object);
    if (!declaration) {
      missingDeclarations.push(name);
      return;
    }
    if (declaration.kind === "not-anatomical") {
      explicitlyNonAnatomicalObjects += 1;
      return;
    }
    const entry = anatomicalEntryById(declaration.entryId, catalog);
    if (!entry) {
      unknownEntryIds.push(declaration.entryId);
      return;
    }
    boundObjects += 1;
    referenced.add(entry.id);
    if (!entry.evidence.claim || entry.evidence.limitations.length === 0) {
      missingEvidence.push(entry.id);
    }
  });
  missingDeclarations.sort();
  unknownEntryIds.sort();
  missingEvidence.sort();
  return {
    totalRenderableObjects,
    boundObjects,
    explicitlyNonAnatomicalObjects,
    catalogEntriesReferenced: referenced.size,
    missingDeclarations,
    unknownEntryIds,
    missingEvidence,
    contractReady: totalRenderableObjects > 0 &&
      boundObjects + explicitlyNonAnatomicalObjects === totalRenderableObjects &&
      missingDeclarations.length === 0 &&
      unknownEntryIds.length === 0 &&
      missingEvidence.length === 0,
  };
}
