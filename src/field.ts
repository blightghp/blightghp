import type { BrainData } from "./brain";

export interface FieldSnapshot {
  eField: Float32Array;
  iField: Float32Array;
  waveActivity: Float32Array;
}

export interface FieldConfig {
  tauE: number;
  tauI: number;
  diffusionE: number;
  diffusionI: number;
  couplingGain: number;
  conductionSpeed: number; // spatial units / second
}

const DEFAULT_CONFIG: FieldConfig = {
  tauE: 0.016, // 16ms
  tauI: 0.024, // 24ms
  diffusionE: 0.18,
  diffusionI: 0.12,
  couplingGain: 0.08,
  conductionSpeed: 1.6,
};

export class PopulationField {
  readonly nodeCount: number;
  readonly eField: Float32Array;
  readonly iField: Float32Array;
  readonly waveActivity: Float32Array;

  private readonly neighbors: Int32Array[];
  private readonly neighborWeights: Float32Array[];
  private readonly conductionDelays: Uint16Array[];
  private readonly delayBuffersE: Float32Array[];
  private readonly delayBuffersI: Float32Array[];
  private readonly bufferCursors: Uint16Array;
  private readonly config: FieldConfig;

  constructor(data: BrainData, config: Partial<FieldConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.nodeCount = data.nodes.length;
    this.eField = new Float32Array(this.nodeCount);
    this.iField = new Float32Array(this.nodeCount);
    this.waveActivity = new Float32Array(this.nodeCount);

    const neighborsList: number[][] = Array.from({ length: this.nodeCount }, () => []);
    const weightsList: number[][] = Array.from({ length: this.nodeCount }, () => []);
    const delaysList: number[][] = Array.from({ length: this.nodeCount }, () => []);
    const maxDelays: number[] = Array.from({ length: this.nodeCount }, () => 1);

    const radius = 0.42;
    for (let i = 0; i < this.nodeCount; i += 1) {
      const posI = data.nodes[i];
      for (let j = 0; j < this.nodeCount; j += 1) {
        if (i === j) continue;
        const posJ = data.nodes[j];
        const dist = posI.distanceTo(posJ);
        if (dist <= radius) {
          neighborsList[i].push(j);
          const weight = Math.exp(-dist * 4.5);
          weightsList[i].push(weight);
          const delaySteps = Math.max(1, Math.round(dist / (this.config.conductionSpeed * 0.016)));
          delaysList[i].push(delaySteps);
          if (delaySteps > maxDelays[i]) maxDelays[i] = delaySteps;
        }
      }
    }

    this.neighbors = neighborsList.map((arr) => Int32Array.from(arr));
    this.neighborWeights = weightsList.map((arr) => {
      const sum = arr.reduce((a, b) => a + b, 0);
      const norm = sum > 0 ? sum : 1;
      return Float32Array.from(arr.map((w) => w / norm));
    });
    this.conductionDelays = delaysList.map((arr) => Uint16Array.from(arr));

    this.delayBuffersE = maxDelays.map((maxD) => new Float32Array(maxD + 2));
    this.delayBuffersI = maxDelays.map((maxD) => new Float32Array(maxD + 2));
    this.bufferCursors = new Uint16Array(this.nodeCount);
  }

  step(spiked: Uint8Array, neuronKinds: ("excitatory" | "inhibitory")[], dt: number): void {
    const decayE = Math.exp(-dt / this.config.tauE);
    const decayI = Math.exp(-dt / this.config.tauI);

    for (let i = 0; i < this.nodeCount; i += 1) {
      if (spiked[i]) {
        if (neuronKinds[i] === "excitatory") {
          this.eField[i] += 0.45;
        } else {
          this.iField[i] += 0.55;
        }
      }
    }

    const nextE = new Float32Array(this.nodeCount);
    const nextI = new Float32Array(this.nodeCount);

    for (let i = 0; i < this.nodeCount; i += 1) {
      const eVal = this.eField[i] * decayE;
      const iVal = this.iField[i] * decayI;

      const nbrs = this.neighbors[i];
      const wts = this.neighborWeights[i];
      let lapE = 0;
      let lapI = 0;

      for (let k = 0; k < nbrs.length; k += 1) {
        const nbrIndex = nbrs[k];
        const w = wts[k];
        lapE += (this.eField[nbrIndex] - eVal) * w;
        lapI += (this.iField[nbrIndex] - iVal) * w;
      }

      nextE[i] = Math.max(0, Math.min(2.5, eVal + this.config.diffusionE * lapE * dt * 10));
      nextI[i] = Math.max(0, Math.min(2.5, iVal + this.config.diffusionI * lapI * dt * 10));

      this.waveActivity[i] = Math.min(1, nextE[i] * 0.7 + nextI[i] * 0.3);
    }

    this.eField.set(nextE);
    this.iField.set(nextI);
  }

  getCouplingCurrent(nodeIndex: number): number {
    const e = this.eField[nodeIndex];
    const i = this.iField[nodeIndex];
    return (e - i) * this.config.couplingGain;
  }

  getConductionDelay(nodeIndex: number, neighborIndex: number): number {
    return this.conductionDelays[nodeIndex]?.[neighborIndex] ?? 1;
  }

  reset(): void {
    this.eField.fill(0);
    this.iField.fill(0);
    this.waveActivity.fill(0);
    this.delayBuffersE.forEach((buf) => buf.fill(0));
    this.delayBuffersI.forEach((buf) => buf.fill(0));
    this.bufferCursors.fill(0);
  }

  snapshot(): FieldSnapshot {
    return {
      eField: this.eField.slice(),
      iField: this.iField.slice(),
      waveActivity: this.waveActivity.slice(),
    };
  }
}
