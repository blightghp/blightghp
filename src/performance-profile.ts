import type { NeuralSnapshot } from "./protocol";

export const SNAPSHOT_CADENCES = [1, 2, 4, 6] as const;
export type SnapshotCadence = (typeof SNAPSHOT_CADENCES)[number];

export function parseSnapshotCadence(value: unknown): SnapshotCadence | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return SNAPSHOT_CADENCES.find((cadence) => cadence === parsed);
}

export function shouldRequestSnapshot(
  publishedTick: number,
  targetTick: number,
  cadence: SnapshotCadence,
): boolean {
  return targetTick > publishedTick && targetTick - publishedTick >= cadence;
}

export function snapshotByteLength(snapshot: NeuralSnapshot): number {
  return [
    snapshot.potentials,
    snapshot.activations,
    snapshot.weights,
    snapshot.signals.synapseIds,
    snapshot.signals.progress,
    snapshot.signals.strength,
    snapshot.signals.inhibitory,
    snapshot.field.nodeIndices,
    snapshot.field.eField,
    snapshot.field.iField,
    snapshot.field.waveActivity,
    snapshot.corticothalamic.excitatory,
    snapshot.corticothalamic.inhibitory,
  ].reduce((sum, view) => sum + view.byteLength, 0);
}

interface RenderCounters {
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
}

export interface RuntimeProfile {
  snapshotCadenceTicks: SnapshotCadence;
  sampleCount: number;
  workerLatencyMs: { mean: number; p95: number };
  frameCpuMs: { mean: number; p95: number };
  gpu: { drawCalls: number; triangles: number };
  memory: {
    snapshotBytes: number;
    jsHeapBytes?: number;
    geometries: number;
    textures: number;
  };
}

const WINDOW_SIZE = 240;

function summary(samples: readonly number[]): { mean: number; p95: number } {
  if (samples.length === 0) return { mean: 0, p95: 0 };
  const sorted = [...samples].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return {
    mean: samples.reduce((sum, value) => sum + value, 0) / samples.length,
    p95: sorted[index],
  };
}

export class RuntimeProfiler {
  private readonly workerLatency: number[] = [];
  private readonly frameCpu: number[] = [];
  private snapshotBytes = 0;
  private counters: RenderCounters = { calls: 0, triangles: 0, geometries: 0, textures: 0 };
  private jsHeapBytes: number | undefined;

  recordWorkerLatency(milliseconds: number): void {
    this.push(this.workerLatency, milliseconds);
  }

  recordFrame(milliseconds: number, counters: RenderCounters, jsHeapBytes?: number): void {
    this.push(this.frameCpu, milliseconds);
    this.counters = counters;
    if (jsHeapBytes !== undefined && Number.isFinite(jsHeapBytes)) this.jsHeapBytes = jsHeapBytes;
  }

  recordSnapshot(snapshot: NeuralSnapshot): void {
    this.snapshotBytes = snapshotByteLength(snapshot);
  }

  report(snapshotCadenceTicks: SnapshotCadence): RuntimeProfile {
    return {
      snapshotCadenceTicks,
      sampleCount: Math.min(this.workerLatency.length, this.frameCpu.length),
      workerLatencyMs: summary(this.workerLatency),
      frameCpuMs: summary(this.frameCpu),
      gpu: { drawCalls: this.counters.calls, triangles: this.counters.triangles },
      memory: {
        snapshotBytes: this.snapshotBytes,
        jsHeapBytes: this.jsHeapBytes,
        geometries: this.counters.geometries,
        textures: this.counters.textures,
      },
    };
  }

  private push(samples: number[], value: number): void {
    if (!Number.isFinite(value) || value < 0) return;
    samples.push(value);
    if (samples.length > WINDOW_SIZE) samples.shift();
  }
}
