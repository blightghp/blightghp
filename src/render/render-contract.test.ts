import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { generateBrainData } from "../brain";
import { ANATOMY_IDS } from "../anatomy";
import { DiagnosticFallbackHost } from "../wasm-engine-host";
import {
  anatomicalDeclarationOf,
  auditAnatomicalScene,
  declareAnatomicalBinding,
  declareNonAnatomical,
  pickAnatomicalEntry,
} from "./anatomical-provenance";
import { CellRenderLayer } from "./cell-layer";
import { ElectricalBoardLayer } from "./electrical-board-layer";
import { LaminarRenderLayer } from "./laminar-layer";
import { NeuronRenderLayer } from "./neuron-layer";
import { SynapseRenderLayer } from "./synapse-layer";
import {
  ClippingSystem,
  createCutPlanes,
  DEFAULT_CUT_PLANE_STATE,
  sampleMacroscopicCutProbe,
} from "./clipping";
import {
  PresentationMaterialEffects,
  REALISTIC_ILLUSTRATIVE_MANIFEST,
  RealisticIllustrativeMaterialManager,
  surfaceParameters,
} from "./material-profile";
import {
  auditVisualMaterialReadiness,
  auditVisualProvenance,
  auditVisualBindings,
  declareVisual,
  declareClippingParticipation,
  visualPassOf,
  visualProvenanceOf,
  visualSemanticBindingOf,
} from "./render-types";
import { syncBloomDepthMaskClipping } from "./selective-bloom";
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

function materialManagerForContract(scene: THREE.Scene): RealisticIllustrativeMaterialManager {
  const textures = new Map<string, THREE.Texture>();
  return new RealisticIllustrativeMaterialManager(scene, {
    environmentTexture: new THREE.Texture(),
    normalMapProvider: {
      get(type) {
        const texture = textures.get(type) ?? new THREE.Texture();
        textures.set(type, texture);
        return texture;
      },
      count: () => textures.size,
      estimatedBytes: () => textures.size * 256 * 256 * 4 * 4 / 3,
      dispose: () => undefined,
    },
  });
}

function scientificHashes(snapshot: ReturnType<DiagnosticFallbackHost["advance"]>["snapshot"]) {
  return {
    stateHash: snapshot.diagnostics.stateHash,
    corticothalamicHash: snapshot.diagnostics.corticothalamicHash,
    cellPatchHash: snapshot.diagnostics.cellPatchHash,
    chemicalHash: snapshot.diagnostics.chemicalHash,
    cellSpikeEventHash: snapshot.diagnostics.cellSpikeEventHash,
  };
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

  it("binds or explicitly excludes every renderable from the anatomical catalog", () => {
    for (const layer of [
      new LaminarRenderLayer(),
      new CellRenderLayer(),
      new NeuronRenderLayer(7),
      new ElectricalBoardLayer(),
      new SynapseRenderLayer(),
    ]) {
      const report = auditAnatomicalScene(layer.group);
      expect(report.totalRenderableObjects).toBeGreaterThan(0);
      expect(report.boundObjects).toBeGreaterThan(0);
      expect(report.boundObjects + report.explicitlyNonAnatomicalObjects)
        .toBe(report.totalRenderableObjects);
      expect(report.missingDeclarations).toEqual([]);
      expect(report.unknownEntryIds).toEqual([]);
      expect(report.missingEvidence).toEqual([]);
      expect(report.contractReady).toBe(true);
      layer.dispose();
    }
  });

  it("rejects unknown anatomy IDs and requires reasons for non-anatomical objects", () => {
    const object = new THREE.Object3D();
    expect(() => declareAnatomicalBinding(object, "brain-pro:anatomy/missing"))
      .toThrow("unknown anatomical catalog entry");
    expect(() => declareNonAnatomical(object, "  ")).toThrow("require a reason");
    declareAnatomicalBinding(object, ANATOMY_IDS.soma);
    expect(anatomicalDeclarationOf(object)).toEqual({
      kind: "catalog-entry",
      entryId: ANATOMY_IDS.soma,
    });
  });

  it("converges raycast picking on the same stable catalog ID", () => {
    const root = new THREE.Group();
    const overlay = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial(),
    );
    overlay.position.z = 0.2;
    declareNonAnatomical(overlay, "test overlay");
    const soma = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.8, 0.8),
      new THREE.MeshBasicMaterial(),
    );
    declareAnatomicalBinding(soma, ANATOMY_IDS.soma);
    root.add(overlay, soma);
    root.updateMatrixWorld(true);
    const raycaster = new THREE.Raycaster(
      new THREE.Vector3(0, 0, 2),
      new THREE.Vector3(0, 0, -1),
    );
    expect(pickAnatomicalEntry(root, raycaster)?.id).toBe(ANATOMY_IDS.soma);
    overlay.geometry.dispose();
    overlay.material.dispose();
    soma.geometry.dispose();
    soma.material.dispose();
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

