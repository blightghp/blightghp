import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { generateBrainData } from "../brain";
import { DiagnosticFallbackHost } from "../wasm-engine-host";
import { CellRenderLayer } from "./cell-layer";
import { ElectricalBoardLayer } from "./electrical-board-layer";
import { LaminarRenderLayer } from "./laminar-layer";
import { NeuronRenderLayer } from "./neuron-layer";
import { SynapseRenderLayer } from "./synapse-layer";
import {
  auditVisualMaterialReadiness,
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
      new NeuronRenderLayer(7),
      new ElectricalBoardLayer(),
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
      new NeuronRenderLayer(7),
      new ElectricalBoardLayer(),
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
      new NeuronRenderLayer(7),
      new ElectricalBoardLayer(),
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

  it("keeps every DOM-independent view ready for a material profile", () => {
    for (const layer of [
      new LaminarRenderLayer(),
      new CellRenderLayer(),
      new NeuronRenderLayer(7),
      new ElectricalBoardLayer(),
      new SynapseRenderLayer(),
    ]) {
      const report = auditVisualMaterialReadiness(layer.group);
      expect(report.activeProfile).toBe("schematic");
      expect(report.totalRenderableObjects).toBeGreaterThan(0);
      expect(report.matterObjects + report.emissionObjects)
        .toBe(report.totalRenderableObjects);
      expect(report.pbrCandidateMeshes).toBeLessThanOrEqual(report.matterObjects);
      expect(report.undeclaredObjects).toBe(0);
      expect(report.missingStateBindings).toBe(0);
      expect(report.contractReady).toBe(true);
      layer.dispose();
    }
  });

  it("verifies the declared non-color cues against concrete scene geometry", () => {
    const laminar = new LaminarRenderLayer();
    expect(laminar.group.getObjectByName("L1-excitatory")).toHaveProperty(
      "geometry.type",
      "CylinderGeometry",
    );
    expect(laminar.group.getObjectByName("L1-inhibitory")).toHaveProperty(
      "geometry.type",
      "TorusGeometry",
    );
    expect(laminar.group.getObjectByName("thalamic-relay")).toHaveProperty(
      "geometry.type",
      "IcosahedronGeometry",
    );
    expect(laminar.group.getObjectByName("thalamic-reticular-nucleus")).toHaveProperty(
      "geometry.type",
      "TorusGeometry",
    );

    const synapse = new SynapseRenderLayer();
    const glutamate = synapse.group.getObjectByName("glutamate-cloud") as THREE.InstancedMesh;
    const gaba = synapse.group.getObjectByName("gaba-cloud") as THREE.InstancedMesh;
    const glutamateGeometry = glutamate.geometry as THREE.SphereGeometry;
    const gabaGeometry = gaba.geometry as THREE.SphereGeometry;
    expect(glutamateGeometry.parameters.radius).not.toBe(gabaGeometry.parameters.radius);
    expect(synapse.group.getObjectByName("glutamate-release")?.position.x).toBeLessThan(0);
    expect(synapse.group.getObjectByName("gaba-release")?.position.x).toBeGreaterThan(0);
    expect(synapse.group.getObjectByName("glutamate-recapture")?.position.x).toBeLessThan(0);
    expect(synapse.group.getObjectByName("gaba-recapture")?.position.x).toBeGreaterThan(0);

    const cell = new CellRenderLayer();
    const topology = generateBrainData({
      seed: 7,
      surfaceNodesPerHemisphere: 20,
      innerNodesPerHemisphere: 3,
    });
    const fallback = new DiagnosticFallbackHost();
    fallback.initialize({ type: "initialize", topology }, "geometry-test");
    const snapshot = fallback.advance({
      type: "advance",
      targetTick: 1,
      stimulus: { intensity: 0, confidence: 0 },
    }).snapshot;
    cell.update({ current: snapshot, alpha: 1 });
    const somata = cell.group.getObjectByName("adex-somata") as THREE.InstancedMesh;
    const excitatoryScale = new THREE.Vector3();
    const inhibitoryScale = new THREE.Vector3();
    somata.getMatrixAt(0, new THREE.Matrix4()).decompose(
      new THREE.Vector3(),
      new THREE.Quaternion(),
      excitatoryScale,
    );
    somata.getMatrixAt(8, new THREE.Matrix4()).decompose(
      new THREE.Vector3(),
      new THREE.Quaternion(),
      inhibitoryScale,
    );
    expect(excitatoryScale.y / excitatoryScale.x).toBeGreaterThan(1);
    expect(inhibitoryScale.y / inhibitoryScale.x).toBeLessThan(1);

    const electrical = new ElectricalBoardLayer();
    electrical.update({ current: snapshot, alpha: 1 });
    expect(electrical.group.getObjectByName("electrical-excitatory-nodes")).toHaveProperty(
      "geometry.type",
      "CircleGeometry",
    );
    expect(electrical.group.getObjectByName("electrical-inhibitory-nodes")).toHaveProperty(
      "geometry.type",
      "PlaneGeometry",
    );
    expect(electrical.group.getObjectByName("electrical-ampa-paths")).toHaveProperty(
      "geometry.type",
      "ShapeGeometry",
    );
    expect(electrical.group.getObjectByName("electrical-stamped-events")).toHaveProperty(
      "geometry.type",
      "RingGeometry",
    );

    const neuron = new NeuronRenderLayer(7);
    expect(neuron.group.getObjectByName("resolved-neuron-soma")).toHaveProperty(
      "geometry.type",
      "IcosahedronGeometry",
    );
    expect(
      neuron.group.getObjectByName("resolved-neuron-multicompartment-dendrite"),
    ).toHaveProperty("geometry.type", "BufferGeometry");
    expect(neuron.group.getObjectByName("resolved-neuron-ampa-current")).toHaveProperty(
      "geometry.type",
      "ShapeGeometry",
    );
    expect(neuron.group.getObjectByName("resolved-neuron-stamped-event")).toHaveProperty(
      "geometry.type",
      "RingGeometry",
    );

    laminar.dispose();
    synapse.dispose();
    cell.dispose();
    electrical.dispose();
    neuron.dispose();
    fallback.dispose();
  });
});
