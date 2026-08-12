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
  EngineScheduledEvent,
  EngineScheduleCommand,
  EngineSnapshotEvent,
  NeuralSnapshot,
} from "./protocol";
import { snapshotBufferEntries } from "./snapshot-layout";
import initWasm, { WasmNeuralEngine } from "./wasm/brain_wasm.js";

let wasmInitialization: Promise<unknown> | undefined;

export const WORKER_RESOURCE_LIMITS = {
  nodes: 20_000,
  synapses: 250_000,
  fieldVertices: 50_000,
  fieldEdges: 1_000_000,
  ticksPerCommand: 600,
  inputsPerCommand: 256,
  scheduledInputs: 4_096,
} as const;

export interface WorkerResourceCounts {
  nodes: number;
  synapses: number;
  fieldVertices: number;
  fieldEdges: number;
}

export function assertResourceCounts(counts: WorkerResourceCounts): void {
  for (const [name, value] of Object.entries(counts)) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`contagem inválida para ${name}`);
    }
  }
  if (
    counts.nodes > WORKER_RESOURCE_LIMITS.nodes ||
    counts.synapses > WORKER_RESOURCE_LIMITS.synapses ||
    counts.fieldVertices > WORKER_RESOURCE_LIMITS.fieldVertices ||
    counts.fieldEdges > WORKER_RESOURCE_LIMITS.fieldEdges
  ) {
    throw new Error("topologia excede o envelope de recursos do navegador");
  }
}

export function assertAdvanceWithinEnvelope(
  currentTick: number,
  targetTick: number,
): void {
  if (!Number.isSafeInteger(targetTick) || targetTick < currentTick) {
    throw new Error("tick alvo inválido ou regressivo");
  }
  if (targetTick - currentTick > WORKER_RESOURCE_LIMITS.ticksPerCommand) {
    throw new Error("avanço excede o trabalho máximo por comando");
  }
}

export function assertScheduledInputsWithinEnvelope(
  currentTick: number,
  command: EngineScheduleCommand,
): void {
  if (command.inputs.length > WORKER_RESOURCE_LIMITS.inputsPerCommand) {
    throw new Error("lote de entradas excede o limite por comando");
  }
  const addresses = new Set<string>();
  for (const input of command.inputs) {
    if (
      !Number.isSafeInteger(input.tick) ||
      input.tick <= currentTick ||
      !Number.isSafeInteger(input.sequence) ||
      input.sequence < 2 ||
      input.sequence > 0xffff_ffff
    ) {
      throw new Error("endereço de entrada inválido");
    }
    if (
      (input.kind === "stimulus" &&
        (!Number.isFinite(input.intensity) ||
          !Number.isFinite(input.confidence) ||
          input.intensity < 0 ||
          input.intensity > 1 ||
          input.confidence < 0 ||
          input.confidence > 1)) ||
      (input.kind === "plasticity" &&
        (!Number.isFinite(input.learningRate) ||
          input.learningRate < 0 ||
          input.learningRate > 0.02))
    ) {
      throw new Error("payload de entrada inválido");
    }
    const address = `${input.tick}:${input.sequence}`;
    if (addresses.has(address)) throw new Error("endereço de entrada duplicado no lote");
    addresses.add(address);
  }
}

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
  return snapshotBufferEntries(snapshot).map(({ view }) => view.buffer as ArrayBuffer);
}

export class WasmEngineHost {
  private engine: WasmNeuralEngine | undefined;
  private fixedStep = SIMULATION_STEP_SECONDS;
  private readonly queuedInputAddresses = new Set<string>();

