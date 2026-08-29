import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { generateBrainData } from "../brain";
import { anatomicalDeclarationOf } from "./anatomical-provenance";
import {
  ClippingSystem,
  applyR10ECutFaceShader,
  createR10ECutFaceMaterial,
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
  it("bounds cut-face uniforms and rejects an incompatible shader before mutation", () => {
    const invalid = createR10ECutFaceMaterial([], {
      color: Number.NaN,
      tint: new THREE.Color(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY),
      opacity: Number.POSITIVE_INFINITY,
      patternStrength: Number.NEGATIVE_INFINITY,
      patternScale: Number.NaN,
    });
    const invalidShader = {
      vertexShader: THREE.ShaderLib.basic.vertexShader,
      fragmentShader: THREE.ShaderLib.basic.fragmentShader,
      uniforms: {},
    } as unknown as THREE.WebGLProgramParametersWithUniforms;
    invalid.onBeforeCompile(invalidShader, {} as THREE.WebGLRenderer);
    expect(invalid.opacity).toBeCloseTo(0.86);
    expect([invalid.color.r, invalid.color.g, invalid.color.b].every(Number.isFinite)).toBe(true);
    expect([
      (invalidShader.uniforms.r10eCutFaceTint.value as THREE.Color).r,
      (invalidShader.uniforms.r10eCutFaceTint.value as THREE.Color).g,
      (invalidShader.uniforms.r10eCutFaceTint.value as THREE.Color).b,
    ].every(Number.isFinite)).toBe(true);
    expect(invalidShader.uniforms.r10eCutFacePatternStrength.value).toBeCloseTo(0.16);
    expect(invalidShader.uniforms.r10eCutFacePatternScale.value).toBeCloseTo(2.2);

    const clamped = createR10ECutFaceMaterial([], {
      color: 0xffffff,
      tint: 0x000000,
      opacity: 2,
      patternStrength: 1,
      patternScale: 0,
    });
    const clampedShader = {
      vertexShader: THREE.ShaderLib.basic.vertexShader,
      fragmentShader: THREE.ShaderLib.basic.fragmentShader,
      uniforms: {},
    } as unknown as THREE.WebGLProgramParametersWithUniforms;
    clamped.onBeforeCompile(clampedShader, {} as THREE.WebGLRenderer);
    expect(clamped.opacity).toBe(1);
    expect(clampedShader.uniforms.r10eCutFacePatternStrength.value).toBeCloseTo(0.32);
    expect(clampedShader.uniforms.r10eCutFacePatternScale.value).toBeCloseTo(0.1);

    const malformed = {
      vertexShader: THREE.ShaderLib.basic.vertexShader,
      fragmentShader: THREE.ShaderLib.basic.fragmentShader.replace("#include <aomap_fragment>", ""),
      uniforms: {},
    } as unknown as THREE.WebGLProgramParametersWithUniforms;
    const vertexBefore = malformed.vertexShader;
    const fragmentBefore = malformed.fragmentShader;
    expect(() => applyR10ECutFaceShader(malformed)).toThrow(/ambient-occlusion modulation/);
    expect(malformed.vertexShader).toBe(vertexBefore);
    expect(malformed.fragmentShader).toBe(fragmentBefore);
    expect(malformed.uniforms).toEqual({});
    invalid.dispose();
    clamped.dispose();
  });

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
      cutFaceShaderCaps: 1,
      estimatedAdditionalDrawCalls: 3,
      maximumAdditionalDrawCalls: 18,
    });
    expect(clipping.cacheAudit()).toEqual({ layers: 1, objects: 2, builds: 1 });
    const stencil = scene.getObjectByName("cut-stencil-back-0-0") as THREE.Mesh;
    const cap = scene.getObjectByName("cut-cap-0") as THREE.Mesh;
    expect(stencil.geometry).toBe(source.geometry);
    expect(visualProvenanceOf(stencil)).toBe("decoration");
    expect(visualProvenanceOf(cap)).toBe("decoration");
    expect(anatomicalDeclarationOf(cap)).toMatchObject({ kind: "not-anatomical" });
    const capMaterial = cap.material as THREE.MeshBasicMaterial;
    expect(capMaterial.userData.r10eMaterialRegion).toBe("cut-face");
    expect(capMaterial.userData.r10eCutFaceShader).toBe(true);
    expect(capMaterial.customProgramCacheKey()).toBe("r10-e-cut-face-v1");
    expect(capMaterial.clippingPlanes).toHaveLength(0);
    expect(capMaterial.depthTest).toBe(true);
    expect(capMaterial.depthWrite).toBe(true);
    expect(capMaterial.stencilWrite).toBe(true);
    expect(capMaterial.stencilRef).toBe(0);
    expect(capMaterial.stencilFunc).toBe(THREE.NotEqualStencilFunc);
    expect(capMaterial.stencilFail).toBe(THREE.ReplaceStencilOp);
    expect(capMaterial.stencilZFail).toBe(THREE.ReplaceStencilOp);
    expect(capMaterial.stencilZPass).toBe(THREE.ReplaceStencilOp);
    const shader = {
      vertexShader: THREE.ShaderLib.basic.vertexShader,
      fragmentShader: THREE.ShaderLib.basic.fragmentShader,
      uniforms: {},
    } as unknown as THREE.WebGLProgramParametersWithUniforms;
    capMaterial.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(shader.vertexShader).toContain("varying vec3 vR10ECutFaceWorldPosition;");
    expect(shader.vertexShader).toContain(
      "vR10ECutFaceWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;",
    );
    expect(shader.fragmentShader).toContain("uniform vec3 r10eCutFaceTint;");
    const patternIndex = shader.fragmentShader.indexOf("vec3 r10eCutFaceCell");
    expect(patternIndex).toBeGreaterThan(shader.fragmentShader.indexOf("#include <aomap_fragment>"));
    expect(patternIndex).toBeLessThan(
      shader.fragmentShader.indexOf("reflectedLight.indirectDiffuse *= diffuseColor.rgb"),
    );
    expect(Number.isFinite(shader.uniforms.r10eCutFacePatternStrength.value as number)).toBe(true);
    expect(Number.isFinite(shader.uniforms.r10eCutFacePatternScale.value as number)).toBe(true);
    const stencilDispose = vi.spyOn(stencil.material as THREE.Material, "dispose");
    const capGeometryDispose = vi.spyOn(cap.geometry, "dispose");
    const capMaterialDispose = vi.spyOn(cap.material as THREE.Material, "dispose");

    clipping.setState({ slab: true });
    clipping.update();
    expect(clipping.audit()).toMatchObject({
      planeCount: 2,
      cutFaceShaderCaps: 2,
      estimatedAdditionalDrawCalls: 6,
    });
    const slabCap0 = scene.getObjectByName("cut-cap-0") as THREE.Mesh<
      THREE.PlaneGeometry,
      THREE.MeshBasicMaterial
    >;
    const slabCap1 = scene.getObjectByName("cut-cap-1") as THREE.Mesh<
      THREE.PlaneGeometry,
      THREE.MeshBasicMaterial
    >;
    expect(slabCap0.material.clippingPlanes).toHaveLength(1);
    expect(slabCap1.material.clippingPlanes).toHaveLength(1);
    expect(stencilDispose).toHaveBeenCalledOnce();
    expect(capGeometryDispose).toHaveBeenCalledOnce();
    expect(capMaterialDispose).toHaveBeenCalledOnce();
    expect(clipping.cacheAudit().builds).toBe(1);
    clipping.invalidateLayer("overview");
    expect(clipping.cacheAudit().builds).toBe(2);

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
