import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { CellRenderLayer } from "./cell-layer";
import { ElectricalBoardLayer } from "./electrical-board-layer";
import { LaminarRenderLayer } from "./laminar-layer";
import {
  createR10EProceduralEnvironmentSource,
  hasR10EBakedSurfaceAttributes,
  PresentationMaterialEffects,
  REALISTIC_ILLUSTRATIVE_MANIFEST,
  RealisticIllustrativeMaterialManager,
  surfaceParameters,
} from "./material-profile";
import type { MaterialProfileManagerOptions } from "./material-profile";
import { NeuronRenderLayer } from "./neuron-layer";
import {
  auditVisualMaterialReadiness,
  declareVisual,
  visualSemanticBindingOf,
} from "./render-types";
import { SynapseRenderLayer } from "./synapse-layer";

function managerForTest(
  scene: THREE.Scene,
  physicalMaterialFactory?: MaterialProfileManagerOptions["physicalMaterialFactory"],
): RealisticIllustrativeMaterialManager {
  const textures = new Map<string, THREE.Texture>();
  return new RealisticIllustrativeMaterialManager(scene, {
    environmentTexture: new THREE.Texture(),
    normalMapProvider: {
      get(type) {
        const current = textures.get(type) ?? new THREE.Texture();
        textures.set(type, current);
        return current;
      },
      count: () => textures.size,
      estimatedBytes: () => textures.size * 256 * 256 * 4 * 4 / 3,
      dispose: () => undefined,
    },
    ...(physicalMaterialFactory ? { physicalMaterialFactory } : {}),
  });
}

