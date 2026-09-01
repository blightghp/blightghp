import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { ANATOMY_IDS } from "../anatomy";
import { declareAnatomicalBinding } from "./anatomical-provenance";
import { SelectionHighlightController } from "./selection-highlight";
import { declareVisual } from "./render-types";

function disposeTree(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (!("geometry" in object) || !("material" in object)) return;
    const renderable = object as THREE.Object3D & {
      geometry: THREE.BufferGeometry;
      material: THREE.Material | THREE.Material[];
    };
    renderable.geometry.dispose();
    const materials = Array.isArray(renderable.material)
      ? renderable.material
      : [renderable.material];
    materials.forEach((material) => material.dispose());
  });
}

describe("SelectionHighlightController", () => {
  it("targets only visible renderables with their own catalog binding and visual provenance", () => {
    const root = new THREE.Group();
    const inheritedBinding = new THREE.Group();
    declareAnatomicalBinding(inheritedBinding, ANATOMY_IDS.soma);
    const inheritedChild = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    inheritedChild.name = "inherited-child";
    declareVisual(inheritedChild, "matter", "topology");
    inheritedBinding.add(inheritedChild);

    const selected = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    selected.name = "direct-soma";
    declareAnatomicalBinding(selected, ANATOMY_IDS.soma);
    declareVisual(selected, "matter", "state");

    const hiddenAncestor = new THREE.Group();
    hiddenAncestor.visible = false;
    const hidden = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    declareAnatomicalBinding(hidden, ANATOMY_IDS.soma);
    declareVisual(hidden, "matter", "topology");
    hiddenAncestor.add(hidden);

    const unprovenanced = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    declareAnatomicalBinding(unprovenanced, ANATOMY_IDS.soma);
    root.add(inheritedBinding, selected, hiddenAncestor, unprovenanced);

    const controller = new SelectionHighlightController();
    expect(controller.setSelection(ANATOMY_IDS.soma, root)).toMatchObject({
      status: "ready",
      targetCount: 1,
      highlightedMaterials: 1,
    });
    expect(controller.targets()).toEqual([
      expect.objectContaining({
        entryId: ANATOMY_IDS.soma,
        objectName: "direct-soma",
        directBinding: true,
        provenance: "state",
      }),
    ]);
    disposeTree(root);
  });

  it("keeps material identity and restores emissive presentation state exactly", () => {
    const material = new THREE.MeshStandardMaterial({
      color: 0x446688,
      emissive: 0x112233,
      emissiveIntensity: 0.19,
    });
    const originalEmissive = material.emissive.toArray();
    const originalIntensity = material.emissiveIntensity;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
    declareAnatomicalBinding(mesh, ANATOMY_IDS.soma);
    declareVisual(mesh, "matter", "state");
    const clone = vi.spyOn(material, "clone");
    const controller = new SelectionHighlightController({
      emissiveColor: 0xff9900,
      emissiveIntensity: 0.91,
    });

    controller.setSelection(ANATOMY_IDS.soma, mesh);
    controller.beforeRender();
    expect(mesh.material).toBe(material);
    expect(material.emissive.getHex()).toBe(0xff9900);
    expect(material.emissiveIntensity).toBe(0.91);
    expect(controller.audit()).toMatchObject({
      materialAllocations: 0,
      renderActive: true,
      emissiveMaterials: 1,
    });
    expect(clone).not.toHaveBeenCalled();

    controller.afterRender();
    expect(mesh.material).toBe(material);
    expect(material.emissive.toArray()).toEqual(originalEmissive);
    expect(material.emissiveIntensity).toBe(originalIntensity);
    expect(controller.audit().renderActive).toBe(false);
    expect(clone).not.toHaveBeenCalled();
    mesh.geometry.dispose();
    material.dispose();
  });

  it("preserves state-only MeshBasic and Line colors and reports a textual fallback", () => {
    const root = new THREE.Group();
    const basicMaterial = new THREE.MeshBasicMaterial({ color: 0x2f75a1 });
    const basic = new THREE.Mesh(new THREE.BoxGeometry(), basicMaterial);
    declareAnatomicalBinding(basic, ANATOMY_IDS.soma);
    declareVisual(basic, "matter", "state");
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xc76d45 });
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-1, 0, 0),
        new THREE.Vector3(1, 0, 0),
      ]),
      lineMaterial,
    );
    declareAnatomicalBinding(line, ANATOMY_IDS.soma);
    declareVisual(line, "matter", "state");
    root.add(basic, line);
    const basicColor = basicMaterial.color.getHex();
    const lineColor = lineMaterial.color.getHex();

    const controller = new SelectionHighlightController();
    expect(controller.setSelection(ANATOMY_IDS.soma, root)).toMatchObject({
      status: "ready",
      targetCount: 2,
      highlightedMaterials: 0,
      textualFallbackMaterials: 2,
      materialAllocations: 0,
    });
    expect(controller.targets().every((target) => target.treatment === "textual-fallback")).toBe(true);
    controller.beforeRender();
    expect(basicMaterial.color.getHex()).toBe(basicColor);
    expect(lineMaterial.color.getHex()).toBe(lineColor);
    controller.afterRender();
    expect(basicMaterial.color.getHex()).toBe(basicColor);
    expect(lineMaterial.color.getHex()).toBe(lineColor);
    disposeTree(root);
  });

  it("treats unknown entries and known entries without direct matches as safe no-ops", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    declareAnatomicalBinding(mesh, ANATOMY_IDS.soma);
    declareVisual(mesh, "matter", "topology");
    const controller = new SelectionHighlightController();

    expect(controller.setSelection("brain-pro:anatomy/not-in-catalog", mesh)).toEqual({
      entryId: "brain-pro:anatomy/not-in-catalog",
      status: "unknown-entry",
      targetCount: 0,
      highlightedMaterials: 0,
      emissiveMaterials: 0,
      rimMaterials: 0,
      textualFallbackMaterials: 0,
      materialAllocations: 0,
      renderActive: false,
    });
    controller.beforeRender();
    controller.afterRender();

    expect(controller.setSelection(ANATOMY_IDS.axon, mesh)).toMatchObject({
      entryId: ANATOMY_IDS.axon,
      status: "no-match",
      targetCount: 0,
      highlightedMaterials: 0,
      materialAllocations: 0,
    });
    controller.beforeRender();
    controller.afterRender();
    mesh.geometry.dispose();
    mesh.material.dispose();
  });
});
