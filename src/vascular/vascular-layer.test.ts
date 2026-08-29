import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  anatomicalDeclarationOf,
  auditAnatomicalScene,
} from "../render/anatomical-provenance";
import {
  isExcludedFromSelectiveBloom,
  visualClippingParticipationOf,
  visualProvenanceOf,
  visualSemanticBindingOf,
} from "../render/render-types";
import {
  VASCULAR_REALISTIC_ILLUSTRATIVE_MANIFEST,
  VASCULAR_VIEW_DRAW_BUDGETS,
  VascularTopologyModule,
} from "./vascular-layer";

describe("R10-B vascular topology layer", () => {
  it("builds each view once inside the declared draw budget", () => {
    const module = new VascularTopologyModule();
    const roots = {
      overview: new THREE.Group(),
      laminar: new THREE.Group(),
      cell: new THREE.Group(),
      neuron: new THREE.Group(),
      electricity: new THREE.Group(),
      synapse: new THREE.Group(),
    };
    for (const [view, root] of Object.entries(roots)) {
      module.attach(view as keyof typeof roots, root);
    }
    const audit = module.audit();
    expect(audit.contractReady).toBe(true);
    expect(audit.totalDrawCalls).toBeLessThanOrEqual(17);
    expect(audit.geometryBuilds).toBe(audit.totalDrawCalls);
    for (const [view, report] of Object.entries(audit.views)) {
      expect(report.drawCalls).toBeLessThanOrEqual(
        VASCULAR_VIEW_DRAW_BUDGETS[view as keyof typeof roots],
      );
      expect(report.topologyObjects).toBe(report.renderableObjects);
      expect(report.stateObjects).toBe(0);
      expect(report.animatedObjects).toBe(0);
    }
    const before = module.audit().geometryBuilds;
    module.setSkeletonMode(true);
    module.setSkeletonMode(false);
    expect(module.audit().geometryBuilds).toBe(before);
    module.dispose();
  });

  it("binds every renderable directly to the catalog and excludes it from bloom", () => {
    const module = new VascularTopologyModule();
    const root = new THREE.Group();
    module.attach("overview", root);
    const sceneAudit = auditAnatomicalScene(root);
    expect(sceneAudit.contractReady).toBe(true);
    root.traverse((object) => {
      if (!("material" in object)) return;
      expect(visualProvenanceOf(object)).toBe("topology");
      expect(visualSemanticBindingOf(object)).toBeUndefined();
      expect(anatomicalDeclarationOf(object)?.kind).toBe("catalog-entry");
      expect(visualClippingParticipationOf(object)).toBe("include");
      expect(isExcludedFromSelectiveBloom(object)).toBe(true);
      expect(object.matrixAutoUpdate).toBe(false);
    });
    module.dispose();
  });

  it("keeps the historical 25-object PBR manifest separate from 12 vascular entries", () => {
    const entries = Object.values(VASCULAR_REALISTIC_ILLUSTRATIVE_MANIFEST).flat();
    expect(entries).toHaveLength(12);
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(12);
    expect(entries.every((entry) => entry.surface === "membrane")).toBe(true);
    expect(entries.every((entry) => entry.materialRegion === "vascular")).toBe(true);
  });

  it("disposes every owned geometry and material exactly once", () => {
    const module = new VascularTopologyModule();
    const root = new THREE.Group();
    module.attach("synapse", root);
    const resources: Array<THREE.BufferGeometry | THREE.Material> = [];
    root.traverse((object) => {
      const renderable = object as THREE.Object3D & {
        geometry?: THREE.BufferGeometry;
        material?: THREE.Material;
      };
      if (renderable.geometry) resources.push(renderable.geometry);
      if (renderable.material) resources.push(renderable.material);
    });
    const disposeCounts = new Map(resources.map((resource) => [resource.uuid, 0]));
    for (const resource of resources) {
      resource.addEventListener("dispose", () => {
        disposeCounts.set(resource.uuid, (disposeCounts.get(resource.uuid) ?? 0) + 1);
      });
    }
    module.dispose();
    module.dispose();
    expect([...disposeCounts.values()].every((count) => count === 1)).toBe(true);
    expect(root.children).toHaveLength(0);
  });

  it("keeps the exact raycast object and point for a vascular focus marker", () => {
    const module = new VascularTopologyModule();
    const root = new THREE.Group();
    module.attach("synapse", root);
    root.updateMatrixWorld(true);

    const pericyte = root.getObjectByName("vascular-synapse-pericyte") as THREE.Mesh;
    expect(pericyte).toBeInstanceOf(THREE.Mesh);
    root.traverse((object) => {
      if (object !== pericyte && "material" in object) object.visible = false;
    });
    root.updateMatrixWorld(true);

    const vertex = new THREE.Vector3().fromBufferAttribute(
      pericyte.geometry.getAttribute("position"),
      0,
    );
    const point = pericyte.localToWorld(vertex);
    const center = pericyte.getWorldPosition(new THREE.Vector3());
    const outward = point.clone().sub(center).normalize();
    const raycaster = new THREE.Raycaster(
      point.clone().addScaledVector(outward, 1),
      outward.negate(),
    );

    expect(module.pickTarget("synapse", raycaster)).toMatchObject({
      entry: { id: "brain-pro:anatomy/pericyte" },
      object: pericyte,
    });
    expect(module.pick("synapse", raycaster)?.id).toBe("brain-pro:anatomy/pericyte");
    module.dispose();
  });
});
