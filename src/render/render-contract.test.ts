import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { CellRenderLayer } from "./cell-layer";
import { LaminarRenderLayer } from "./laminar-layer";
import { SynapseRenderLayer } from "./synapse-layer";
import {
  auditVisualProvenance,
  auditVisualBindings,
  declareVisual,
  visualPassOf,
  visualProvenanceOf,
  visualSemanticBindingOf,
} from "./render-types";
import { projectionColorToken, VISUAL_COLORS } from "./visual-tokens";

function renderedObjects(root: THREE.Object3D): Array<THREE.Object3D & { material: THREE.Material }> {
  const objects: Array<THREE.Object3D & { material: THREE.Material }> = [];
  root.traverse((object) => {
    if ("material" in object && !Array.isArray(object.material)) {
      objects.push(object as THREE.Object3D & { material: THREE.Material });
    }
  });
  return objects;
}

describe("render presentation contract", () => {
  it("defaults undeclared objects to matter but never invents provenance", () => {
    const object = new THREE.Object3D();
    expect(visualPassOf(object)).toBe("matter");
    expect(visualProvenanceOf(object)).toBeUndefined();
    declareVisual(object, "emission", "state");
    expect(visualPassOf(object)).toBe("emission");
    expect(visualProvenanceOf(object)).toBe("state");
  });

  it("uses additive blending only for declared emission", () => {
    for (const layer of [
      new LaminarRenderLayer(),
      new CellRenderLayer(),
      new SynapseRenderLayer(),
    ]) {
      const objects = renderedObjects(layer.group);
      expect(objects.length).toBeGreaterThan(0);
      for (const object of objects) {
        expect(visualProvenanceOf(object)).toBeDefined();
        if (visualPassOf(object) === "emission") {
          expect(object.material.blending).toBe(THREE.AdditiveBlending);
          expect(object.material.depthWrite).toBe(false);
        } else {
          expect(object.material.blending).toBe(THREE.NormalBlending);
          expect(object.material.depthWrite).toBe(true);
        }
      }
      layer.dispose();
    }
  });

  it("maps shared identities to one token across views", () => {
    expect(projectionColorToken("reticular")).toBe(VISUAL_COLORS.inhibitory);
    expect(projectionColorToken("feedforward")).toBe(VISUAL_COLORS.excitatory);
    expect(projectionColorToken("thalamocortical")).toBe(VISUAL_COLORS.excitatory);
  });

  it("counts every rendered object's declared provenance", () => {
    for (const layer of [
      new LaminarRenderLayer(),
      new CellRenderLayer(),
      new SynapseRenderLayer(),
    ]) {
      const report = auditVisualProvenance(layer.group);
      expect(report.total).toBeGreaterThan(0);
      expect(report.undeclared).toBe(0);
      expect(report.state).toBeGreaterThan(0);
      layer.dispose();
    }
  });

  it("binds every state object to a field, unit, transform and non-color cue", () => {
    for (const layer of [
      new LaminarRenderLayer(),
      new CellRenderLayer(),
      new SynapseRenderLayer(),
    ]) {
      const report = auditVisualBindings(layer.group);
      expect(report.totalStateObjects).toBeGreaterThan(0);
      expect(report.declaredBindings).toBe(report.totalStateObjects);
      expect(report.missingBindings).toEqual([]);
      expect(report.missingRedundancy).toEqual([]);
      for (const object of renderedObjects(layer.group)) {
        if (visualProvenanceOf(object) !== "state") continue;
        const binding = visualSemanticBindingOf(object);
        expect(binding?.field).toBeTruthy();
        expect(binding?.unit).toBeTruthy();
        expect(binding?.transform).toBeTruthy();
        expect(binding?.redundancy.length).toBeGreaterThan(0);
      }
      layer.dispose();
    }
  });
});