describe("ClippingSystem contract", () => {
  it("clipping planes do not modify any of the five scientific hashes or send Worker messages", () => {
    const topology = generateBrainData({
      seed: 31,
      surfaceNodesPerHemisphere: 16,
      innerNodesPerHemisphere: 2,
    });
    const host = new DiagnosticFallbackHost();
    host.initialize({ type: "initialize", topology }, "clipping-hash-contract");
    const snapshot = host.advance({
      type: "advance",
      targetTick: 1,
      stimulus: { intensity: 0, confidence: 0 },
    }).snapshot;
    const before = scientificHashes(snapshot);
    const workerPost = vi.fn();
    const scene = new THREE.Scene();
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    mesh.name = "cap";
    declareVisual(mesh, "matter", "topology");
    root.add(mesh);
    const clipping = new ClippingSystem({ localClippingEnabled: false }, scene);
    clipping.registerLayer({ id: "overview", root, optIn: true, capObjectNames: [mesh.name] });
    clipping.setState({ enabled: true, position: 0.64, orientation: "coronal" });
    expect(workerPost).not.toHaveBeenCalled();
    expect(scientificHashes(snapshot)).toEqual(before);
    clipping.dispose();
    mesh.geometry.dispose();
    mesh.material.dispose();
    host.dispose();
  });

  it("bounds stencil caps to 18 additional draws and resets their state on view switches", () => {
    const scene = new THREE.Scene();
    const overview = new THREE.Group();
    const laminar = new THREE.Group();
    const overviewNames: string[] = [];
    for (let index = 0; index < 10; index += 1) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
      mesh.name = `overview-cap-${index}`;
      declareVisual(mesh, "matter", "topology");
      overview.add(mesh);
      overviewNames.push(mesh.name);
    }
    const laminarMesh = new THREE.Mesh(new THREE.SphereGeometry(), new THREE.MeshBasicMaterial());
    laminarMesh.name = "laminar-cap";
    declareVisual(laminarMesh, "matter", "topology");
    laminar.add(laminarMesh);
    const clipping = new ClippingSystem({ localClippingEnabled: false }, scene);
    clipping.registerLayer({ id: "overview", root: overview, optIn: true, capObjectNames: overviewNames });
    clipping.registerLayer({ id: "laminar", root: laminar, optIn: true, capObjectNames: [laminarMesh.name] });
    clipping.setState({ enabled: true, slab: true });
    clipping.update();
    const previousStencil = scene.getObjectByName("cut-stencil-back-0-0") as THREE.Mesh;
    expect(clipping.audit().estimatedAdditionalDrawCalls).toBeLessThanOrEqual(18);
    clipping.setActiveLayer("laminar");
    clipping.update();
    const currentStencil = scene.getObjectByName("cut-stencil-back-0-0") as THREE.Mesh;
    expect(previousStencil.parent).toBeNull();
    expect(currentStencil).not.toBe(previousStencil);
    expect(currentStencil.geometry).toBe(laminarMesh.geometry);
    clipping.dispose();
    for (const object of [...overview.children, ...laminar.children]) {
      const renderable = object as THREE.Mesh;
      renderable.geometry.dispose();
      (renderable.material as THREE.Material).dispose();
    }
  });

  it("keeps excluded materials unclipped and restores original clipping contracts on dispose", () => {
    const originalPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.25);
    const material = new THREE.MeshBasicMaterial({ clippingPlanes: [originalPlane] });
    material.clipIntersection = true;
    const excludedMaterial = new THREE.MeshBasicMaterial();
    const included = new THREE.Mesh(new THREE.BoxGeometry(), material);
    const excluded = new THREE.Mesh(new THREE.BoxGeometry(), excludedMaterial);
    included.name = "included";
    declareVisual(included, "matter", "topology");
    declareVisual(excluded, "matter", "decoration");
    declareClippingParticipation(excluded, "exclude");
    const root = new THREE.Group();
    root.add(included, excluded);
    const scene = new THREE.Scene();
    const clipping = new ClippingSystem({ localClippingEnabled: false }, scene);
    clipping.registerLayer({ id: "overview", root, optIn: true, capObjectNames: [] });
    clipping.setState({ enabled: true, orientation: "axial" });
    expect(material.clippingPlanes).toHaveLength(1);
    expect(material.clippingPlanes?.[0]).not.toBe(originalPlane);
    expect(excludedMaterial.clippingPlanes).toBeNull();
    clipping.dispose();
    expect(material.clippingPlanes).toEqual([originalPlane]);
    expect(material.clipIntersection).toBe(true);
    included.geometry.dispose();
    excluded.geometry.dispose();
    material.dispose();
    excludedMaterial.dispose();
  });

  it("uses exactly two opposing planes for slab mode", () => {
    const planes = createCutPlanes({
      ...DEFAULT_CUT_PLANE_STATE,
      enabled: true,
      slab: true,
      orientation: "oblique",
    });
    expect(planes).toHaveLength(2);
    expect(planes[0].normal.dot(planes[1].normal)).toBeCloseTo(-1);
  });

  it("applies the same clipping array to the bloom depth and base materials", () => {
    const planes = [new THREE.Plane(new THREE.Vector3(1, 0, 0), 0.2)];
    const base = new THREE.MeshPhysicalMaterial({ clippingPlanes: planes });
    base.clipIntersection = true;
    const bloomDepth = new THREE.MeshBasicMaterial();
    syncBloomDepthMaskClipping(base, bloomDepth);
    expect(bloomDepth.clippingPlanes).toBe(base.clippingPlanes);
    expect(bloomDepth.clipIntersection).toBe(base.clipIntersection);
    expect(bloomDepth.depthTest).toBe(base.depthTest);
    expect(bloomDepth.depthWrite).toBe(base.depthWrite);
    base.dispose();
    bloomDepth.dispose();
  });

  it("exposes the face probe only for overview and includes a unit for a published field", () => {
    const topology = generateBrainData({
      seed: 37,
      surfaceNodesPerHemisphere: 16,
      innerNodesPerHemisphere: 2,
    });
    const current = new Float32Array(topology.corticalField.nodeIndices.length).fill(0.75);
    const plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
    const unavailable = sampleMacroscopicCutProbe(
      "cell",
      topology,
      current,
      current,
      1,
      plane,
    );
    const available = sampleMacroscopicCutProbe(
      "overview",
      topology,
      current,
      current,
      1,
      plane,
    );
    expect(unavailable.available).toBe(false);
    expect(available).toMatchObject({
      available: true,
      unit: "normalized field activity",
      value: 0.75,
    });
  });
});

