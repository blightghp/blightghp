export const SIMULATION_PROTOCOL_VERSION = 1 as const;
export const SIMULATION_STEP_SECONDS = 1 / 60;

export type SimulationTick = number;

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
  schemaVersion: typeof SIMULATION_PROTOCOL_VERSION;
  tick: SimulationTick;
  timeSeconds: number;
  firingRate: number;
  spikes: number;
  meanWeight: number;
  potentials: Float32Array;
  activations: Float32Array;
  weights: Float32Array;
}
