import type {
  BrainData,
  CorticalFieldTopology,
  NeuronKind,
} from "./brain";

export interface FieldSnapshot {
  nodeIndices: Uint32Array;
  eField: Float32Array;
  iField: Float32Array;
  waveActivity: Float32Array;
}

export interface FieldConfig {
  dtSeconds: number;
  tauESeconds: number;
  tauISeconds: number;
  propagationEPerSecond: number;
  propagationIPerSecond: number;
  couplingGain: number;
  conductionSpeedUnitsPerSecond: number;
  spatialKernelScale: number;
  excitatorySpikeImpulse: number;
  inhibitorySpikeImpulse: number;
  maxActivity: number;
}

export const DEFAULT_FIELD_CONFIG: Readonly<FieldConfig> = {
  dtSeconds: 1 / 60,
  tauESeconds: 0.016,
  tauISeconds: 0.024,
  propagationEPerSecond: 1.8,
  propagationIPerSecond: 1.2,
  couplingGain: 0.08,
  conductionSpeedUnitsPerSecond: 1.6,
  spatialKernelScale: 0.22,
  excitatorySpikeImpulse: 0.45,
  inhibitorySpikeImpulse: 0.55,
  maxActivity: 2.5,
};

export interface ProjectedSpikeDrive {
  excitatory: Float32Array;
  inhibitory: Float32Array;
}

function assertPositiveFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} deve ser positivo e finito.`);
  }
}

function validateConfig(config: FieldConfig): void {
  assertPositiveFinite("dtSeconds", config.dtSeconds);
  assertPositiveFinite("tauESeconds", config.tauESeconds);
  assertPositiveFinite("tauISeconds", config.tauISeconds);
  assertPositiveFinite("conductionSpeedUnitsPerSecond", config.conductionSpeedUnitsPerSecond);
  assertPositiveFinite("spatialKernelScale", config.spatialKernelScale);
  assertPositiveFinite("excitatorySpikeImpulse", config.excitatorySpikeImpulse);
  assertPositiveFinite("inhibitorySpikeImpulse", config.inhibitorySpikeImpulse);
  assertPositiveFinite("maxActivity", config.maxActivity);
  if (
    !Number.isFinite(config.propagationEPerSecond) ||
    config.propagationEPerSecond < 0 ||
    !Number.isFinite(config.propagationIPerSecond) ||
    config.propagationIPerSecond < 0 ||
    !Number.isFinite(config.couplingGain) ||
    config.couplingGain < 0
  ) {
    throw new RangeError("Propagação e ganho de acoplamento devem ser finitos e não negativos.");
  }
}

/**
 * Aggregates every cortical spike exactly once into its assigned field vertex.
 * The sums therefore preserve the configured impulse across the projection.
 */
export function projectSpikesToField(
  topology: CorticalFieldTopology,
  spiked: Uint8Array,
  neuronKinds: readonly NeuronKind[],
  excitatoryImpulse = DEFAULT_FIELD_CONFIG.excitatorySpikeImpulse,
  inhibitoryImpulse = DEFAULT_FIELD_CONFIG.inhibitorySpikeImpulse,
): ProjectedSpikeDrive {
  if (spiked.length !== topology.vertexByNode.length || neuronKinds.length !== spiked.length) {
    throw new RangeError("Spikes, tipos neuronais e projeção devem ter o mesmo número de nós.");
  }
  assertPositiveFinite("excitatoryImpulse", excitatoryImpulse);
  assertPositiveFinite("inhibitoryImpulse", inhibitoryImpulse);

  const excitatory = new Float32Array(topology.nodeIndices.length);
  const inhibitory = new Float32Array(topology.nodeIndices.length);
  for (let node = 0; node < spiked.length; node += 1) {
    if (!spiked[node]) continue;
    const vertex = topology.vertexByNode[node];
    if (vertex < 0) continue;
    if (neuronKinds[node] === "excitatory") {
      excitatory[vertex] += excitatoryImpulse;
    } else {
      inhibitory[vertex] += inhibitoryImpulse;
    }
  }
  return { excitatory, inhibitory };
}

/**
 * Delayed graph-kernel E/I field on the procedural cortical surface.
 *
 * The topology is an explicit k-nearest-neighbour graph, not a triangular
 * anatomical mesh and not a Laplace–Beltrami operator. Edge history is sampled
 * at distance / conduction speed, making propagation delay part of the actual
 * update rather than metadata used only by the renderer.
 */
export class PopulationField {
  readonly vertexCount: number;
  readonly eField: Float32Array;
  readonly iField: Float32Array;
  readonly waveActivity: Float32Array;

  private readonly topology: CorticalFieldTopology;
  private readonly neighborWeights: Float32Array;
  private readonly conductionDelaySteps: Uint16Array;
  private readonly historyE: Float32Array;
  private readonly historyI: Float32Array;
  private readonly historyLength: number;
  private readonly nextE: Float32Array;
  private readonly nextI: Float32Array;
  private readonly config: FieldConfig;
  private historyCursor = 0;

  constructor(data: BrainData, config: Partial<FieldConfig> = {}) {
    this.config = { ...DEFAULT_FIELD_CONFIG, ...config };
    validateConfig(this.config);
    this.topology = data.corticalField;
    this.vertexCount = this.topology.nodeIndices.length;
    this.eField = new Float32Array(this.vertexCount);
    this.iField = new Float32Array(this.vertexCount);
    this.waveActivity = new Float32Array(this.vertexCount);
    this.nextE = new Float32Array(this.vertexCount);
    this.nextI = new Float32Array(this.vertexCount);

    this.neighborWeights = new Float32Array(this.topology.neighbors.length);
    this.conductionDelaySteps = new Uint16Array(this.topology.neighbors.length);
    let maximumDelay = 1;
    for (let vertex = 0; vertex < this.vertexCount; vertex += 1) {
      const start = this.topology.rowOffsets[vertex];
      const end = this.topology.rowOffsets[vertex + 1];
      let weightSum = 0;
      for (let edge = start; edge < end; edge += 1) {
        const length = this.topology.edgeLengths[edge];
        const weight = Math.exp(-length / this.config.spatialKernelScale);
        this.neighborWeights[edge] = weight;
        weightSum += weight;
        const delay = Math.max(
          1,
          Math.round(
            length /
              (this.config.conductionSpeedUnitsPerSecond * this.config.dtSeconds),
          ),
        );
        if (delay > 0xffff) {
          throw new RangeError("O atraso do campo excede a capacidade de Uint16.");
        }
        this.conductionDelaySteps[edge] = delay;
        maximumDelay = Math.max(maximumDelay, delay);
      }
      if (weightSum > 0) {
        for (let edge = start; edge < end; edge += 1) {
          this.neighborWeights[edge] /= weightSum;
        }
      }
    }

    this.historyLength = maximumDelay + 1;
    this.historyE = new Float32Array(this.historyLength * this.vertexCount);
    this.historyI = new Float32Array(this.historyLength * this.vertexCount);
  }

  step(spiked: Uint8Array, neuronKinds: readonly NeuronKind[], dt: number): void {
    if (Math.abs(dt - this.config.dtSeconds) > Number.EPSILON * 8) {
      throw new RangeError("O campo deve avançar com o passo fixo declarado em dtSeconds.");
    }
    const drive = projectSpikesToField(
      this.topology,
      spiked,
      neuronKinds,
      this.config.excitatorySpikeImpulse,
      this.config.inhibitorySpikeImpulse,
    );
    for (let vertex = 0; vertex < this.vertexCount; vertex += 1) {
      this.eField[vertex] += drive.excitatory[vertex];
      this.iField[vertex] += drive.inhibitory[vertex];
    }

    const historyBase = this.historyCursor * this.vertexCount;
    this.historyE.set(this.eField, historyBase);
    this.historyI.set(this.iField, historyBase);

    const decayE = Math.exp(-dt / this.config.tauESeconds);
    const decayI = Math.exp(-dt / this.config.tauISeconds);
    for (let vertex = 0; vertex < this.vertexCount; vertex += 1) {
      const currentE = this.eField[vertex];
      const currentI = this.iField[vertex];
      let delayedMeanE = 0;
      let delayedMeanI = 0;
      const start = this.topology.rowOffsets[vertex];
      const end = this.topology.rowOffsets[vertex + 1];
      for (let edge = start; edge < end; edge += 1) {
        const neighbor = this.topology.neighbors[edge];
        const delayedCursor =
          (this.historyCursor - this.conductionDelaySteps[edge] + this.historyLength) %
          this.historyLength;
        const delayedIndex = delayedCursor * this.vertexCount + neighbor;
        const weight = this.neighborWeights[edge];
        delayedMeanE += this.historyE[delayedIndex] * weight;
        delayedMeanI += this.historyI[delayedIndex] * weight;
      }

      const propagatedE =
        currentE * decayE +
        this.config.propagationEPerSecond * (delayedMeanE - currentE) * dt;
      const propagatedI =
        currentI * decayI +
        this.config.propagationIPerSecond * (delayedMeanI - currentI) * dt;
      this.nextE[vertex] = Math.max(0, Math.min(this.config.maxActivity, propagatedE));
      this.nextI[vertex] = Math.max(0, Math.min(this.config.maxActivity, propagatedI));
      this.waveActivity[vertex] = Math.min(
        1,
        this.nextE[vertex] * 0.7 + this.nextI[vertex] * 0.3,
      );
    }

    this.eField.set(this.nextE);
    this.iField.set(this.nextI);
    this.historyCursor = (this.historyCursor + 1) % this.historyLength;
  }

  getFieldVertexForNode(nodeIndex: number): number {
    return this.topology.vertexByNode[nodeIndex] ?? -1;
  }

  getCouplingCurrent(nodeIndex: number): number {
    const vertex = this.getFieldVertexForNode(nodeIndex);
    if (vertex < 0) return 0;
    return (this.eField[vertex] - this.iField[vertex]) * this.config.couplingGain;
  }

  getConductionDelaySteps(sourceVertex: number, targetVertex: number): number | undefined {
    if (
      sourceVertex < 0 ||
      sourceVertex >= this.vertexCount ||
      targetVertex < 0 ||
      targetVertex >= this.vertexCount
    ) {
      return undefined;
    }
    const start = this.topology.rowOffsets[targetVertex];
    const end = this.topology.rowOffsets[targetVertex + 1];
    for (let edge = start; edge < end; edge += 1) {
      if (this.topology.neighbors[edge] === sourceVertex) {
        return this.conductionDelaySteps[edge];
      }
    }
    return undefined;
  }

  reset(): void {
    this.eField.fill(0);
    this.iField.fill(0);
    this.waveActivity.fill(0);
    this.nextE.fill(0);
    this.nextI.fill(0);
    this.historyE.fill(0);
    this.historyI.fill(0);
    this.historyCursor = 0;
  }

  snapshot(): FieldSnapshot {
    return {
      nodeIndices: this.topology.nodeIndices.slice(),
      eField: this.eField.slice(),
      iField: this.iField.slice(),
      waveActivity: this.waveActivity.slice(),
    };
  }
}