describe("MaterialProfileManager contract", () => {
  it("keeps schematic originals, upgrades only eligible matter, and leaves emission untouched", () => {
    const scene = new THREE.Scene();
    const layer = new SynapseRenderLayer();
    const manager = materialManagerForContract(scene);
    manager.registerLayer("synapse", layer.group, REALISTIC_ILLUSTRATIVE_MANIFEST.synapse);
    const eligible = layer.group.getObjectByName("presynaptic-bouton") as THREE.Mesh;
    const emission = layer.group.getObjectByName("glutamate-cloud") as THREE.Points;
    const schematic = eligible.material;
    const emissionMaterial = emission.material;
    manager.setProfile("realistic-illustrative");
    expect(eligible.material).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    expect(emission.material).toBe(emissionMaterial);
    manager.setProfile("schematic");
    expect(eligible.material).toBe(schematic);
    manager.dispose();
    layer.dispose();
  });

  it("preserves neuron vertex-color gradients because schematic lines are protected", () => {
    const scene = new THREE.Scene();
    const layer = new NeuronRenderLayer(41);
    const manager = materialManagerForContract(scene);
    manager.registerLayer("neuron", layer.group, REALISTIC_ILLUSTRATIVE_MANIFEST.neuron);
    const dendrite = layer.group.getObjectByName(
      "resolved-neuron-multicompartment-dendrite",
    ) as THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
    const material = dendrite.material;
    manager.setProfile("realistic-illustrative");
    expect(dendrite.material).toBe(material);
    expect(dendrite.material.vertexColors).toBe(true);
    expect(dendrite.geometry.getAttribute("color")).toBeDefined();
    manager.dispose();
    layer.dispose();
  });

  it("uses the refined tissue, membrane and substrate PBR presets", () => {
    expect(surfaceParameters("membrane")).toMatchObject({
      roughness: 0.32,
      transmission: 0.22,
      clearcoat: 0.28,
      sheen: 0.18,
      ior: 1.4,
    });
    expect(surfaceParameters("tissue")).toMatchObject({
      roughness: 0.52,
      transmission: 0.1,
      clearcoat: 0.12,
      sheen: 0.25,
      ior: 1.38,
    });
    expect(surfaceParameters("substrate")).toMatchObject({
      roughness: 0.72,
      transmission: 0,
      sheen: 0,
      ior: 1.5,
    });
  });

  it("keeps geometry UUIDs and five scientific hashes stable across profile switches", () => {
    const topology = generateBrainData({
      seed: 43,
      surfaceNodesPerHemisphere: 16,
      innerNodesPerHemisphere: 2,
    });
    const host = new DiagnosticFallbackHost();
    host.initialize({ type: "initialize", topology }, "material-hash-contract");
    const snapshot = host.advance({
      type: "advance",
      targetTick: 1,
      stimulus: { intensity: 0, confidence: 0 },
    }).snapshot;
    const hashes = scientificHashes(snapshot);
    const scene = new THREE.Scene();
    const layer = new CellRenderLayer();
    const manager = materialManagerForContract(scene);
    manager.registerLayer("cell", layer.group, REALISTIC_ILLUSTRATIVE_MANIFEST.cell);
    const soma = layer.group.getObjectByName("adex-somata") as THREE.Mesh;
    const geometryUuid = soma.geometry.uuid;
    manager.setProfile("realistic-illustrative");
    manager.setProfile("schematic");
    expect(soma.geometry.uuid).toBe(geometryUuid);
    expect(manager.audit().semanticGeometryChanges).toBe(0);
    expect(scientificHashes(snapshot)).toEqual(hashes);
    manager.dispose();
    layer.dispose();
    host.dispose();
  });

  it("forces schematic on high contrast and context loss", () => {
    const scene = new THREE.Scene();
    const layer = new ElectricalBoardLayer();
    const manager = materialManagerForContract(scene);
    manager.registerLayer(
      "electricity",
      layer.group,
      REALISTIC_ILLUSTRATIVE_MANIFEST.electricity,
    );
    manager.setProfile("realistic-illustrative");
    manager.setEnvironment({ highContrast: true });
    expect(manager.profile()).toBe("schematic");
    expect(manager.audit().fallbackReason).toBe("high-contrast-requires-schematic");
    manager.setEnvironment({ highContrast: false });
    manager.failAtomic("webgl-context-lost");
    expect(manager.profile()).toBe("schematic");
    expect(manager.audit().fallbackReason).toBe("webgl-context-lost");
    manager.dispose();
    layer.dispose();
  });

  it("activates the environment and light rig only in realistic mode and disposes physical materials", () => {
    const scene = new THREE.Scene();
    const layer = new ElectricalBoardLayer();
    const manager = materialManagerForContract(scene);
    manager.registerLayer(
      "electricity",
      layer.group,
      REALISTIC_ILLUSTRATIVE_MANIFEST.electricity,
    );
    manager.setProfile("realistic-illustrative");
    const board = layer.group.getObjectByName("electrical-board-surface") as THREE.Mesh;
    const physical = board.material as THREE.MeshPhysicalMaterial;
    const disposed = vi.fn();
    physical.addEventListener("dispose", disposed);
    expect(manager.audit()).toMatchObject({ environmentMapActive: true, lightCount: 4 });
    expect(scene.getObjectByName("realistic-illustrative-light-rig")?.visible).toBe(true);
    manager.setProfile("schematic");
    expect(scene.environment).toBeNull();
    expect(scene.getObjectByName("realistic-illustrative-light-rig")?.visible).toBe(false);
    manager.dispose();
    expect(disposed).toHaveBeenCalledOnce();
    layer.dispose();
  });

  it("publishes a complete 25-object manifest for all six views", () => {
    expect(Object.keys(REALISTIC_ILLUSTRATIVE_MANIFEST).sort()).toEqual([
      "cell",
      "electricity",
      "laminar",
      "neuron",
      "overview",
      "synapse",
    ]);
    const entries = Object.values(REALISTIC_ILLUSTRATIVE_MANIFEST).flat();
    expect(entries).toHaveLength(25);
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length);
    expect(entries.every((entry) => entry.source === "procedural-scene-graph")).toBe(true);
  });
});

