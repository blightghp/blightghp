import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { AnatomicalCatalogEntry, AnatomyView } from "../anatomy";
import { anatomicalEntryById } from "../anatomy";
import { declareAnatomicalBinding } from "../render/anatomical-provenance";
import {
  declareClippingParticipation,
  declareVascularTopologyObject,
  declareVisual,
  excludeFromSelectiveBloom,
  visualProvenanceOf,
} from "../render/render-types";
import { VISUAL_COLORS } from "../render/visual-tokens";
import type { RealisticIllustrativeManifest } from "../render/material-profile";
import {
  VASCULAR_TOPOLOGY,
  auditVascularTopology,
  vascularSegmentsForCatalogId,
} from "./vascular-topology";
import type {
  VascularClass,
  VascularSegment,
  VascularTopology,
} from "./vascular-topology";

export type VascularView = Exclude<AnatomyView, "electricity"> | "electricity";

export const VASCULAR_VIEW_DRAW_BUDGETS: Readonly<Record<VascularView, number>> = {
  overview: 6,
  laminar: 3,
  cell: 2,
  neuron: 1,
  synapse: 5,
  electricity: 0,
};

function materialEntry(
  objectName: string,
  maximumLocalRadius: number,
): RealisticIllustrativeManifest["overview"][number] {
  return {
    id: `r10-b:${objectName}`,
    objectName,
    surface: "membrane",
    maximumLocalRadius,
    opacityRange: [0, 1],
    source: "procedural-scene-graph",
    materialRegion: "vascular",
  };
}

/** Incremental PBR eligibility for the static vascular overlay (12 objects). */
export const VASCULAR_REALISTIC_ILLUSTRATIVE_MANIFEST: RealisticIllustrativeManifest = {
  overview: [
    materialEntry("vascular-overview-arterial", 3.2),
    materialEntry("vascular-overview-venous", 3.2),
    materialEntry("vascular-overview-direction-cues", 0.2),
  ],
  laminar: [
    materialEntry("vascular-laminar-arterial", 0.6),
    materialEntry("vascular-laminar-venous", 0.6),
  ],
  cell: [
    materialEntry("vascular-cell-arterial", 1.5),
    materialEntry("vascular-cell-capillary", 1.5),
  ],
  neuron: [materialEntry("vascular-neuron-capillary", 1.5)],
  electricity: [],
  synapse: [
    materialEntry("vascular-synapse-endothelium", 1.2),
    materialEntry("vascular-synapse-pericyte", 0.5),
    materialEntry("vascular-synapse-astrocyte-endfoot", 0.5),
    materialEntry("vascular-synapse-blood-brain-barrier", 0.8),
  ],
};

export interface VascularEncoding {
  readonly class: VascularClass;
  readonly shape: "circular-tapered" | "flattened-uniform" | "filament" | "component";
  readonly pattern: "static-chevron" | "double-contour" | "dotted" | "labeled-component";
  readonly label: string;
}

export interface VascularViewAudit {
  readonly drawCalls: number;
  readonly maximumDrawCalls: number;
  readonly triangles: number;
  readonly geometryBytes: number;
  readonly renderableObjects: number;
  readonly topologyObjects: number;
  readonly stateObjects: number;
  readonly animatedObjects: number;
  readonly contractReady: boolean;
}

export interface VascularLayerAudit {
  readonly topology: ReturnType<typeof auditVascularTopology>;
  readonly views: Readonly<Record<VascularView, VascularViewAudit>>;
  readonly totalDrawCalls: number;
  readonly maximumTotalDrawCalls: 17;
  readonly geometryBuilds: number;
  readonly skeletonMode: boolean;
  readonly contractReady: boolean;
}

interface PickRecord {
  readonly object: THREE.Object3D;
  readonly resolve: (intersection: THREE.Intersection) => string | undefined;
}

const VIEW_NAMES: readonly VascularView[] = [
  "overview",
  "laminar",
  "cell",
  "neuron",
  "electricity",
  "synapse",
];

function encodingFor(vascularClass: VascularClass): VascularEncoding {
  if (vascularClass === "arterial") {
    return {
      class: vascularClass,
      shape: "circular-tapered",
      pattern: "static-chevron",
      label: "A · arterial",
    };
  }
  if (vascularClass === "venous") {
    return {
      class: vascularClass,
      shape: "flattened-uniform",
      pattern: "double-contour",
      label: "V · venoso",
    };
  }
  return {
    class: vascularClass,
    shape: "filament",
    pattern: "dotted",
    label: "C · capilar",
  };
}

