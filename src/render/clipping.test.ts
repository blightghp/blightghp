import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { generateBrainData } from "../brain";
import {
  ClippingSystem,
  createCutPlanes,
  DEFAULT_CUT_PLANE_STATE,
  sampleMacroscopicCutProbe,
} from "./clipping";
import {
  declareClippingParticipation,
  declareVisual,
  visualProvenanceOf,
} from "./render-types";

describe("R09-F clipping planes and stencil caps", () => {
  it("builds canonical half-spaces and a bounded slab deterministically", () => {
    const coronal = createCutPlanes({
      ...DEFAULT_CUT_PLANE_STATE,
      enabled: true,
      orientation: "coronal",
      position: 0.25,
    });
    expect(coronal).toHaveLength(1);
    expect(coronal[0].normal.toArray()).toEqual([0, 0, 1]);
    expect(coronal[0].distanceToPoint(new THREE.Vector3(0, 0, 0.25))).toBeCloseTo(0);

    const slab = createCutPlanes({
      ...DEFAULT_CUT_PLANE_STATE,
      enabled: true,
      orientation: "sagittal",
      slab: true,
      position: 0.2,
      slabThickness: 0.4,
    });
    expect(slab).toHaveLength(2);
    const inside = new THREE.Vector3(0.2, 0, 0);
    const outsideLow = new THREE.Vector3(-0.1, 0, 0);
    const outsideHigh = new THREE.Vector3(0.5, 0, 0);
    expect(slab.every((plane) => plane.distanceToPoint(inside) >= 0)).toBe(true);
    expect(slab.some((plane) => plane.distanceToPoint(outsideLow) < 0)).toBe(true);
    expect(slab.some((plane) => plane.distanceToPoint(outsideHigh) < 0)).toBe(true);

    const obliqueA = createCutPlanes({
      ...DEFAULT_CUT_PLANE_STATE,
      enabled: true,
      orientation: "oblique",
    });
    const obliqueB = createCutPlanes({
      ...DEFAULT_CUT_PLANE_STATE,
      enabled: true,
      orientation: "oblique",
    });
    expect(obliqueA[0].normal.toArray()).toEqual(obliqueB[0].normal.toArray());
    expect(obliqueA[0].normal.length()).toBeCloseTo(1);
  });

  it("clips only opted-in objects and owns every stencil allocation", () => {
    const scene = new THREE.Scene();
    const renderer = { localClippingEnabled: false };
    const layer = new THREE.Group();
    const source = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0x3388bb }),
    );
    source.name = "closed-source";
    declareVisual(source, "matter", "topology");
    const annotation = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-1, 0, 0),
        new THREE.Vector3(1, 0, 0),
      ]),
      new THREE.LineBasicMaterial({ color: 0xffffff }),
    );
    annotation.name = "uncut-annotation";
    declareVisual(annotation, "matter", "decoration");
    declareClippingParticipation(annotation, "exclude");
    layer.add(source, annotation);
    scene.add(layer);

    const clipping = new ClippingSystem(renderer, scene);
    clipping.registerLayer({
      id: "overview",
      root: layer,
      optIn: true,
      capObjectNames: [source.name],
    });
    clipping.setActiveLayer("overview");
    clipping.setState({ enabled: true, orientation: "axial" });
    clipping.update();

    expect(renderer.localClippingEnabled).toBe(true);
    expect((source.material as THREE.Material).clippingPlanes).toHaveLength(1);
    expect((annotation.material as THREE.Material).clippingPlanes).toBeNull();
    expect(clipping.audit()).toMatchObject({
      enabled: true,
      planeCount: 1,
      capSources: 1,
      estimatedAdditionalDrawCalls: 3,
      maximumAdditionalDrawCalls: 18,
    });
    const stencil = scene.getObjectByName("cut-stencil-back-0-0") as THREE.Mesh;
    const cap = scene.getObjectByName("cut-cap-0") as THREE.Mesh;
    expect(stencil.geometry).toBe(source.geometry);
    expect(visualProvenanceOf(stencil)).toBe("decoration");
    expect(visualProvenanceOf(cap)).toBe("decoration");
    const stencilDispose = vi.spyOn(stencil.material as THREE.Material, "dispose");
    const capGeometryDispose = vi.spyOn(cap.geometry, "dispose");
    const capMaterialDispose = vi.spyOn(cap.material as THREE.Material, "dispose");

    clipping.setState({ slab: true });
    clipping.update();
    expect(clipping.audit()).toMatchObject({
      planeCount: 2,
      estimatedAdditionalDrawCalls: 6,
    });
    expect(stencilDispose).toHaveBeenCalledOnce();
    expect(capGeometryDispose).toHaveBeenCalledOnce();
    expect(capMaterialDispose).toHaveBeenCalledOnce();

    clipping.dispose();
    expect(renderer.localClippingEnabled).toBe(false);
    expect((source.material as THREE.Material).clippingPlanes).toBeNull();
    expect(scene.getObjectByName("r09-f-stencil-caps")).toBeUndefined();
    source.geometry.dispose();
    source.material.dispose();
    annotation.geometry.dispose();
    annotation.material.dispose();
  });

  it("samples only the published macroscopic field with declared interpolation", () => {
    const topology = generateBrainData({
      seed: 23,
      surfaceNodesPerHemisphere: 16,
      innerNodesPerHemisphere: 2,
    });
    const count = topology.corticalField.nodeIndices.length;
    const current = new Float32Array(count).fill(1);
    const previous = new Float32Array(count).fill(0);
    const result = sampleMacroscopicCutProbe(
      "overview",
      topology,
      current,
      previous,
      0.25,
      new THREE.Plane(new THREE.Vector3(1, 0, 0), 0),
    );
    expect(result).toMatchObject({
      available: true,
      field: "field.waveActivity",
      unit: "normalized field activity",
      interpolation: "linear between adjacent published snapshots",
    });
    expect(result.sampleCount).toBeGreaterThan(0);
    expect(result.value).toBeCloseTo(0.25);

    const microscopic = sampleMacroscopicCutProbe(
      "synapse",
      topology,
      current,
      previous,
      0.25,
      new THREE.Plane(new THREE.Vector3(1, 0, 0), 0),
    );
    expect(microscopic.available).toBe(false);
    expect(microscopic.reason).toMatch(/macroscopic-field mapping/);
  });
});
