/* tslint:disable */
/* eslint-disable */

export class WasmLaminarEngine {
    free(): void;
    [Symbol.dispose](): void;
    excitatory(): Float64Array;
    inhibitory(): Float64Array;
    /**
     * Creates the Wasm-facing engine with a fixed step in seconds.
     *
     * # Errors
     *
     * Returns a JavaScript error when the step is not positive and finite.
     */
    constructor(dt_seconds: number);
    reset(): void;
    static schema_version(): number;
    /**
     * Advances one fixed tick with an external drive applied to layer IV.
     *
     * # Errors
     *
     * Returns a JavaScript error when the drive is negative or non-finite.
     */
    step_with_layer_four_drive(drive: number): void;
    tick(): bigint;
}

export class WasmNeuralEngine {
    free(): void;
    [Symbol.dispose](): void;
    activations(): Float32Array;
    /**
     * Advances the simulation to a target tick and publishes one snapshot.
     *
     * # Errors
     *
     * Returns a JavaScript error on tick regression or engine failure.
     */
    advance_to(target_tick: number, intensity: number, confidence: number, learning_rate: number): void;
    field_excitatory(): Float32Array;
    field_inhibitory(): Float32Array;
    field_node_indices(): Uint32Array;
    field_wave_activity(): Float32Array;
    firing_rate(): number;
    mean_weight(): number;
    /**
     * Creates the complete browser engine from compact topology buffers.
     *
     * # Errors
     *
     * Returns a JavaScript error when buffer lengths, topology or numerical
     * parameters violate the engine contract.
     */
    constructor(seed: number, dt_seconds: number, neuron_kinds: Uint8Array, synapse_from: Uint32Array, synapse_to: Uint32Array, synapse_weights: Float32Array, synapse_delays_seconds: Float64Array, synapse_plastic: Uint8Array, cortical_nodes: Uint32Array, node_z: Float64Array, field_node_indices: Uint32Array, field_vertex_by_node: Int32Array, field_row_offsets: Uint32Array, field_neighbors: Uint32Array, field_edge_lengths: Float32Array);
    potentials(): Float32Array;
    reset(seed?: number | null): void;
    static schema_version(): number;
    signal_inhibitory(): Uint8Array;
    signal_progress(): Float32Array;
    signal_strength(): Float32Array;
    signal_synapse_ids(): Uint32Array;
    spikes(): number;
    state_hash(): string;
    tick(): number;
    time_seconds(): number;
    weights(): Float32Array;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_wasmlaminarengine_free: (a: number, b: number) => void;
    readonly __wbg_wasmneuralengine_free: (a: number, b: number) => void;
    readonly wasmlaminarengine_excitatory: (a: number) => [number, number];
    readonly wasmlaminarengine_inhibitory: (a: number) => [number, number];
    readonly wasmlaminarengine_new: (a: number) => [number, number, number];
    readonly wasmlaminarengine_reset: (a: number) => void;
    readonly wasmlaminarengine_schema_version: () => number;
    readonly wasmlaminarengine_step_with_layer_four_drive: (a: number, b: number) => [number, number];
    readonly wasmlaminarengine_tick: (a: number) => bigint;
    readonly wasmneuralengine_activations: (a: number) => [number, number];
    readonly wasmneuralengine_advance_to: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly wasmneuralengine_field_excitatory: (a: number) => [number, number];
    readonly wasmneuralengine_field_inhibitory: (a: number) => [number, number];
    readonly wasmneuralengine_field_node_indices: (a: number) => [number, number];
    readonly wasmneuralengine_field_wave_activity: (a: number) => [number, number];
    readonly wasmneuralengine_firing_rate: (a: number) => number;
    readonly wasmneuralengine_mean_weight: (a: number) => number;
    readonly wasmneuralengine_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number, p: number, q: number, r: number, s: number, t: number, u: number, v: number, w: number, x: number, y: number, z: number, a1: number, b1: number) => [number, number, number];
    readonly wasmneuralengine_potentials: (a: number) => [number, number];
    readonly wasmneuralengine_reset: (a: number, b: number) => void;
    readonly wasmneuralengine_schema_version: () => number;
    readonly wasmneuralengine_signal_inhibitory: (a: number) => [number, number];
    readonly wasmneuralengine_signal_progress: (a: number) => [number, number];
    readonly wasmneuralengine_signal_strength: (a: number) => [number, number];
    readonly wasmneuralengine_signal_synapse_ids: (a: number) => [number, number];
    readonly wasmneuralengine_spikes: (a: number) => number;
    readonly wasmneuralengine_state_hash: (a: number) => [number, number];
    readonly wasmneuralengine_tick: (a: number) => number;
    readonly wasmneuralengine_time_seconds: (a: number) => number;
    readonly wasmneuralengine_weights: (a: number) => [number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
