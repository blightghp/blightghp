import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { CellRenderLayer } from "./cell-layer";
import { ElectricalBoardLayer } from "./electrical-board-layer";
import { LaminarRenderLayer } from "./laminar-layer";
import {
  PresentationMaterialEffects,
  REALISTIC_ILLUSTRATIVE_MANIFEST,
  RealisticIllustrativeMaterialManager,
} from "./material-profile";
import { NeuronRenderLayer } from "./neuron-layer";
import {
  auditVisualMaterialReadiness,
  declareVisual,
  visualSemanticBindingOf,
} from "./render-types";
import { SynapseRenderLayer } from "./synapse-layer";

describe("R09-F realistic-illustrative material manager", () => {
  it("swaps only bounded matter while preserving geometry, bindings and emission", () => {
    const scene = new THREE.Scene();
    const laminar = new LaminarRenderLayer();
    const cell = new CellRenderLayer();
    const neuron = new NeuronRenderLayer(19);
    const electricity = new ElectricalBoardLayer();
    const synapse = new SynapseRenderLayer();
    const manager = new RealisticIllustrativeMaterialManager(scene);
    const registrations = [
      ["laminar", laminar.group, REALISTIC_ILLUSTRATIVE_MANIFEST.laminar],
      ["cell", cell.group, REALISTIC_ILLUSTRATIVE_MANIFEST.cell],
      ["neuron", neuron.group, REALISTIC_ILLUSTRATIVE_MANIFEST.neuron],
      ["electricity", electricity.group, REALISTIC_ILLUSTRATIVE_MANIFEST.electricity],
      ["synapse", synapse.group, REALISTIC_ILLUSTRATIVE_MANIFEST.synapse],
    ] as const;
    const geometryIds = new Map<string, string>();
    const bindings = new Map<string, ReturnType<typeof visualSemanticBindingOf>>();
    const schematicMaterials = new Map<string, THREE.Material | THREE.Material[]>();
    for (const [view, root, manifest] of registrations) {
      for (const entry of manifest) {
        const object = root.getObjectByName(entry.objectName) as THREE.Mesh;
        geometryIds.set(entry.id, object.geometry.uuid);
        bindings.set(entry.id, visualSemanticBindingOf(object));
        schematicMaterials.set(entry.id, object.material);
      }
      manager.registerLayer(view, root, manifest);
    }
    const emission = laminar.group.getObjectByName("axonal-pulse-0") as THREE.Mesh;
    const emissionMaterial = emission.material;

    expect(manager.setProfile("realistic-illustrative")).toBe("realistic-illustrative");
    for (const [, root, manifest] of registrations) {
      for (const entry of manifest) {
        const object = root.getObjectByName(entry.objectName) as THREE.Mesh;
        expect(object.material).toBeInstanceOf(THREE.MeshPhysicalMaterial);
        expect(object.geometry.uuid).toBe(geometryIds.get(entry.id));
        expect(visualSemanticBindingOf(object)).toEqual(bindings.get(entry.id));
      }
      const report = auditVisualMaterialReadiness(root);
      expect(report.activeProfile).toBe("realistic-illustrative");
      expect(report.physicalMaterialObjects).toBe(report.boundedPbrObjects);
    }
    expect(emission.material).toBe(emissionMaterial);
    expect(manager.audit()).toMatchObject({
      eligibleObjects: 21,
      physicalMaterialObjects: 21,
      semanticGeometryChanges: 0,
      estimatedAdditionalObjectDraws: 0,
      estimatedTransmissionPasses: 1,
    });

    expect(manager.setProfile("schematic")).toBe("schematic");
    for (const [, root, manifest] of registrations) {
      for (const entry of manifest) {
        const object = root.getObjectByName(entry.objectName) as THREE.Mesh;
        expect(object.material).toBe(schematicMaterials.get(entry.id));
      }
    }

    manager.dispose();
    laminar.dispose();
    cell.dispose();
    neuron.dispose();
    electricity.dispose();
    synapse.dispose();
  });

  it("falls back atomically for high contrast and context loss", () => {
    const scene = new THREE.Scene();
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x44aaff, transparent: true, opacity: 0.7 }),
    );
    mesh.name = "bounded-matter";
    declareVisual(mesh, "matter", "topology");
    root.add(mesh);
    const schematic = mesh.material;
    const manager = new RealisticIllustrativeMaterialManager(scene);
    manager.registerLayer("overview", root, [{
      id: "test:bounded-matter",
      objectName: mesh.name,
      surface: "membrane",
      maximumLocalRadius: 0.5,
      opacityRange: [0.2, 0.8],
      source: "procedural-scene-graph",
    }]);
    manager.setProfile("realistic-illustrative");
    const physical = mesh.material as unknown as THREE.MeshPhysicalMaterial;
    const dispose = vi.spyOn(physical, "dispose");

    manager.setEnvironment({ highContrast: true });
    expect(mesh.material).toBe(schematic);
    expect(manager.audit()).toMatchObject({
      activeProfile: "schematic",
      requestedProfile: "realistic-illustrative",
      fallbackReason: "high-contrast-requires-schematic",
    });
    manager.setEnvironment({ highContrast: false });
    expect(mesh.material).toBe(physical);
    manager.failAtomic("webgl-context-lost");
    expect(mesh.material).toBe(schematic);
    expect(manager.audit()).toMatchObject({
      activeProfile: "schematic",
      requestedProfile: "schematic",
      fallbackReason: "webgl-context-lost",
    });

    manager.dispose();
    expect(dispose).toHaveBeenCalledOnce();
    mesh.geometry.dispose();
    schematic.dispose();
  });

  it("restores opacity and depth state exactly after presentation effects", () => {
    const root = new THREE.Group();
    const matter = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshBasicMaterial({ opacity: 0.8, transparent: true, depthWrite: true }),
    );
    const emission = new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.PointsMaterial({ opacity: 0.6, transparent: true, depthWrite: false }),
    );
    declareVisual(matter, "matter", "topology");
    declareVisual(emission, "emission", "state", {
      field: "test",
      unit: "normalized",
      transform: "identity",
      redundancy: ["position"],
    });
    root.add(matter, emission);
    const effects = new PresentationMaterialEffects();
    effects.setState({ opacity: 0.5, xray: true, isolateMatter: true });
    effects.beforeRender(root);
    expect((matter.material as THREE.Material).opacity).toBeCloseTo(0.8 * 0.5 * 0.28);
    expect((matter.material as THREE.Material).depthWrite).toBe(false);
    expect((emission.material as THREE.Material).opacity).toBeCloseTo(0.6 * 0.16);
    effects.afterRender();
    expect((matter.material as THREE.Material).opacity).toBe(0.8);
    expect((matter.material as THREE.Material).depthWrite).toBe(true);
    expect((emission.material as THREE.Material).opacity).toBe(0.6);
    expect((emission.material as THREE.Material).depthWrite).toBe(false);
    matter.geometry.dispose();
    matter.material.dispose();
    emission.geometry.dispose();
    emission.material.dispose();
  });
});