describe("PresentationMaterialEffects contract", () => {
  it("opacity and x-ray alter only temporary material state and restore it exactly", () => {
    const topology = generateBrainData({
      seed: 47,
      surfaceNodesPerHemisphere: 16,
      innerNodesPerHemisphere: 2,
    });
    const host = new DiagnosticFallbackHost();
    host.initialize({ type: "initialize", topology }, "effects-hash-contract");
    const snapshot = host.advance({
      type: "advance",
      targetTick: 1,
      stimulus: { intensity: 0, confidence: 0 },
    }).snapshot;
    const hashes = scientificHashes(snapshot);
    const material = new THREE.MeshBasicMaterial({ opacity: 0.73, transparent: true });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
    declareVisual(mesh, "matter", "topology");
    const effects = new PresentationMaterialEffects();
    effects.setState({ opacity: 0.5, xray: true });
    effects.beforeRender(mesh);
    expect(material.opacity).toBeCloseTo(0.73 * 0.5 * 0.28);
    expect(material.depthWrite).toBe(false);
    expect(() => effects.beforeRender(mesh)).toThrow(/not restored/);
    effects.afterRender();
    expect(material.opacity).toBe(0.73);
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(true);
    expect(scientificHashes(snapshot)).toEqual(hashes);
    mesh.geometry.dispose();
    material.dispose();
    host.dispose();
  });
});
