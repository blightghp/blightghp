import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { generateBrainData } from "../brain";
import {
  buildProceduralSurface,
  buildProceduralSurfaceSet,
  PROCEDURAL_SURFACE_HIGH_TRIANGLE_CEILING,
  PROCEDURAL_SURFACE_LOW_TRIANGLE_CEILING,
} from "./procedural-surface";

function disposeSet(result: ReturnType<typeof buildProceduralSurfaceSet>): void {
  for (const region of Object.values(result.geometries)) {
    region.high.dispose();
    region.low.dispose();
  }
}

describe("R10-D procedural anatomical surface", () => {
  it("builds deterministic LODs, hashes and baked attributes from the brain seed", () => {
    const data = generateBrainData();
    const first = buildProceduralSurfaceSet(data, { buildCeilingMilliseconds: 5_000 });
    const second = buildProceduralSurfaceSet(data, { buildCeilingMilliseconds: 5_000 });
    expect(second.audit.surfaceGeometryHash).toBe(first.audit.surfaceGeometryHash);
    expect(first.audit.surfaceGeometryHash).toBe("7dfdd64207190121");
    expect(first.audit).toMatchObject({
      schemaVersion: 1,
      algorithmVersion: "r10-d-simplex-ridge-v1",
      seed: data.seed,
      totalTriangles: { high: 5_780, low: 1_500 },
      contractReady: true,
    });
    expect(first.audit.totalTriangles.high).toBeLessThanOrEqual(
      PROCEDURAL_SURFACE_HIGH_TRIANGLE_CEILING,
    );
    expect(first.audit.totalTriangles.low).toBeLessThanOrEqual(
      PROCEDURAL_SURFACE_LOW_TRIANGLE_CEILING,
    );
    for (const geometry of Object.values(first.geometries)) {
      for (const candidate of [geometry.high, geometry.low]) {
        const positions = candidate.getAttribute("position");
        expect(candidate.getAttribute("aoFactor").count).toBe(positions.count);
        expect(candidate.getAttribute("curvature").count).toBe(positions.count);
        expect(candidate.getAttribute("thickness").count).toBe(positions.count);
        expect(candidate.getAttribute("color").count).toBe(positions.count);
        expect(candidate.getAttribute("uv").count).toBe(positions.count);
      }
    }
    disposeSet(first);
    disposeSet(second);
  });

  it("separates seed and region hash domains", () => {
    const data = generateBrainData({ seed: 19 });
    const points = data.groups.leftHemi.map((index) => data.nodes[index]);
    const first = buildProceduralSurface("leftHemi", points, 19, "low");
    const otherSeed = buildProceduralSurface("leftHemi", points, 20, "low");
    const otherRegion = buildProceduralSurface("rightHemi", points, 19, "low");
    expect(first.audit.hash).not.toBe(otherSeed.audit.hash);
    expect(first.audit.hash).not.toBe(otherRegion.audit.hash);
    first.geometry.dispose();
    otherSeed.geometry.dispose();
    otherRegion.geometry.dispose();
  });

  it("rejects malformed inputs and construction budget exhaustion atomically", () => {
    expect(() => buildProceduralSurface(
      "leftHemi",
      [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()],
      1,
      "low",
    )).toThrow(/point count/);
    expect(() => buildProceduralSurface(
      "leftHemi",
      [
        new THREE.Vector3(),
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(Number.NaN, 0, 1),
      ],
      1,
      "low",
    )).toThrow(/invalid point/);
    let timestamp = 0;
    expect(() => buildProceduralSurfaceSet(generateBrainData(), {
      buildCeilingMilliseconds: 1,
      now: () => (timestamp += 10),
    })).toThrow(/budget exceeded/);
  });
});
