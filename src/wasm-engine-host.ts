import type { BrainData } from "./brain";
import {
  SIMULATION_PROTOCOL_VERSION,
  SIMULATION_STEP_SECONDS,
} from "./protocol";
import type {
  EngineAdvanceCommand,
  EngineDiagnostics,
  EngineInitializeCommand,
  EngineReadyEvent,
  EngineSnapshotEvent,
  NeuralSnapshot,
} from "./protocol";
import initWasm, { WasmNeuralEngine } from "./wasm/brain_wasm.js";

let wasmInitialization: Promise<unknown> | undefined;

function initializeModule(): Promise<unknown> {
  wasmInitialization ??= initWasm({
    module_or_path: new URL("./wasm/brain_wasm_bg.wasm", import.meta.url),
  });
  return wasmInitialization;
}

function flattenTopology(data: BrainData) {
  const synapseCount = data.synapses.length;
  const synapseFrom = new Uint32Array(synapseCount);
  const synapseTo = new Uint32Array(synapseCount);
  const synapseWeights = new Float32Array(synapseCount);
  const synapseDelays = new Float64Array(synapseCount);
  const synapsePlastic = new Uint8Array(synapseCount);

  data.synapses.forEach((synapse, index) => {
    synapseFrom[index] = synapse.from;
    synapseTo[index] = synapse.to;
    synapseWeights[index] = synapse.weight;
    synapseDelays[index] = synapse.delay;
    synapsePlastic[index] = Number(synapse.plastic);
  });

  return {
    neuronKinds: Uint8Array.from(
      data.neuronKindByNode,
      (kind) => Number(kind === "inhibitory"),
    ),
    synapseFrom,
    synapseTo,
    synapseWeights,
    synapseDelays,
    synapsePlastic,
    corticalNodes: Uint32Array.from([
      ...data.groups.leftHemi,
      ...data.groups.rightHemi,
    ]),
    nodeZ: Float64Array.from(data.nodes, (node) => node.z),
  };
}

export function snapshotTransferList(snapshot: NeuralSnapshot): ArrayBuffer[] {
  return [
    snapshot.potentials.buffer,
    snapshot.activations.buffer,
    snapshot.weights.buffer,
    snapshot.signals.synapseIds.buffer,
    snapshot.signals.progress.buffer,
    snapshot.signals.strength.buffer,
    snapshot.signals.inhibitory.buffer,
    snapshot.field.nodeIndices.buffer,
    snapshot.field.eField.buffer,
    snapshot.field.iField.buffer,
    snapshot.field.waveActivity.buffer,
  ];
}

export class WasmEngineHost {
  private engine: WasmNeuralEngine | undefined;
  private fixedStep = SIMULATION_STEP_SECONDS;

  async initialize(command: EngineInitializeCommand): Promise<EngineReadyEvent> {
    await initializeModule();
    this.dispose();
    this.fixedStep = command.fixedStep ?? SIMULATION_STEP_SECONDS;
    const flat = flattenTopology(command.topology);
    const field = command.topology.corticalField;
    this.engine = new WasmNeuralEngine(
      command.seed ?? command.topology.seed,
      this.fixedStep,
      flat.neuronKinds,
      flat.synapseFrom,
      flat.synapseTo,
      flat.synapseWeights,
      flat.synapseDelays,
      flat.synapsePlastic,
      flat.corticalNodes,
      flat.nodeZ,
      field.nodeIndices,
      field.vertexByNode,
      field.rowOffsets,
      field.neighbors,
      field.edgeLengths,
    );
    if (WasmNeuralEngine.schema_version() !== SIMULATION_PROTOCOL_VERSION) {
      const actual = WasmNeuralEngine.schema_version();
      this.dispose();
      throw new Error(
        `ABI Wasm incompatível: schema ${actual}, esperado ${SIMULATION_PROTOCOL_VERSION}.`,
      );
    }
    return {
      type: "ready",
      tick: 0,
      runtime: "rust-wasm",
      schemaVersion: SIMULATION_PROTOCOL_VERSION,
      degraded: false,
    };
  }

  advance(command: EngineAdvanceCommand): EngineSnapshotEvent {
    const engine = this.requireEngine();
    engine.advance_to(
      command.targetTick,
      command.stimulus.intensity,
      command.stimulus.confidence,
      command.learningRate ?? 0.004,
    );
    return { type: "snapshot", snapshot: this.snapshot() };
  }

