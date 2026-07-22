import { BrainData } from "./brain";

export interface NeuralStimulus {
  intensity: number;
  confidence: number;
}

export interface NeuralSignal {
  synapseIndex: number;
  progress: number;
  strength: number;
  inhibitory: boolean;
}

export interface NeuralSnapshot {
  time: number;
  firingRate: number;
  spikes: number;
  meanWeight: number;
  potentials: number[];
  activations: number[];
  weights: number[];
}

interface SignalInFlight extends NeuralSignal {
  elapsed: number;
  duration: number;
}

const MIN_EXCITATORY_WEIGHT = 0.12;
const MAX_EXCITATORY_WEIGHT = 0.92;
const MAX_SIGNALS_IN_FLIGHT = 900;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function stableNoise(index: number): number {
  const value = Math.sin((index + 1) * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

export class NeuralSimulation {
  readonly potentials: Float32Array;
  readonly activations: Float32Array;

  private readonly data: BrainData;
  private readonly fixedStep: number;
  private readonly initialWeights: Float32Array;
  private readonly weights: Float32Array;
  private readonly delaySteps: Uint16Array;
  private readonly thresholds: Float32Array;
  private readonly refractory: Float32Array;
  private readonly preTrace: Float32Array;
  private readonly postTrace: Float32Array;
  private readonly spiked: Uint8Array;
  private readonly outgoing: number[][];
  private readonly incoming: number[][];
  private readonly pending: Float32Array[];
  private readonly inputNodes: number[];
  private readonly inputPhases: number[];
  private signalsInFlight: SignalInFlight[] = [];
  private queueCursor = 0;
  private elapsed = 0;
  private rate = 0;
  private latestSpikeCount = 0;
  private learningRate = 0.004;

  constructor(data: BrainData, fixedStep = 1 / 60) {
    this.data = data;
    this.fixedStep = fixedStep;
    this.potentials = new Float32Array(data.nodes.length);
    this.activations = new Float32Array(data.nodes.length);
    this.refractory = new Float32Array(data.nodes.length);
    this.preTrace = new Float32Array(data.nodes.length);
    this.postTrace = new Float32Array(data.nodes.length);
    this.spiked = new Uint8Array(data.nodes.length);
    this.thresholds = Float32Array.from(data.nodes, (_, index) => 0.9 + stableNoise(index) * 0.22);
    this.initialWeights = Float32Array.from(data.synapses, (synapse) => synapse.weight);
    this.weights = this.initialWeights.slice();
    this.delaySteps = Uint16Array.from(data.synapses, (synapse) =>
      Math.max(1, Math.round(synapse.delay / fixedStep)),
    );

    this.outgoing = Array.from({ length: data.nodes.length }, () => []);
    this.incoming = Array.from({ length: data.nodes.length }, () => []);
    data.synapses.forEach((synapse, index) => {
      this.outgoing[synapse.from].push(index);
      this.incoming[synapse.to].push(index);
    });

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

  step(delta: number, stimulus: NeuralStimulus): void {
    if (!Number.isFinite(delta) || delta <= 0) return;

    const dt = Math.min(delta, this.fixedStep * 2);
    const intensity = clamp(stimulus.intensity, 0, 1);
    const confidence = clamp(stimulus.confidence, 0, 1);
    const nextTime = this.elapsed + dt;
    this.ageSignals(dt);

    const membraneDecay = Math.exp(-dt / 0.32);
    const activityDecay = Math.exp(-dt / 0.16);
    const traceDecay = Math.exp(-dt / 0.2);
    const arriving = this.pending[this.queueCursor];
    this.spiked.fill(0);

    for (let node = 0; node < this.data.nodes.length; node += 1) {
      this.potentials[node] = clamp(
        this.potentials[node] * membraneDecay + arriving[node],
        -1.4,
        1.8,
      );
      arriving[node] = 0;
      this.activations[node] *= activityDecay;
      this.preTrace[node] *= traceDecay;
      this.postTrace[node] *= traceDecay;
      this.refractory[node] = Math.max(0, this.refractory[node] - dt);
    }

    this.injectStimulus(this.elapsed, nextTime, intensity, confidence);

    let spikes = 0;
    for (let node = 0; node < this.data.nodes.length; node += 1) {
      if (this.refractory[node] > 0 || this.potentials[node] < this.thresholds[node]) continue;
      this.spiked[node] = 1;
      this.potentials[node] = 0;
      this.activations[node] = 1;
      this.refractory[node] = 0.055 + stableNoise(node + 7000) * 0.035;
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

    const instantaneousRate = spikes / dt / this.data.nodes.length;
    this.rate += (instantaneousRate - this.rate) * 0.08;
    this.latestSpikeCount = spikes;
    this.elapsed = nextTime;
    this.queueCursor = (this.queueCursor + 1) % this.pending.length;
  }

  reset(): void {
    this.potentials.fill(0);
    this.activations.fill(0);
    this.refractory.fill(0);
    this.preTrace.fill(0);
    this.postTrace.fill(0);
    this.spiked.fill(0);
    this.pending.forEach((slot) => slot.fill(0));
    this.weights.set(this.initialWeights);
    this.signalsInFlight = [];
    this.queueCursor = 0;
    this.elapsed = 0;
    this.rate = 0;
    this.latestSpikeCount = 0;
  }

  get signals(): readonly NeuralSignal[] {
    return this.signalsInFlight;
  }

  get firingRate(): number {
    return this.rate;
  }

  get spikesLastStep(): number {
    return this.latestSpikeCount;
  }

  get time(): number {
    return this.elapsed;
  }

  getWeight(index: number): number {
    return this.weights[index] ?? 0;
  }

  meanWeight(): number {
    if (this.weights.length === 0) return 0;
    let total = 0;
    for (const weight of this.weights) total += Math.abs(weight);
    return total / this.weights.length;
  }

  snapshot(): NeuralSnapshot {
    return {
      time: this.elapsed,
      firingRate: this.rate,
      spikes: this.latestSpikeCount,
      meanWeight: this.meanWeight(),
      potentials: Array.from(this.potentials),
      activations: Array.from(this.activations),
      weights: Array.from(this.weights),
    };
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

      for (const synapseIndex of this.incoming[node]) {
        const synapse = this.data.synapses[synapseIndex];
        if (!synapse.plastic || this.weights[synapseIndex] <= 0) continue;
        const potentiation = this.learningRate * this.preTrace[synapse.from];
        this.weights[synapseIndex] = clamp(
          this.weights[synapseIndex] + potentiation,
          MIN_EXCITATORY_WEIGHT,
          MAX_EXCITATORY_WEIGHT,
        );
      }

      for (const synapseIndex of this.outgoing[node]) {
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

      for (const synapseIndex of this.outgoing[node]) {
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
