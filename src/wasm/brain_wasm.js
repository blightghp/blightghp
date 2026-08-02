/* @ts-self-types="./brain_wasm.d.ts" */

export class WasmLaminarEngine {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmLaminarEngineFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmlaminarengine_free(ptr, 0);
    }
    /**
     * @returns {Float64Array}
     */
    excitatory() {
        const ret = wasm.wasmlaminarengine_excitatory(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * @returns {Float64Array}
     */
    inhibitory() {
        const ret = wasm.wasmlaminarengine_inhibitory(this.__wbg_ptr);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * Creates the Wasm-facing engine with a fixed step in seconds.
     *
     * # Errors
     *
     * Returns a JavaScript error when the step is not positive and finite.
     * @param {number} dt_seconds
     */
    constructor(dt_seconds) {
        const ret = wasm.wasmlaminarengine_new(dt_seconds);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        WasmLaminarEngineFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    reset() {
        wasm.wasmlaminarengine_reset(this.__wbg_ptr);
    }
    /**
     * @returns {number}
     */
    static schema_version() {
        const ret = wasm.wasmlaminarengine_schema_version();
        return ret >>> 0;
    }
    /**
     * Advances one fixed tick with an external drive applied to layer IV.
     *
     * # Errors
     *
     * Returns a JavaScript error when the drive is negative or non-finite.
     * @param {number} drive
     */
    step_with_layer_four_drive(drive) {
        const ret = wasm.wasmlaminarengine_step_with_layer_four_drive(this.__wbg_ptr, drive);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @returns {bigint}
     */
    tick() {
        const ret = wasm.wasmlaminarengine_tick(this.__wbg_ptr);
        return BigInt.asUintN(64, ret);
    }
}
if (Symbol.dispose) WasmLaminarEngine.prototype[Symbol.dispose] = WasmLaminarEngine.prototype.free;

export class WasmNeuralEngine {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmNeuralEngineFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmneuralengine_free(ptr, 0);
    }
    /**
     * @returns {Float32Array}
     */
    activations() {
        const ret = wasm.wasmneuralengine_activations(this.__wbg_ptr);
        var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * Advances to a target using the canonical scheduled-input stream.
     *
     * # Errors
     *
     * Returns a JavaScript error on tick regression, excessive work or solver failure.
     * @param {number} target_tick
     */
    advance_scheduled_to(target_tick) {
        const ret = wasm.wasmneuralengine_advance_scheduled_to(this.__wbg_ptr, target_tick);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Advances the simulation to a target tick and publishes one snapshot.
     *
     * # Errors
     *
     * Returns a JavaScript error on tick regression or engine failure.
     * @param {number} target_tick
     * @param {number} intensity
     * @param {number} confidence
     * @param {number} learning_rate
     */
    advance_to(target_tick, intensity, confidence, learning_rate) {
        const ret = wasm.wasmneuralengine_advance_to(this.__wbg_ptr, target_tick, intensity, confidence, learning_rate);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @returns {string}
     */
    corticothalamic_state_hash() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmneuralengine_corticothalamic_state_hash(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {Float32Array}
     */
    field_excitatory() {
        const ret = wasm.wasmneuralengine_field_excitatory(this.__wbg_ptr);
        var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @returns {Float32Array}
     */
    field_inhibitory() {
        const ret = wasm.wasmneuralengine_field_inhibitory(this.__wbg_ptr);
        var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @returns {Uint32Array}
     */
    field_node_indices() {
        const ret = wasm.wasmneuralengine_field_node_indices(this.__wbg_ptr);
        var v1 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @returns {Float32Array}
     */
    field_wave_activity() {
        const ret = wasm.wasmneuralengine_field_wave_activity(this.__wbg_ptr);
        var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @returns {number}
     */
    firing_rate() {
        const ret = wasm.wasmneuralengine_firing_rate(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {Float32Array}
     */
    laminar_excitatory() {
        const ret = wasm.wasmneuralengine_laminar_excitatory(this.__wbg_ptr);
        var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @returns {Float32Array}
     */
    laminar_inhibitory() {
        const ret = wasm.wasmneuralengine_laminar_inhibitory(this.__wbg_ptr);
        var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @returns {number}
     */
    layer6_feedback() {
        const ret = wasm.wasmneuralengine_layer6_feedback(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    mean_weight() {
        const ret = wasm.wasmneuralengine_mean_weight(this.__wbg_ptr);
        return ret;
    }
    /**
     * Creates the complete browser engine from compact topology buffers.
     *
     * # Errors
     *
     * Returns a JavaScript error when buffer lengths, topology or numerical
     * parameters violate the engine contract.
     * @param {number} seed
     * @param {number} dt_seconds
     * @param {Uint8Array} neuron_kinds
     * @param {Uint32Array} synapse_from
     * @param {Uint32Array} synapse_to
     * @param {Float32Array} synapse_weights
     * @param {Float64Array} synapse_delays_seconds
     * @param {Uint8Array} synapse_plastic
     * @param {Uint32Array} cortical_nodes
     * @param {Float64Array} node_z
     * @param {Uint32Array} field_node_indices
     * @param {Int32Array} field_vertex_by_node
     * @param {Uint32Array} field_row_offsets
     * @param {Uint32Array} field_neighbors
     * @param {Float32Array} field_edge_lengths
     */
    constructor(seed, dt_seconds, neuron_kinds, synapse_from, synapse_to, synapse_weights, synapse_delays_seconds, synapse_plastic, cortical_nodes, node_z, field_node_indices, field_vertex_by_node, field_row_offsets, field_neighbors, field_edge_lengths) {
        const ptr0 = passArray8ToWasm0(neuron_kinds, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray32ToWasm0(synapse_from, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArray32ToWasm0(synapse_to, wasm.__wbindgen_malloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passArrayF32ToWasm0(synapse_weights, wasm.__wbindgen_malloc);
        const len3 = WASM_VECTOR_LEN;
        const ptr4 = passArrayF64ToWasm0(synapse_delays_seconds, wasm.__wbindgen_malloc);
        const len4 = WASM_VECTOR_LEN;
        const ptr5 = passArray8ToWasm0(synapse_plastic, wasm.__wbindgen_malloc);
        const len5 = WASM_VECTOR_LEN;
        const ptr6 = passArray32ToWasm0(cortical_nodes, wasm.__wbindgen_malloc);
        const len6 = WASM_VECTOR_LEN;
        const ptr7 = passArrayF64ToWasm0(node_z, wasm.__wbindgen_malloc);
        const len7 = WASM_VECTOR_LEN;
        const ptr8 = passArray32ToWasm0(field_node_indices, wasm.__wbindgen_malloc);
        const len8 = WASM_VECTOR_LEN;
        const ptr9 = passArray32ToWasm0(field_vertex_by_node, wasm.__wbindgen_malloc);
        const len9 = WASM_VECTOR_LEN;
        const ptr10 = passArray32ToWasm0(field_row_offsets, wasm.__wbindgen_malloc);
        const len10 = WASM_VECTOR_LEN;
        const ptr11 = passArray32ToWasm0(field_neighbors, wasm.__wbindgen_malloc);
        const len11 = WASM_VECTOR_LEN;
        const ptr12 = passArrayF32ToWasm0(field_edge_lengths, wasm.__wbindgen_malloc);
        const len12 = WASM_VECTOR_LEN;
        const ret = wasm.wasmneuralengine_new(seed, dt_seconds, ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4, ptr5, len5, ptr6, len6, ptr7, len7, ptr8, len8, ptr9, len9, ptr10, len10, ptr11, len11, ptr12, len12);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        WasmNeuralEngineFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {Float32Array}
     */
    potentials() {
        const ret = wasm.wasmneuralengine_potentials(this.__wbg_ptr);
        var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @returns {number}
     */
    relay_drive_to_l4() {
        const ret = wasm.wasmneuralengine_relay_drive_to_l4(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number | null} [seed]
     */
    reset(seed) {
        wasm.wasmneuralengine_reset(this.__wbg_ptr, isLikeNone(seed) ? Number.MAX_SAFE_INTEGER : (seed) >>> 0);
    }
    /**
     * Queues a bounded plasticity update for deterministic replay.
     *
     * # Errors
     *
     * Returns a JavaScript error for invalid values, addresses or queue limits.
     * @param {number} tick
     * @param {number} sequence
     * @param {number} learning_rate
     */
    schedule_plasticity(tick, sequence, learning_rate) {
        const ret = wasm.wasmneuralengine_schedule_plasticity(this.__wbg_ptr, tick, sequence, learning_rate);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Queues a bounded stimulus for deterministic replay.
     *
     * # Errors
     *
     * Returns a JavaScript error for invalid values, addresses or queue limits.
     * @param {number} tick
     * @param {number} sequence
     * @param {number} intensity
     * @param {number} confidence
     */
    schedule_stimulus(tick, sequence, intensity, confidence) {
        const ret = wasm.wasmneuralengine_schedule_stimulus(this.__wbg_ptr, tick, sequence, intensity, confidence);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @returns {number}
     */
    static schema_version() {
        const ret = wasm.wasmneuralengine_schema_version();
        return ret >>> 0;
    }
    /**
     * @returns {Uint8Array}
     */
    signal_inhibitory() {
        const ret = wasm.wasmneuralengine_signal_inhibitory(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {Float32Array}
     */
    signal_progress() {
        const ret = wasm.wasmneuralengine_signal_progress(this.__wbg_ptr);
        var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @returns {Float32Array}
     */
    signal_strength() {
        const ret = wasm.wasmneuralengine_signal_strength(this.__wbg_ptr);
        var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @returns {Uint32Array}
     */
    signal_synapse_ids() {
        const ret = wasm.wasmneuralengine_signal_synapse_ids(this.__wbg_ptr);
        var v1 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @returns {number}
     */
    spikes() {
        const ret = wasm.wasmneuralengine_spikes(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {string}
     */
    state_hash() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmneuralengine_state_hash(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {number}
     */
    thalamic_rebound() {
        const ret = wasm.wasmneuralengine_thalamic_rebound(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    thalamic_relay() {
        const ret = wasm.wasmneuralengine_thalamic_relay(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    thalamic_trn() {
        const ret = wasm.wasmneuralengine_thalamic_trn(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    tick() {
        const ret = wasm.wasmneuralengine_tick(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    time_seconds() {
        const ret = wasm.wasmneuralengine_time_seconds(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {Float32Array}
     */
    weights() {
        const ret = wasm.wasmneuralengine_weights(this.__wbg_ptr);
        var v1 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
}
if (Symbol.dispose) WasmNeuralEngine.prototype[Symbol.dispose] = WasmNeuralEngine.prototype.free;
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_throw_344f42d3211c4765: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbindgen_cast_0000000000000001: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./brain_wasm_bg.js": import0,
    };
}

const WasmLaminarEngineFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmlaminarengine_free(ptr, 1));
const WasmNeuralEngineFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmneuralengine_free(ptr, 1));

function getArrayF32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

function getArrayF64FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat64ArrayMemory0().subarray(ptr / 8, ptr / 8 + len);
}

function getArrayU32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedFloat32ArrayMemory0 = null;
function getFloat32ArrayMemory0() {
    if (cachedFloat32ArrayMemory0 === null || cachedFloat32ArrayMemory0.byteLength === 0) {
        cachedFloat32ArrayMemory0 = new Float32Array(wasm.memory.buffer);
    }
    return cachedFloat32ArrayMemory0;
}

let cachedFloat64ArrayMemory0 = null;
function getFloat64ArrayMemory0() {
    if (cachedFloat64ArrayMemory0 === null || cachedFloat64ArrayMemory0.byteLength === 0) {
        cachedFloat64ArrayMemory0 = new Float64Array(wasm.memory.buffer);
    }
    return cachedFloat64ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint32ArrayMemory0 = null;
function getUint32ArrayMemory0() {
    if (cachedUint32ArrayMemory0 === null || cachedUint32ArrayMemory0.byteLength === 0) {
        cachedUint32ArrayMemory0 = new Uint32Array(wasm.memory.buffer);
    }
    return cachedUint32ArrayMemory0;
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function passArray32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getUint32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArrayF32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getFloat32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArrayF64ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 8, 8) >>> 0;
    getFloat64ArrayMemory0().set(arg, ptr / 8);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedFloat32ArrayMemory0 = null;
    cachedFloat64ArrayMemory0 = null;
    cachedUint32ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('brain_wasm_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