  reset(seed?: number): EngineReadyEvent {
    const engine = this.requireEngine();
    engine.reset(seed);
    return {
      type: "ready",
      tick: 0,
      runtime: "rust-wasm",
      schemaVersion: SIMULATION_PROTOCOL_VERSION,
      degraded: false,
    };
  }

  dispose(): void {
    this.engine?.free();
    this.engine = undefined;
  }

  private requireEngine(): WasmNeuralEngine {
    if (!this.engine) throw new Error("motor Wasm não inicializado");
    return this.engine;
  }

  private snapshot(): NeuralSnapshot {
    const engine = this.requireEngine();
    const diagnostics: EngineDiagnostics = {
      runtime: "rust-wasm",
      stateHash: engine.state_hash(),
      degraded: false,
    };
    return {
      schemaVersion: SIMULATION_PROTOCOL_VERSION,
      tick: engine.tick(),
      timeSeconds: engine.time_seconds(),
      firingRate: engine.firing_rate(),
      spikes: engine.spikes(),
      meanWeight: engine.mean_weight(),
      potentials: engine.potentials(),
      activations: engine.activations(),
      weights: engine.weights(),
      signals: {
        synapseIds: engine.signal_synapse_ids(),
        progress: engine.signal_progress(),
        strength: engine.signal_strength(),
        inhibitory: engine.signal_inhibitory(),
      },
      field: {
        nodeIndices: engine.field_node_indices(),
        eField: engine.field_excitatory(),
        iField: engine.field_inhibitory(),
        waveActivity: engine.field_wave_activity(),
      },
      diagnostics,
    };
  }
}

export class DiagnosticFallbackHost {
  private topology: BrainData | undefined;
  private tick = 0;
  private fixedStep = SIMULATION_STEP_SECONDS;
  private detail = "Wasm indisponível; nenhuma equação científica está rodando.";

  initialize(command: EngineInitializeCommand, reason: unknown): EngineReadyEvent {
    this.topology = command.topology;
    this.fixedStep = command.fixedStep ?? SIMULATION_STEP_SECONDS;
    this.tick = 0;
    this.detail = reason instanceof Error ? reason.message : String(reason);
    return this.ready();
  }

  advance(command: EngineAdvanceCommand): EngineSnapshotEvent {
    if (!this.topology) throw new Error("fallback diagnóstico não inicializado");
    if (command.targetTick < this.tick) throw new Error("tick alvo não pode recuar");
    this.tick = command.targetTick;
    const fieldNodes = this.topology.corticalField.nodeIndices.slice();
    return {
      type: "snapshot",
      snapshot: {
        schemaVersion: SIMULATION_PROTOCOL_VERSION,
        tick: this.tick,
        timeSeconds: this.tick * this.fixedStep,
        firingRate: 0,
        spikes: 0,
        meanWeight: 0,
        potentials: new Float32Array(this.topology.nodes.length),
        activations: new Float32Array(this.topology.nodes.length),
        weights: new Float32Array(this.topology.synapses.length),
        signals: {
          synapseIds: new Uint32Array(),
          progress: new Float32Array(),
          strength: new Float32Array(),
          inhibitory: new Uint8Array(),
        },
        field: {
          nodeIndices: fieldNodes,
          eField: new Float32Array(fieldNodes.length),
          iField: new Float32Array(fieldNodes.length),
          waveActivity: new Float32Array(fieldNodes.length),
        },
        diagnostics: {
          runtime: "diagnostic-fallback",
          stateHash: "unavailable",
          degraded: true,
          detail: this.detail,
        },
      },
    };
  }

  reset(): EngineReadyEvent {
    if (!this.topology) throw new Error("fallback diagnóstico não inicializado");
    this.tick = 0;
    return this.ready();
  }

  dispose(): void {
    this.topology = undefined;
  }

  private ready(): EngineReadyEvent {
    return {
      type: "ready",
      tick: 0,
      runtime: "diagnostic-fallback",
      schemaVersion: SIMULATION_PROTOCOL_VERSION,
      degraded: true,
      detail: this.detail,
    };
  }
}
