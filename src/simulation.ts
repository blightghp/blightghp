import { BrainData } from "./brain";
import { buildSynapseCsr, incomingRow, outgoingRow, SynapseCsr } from "./network";
import { meanAbsoluteWeight, PopulationFiringRate } from "./observables";
import {
  SIMULATION_PROTOCOL_VERSION,
  SIMULATION_STEP_SECONDS,
} from "./protocol";
import type {
  NeuralSignal,
  NeuralSnapshot,
  NeuralStimulus,
  SignalBatch,
  SimulationTick,
} from "./protocol";
import {
  RANDOM_STREAM_CELL_REFRACTORY,
  RANDOM_STREAM_CELL_THRESHOLD,
  randomUnit,
} from "./random";

export type { NeuralSignal, NeuralSnapshot, NeuralStimulus } from "./protocol";

interface SignalInFlight extends NeuralSignal {
  elapsed: number;
  duration: number;
}

const MIN_EXCITATORY_WEIGHT = 0.12;
const MAX_EXCITATORY_WEIGHT = 0.92;
const MAX_SIGNALS_IN_FLIGHT = 900;
const FIRING_RATE_WINDOW_SECONDS = 0.2;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export class NeuralSimulation {
  readonly potentials: Float32Array;
  readonly activations: Float32Array;
  readonly gAmpa: Float32Array;
  readonly gGaba: Float32Array;

  private readonly data: BrainData;
  private readonly fixedStep: number;
  private readonly seed: number;
  private readonly initialWeights: Float32Array;
  private readonly weights: Float32Array;
  private readonly delaySteps: Uint16Array;
  private readonly thresholds: Float32Array;
  private readonly refractory: Float32Array;
  private readonly preTrace: Float32Array;
  private readonly postTrace: Float32Array;
  private readonly spiked: Uint8Array;
  private readonly csr: SynapseCsr;
  private readonly pending: Float32Array[];
  private readonly inputNodes: number[];
  private readonly inputPhases: number[];
  private readonly firingRateObservable: PopulationFiringRate;
  private signalsInFlight: SignalInFlight[] = [];
  private queueCursor = 0;
  private currentTick = 0;
  private rate = 0;
  private latestSpikeCount = 0;
  private learningRate = 0.004;

  constructor(data: BrainData, fixedStep = SIMULATION_STEP_SECONDS, seed = data.seed) {
    if (!Number.isFinite(fixedStep) || fixedStep <= 0) {
      throw new RangeError("O passo da simulação deve ser um número positivo e finito.");
    }
    this.data = data;
    this.fixedStep = fixedStep;
    this.seed = seed;
    this.firingRateObservable = new PopulationFiringRate(
      data.nodes.length,
      fixedStep,
      FIRING_RATE_WINDOW_SECONDS,
    );
    this.potentials = new Float32Array(data.nodes.length);
    this.activations = new Float32Array(data.nodes.length);
    this.gAmpa = new Float32Array(data.nodes.length);
    this.gGaba = new Float32Array(data.nodes.length);
    this.refractory = new Float32Array(data.nodes.length);
    this.preTrace = new Float32Array(data.nodes.length);
    this.postTrace = new Float32Array(data.nodes.length);
    this.spiked = new Uint8Array(data.nodes.length);
    this.thresholds = Float32Array.from(
      data.nodes,
      (_, index) => 0.9 + randomUnit(seed, RANDOM_STREAM_CELL_THRESHOLD, index, 0, 0) * 0.22,
    );
    this.initialWeights = Float32Array.from(data.synapses, (synapse) => synapse.weight);
    this.weights = this.initialWeights.slice();
    this.delaySteps = Uint16Array.from(data.synapses, (synapse) =>
      Math.max(1, Math.round(synapse.delay / fixedStep)),
    );

    this.csr = buildSynapseCsr(data.nodes.length, data.synapses);

    const longestDelay = Math.max(...this.delaySteps);
    this.pending = Array.from(
      { length: longestDelay + 2 },
      () => new Float32Array(data.nodes.length),
    );

    const corticalInputs = [...data.groups.leftHemi, ...data.groups.rightHemi].filter(
      (node) => data.neuronKindByNode[node] === "excitatory" && data.nodes[node].z > 0.58,
    );
    const stride = Math.max(1, Math.floor(corticalInputs.length / 48));
    this.inputNodes = corticalInputs.filter((_, index) => index % stride === 0).slice(0, 48);
    this.inputPhases = this.inputNodes.map((_, index) => (index * 0.61803398875) % 1);
  }

  setPlasticity(rate: number): void {
    this.learningRate = clamp(rate, 0, 0.02);
  }

  step(stimulus: NeuralStimulus): void {
    const dt = this.fixedStep;
    const intensity = clamp(stimulus.intensity, 0, 1);
    const confidence = clamp(stimulus.confidence, 0, 1);
    const currentTime = this.currentTick * dt;
    const nextTime = (this.currentTick + 1) * dt;
    this.ageSignals(dt);

    const membraneDecay = Math.exp(-dt / 0.32);
    const ampaDecay = Math.exp(-dt / 0.005);
    const gabaDecay = Math.exp(-dt / 0.010);
    const activityDecay = Math.exp(-dt / 0.16);
    const traceDecay = Math.exp(-dt / 0.2);
    const arriving = this.pending[this.queueCursor];
    this.spiked.fill(0);

    for (let node = 0; node < this.data.nodes.length; node += 1) {
      const arrivedPulse = arriving[node];
      if (arrivedPulse > 0) {
        this.gAmpa[node] += arrivedPulse;
      } else if (arrivedPulse < 0) {
        this.gGaba[node] += Math.abs(arrivedPulse);
      }
      arriving[node] = 0;

      this.gAmpa[node] *= ampaDecay;
      this.gGaba[node] *= gabaDecay;
      const synapticCurrent = this.gAmpa[node] - this.gGaba[node];

      this.potentials[node] = clamp(
        this.potentials[node] * membraneDecay + synapticCurrent,
        -1.4,
        1.8,
      );
      this.activations[node] *= activityDecay;
      this.preTrace[node] *= traceDecay;
      this.postTrace[node] *= traceDecay;
      this.refractory[node] = Math.max(0, this.refractory[node] - dt);
    }

    this.injectStimulus(currentTime, nextTime, intensity, confidence);

    let spikes = 0;
    for (let node = 0; node < this.data.nodes.length; node += 1) {
      if (this.refractory[node] > 0 || this.potentials[node] < this.thresholds[node]) continue;
      this.spiked[node] = 1;
      this.potentials[node] = 0;
      this.activations[node] = 1;
      this.refractory[node] =
        0.055 +
        randomUnit(this.seed, RANDOM_STREAM_CELL_REFRACTORY, node, this.currentTick, 0) * 0.035;
      spikes += 1;
    }

    this.applyPlasticity();
    this.propagateSpikes();

    for (let node = 0; node < this.data.nodes.length; node += 1) {
      if (this.spiked[node]) {
        this.preTrace[node] = 1;
        this.postTrace[node] = 1;
      }
    }

    this.rate = this.firingRateObservable.sample(spikes);
    this.latestSpikeCount = spikes;
    this.currentTick += 1;
    this.queueCursor = (this.queueCursor + 1) % this.pending.length;
  }

  reset(seed?: number): void {
    if (seed !== undefined) {
      (this as unknown as { seed: number }).seed = seed;
      for (let index = 0; index < this.data.nodes.length; index += 1) {
        this.thresholds[index] =
          0.9 + randomUnit(seed, RANDOM_STREAM_CELL_THRESHOLD, index, 0, 0) * 0.22;
      }
    }
    this.potentials.fill(0);
    this.activations.fill(0);
    this.gAmpa.fill(0);
    this.gGaba.fill(0);
    this.refractory.fill(0);
    this.preTrace.fill(0);
    this.postTrace.fill(0);
    this.spiked.fill(0);
    this.pending.forEach((slot) => slot.fill(0));
    this.weights.set(this.initialWeights);
    this.signalsInFlight = [];
    this.queueCursor = 0;
    this.currentTick = 0;
    this.firingRateObservable.reset();
    this.rate = 0;
    this.latestSpikeCount = 0;
  }

  get firingRate(): number {
    return this.rate;
  }

  get spikesLastStep(): number {
    return this.latestSpikeCount;
  }

  get time(): number {
    return this.currentTick * this.fixedStep;
  }

  get tick(): SimulationTick {
    return this.currentTick;
  }

  meanWeight(): number {
    return meanAbsoluteWeight(this.weights);
  }

  snapshot(): NeuralSnapshot {
    return {
      schemaVersion: SIMULATION_PROTOCOL_VERSION,
      tick: this.currentTick,
      timeSeconds: this.time,
      firingRate: this.rate,
      spikes: this.latestSpikeCount,
      meanWeight: this.meanWeight(),
      potentials: this.potentials.slice(),
      activations: this.activations.slice(),
      weights: this.weights.slice(),
      signals: this.signalBatch(),
    };
  }

  private signalBatch(): SignalBatch {
    const count = this.signalsInFlight.length;
    const synapseIds = new Uint32Array(count);
    const progress = new Float32Array(count);
    const strength = new Float32Array(count);
    const inhibitory = new Uint8Array(count);
    for (let index = 0; index < count; index += 1) {
      const signal = this.signalsInFlight[index];
      synapseIds[index] = signal.synapseIndex;
      progress[index] = signal.progress;
      strength[index] = signal.strength;
      inhibitory[index] = signal.inhibitory ? 1 : 0;
    }
    return { synapseIds, progress, strength, inhibitory };
  }

  private injectStimulus(
    currentTime: number,
    nextTime: number,
    intensity: number,
    confidence: number,
  ): void {
    const frequency = 1.4 + intensity * 8.6;
    const drive = 0.96 + intensity * 0.24 + confidence * 0.12;
    for (let index = 0; index < this.inputNodes.length; index += 1) {
      const phase = this.inputPhases[index];
      const previousCycle = Math.floor(currentTime * frequency + phase);
      const nextCycle = Math.floor(nextTime * frequency + phase);
      if (nextCycle > previousCycle) this.potentials[this.inputNodes[index]] += drive;
    }
  }

  private applyPlasticity(): void {
    if (this.learningRate === 0) return;

    for (let node = 0; node < this.spiked.length; node += 1) {
      if (!this.spiked[node]) continue;

      for (const synapseIndex of incomingRow(this.csr, node)) {
        const synapse = this.data.synapses[synapseIndex];
        if (!synapse.plastic || this.weights[synapseIndex] <= 0) continue;
        const potentiation = this.learningRate * this.preTrace[synapse.from];
        this.weights[synapseIndex] = clamp(
          this.weights[synapseIndex] + potentiation,
          MIN_EXCITATORY_WEIGHT,
          MAX_EXCITATORY_WEIGHT,
        );
      }

      for (const synapseIndex of outgoingRow(this.csr, node)) {
        const synapse = this.data.synapses[synapseIndex];
        if (!synapse.plastic || this.weights[synapseIndex] <= 0) continue;
        const depression = this.learningRate * 0.82 * this.postTrace[synapse.to];
        this.weights[synapseIndex] = clamp(
          this.weights[synapseIndex] - depression,
          MIN_EXCITATORY_WEIGHT,
          MAX_EXCITATORY_WEIGHT,
        );
      }
    }
  }

  private propagateSpikes(): void {
    for (let node = 0; node < this.spiked.length; node += 1) {
      if (!this.spiked[node]) continue;

      for (const synapseIndex of outgoingRow(this.csr, node)) {
        const synapse = this.data.synapses[synapseIndex];
        const targetSlot = (this.queueCursor + this.delaySteps[synapseIndex]) % this.pending.length;
        const weight = this.weights[synapseIndex];
        this.pending[targetSlot][synapse.to] += weight;
        this.signalsInFlight.push({
          synapseIndex,
          elapsed: 0,
          duration: this.delaySteps[synapseIndex] * this.fixedStep,
          progress: 0,
          strength: Math.abs(weight),
          inhibitory: weight < 0,
        });
      }
    }

    if (this.signalsInFlight.length > MAX_SIGNALS_IN_FLIGHT) {
      this.signalsInFlight.splice(0, this.signalsInFlight.length - MAX_SIGNALS_IN_FLIGHT);
    }
  }

  private ageSignals(delta: number): void {
    let writeIndex = 0;
    for (const signal of this.signalsInFlight) {
      signal.elapsed += delta;
      signal.progress = signal.duration === 0 ? 1 : signal.elapsed / signal.duration;
      if (signal.progress >= 1) continue;
      this.signalsInFlight[writeIndex] = signal;
      writeIndex += 1;
    }
    this.signalsInFlight.length = writeIndex;
  }
}