describe("R09-F realistic-illustrative material manager", () => {
  it("swaps only bounded matter while preserving geometry, bindings and emission", () => {
    const scene = new THREE.Scene();
    const laminar = new LaminarRenderLayer();
    const cell = new CellRenderLayer();
    const neuron = new NeuronRenderLayer(19);
    const electricity = new ElectricalBoardLayer();
    const synapse = new SynapseRenderLayer();
    const manager = managerForTest(scene);
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
    expect(scene.environment).toBeInstanceOf(THREE.Texture);
    expect(scene.getObjectByName("realistic-illustrative-light-rig")?.visible).toBe(true);
    expect(manager.audit()).toMatchObject({
      eligibleObjects: 21,
      physicalMaterialObjects: 21,
      semanticGeometryChanges: 0,
      estimatedAdditionalObjectDraws: 6,
      transmissionObjects: 0,
      estimatedTransmissionPasses: 0,
      bakedSurfaceShaderObjects: 0,
      lightCount: 4,
      environmentMapActive: true,
      proceduralNormalMapTextures: 3,
    });

    expect(manager.setProfile("schematic")).toBe("schematic");
    expect(scene.environment).toBeNull();
    expect(scene.getObjectByName("realistic-illustrative-light-rig")?.visible).toBe(false);
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

  it("builds the R10-E studio source and four-light rig without external assets", () => {
    const source = createR10EProceduralEnvironmentSource();
    const image = source.image as { data: Uint8Array; width: number; height: number };
    expect(source.name).toBe("r10-e-procedural-studio-equirectangular");
    expect(source.mapping).toBe(THREE.EquirectangularReflectionMapping);
    expect(source.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(image).toMatchObject({ width: 128, height: 64 });
    expect(image.data).toHaveLength(128 * 64 * 4);
    expect(image.data.every(Number.isFinite)).toBe(true);
    expect(Math.max(...image.data)).toBeGreaterThan(200);
    source.dispose();

    const scene = new THREE.Scene();
    const manager = managerForTest(scene);
    const rig = scene.getObjectByName("realistic-illustrative-light-rig") as THREE.Group;
    const lights = rig.children.filter((child): child is THREE.Light => child instanceof THREE.Light);
    expect(lights).toHaveLength(4);
    expect(lights.filter((light) => light instanceof THREE.DirectionalLight)).toHaveLength(3);
    for (const light of lights) {
      expect(Number.isFinite(light.intensity)).toBe(true);
      expect(light.intensity).toBeGreaterThan(0);
    }
    manager.dispose();
  });

  it("uses baked R10-D attributes only on approved overview shells without transmission", () => {
    const scene = new THREE.Scene();
    const root = new THREE.Group();
    const shellGeometry = new THREE.SphereGeometry(0.2, 8, 6);
    const vertexCount = shellGeometry.getAttribute("position").count;
    shellGeometry.setAttribute(
      "aoFactor",
      new THREE.BufferAttribute(new Float32Array(vertexCount).fill(0.78), 1),
    );
    shellGeometry.setAttribute(
      "curvature",
      new THREE.BufferAttribute(new Float32Array(vertexCount).fill(0.12), 1),
    );
    shellGeometry.setAttribute(
      "thickness",
      new THREE.BufferAttribute(new Float32Array(vertexCount).fill(0.7), 1),
    );
    const shell = new THREE.Mesh(shellGeometry, new THREE.MeshBasicMaterial({ color: 0x886655 }));
    shell.name = "leftHemi-shell";
    declareVisual(shell, "matter", "topology");
    const shellSchematic = shell.material as THREE.MeshBasicMaterial;

    const nonShellGeometry = shellGeometry.clone();
    const nonShell = new THREE.Mesh(nonShellGeometry, new THREE.MeshBasicMaterial({ color: 0x668899 }));
    nonShell.name = "baked-looking-non-shell";
    declareVisual(nonShell, "matter", "topology");
    root.add(shell, nonShell);

    const manager = managerForTest(scene);
    manager.registerLayer("overview", root, [
      {
        id: "test:leftHemi-shell",
        objectName: shell.name,
        surface: "tissue",
        maximumLocalRadius: 0.3,
        opacityRange: [0, 1],
        source: "procedural-scene-graph",
        materialRegion: "cortex",
      },
      {
        id: "test:baked-looking-non-shell",
        objectName: nonShell.name,
        surface: "tissue",
        maximumLocalRadius: 0.3,
        opacityRange: [0, 1],
        source: "procedural-scene-graph",
      },
    ]);
    expect(manager.setProfile("realistic-illustrative")).toBe("realistic-illustrative");
    const shellMaterial = shell.material as unknown as THREE.MeshPhysicalMaterial;
    const nonShellMaterial = nonShell.material as unknown as THREE.MeshPhysicalMaterial;
    expect(shellMaterial.transmission).toBe(0);
    expect(nonShellMaterial.transmission).toBe(0);
    expect(shellMaterial.userData.r10eBakedSurfaceShader).toBe(true);
    expect(nonShellMaterial.userData.r10eBakedSurfaceShader).toBeUndefined();
    expect(shellMaterial.customProgramCacheKey()).toBe("r10-e-baked-surface-v1:cortex");
    const corticalPresentationColor = new THREE.Color(0x886655).lerp(
      new THREE.Color(0xc98f78),
      0.88,
    );
    expect(shellMaterial.color).toEqual(corticalPresentationColor);
    expect(nonShellMaterial.color).toEqual(new THREE.Color(0x668899));
    expect(manager.audit()).toMatchObject({
      transmissionObjects: 0,
      estimatedTransmissionPasses: 0,
      bakedSurfaceShaderObjects: 1,
      regionalBaseColorObjects: 1,
    });

    const versionBeforeSync = shellMaterial.version;
    shellSchematic.color.set(0x335577);
    manager.sync();
    expect(shellMaterial.version).toBe(versionBeforeSync);
    expect(shellMaterial.color).toEqual(
      new THREE.Color(0x335577).lerp(new THREE.Color(0xc98f78), 0.88),
    );
    expect(shellMaterial.emissive).toEqual(shellMaterial.color.clone().multiplyScalar(0.035));
    expect(nonShellMaterial.color).toEqual(new THREE.Color(0x668899));

    manager.setEnvironment({ highContrast: true });
    expect(shell.material).toBe(shellSchematic);
    expect(shellSchematic.color).toEqual(new THREE.Color(0x335577));

    const shader = {
      vertexShader: THREE.ShaderLib.physical.vertexShader,
      fragmentShader: THREE.ShaderLib.physical.fragmentShader,
      uniforms: {},
    } as unknown as THREE.WebGLProgramParametersWithUniforms;
    shellMaterial.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(shader.vertexShader.split("attribute float aoFactor;")).toHaveLength(2);
    expect(shader.vertexShader).toContain("vR10EAoFactor = clamp(aoFactor, 0.0, 1.0);");
    expect(shader.fragmentShader).toContain("uniform float r10eAoStrength;");
    expect(shader.fragmentShader).toContain("#if NUM_DIR_LIGHTS > 0");
    const modulationIndex = shader.fragmentShader.indexOf("float r10eAo = clamp");
    expect(modulationIndex).toBeGreaterThan(shader.fragmentShader.indexOf("#include <aomap_fragment>"));
    expect(modulationIndex).toBeLessThan(shader.fragmentShader.indexOf("vec3 totalDiffuse"));
    expect(Number.isFinite(shader.uniforms.r10eAoStrength.value as number)).toBe(true);
    expect(Number.isFinite(shader.uniforms.r10eFresnelPower.value as number)).toBe(true);

    const malformedGeometry = shellGeometry.clone();
    malformedGeometry.setAttribute(
      "thickness",
      new THREE.BufferAttribute(new Float32Array(vertexCount).fill(Number.NaN), 1),
    );
    expect(hasR10EBakedSurfaceAttributes(shellGeometry)).toBe(true);
    expect(hasR10EBakedSurfaceAttributes(malformedGeometry)).toBe(false);

    manager.dispose();
    shellGeometry.dispose();
    nonShellGeometry.dispose();
    malformedGeometry.dispose();
    (shell.material as THREE.Material).dispose();
    (nonShell.material as THREE.Material).dispose();
  });

  it("falls back atomically when an approved overview shell lacks a baked attribute", () => {
    const scene = new THREE.Scene();
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial());
    mesh.name = "cerebellum-shell";
    declareVisual(mesh, "matter", "topology");
    root.add(mesh);
    const schematic = mesh.material;
    const manager = managerForTest(scene);
    manager.registerLayer("overview", root, [{
      id: "test:cerebellum-shell",
      objectName: mesh.name,
      surface: "tissue",
      maximumLocalRadius: 0.3,
      opacityRange: [0, 1],
      source: "procedural-scene-graph",
    }]);
    expect(manager.setProfile("realistic-illustrative")).toBe("schematic");
    expect(mesh.material).toBe(schematic);
    expect(manager.audit().fallbackReason).toContain("lacks valid baked surface attributes");
    manager.dispose();
    mesh.geometry.dispose();
    schematic.dispose();
  });

  it("applies the vascular preset without extending the baked overview shader path", () => {
    const scene = new THREE.Scene();
    const root = new THREE.Group();
    const geometry = new THREE.SphereGeometry(0.2, 8, 6);
    const vertexCount = geometry.getAttribute("position").count;
    for (const name of ["aoFactor", "curvature", "thickness"] as const) {
      geometry.setAttribute(name, new THREE.BufferAttribute(new Float32Array(vertexCount).fill(0.6), 1));
    }
    const vessel = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0xa65e52 }));
    vessel.name = "vascular-test-segment";
    vessel.userData.vascularTopology = true;
    declareVisual(vessel, "matter", "topology");
    root.add(vessel);
    const manager = managerForTest(scene);
    manager.registerLayer("overview", root, [{
      id: "test:vascular-test-segment",
      objectName: vessel.name,
      surface: "membrane",
      maximumLocalRadius: 0.3,
      opacityRange: [0, 1],
      source: "procedural-scene-graph",
      materialRegion: "vascular",
    }]);
    expect(manager.setProfile("realistic-illustrative")).toBe("realistic-illustrative");
    const material = vessel.material as unknown as THREE.MeshPhysicalMaterial;
    expect(material.roughness).toBeCloseTo(surfaceParameters("membrane", "vascular").roughness);
    expect(material.clearcoat).toBeCloseTo(surfaceParameters("membrane", "vascular").clearcoat);
    expect(material.userData.r10eMaterialRegion).toBe("vascular");
    expect(material.userData.r10eBakedSurfaceShader).toBeUndefined();
    expect(material.color).toEqual(new THREE.Color(0xa65e52));
    expect(manager.audit()).toMatchObject({
      vascularMaterialObjects: 1,
      bakedSurfaceShaderObjects: 0,
      regionalBaseColorObjects: 0,
      transmissionObjects: 0,
    });
    manager.dispose();
    geometry.dispose();
    (vessel.material as THREE.Material).dispose();
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
    const manager = managerForTest(scene);
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
    expect(() => effects.beforeRender(root)).toThrow(/not restored/);
    expect((matter.material as THREE.Material).opacity).toBeCloseTo(0.8 * 0.5 * 0.28);
    expect((matter.material as THREE.Material).depthWrite).toBe(false);
    expect((emission.material as THREE.Material).opacity).toBeCloseTo(0.6 * 0.16);
    effects.afterRender();
    expect((matter.material as THREE.Material).opacity).toBe(0.8);
    expect((matter.material as THREE.Material).depthWrite).toBe(true);
    expect((emission.material as THREE.Material).opacity).toBe(0.6);
    expect((emission.material as THREE.Material).depthWrite).toBe(false);
    effects.beforeRender(root);
    effects.afterRender();
    expect(effects.cacheAudit()).toEqual({ roots: 1, records: 2, builds: 1 });
    effects.beforeRender(root, 1);
    effects.afterRender();
    expect(effects.cacheAudit().builds).toBe(2);
    matter.geometry.dispose();
    matter.material.dispose();
    emission.geometry.dispose();
    emission.material.dispose();
  });

  it("isolates vascular matter with residual non-vascular context and exact restoration", () => {
    const root = new THREE.Group();
    const contextMaterial = new THREE.MeshBasicMaterial({ opacity: 0.8, transparent: true });
    const vesselMaterial = new THREE.MeshBasicMaterial({ opacity: 0.9, transparent: true });
    const context = new THREE.Mesh(new THREE.BoxGeometry(), contextMaterial);
    const vessel = new THREE.Mesh(new THREE.CylinderGeometry(), vesselMaterial);
    declareVisual(context, "matter", "topology");
    declareVisual(vessel, "matter", "topology");
    vessel.userData.vascularTopology = true;
    root.add(context, vessel);
    const effects = new PresentationMaterialEffects();
    effects.setState({ isolateVascular: true });
    effects.beforeRender(root);
    expect(contextMaterial.opacity).toBeCloseTo(0.8 * 0.12);
    expect(vesselMaterial.opacity).toBe(0.9);
    effects.afterRender();
    expect(contextMaterial.opacity).toBe(0.8);
    expect(vesselMaterial.opacity).toBe(0.9);
    context.geometry.dispose();
    vessel.geometry.dispose();
    contextMaterial.dispose();
    vesselMaterial.dispose();
  });

  it("falls back atomically when one material in a view cannot be created", () => {
    const scene = new THREE.Scene();
    const root = new THREE.Group();
    const first = new THREE.Mesh(new THREE.SphereGeometry(0.2), new THREE.MeshBasicMaterial());
    const second = new THREE.Mesh(new THREE.SphereGeometry(0.2), new THREE.MeshBasicMaterial());
    first.name = "first";
    second.name = "second";
    declareVisual(first, "matter", "topology");
    declareVisual(second, "matter", "topology");
    root.add(first, second);
    let created: THREE.MeshPhysicalMaterial | undefined;
    let createdDisposed = false;
    const manager = managerForTest(scene, (record) => {
      if (record.object === second) throw new Error("forced-shader-failure");
      created = new THREE.MeshPhysicalMaterial();
      created.addEventListener("dispose", () => {
        createdDisposed = true;
      });
      return created;
    });
    manager.registerLayer("overview", root, [
      {
        id: "test:first",
        objectName: first.name,
        surface: "membrane",
        maximumLocalRadius: 0.3,
        opacityRange: [0, 1],
        source: "procedural-scene-graph",
      },
      {
        id: "test:second",
        objectName: second.name,
        surface: "membrane",
        maximumLocalRadius: 0.3,
        opacityRange: [0, 1],
        source: "procedural-scene-graph",
      },
    ]);
    const firstSchematic = first.material;
    const secondSchematic = second.material;
    expect(manager.setProfile("realistic-illustrative")).toBe("schematic");
    expect(first.material).toBe(firstSchematic);
    expect(second.material).toBe(secondSchematic);
    expect(manager.audit().fallbackReason).toContain("forced-shader-failure");
    expect(created).toBeDefined();
    expect(createdDisposed).toBe(true);
    manager.dispose();
    first.geometry.dispose();
    second.geometry.dispose();
    firstSchematic.dispose();
    secondSchematic.dispose();
  });

  it("adds presentation-only spherical UVs without changing geometry identity and removes them on dispose", () => {
    const scene = new THREE.Scene();
    const geometry = new THREE.TetrahedronGeometry(0.2);
    geometry.deleteAttribute("uv");
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    mesh.name = "uv-less-tissue";
    declareVisual(mesh, "matter", "topology");
    const root = new THREE.Group();
    root.add(mesh);
    const uuid = geometry.uuid;
    const manager = managerForTest(scene);
    manager.registerLayer("overview", root, [{
      id: "test:uv-less-tissue",
      objectName: mesh.name,
      surface: "tissue",
      maximumLocalRadius: 0.3,
      opacityRange: [0, 1],
      source: "procedural-scene-graph",
    }]);
    expect(geometry.getAttribute("uv")).toHaveProperty("count", geometry.getAttribute("position").count);
    expect(geometry.uuid).toBe(uuid);
    expect(manager.audit()).toMatchObject({
      semanticGeometryChanges: 0,
      generatedPresentationUvAttributes: 1,
    });
    manager.dispose();
    expect(geometry.getAttribute("uv")).toBeUndefined();
    geometry.dispose();
    mesh.material.dispose();
  });

  it("treats an explicit procedural LOD family as one semantic geometry", () => {
    const scene = new THREE.Scene();
    const high = new THREE.IcosahedronGeometry(0.2, 2);
    const low = new THREE.IcosahedronGeometry(0.2, 1);
    high.userData.presentationGeometryFamily = "r10-d:leftHemi:surface";
    low.userData.presentationGeometryFamily = "r10-d:leftHemi:surface";
    const mesh = new THREE.Mesh(high, new THREE.MeshBasicMaterial());
    mesh.name = "lod-tissue";
    declareVisual(mesh, "matter", "topology");
    const root = new THREE.Group();
    root.add(mesh);
    const manager = managerForTest(scene);
    manager.registerLayer("overview", root, [{
      id: "test:lod-tissue",
      objectName: mesh.name,
      surface: "tissue",
      maximumLocalRadius: 0.3,
      opacityRange: [0, 1],
      source: "procedural-scene-graph",
    }]);
    mesh.geometry = low;
    expect(manager.audit().semanticGeometryChanges).toBe(0);
    low.userData.presentationGeometryFamily = "r10-d:rightHemi:surface";
    expect(manager.audit().semanticGeometryChanges).toBe(1);
    manager.dispose();
    high.dispose();
    low.dispose();
    mesh.material.dispose();
  });
});