function colorFor(vascularClass: VascularClass): number {
  if (vascularClass === "arterial") return VISUAL_COLORS.vascularArterial;
  if (vascularClass === "venous") return VISUAL_COLORS.vascularVenous;
  return VISUAL_COLORS.vascularCapillary;
}

function meshMaterial(vascularClass: VascularClass): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({
    color: colorFor(vascularClass),
    transparent: true,
    opacity: vascularClass === "capillary" ? 0.78 : 0.9,
    depthWrite: true,
  });
  material.name = `vascular-${vascularClass}-schematic`;
  return material;
}

function pointsFor(segment: VascularSegment): THREE.Vector3[] {
  return segment.controlPoints.map(([x, y, z]) => new THREE.Vector3(x, y, z));
}

function taperedTubeGeometry(segment: VascularSegment): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pointsFor(segment), false, "centripetal");
  const tubularSegments = Math.max(6, (segment.controlPoints.length - 1) * 5);
  const radialSegments = segment.class === "arterial" ? 8 : segment.class === "venous" ? 6 : 5;
  const baseRadius = (segment.radiusProfile[0] + segment.radiusProfile[1]) * 0.5;
  const geometry = new THREE.TubeGeometry(
    curve,
    tubularSegments,
    baseRadius,
    radialSegments,
    false,
  );
  const positions = geometry.getAttribute("position");
  const center = new THREE.Vector3();
  const position = new THREE.Vector3();
  const ringSize = radialSegments + 1;
  for (let ring = 0; ring <= tubularSegments; ring += 1) {
    const fraction = ring / tubularSegments;
    curve.getPointAt(fraction, center);
    const radius = THREE.MathUtils.lerp(
      segment.radiusProfile[0],
      segment.radiusProfile[1],
      fraction,
    );
    const ratio = radius / baseRadius;
    for (let radial = 0; radial < ringSize; radial += 1) {
      const index = ring * ringSize + radial;
      position.fromBufferAttribute(positions, index);
      position.sub(center).multiplyScalar(ratio).add(center);
      if (segment.class === "venous") position.y = center.y + (position.y - center.y) * 0.7;
      positions.setXYZ(index, position.x, position.y, position.z);
    }
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function mergedTubes(segments: readonly VascularSegment[]): THREE.BufferGeometry {
  const geometries = segments.map(taperedTubeGeometry);
  const merged = mergeGeometries(geometries, true);
  for (const geometry of geometries) geometry.dispose();
  if (!merged) throw new Error("vascular tube merge failed");
  merged.computeBoundingSphere();
  return merged;
}

function geometryBytes(geometry: THREE.BufferGeometry): number {
  let bytes = geometry.index?.array.byteLength ?? 0;
  for (const attribute of Object.values(geometry.attributes)) bytes += attribute.array.byteLength;
  return bytes;
}

function trianglesFor(object: THREE.Object3D & { geometry?: THREE.BufferGeometry }): number {
  if (!object.geometry) return 0;
  const count = object.geometry.index?.count ?? object.geometry.getAttribute("position")?.count ?? 0;
  const instances = object instanceof THREE.InstancedMesh ? object.count : 1;
  return Math.floor(count / 3) * instances;
}

function prepareVascularObject(
  object: THREE.Object3D,
  catalogId: string,
  encoding: VascularEncoding,
): void {
  declareVisual(object, "matter", "topology");
  declareAnatomicalBinding(object, catalogId);
  declareClippingParticipation(object, "include");
  excludeFromSelectiveBloom(object);
  declareVascularTopologyObject(object);
  object.userData.vascularEncoding = encoding;
  object.userData.vascularAnimated = false;
  object.castShadow = false;
  object.receiveShadow = false;
  object.updateMatrix();
  object.matrixAutoUpdate = false;
}

function segmentForInstance(
  segments: readonly VascularSegment[],
  intersection: THREE.Intersection,
): string | undefined {
  const instanceId = intersection.instanceId;
  return instanceId === undefined ? undefined : segments[instanceId]?.catalogId;
}

function segmentForFace(
  object: THREE.Object3D,
  segments: readonly VascularSegment[],
  intersection: THREE.Intersection,
): string | undefined {
  if (!(object instanceof THREE.Mesh) || intersection.faceIndex == null) return undefined;
  const indexOffset = intersection.faceIndex * 3;
  const groupIndex = object.geometry.groups.findIndex(
    (group: { start: number; count: number }) =>
      indexOffset >= group.start && indexOffset < group.start + group.count,
  );
  return groupIndex < 0 ? undefined : segments[groupIndex]?.catalogId;
}

/** Returns true only for renderables owned by the static vascular topology layer. */
export function isVascularRenderable(object: THREE.Object3D): boolean {
  return object.userData.vascularTopology === true;
}

/** Static, procedural vascular overlay shared by the six existing view roots. */
export class VascularTopologyModule {
  private readonly groups = new Map<VascularView, THREE.Group>();
  private readonly pickRecords = new Map<VascularView, PickRecord[]>();
  private geometryBuilds = 0;
  private skeletonMode = false;
  private disposed = false;

  constructor(private readonly topology: VascularTopology = VASCULAR_TOPOLOGY) {
    const audit = auditVascularTopology(topology);
    if (!audit.contractReady) {
      throw new Error(`invalid vascular topology: ${audit.issues.map((issue) => issue.code).join(",")}`);
    }
  }

  /** Attaches one static vascular subgroup to an existing simulation view root. */
  attach(view: VascularView, root: THREE.Group): THREE.Group {
    if (this.disposed) throw new Error("vascular topology module is disposed");
    if (this.groups.has(view)) throw new Error(`vascular view already attached: ${view}`);
    const group = new THREE.Group();
    group.name = `vascular-${view}`;
    group.userData.vascularTopologyRoot = true;
    group.matrixAutoUpdate = false;
    root.add(group);
    this.groups.set(view, group);
    this.pickRecords.set(view, []);
    if (view === "overview") this.buildOverview(group);
    if (view === "laminar") this.buildLaminar(group);
    if (view === "cell") this.buildMergedClasses(view, group, ["arterial", "capillary"]);
    if (view === "neuron") {
      this.buildMergedClasses(view, group, ["capillary"]);
      group.visible = false;
    }
    if (view === "synapse") this.buildNeurovascularUnit(group);
    return group;
  }

  /** Resolves a raycast hit to the same catalog identity used by the anatomy tree. */
  pick(view: VascularView, raycaster: THREE.Raycaster): AnatomicalCatalogEntry | undefined {
    const records = this.pickRecords.get(view) ?? [];
    const objects = records.map((record) => record.object).filter((object) => object.visible);
    for (const intersection of raycaster.intersectObjects(objects, false)) {
      const record = records.find((candidate) => candidate.object === intersection.object);
      const catalogId = record?.resolve(intersection);
      if (!catalogId) continue;
      const entry = anatomicalEntryById(catalogId);
      if (entry) return entry;
    }
    return undefined;
  }

  /** Applies the presentation-only skeleton preference; neuron context remains opt-in. */
  setSkeletonMode(enabled: boolean): void {
    this.skeletonMode = enabled;
    const neuron = this.groups.get("neuron");
    if (neuron) neuron.visible = enabled;
  }

  /** Returns immutable scene cost and provenance evidence for every view. */
  audit(): VascularLayerAudit {
    const views = {} as Record<VascularView, VascularViewAudit>;
    let totalDrawCalls = 0;
    for (const view of VIEW_NAMES) {
      let drawCalls = 0;
      let triangles = 0;
      let ownedGeometryBytes = 0;
      let topologyObjects = 0;
      let stateObjects = 0;
      let animatedObjects = 0;
      const geometries = new Set<THREE.BufferGeometry>();
      this.groups.get(view)?.traverse((object) => {
        if (!("material" in object)) return;
        drawCalls += 1;
        const renderable = object as THREE.Object3D & { geometry?: THREE.BufferGeometry };
        triangles += trianglesFor(renderable);
        if (renderable.geometry) geometries.add(renderable.geometry);
        if (visualProvenanceOf(object) === "topology") topologyObjects += 1;
        if (visualProvenanceOf(object) === "state") stateObjects += 1;
        if (object.userData.vascularAnimated === true) animatedObjects += 1;
      });
      for (const geometry of geometries) ownedGeometryBytes += geometryBytes(geometry);
      totalDrawCalls += drawCalls;
      views[view] = {
        drawCalls,
        maximumDrawCalls: VASCULAR_VIEW_DRAW_BUDGETS[view],
        triangles,
        geometryBytes: ownedGeometryBytes,
        renderableObjects: drawCalls,
        topologyObjects,
        stateObjects,
        animatedObjects,
        contractReady: drawCalls <= VASCULAR_VIEW_DRAW_BUDGETS[view] &&
          topologyObjects === drawCalls && stateObjects === 0 && animatedObjects === 0,
      };
    }
    return {
      topology: auditVascularTopology(this.topology),
      views,
      totalDrawCalls,
      maximumTotalDrawCalls: 17,
      geometryBuilds: this.geometryBuilds,
      skeletonMode: this.skeletonMode,
      contractReady: totalDrawCalls <= 17 &&
        Object.values(views).every((view) => view.contractReady),
    };
  }

  /** Releases every geometry and material owned by the vascular overlay. */
  dispose(): void {
    if (this.disposed) return;
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    for (const group of this.groups.values()) {
      group.traverse((object) => {
        const renderable = object as THREE.Object3D & {
          geometry?: THREE.BufferGeometry;
          material?: THREE.Material | THREE.Material[];
        };
        if (renderable.geometry) geometries.add(renderable.geometry);
        if (Array.isArray(renderable.material)) {
          for (const material of renderable.material) materials.add(material);
        } else if (renderable.material) materials.add(renderable.material);
      });
      group.removeFromParent();
    }
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    this.groups.clear();
    this.pickRecords.clear();
    this.disposed = true;
  }

  private segments(view: VascularView, vascularClass: VascularClass): readonly VascularSegment[] {
    if (view === "electricity") return [];
    return this.topology.segments.filter(
      (segment) => segment.class === vascularClass && segment.views.includes(view),
    );
  }

  private buildOverview(group: THREE.Group): void {
    this.buildMergedClasses("overview", group, ["arterial", "venous"]);
    const segments = this.segments("overview", "arterial").filter(
      (segment) => segment.directionCue === "chevron",
    );
    const geometry = new THREE.ConeGeometry(0.035, 0.1, 5);
    const material = meshMaterial("arterial");
    const cues = new THREE.InstancedMesh(geometry, material, segments.length);
    cues.name = "vascular-overview-direction-cues";
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
    const scale = new THREE.Vector3(1, 1, 1);
    for (let index = 0; index < segments.length; index += 1) {
      const points = segments[index].controlPoints;
      const middle = points[Math.floor(points.length / 2)];
      matrix.compose(new THREE.Vector3(...middle), quaternion, scale);
      cues.setMatrixAt(index, matrix);
    }
    cues.instanceMatrix.needsUpdate = true;
    prepareVascularObject(cues, "brain-pro:anatomy/circle-of-willis", encodingFor("arterial"));
    group.add(cues);
    this.geometryBuilds += 1;
    this.pickRecords.get("overview")?.push({
      object: cues,
      resolve: (intersection) => segmentForInstance(segments, intersection),
    });
  }

  private buildLaminar(group: THREE.Group): void {
    for (const vascularClass of ["arterial", "venous"] as const) {
      const segments = this.segments("laminar", vascularClass);
      if (segments.length === 0) continue;
      const representative = segments[0];
      const height = 1;
      const geometry = new THREE.CylinderGeometry(
        representative.radiusProfile[1],
        representative.radiusProfile[0],
        height,
        vascularClass === "arterial" ? 8 : 6,
      );
      const object = new THREE.InstancedMesh(geometry, meshMaterial(vascularClass), segments.length);
      object.name = `vascular-laminar-${vascularClass}`;
      const matrix = new THREE.Matrix4();
      const midpoint = new THREE.Vector3();
      const direction = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();
      const up = new THREE.Vector3(0, 1, 0);
      const scale = new THREE.Vector3(1, 1, 1);
      for (let index = 0; index < segments.length; index += 1) {
        const first = new THREE.Vector3(...segments[index].controlPoints[0]);
        const controlPoints = segments[index].controlPoints;
        const last = new THREE.Vector3(...controlPoints[controlPoints.length - 1]);
        midpoint.copy(first).add(last).multiplyScalar(0.5);
        direction.copy(last).sub(first);
        quaternion.setFromUnitVectors(up, direction.clone().normalize());
        scale.set(1, direction.length(), vascularClass === "venous" ? 0.7 : 1);
        matrix.compose(midpoint, quaternion, scale);
        object.setMatrixAt(index, matrix);
      }
      object.instanceMatrix.needsUpdate = true;
      prepareVascularObject(object, representative.catalogId, encodingFor(vascularClass));
      group.add(object);
      this.geometryBuilds += 1;
      this.pickRecords.get("laminar")?.push({
        object,
        resolve: (intersection) => segmentForInstance(segments, intersection),
      });
    }
  }

  private buildMergedClasses(
    view: "overview" | "cell" | "neuron",
    group: THREE.Group,
    classes: readonly VascularClass[],
  ): void {
    for (const vascularClass of classes) {
      const segments = this.segments(view, vascularClass);
      if (segments.length === 0) continue;
      const object = new THREE.Mesh(mergedTubes(segments), meshMaterial(vascularClass));
      object.name = `vascular-${view}-${vascularClass}`;
      prepareVascularObject(object, segments[0].catalogId, encodingFor(vascularClass));
      group.add(object);
      this.geometryBuilds += 1;
      this.pickRecords.get(view)?.push({
        object,
        resolve: (intersection) => segmentForFace(object, segments, intersection),
      });
    }
  }

  private buildNeurovascularUnit(group: THREE.Group): void {
    const components: Array<{
      name: string;
      catalogId: string;
      geometry: THREE.BufferGeometry;
      color: number;
      position: THREE.Vector3;
      scale?: THREE.Vector3;
      rotation?: THREE.Euler;
    }> = [
      {
        name: "vascular-synapse-endothelium",
        catalogId: "brain-pro:anatomy/capillary-endothelium",
        geometry: new THREE.CylinderGeometry(0.23, 0.23, 2.1, 12, 1, true),
        color: VISUAL_COLORS.vascularCapillary,
        position: new THREE.Vector3(0, -0.88, 0),
        rotation: new THREE.Euler(0, 0, Math.PI / 2),
      },
      {
        name: "vascular-synapse-pericyte",
        catalogId: "brain-pro:anatomy/pericyte",
        geometry: new THREE.TorusGeometry(0.28, 0.07, 8, 18),
        color: VISUAL_COLORS.vascularVenous,
        position: new THREE.Vector3(0.18, -0.88, 0.1),
        rotation: new THREE.Euler(0, Math.PI / 2, 0),
      },
      {
        name: "vascular-synapse-astrocyte-endfoot",
        catalogId: "brain-pro:anatomy/astrocyte-endfoot",
        geometry: new THREE.SphereGeometry(0.28, 12, 8),
        color: VISUAL_COLORS.vascularArterial,
        position: new THREE.Vector3(-0.48, -0.62, 0.08),
        scale: new THREE.Vector3(1.5, 0.52, 1),
      },
      {
        name: "vascular-synapse-blood-brain-barrier",
        catalogId: "brain-pro:anatomy/blood-brain-barrier",
        geometry: new THREE.TorusGeometry(0.38, 0.022, 6, 24),
        color: VISUAL_COLORS.vascularCapillary,
        position: new THREE.Vector3(0, -0.88, 0),
        scale: new THREE.Vector3(1, 1.7, 1),
        rotation: new THREE.Euler(0, Math.PI / 2, 0),
      },
    ];
    for (const component of components) {
      const object = new THREE.Mesh(
        component.geometry,
        new THREE.MeshBasicMaterial({ color: component.color, transparent: true, opacity: 0.82 }),
      );
      object.name = component.name;
      object.position.copy(component.position);
      if (component.scale) object.scale.copy(component.scale);
      if (component.rotation) object.rotation.copy(component.rotation);
      prepareVascularObject(object, component.catalogId, {
        class: "capillary",
        shape: "component",
        pattern: "labeled-component",
        label: anatomicalEntryById(component.catalogId)?.label ?? component.catalogId,
      });
      group.add(object);
      this.geometryBuilds += 1;
      this.pickRecords.get("synapse")?.push({ object, resolve: () => component.catalogId });
    }
  }
}

/** Returns the first graph row associated with a catalog selection. */
export function vascularTopologyDetailsFor(
  catalogId: string,
): Readonly<{
  id: string;
  class: VascularClass;
  side: VascularSegment["side"];
  branchOrder: number;
  upstreamIds: readonly string[];
  downstreamIds: readonly string[];
  views: readonly string[];
}> | undefined {
  const segment = vascularSegmentsForCatalogId(catalogId)[0];
  if (segment) return {
    id: segment.id,
    class: segment.class,
    side: segment.side,
    branchOrder: segment.branchOrder,
    upstreamIds: segment.upstreamIds,
    downstreamIds: segment.downstreamIds,
    views: segment.views,
  };
  const neurovascularComponents = new Set([
    "brain-pro:anatomy/capillary-endothelium",
    "brain-pro:anatomy/pericyte",
    "brain-pro:anatomy/astrocyte-endfoot",
    "brain-pro:anatomy/blood-brain-barrier",
  ]);
  if (!neurovascularComponents.has(catalogId)) return undefined;
  return {
    id: `brain-pro:vascular/nvu-${catalogId.split("/").pop() ?? "component"}`,
    class: "capillary",
    side: "midline",
    branchOrder: 6,
    upstreamIds: ["brain-pro:vascular/capillary-bed-left", "brain-pro:vascular/capillary-bed-right"],
    downstreamIds: [],
    views: ["synapse"],
  };
}
