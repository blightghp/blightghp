import type { BrainData } from "./brain";
import type { FieldSnapshot } from "./field";

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

// Sinais em trânsito, compactados em arrays paralelos em vez de uma mensagem por
// disparo (ARCHITECTURE.md, Protocolo do Worker). Os quatro arrays têm o mesmo
// comprimento; a entrada i descreve um único sinal.
export interface SignalBatch {
  synapseIds: Uint32Array;
  progress: Float32Array;
  strength: Float32Array;
  inhibitory: Uint8Array;
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
  signals: SignalBatch;
  field?: FieldSnapshot;
}

// O motor ainda não tem uma fila de entradas agendadas por tick; "advance" carrega
// o estímulo corrente junto com o alvo, do mesmo jeito que main.ts já faz hoje.
// ScheduledDrive/schedule entram quando essa fila existir.
export interface EngineInitializeCommand {
  type: "initialize";
  topology: BrainData;
  fixedStep?: number;
  seed?: number;
}

export interface EngineAdvanceCommand {
  type: "advance";
  targetTick: SimulationTick;
  stimulus: NeuralStimulus;
  learningRate?: number;
}

export interface EngineResetCommand {
  type: "reset";
  seed?: number;
}

export interface EngineDisposeCommand {
  type: "dispose";
}

export type EngineCommand =
  | EngineInitializeCommand
  | EngineAdvanceCommand
  | EngineResetCommand
  | EngineDisposeCommand;

export interface EngineReadyEvent {
  type: "ready";
  tick: SimulationTick;
}

export interface EngineSnapshotEvent {
  type: "snapshot";
  snapshot: NeuralSnapshot;
}

export interface EngineFaultEvent {
  type: "fault";
  code: string;
  message: string;
}

export type EngineEvent = EngineReadyEvent | EngineSnapshotEvent | EngineFaultEvent;