  async initialize(command: EngineInitializeCommand): Promise<EngineReadyEvent> {
    await initializeModule();
    this.dispose();
    this.fixedStep = command.fixedStep ?? SIMULATION_STEP_SECONDS;
    assertResourceCounts({
      nodes: command.topology.nodes.length,
      synapses: command.topology.synapses.length,
      fieldVertices: command.topology.corticalField.nodeIndices.length,
      fieldEdges: command.topology.corticalField.neighbors.length,
    });
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
    assertAdvanceWithinEnvelope(engine.tick(), command.targetTick);
    const learningRate = command.learningRate ?? 0.004;
    if (
      !Number.isFinite(command.stimulus.intensity) ||
      !Number.isFinite(command.stimulus.confidence) ||
      command.stimulus.intensity < 0 ||
      command.stimulus.intensity > 1 ||
      command.stimulus.confidence < 0 ||
      command.stimulus.confidence > 1 ||
      !Number.isFinite(learningRate) ||
      learningRate < 0 ||
      learningRate > 0.02
    ) {
      throw new Error("payload de avanço inválido");
    }
    if (command.targetTick > engine.tick()) {
      const applicationTick = engine.tick() + 1;
      engine.schedule_stimulus(
        applicationTick,
        0,
        command.stimulus.intensity,
        command.stimulus.confidence,
      );
      engine.schedule_plasticity(applicationTick, 1, learningRate);
    }
    engine.advance_scheduled_to(command.targetTick);
    for (const address of this.queuedInputAddresses) {
      if (Number(address.slice(0, address.indexOf(":"))) <= command.targetTick) {
        this.queuedInputAddresses.delete(address);
      }
    }
    return { type: "snapshot", snapshot: this.snapshot() };
  }

  schedule(command: EngineScheduleCommand): EngineScheduledEvent {
    const engine = this.requireEngine();
    assertScheduledInputsWithinEnvelope(engine.tick(), command);
    if (
      this.queuedInputAddresses.size + command.inputs.length >
      WORKER_RESOURCE_LIMITS.scheduledInputs
    ) {
      throw new Error("fila de entradas excede o limite do motor");
    }
    for (const input of command.inputs) {
      if (this.queuedInputAddresses.has(`${input.tick}:${input.sequence}`)) {
        throw new Error("endereço de entrada já agendado");
      }
    }
    for (const input of command.inputs) {
      if (input.kind === "stimulus") {
        engine.schedule_stimulus(
          input.tick,
          input.sequence,
          input.intensity,
          input.confidence,
        );
      } else {
        engine.schedule_plasticity(input.tick, input.sequence, input.learningRate);
      }
      this.queuedInputAddresses.add(`${input.tick}:${input.sequence}`);
    }
    return { type: "scheduled", accepted: command.inputs.length };
  }

  reset(seed?: number): EngineReadyEvent {
    const engine = this.requireEngine();
    engine.reset(seed);
    this.queuedInputAddresses.clear();
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
    this.queuedInputAddresses.clear();
  }

  private requireEngine(): WasmNeuralEngine {
    if (!this.engine) throw new Error("motor Wasm não inicializado");
    return this.engine;
  }

