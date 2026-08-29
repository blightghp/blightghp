import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  freezeStaticPresentationMatrices,
  measurePresentationResources,
  PresentationBudgetMonitor,
  RenderProfileGovernor,
} from "./presentation-budget";
import {
  estimateHalfResolutionAmbientOcclusionTextureBytes,
} from "./ambient-occlusion";
import { estimateSelectiveBloomTextureBytes } from "./selective-bloom";
import type { PresentationFrameSample } from "./presentation-budget";
import { declareVisual } from "./render-types";

function sample(frameMilliseconds: number): PresentationFrameSample {
  return {
    view: "overview",
    frameMilliseconds,
    drawCalls: 12,
    triangles: 12_000,
    textureBytes: 4_096,
    geometryBytes: 8_192,
  };
}

describe("R10-C presentation budget", () => {
  it("degrades enhanced only after a consecutive pressure window", () => {
    const governor = new RenderProfileGovernor(undefined, {
      consecutiveOverBudgetFrames: 3,
      recoveryFrames: 2,
      recoveryRatio: 1,
    });
    expect(governor.observe(sample(21)).profile).toBe("enhanced");
    expect(governor.observe(sample(21)).profile).toBe("enhanced");
    expect(governor.observe(sample(19)).consecutiveOverBudgetFrames).toBe(0);
    expect(governor.observe(sample(21)).profile).toBe("enhanced");
    expect(governor.observe(sample(21)).profile).toBe("enhanced");
    const degraded = governor.observe(sample(21));
    expect(degraded).toMatchObject({
      profile: "baseline",
      reason: "frame-budget-exceeded",
      recoveryAvailable: false,
    });
    expect(() => governor.request("enhanced", false)).toThrow(/recovery is not available/);
    governor.observe(sample(10));
    expect(governor.observe(sample(10)).recoveryAvailable).toBe(true);
    expect(governor.request("enhanced", false).profile).toBe("enhanced");
  });

  it("isolates cinema to capture mode and rejects malformed samples", () => {
    const governor = new RenderProfileGovernor();
    expect(() => governor.request("cinema", false)).toThrow(/requires capture mode/);
    expect(governor.request("cinema", true).profile).toBe("cinema");
    expect(governor.leaveCaptureMode().profile).toBe("enhanced");
    expect(() => governor.observe(sample(Number.NaN))).toThrow(/invalid presentation budget/);
  });

  it("reports p50/p95 and every versioned ceiling per view", () => {
    const governor = new RenderProfileGovernor(undefined, { initialProfile: "baseline" });
    const monitor = new PresentationBudgetMonitor();
    for (const frame of [5, 8, 13, 21]) monitor.record(sample(frame));
    const report = monitor.audit("baseline", governor.audit());
    expect(report.schemaVersion).toBe(1);
    expect(report.views.overview).toMatchObject({
      sampleCount: 4,
      frameMillisecondsP50: 8,
      measuredFrameMillisecondsP95: 21,
      measuredDrawCalls: 12,
      withinBudget: true,
    });
    expect(Object.keys(report.views)).toHaveLength(6);
    expect(report.views.laminar.withinBudget).toBe(false);
    expect(report.contractReady).toBe(false);
  });

  it("counts shared resource buffers once and freezes only static declarations", () => {
    const root = new THREE.Group();
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const texture = new THREE.DataTexture(new Uint8Array(4 * 4 * 4), 4, 4);
    const topology = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ map: texture }),
    );
    const duplicate = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture }));
    const stateGeometry = new THREE.SphereGeometry();
    const state = new THREE.Mesh(stateGeometry, new THREE.MeshBasicMaterial());
    declareVisual(topology, "matter", "topology");
    declareVisual(duplicate, "matter", "decoration");
    declareVisual(state, "matter", "state", {
      field: "fixture",
      unit: "1",
      transform: "identity",
      redundancy: ["shape"],
    });
    root.add(topology, duplicate, state);

    const resources = measurePresentationResources(root);
    const bytesFor = (candidate: THREE.BufferGeometry) =>
      (candidate.index?.array.byteLength ?? 0) +
      Object.values(candidate.attributes).reduce(
        (total, attribute) => total + attribute.array.byteLength,
        0,
      );
    const expectedGeometryBytes = bytesFor(geometry) + bytesFor(stateGeometry);
    expect(resources.geometryBytes).toBe(expectedGeometryBytes);
    expect(resources.textureBytes).toBe(4 * 4 * 4);
    expect(freezeStaticPresentationMatrices(root)).toBe(2);
    expect(topology.matrixAutoUpdate).toBe(false);
    expect(duplicate.matrixAutoUpdate).toBe(false);
    expect(state.matrixAutoUpdate).toBe(true);
  });

  it("accounts for composer targets, bloom mips and device pixel ratio", () => {
    expect(estimateSelectiveBloomTextureBytes(100, 50, 1)).toBe(197_232);
    expect(estimateSelectiveBloomTextureBytes(100, 50, 2)).toBe(787_104);
    expect(estimateHalfResolutionAmbientOcclusionTextureBytes(100, 50, 1)).toBe(67_768);
  });
});
