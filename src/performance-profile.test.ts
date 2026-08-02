import { describe, expect, it } from "vitest";
import { parseSnapshotCadence, RuntimeProfiler, shouldRequestSnapshot } from "./performance-profile";

describe("runtime performance profile", () => {
  it("accepts only bounded snapshot cadences", () => {
    expect(parseSnapshotCadence("1")).toBe(1);
    expect(parseSnapshotCadence(6)).toBe(6);
    expect(parseSnapshotCadence(0)).toBeUndefined();
    expect(parseSnapshotCadence(3)).toBeUndefined();
  });

  it("publishes only after the configured tick interval", () => {
    expect(shouldRequestSnapshot(10, 11, 2)).toBe(false);
    expect(shouldRequestSnapshot(10, 12, 2)).toBe(true);
    expect(shouldRequestSnapshot(12, 12, 2)).toBe(false);
  });

  it("reports bounded rolling CPU, GPU, memory and latency metrics", () => {
    const profiler = new RuntimeProfiler();
    profiler.recordWorkerLatency(4);
    profiler.recordWorkerLatency(8);
    profiler.recordFrame(2, { calls: 21, triangles: 900, geometries: 12, textures: 2 });
    profiler.recordFrame(6, { calls: 23, triangles: 920, geometries: 12, textures: 2 }, 1024);
    const report = profiler.report(2);
    expect(report.workerLatencyMs).toEqual({ mean: 6, p95: 8 });
    expect(report.frameCpuMs).toEqual({ mean: 4, p95: 6 });
    expect(report.gpu.drawCalls).toBe(23);
    expect(report.memory.jsHeapBytes).toBe(1024);
  });
});