  private snapshot(): NeuralSnapshot {
    const engine = this.requireEngine();
    const firstSpikeSeconds = engine.cell_first_spike_seconds();
    const chemicalSolverStepIndex = engine.chemical_solver_step_index();
    if (chemicalSolverStepIndex > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error("contador do solver químico excede a representação exata da ABI");
    }
    const diagnostics: EngineDiagnostics = {
      runtime: "rust-wasm",
      stateHash: engine.state_hash(),
      corticothalamicHash: engine.corticothalamic_state_hash(),
      cellPatchHash: engine.cell_state_hash(),
      chemicalHash: engine.chemical_state_hash(),
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
      corticothalamic: {
        excitatory: engine.laminar_excitatory(),
        inhibitory: engine.laminar_inhibitory(),
        relay: engine.thalamic_relay(),
        trn: engine.thalamic_trn(),
        rebound: engine.thalamic_rebound(),
        relayDriveToL4: engine.relay_drive_to_l4(),
        layer6Feedback: engine.layer6_feedback(),
      },
      cellPatch: {
        kinds: engine.cell_kinds(),
        membraneVolts: engine.cell_membrane_volts(),
        dendriteVolts: engine.cell_dendrite_volts(),
        adaptationAmperes: engine.cell_adaptation_amperes(),
        ampaAmperes: engine.cell_ampa_amperes(),
        nmdaAmperes: engine.cell_nmda_amperes(),
        gabaaAmperes: engine.cell_gabaa_amperes(),
        gababAmperes: engine.cell_gabab_amperes(),
        spiked: engine.cell_spiked(),
        firingRateHz: engine.cell_firing_rate_hz(),
        excitatoryInhibitoryRatio: engine.cell_excitatory_inhibitory_ratio(),
        firstSpikeSeconds: firstSpikeSeconds < 0 ? undefined : firstSpikeSeconds,
        fieldVertex: engine.cell_field_vertex(),
        blend: engine.cell_blend(),
      },
      chemical: {
        timeSeconds: engine.chemical_time_seconds(),
        solverStepIndex: Number(chemicalSolverStepIndex),
        releaseEventIndices: engine.chemical_release_event_indices(),
        presynapticSpikeCounts: engine.chemical_presynaptic_spike_counts(),
        vesicleAvailableFraction: engine.chemical_vesicle_available_fraction(),
        vesicleUtilizationFraction: engine.chemical_vesicle_utilization_fraction(),
        latestReleaseMoles: engine.chemical_latest_release_moles(),
        latestReleaseTimeSeconds: engine.chemical_latest_release_time_seconds(),
        totalReleasedMoles: engine.chemical_total_released_moles(),
        cleftMoles: engine.chemical_cleft_moles(),
        cleftConcentrationMolesPerCubicMeter: engine.chemical_cleft_concentration(),
        receptorBoundMoles: engine.chemical_receptor_bound_moles(),
        receptorOccupancyFraction: engine.chemical_receptor_occupancy_fraction(),
        clearedMoles: engine.chemical_cleared_moles(),
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
    assertAdvanceWithinEnvelope(this.tick, command.targetTick);
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
        corticothalamic: {
          excitatory: new Float32Array(6),
          inhibitory: new Float32Array(6),
          relay: 0,
          trn: 0,
          rebound: 0,
          relayDriveToL4: 0,
          layer6Feedback: 0,
        },
        cellPatch: {
          kinds: new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1]),
          membraneVolts: new Float32Array(12),
          dendriteVolts: new Float32Array(12),
          adaptationAmperes: new Float32Array(12),
          ampaAmperes: new Float32Array(12),
          nmdaAmperes: new Float32Array(12),
          gabaaAmperes: new Float32Array(12),
          gababAmperes: new Float32Array(12),
          spiked: new Uint8Array(12),
          firingRateHz: 0,
          excitatoryInhibitoryRatio: 0,
          fieldVertex: 0,
          blend: 0,
        },
        chemical: {
          timeSeconds: this.tick * this.fixedStep,
          solverStepIndex: 0,
          releaseEventIndices: new Uint32Array(2),
          presynapticSpikeCounts: new Uint32Array(2),
          vesicleAvailableFraction: new Float64Array([1, 1]),
          vesicleUtilizationFraction: new Float64Array([0.18, 0.14]),
          latestReleaseMoles: new Float64Array(2),
          latestReleaseTimeSeconds: new Float64Array([-1, -1]),
          totalReleasedMoles: new Float64Array(2),
          cleftMoles: new Float64Array(2),
          cleftConcentrationMolesPerCubicMeter: new Float64Array(2),
          receptorBoundMoles: new Float64Array(4),
          receptorOccupancyFraction: new Float64Array(4),
          clearedMoles: new Float64Array(2),
        },
        diagnostics: {
          runtime: "diagnostic-fallback",
          stateHash: "unavailable",
          corticothalamicHash: "unavailable",
          cellPatchHash: "unavailable",
          chemicalHash: "unavailable",
          degraded: true,
          detail: this.detail,
        },
      },
    };
  }

  schedule(command: EngineScheduleCommand): EngineScheduledEvent {
    if (!this.topology) throw new Error("fallback diagnóstico não inicializado");
    assertScheduledInputsWithinEnvelope(this.tick, command);
    return { type: "scheduled", accepted: command.inputs.length };
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
