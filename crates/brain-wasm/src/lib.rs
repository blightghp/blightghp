#![forbid(unsafe_code)]

use brain_engine::{
    CorticalLayer, FieldTopology, LaminarConfig, LaminarEngine, NeuralSimulation, NeuralStimulus,
    NeuronKind, Seconds, SimulationConfig, SimulationSnapshot, SimulationSynapse,
    ENGINE_SCHEMA_VERSION, LAYER_COUNT, SIMULATION_SCHEMA_VERSION,
};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct WasmLaminarEngine {
    inner: LaminarEngine,
}

#[wasm_bindgen]
pub struct WasmNeuralEngine {
    inner: NeuralSimulation,
    snapshot: SimulationSnapshot,
}

#[wasm_bindgen]
impl WasmNeuralEngine {
    /// Creates the complete browser engine from compact topology buffers.
    ///
    /// # Errors
    ///
    /// Returns a JavaScript error when buffer lengths, topology or numerical
    /// parameters violate the engine contract.
    #[expect(
        clippy::too_many_arguments,
        reason = "the flat ABI avoids JSON parsing and preserves typed-array transfer"
    )]
    #[wasm_bindgen(constructor)]
    pub fn new(
        seed: u32,
        dt_seconds: f64,
        neuron_kinds: Vec<u8>,
        synapse_from: Vec<u32>,
        synapse_to: Vec<u32>,
        synapse_weights: Vec<f32>,
        synapse_delays_seconds: Vec<f64>,
        synapse_plastic: Vec<u8>,
        cortical_nodes: Vec<u32>,
        node_z: Vec<f64>,
        field_node_indices: Vec<u32>,
        field_vertex_by_node: Vec<i32>,
        field_row_offsets: Vec<u32>,
        field_neighbors: Vec<u32>,
        field_edge_lengths: Vec<f32>,
    ) -> Result<Self, JsValue> {
        let synapse_count = synapse_from.len();
        if synapse_to.len() != synapse_count
            || synapse_weights.len() != synapse_count
            || synapse_delays_seconds.len() != synapse_count
            || synapse_plastic.len() != synapse_count
        {
            return Err(JsValue::from_str("synapse buffers must have equal length"));
        }
        let neuron_kinds = neuron_kinds
            .into_iter()
            .map(|kind| match kind {
                0 => Ok(NeuronKind::Excitatory),
                1 => Ok(NeuronKind::Inhibitory),
                _ => Err(JsValue::from_str("invalid neuron kind")),
            })
            .collect::<Result<Vec<_>, _>>()?;
        let synapses = synapse_from
            .into_iter()
            .zip(synapse_to)
            .zip(synapse_weights)
            .zip(synapse_delays_seconds)
            .zip(synapse_plastic)
            .map(
                |((((from, to), weight), delay_seconds), plastic)| SimulationSynapse {
                    from,
                    to,
                    weight,
                    delay_seconds,
                    plastic: plastic != 0,
                },
            )
            .collect();
        let config = SimulationConfig {
            seed,
            fixed_step: Seconds::try_new(dt_seconds).map_err(js_error)?,
            neuron_kinds,
            synapses,
            cortical_nodes,
            node_z,
            field_topology: FieldTopology {
                node_indices: field_node_indices,
                vertex_by_node: field_vertex_by_node,
                row_offsets: field_row_offsets,
                neighbors: field_neighbors,
                edge_lengths: field_edge_lengths,
            },
        };
        let inner = NeuralSimulation::new(config).map_err(js_error)?;
        let snapshot = inner.snapshot();
        Ok(Self { inner, snapshot })
    }

    #[must_use]
    pub fn schema_version() -> u32 {
        SIMULATION_SCHEMA_VERSION
    }

    #[must_use]
    pub fn tick(&self) -> u32 {
        u32::try_from(self.snapshot.tick).unwrap_or(u32::MAX)
    }

    /// Advances the simulation to a target tick and publishes one snapshot.
    ///
    /// # Errors
    ///
    /// Returns a JavaScript error on tick regression or engine failure.
    pub fn advance_to(
        &mut self,
        target_tick: u32,
        intensity: f64,
        confidence: f64,
        learning_rate: f64,
    ) -> Result<(), JsValue> {
        self.inner.set_plasticity(learning_rate);
        self.snapshot = self
            .inner
            .advance_to(
                u64::from(target_tick),
                NeuralStimulus {
                    intensity,
                    confidence,
                },
            )
            .map_err(js_error)?;
        Ok(())
    }

    pub fn reset(&mut self, seed: Option<u32>) {
        self.inner.reset(seed);
        self.snapshot = self.inner.snapshot();
    }

    #[must_use]
    pub fn state_hash(&self) -> String {
        format!("{:016x}", self.snapshot.state_hash)
    }

    #[must_use]
    pub fn corticothalamic_state_hash(&self) -> String {
        format!("{:016x}", self.snapshot.corticothalamic.state_hash)
    }

    #[must_use]
    pub fn time_seconds(&self) -> f64 {
        self.snapshot.time_seconds
    }

    #[must_use]
    pub fn firing_rate(&self) -> f64 {
        self.snapshot.firing_rate
    }

    #[must_use]
    pub fn spikes(&self) -> u32 {
        self.snapshot.spikes
    }

    #[must_use]
    pub fn mean_weight(&self) -> f64 {
        self.snapshot.mean_weight
    }

    #[must_use]
    pub fn potentials(&self) -> Vec<f32> {
        self.snapshot.potentials.clone()
    }

    #[must_use]
    pub fn activations(&self) -> Vec<f32> {
        self.snapshot.activations.clone()
    }

    #[must_use]
    pub fn weights(&self) -> Vec<f32> {
        self.snapshot.weights.clone()
    }

    #[must_use]
    pub fn signal_synapse_ids(&self) -> Vec<u32> {
        self.snapshot.signals.synapse_ids.clone()
    }

    #[must_use]
    pub fn signal_progress(&self) -> Vec<f32> {
        self.snapshot.signals.progress.clone()
    }

    #[must_use]
    pub fn signal_strength(&self) -> Vec<f32> {
        self.snapshot.signals.strength.clone()
    }

    #[must_use]
    pub fn signal_inhibitory(&self) -> Vec<u8> {
        self.snapshot.signals.inhibitory.clone()
    }

    #[must_use]
    pub fn field_node_indices(&self) -> Vec<u32> {
        self.snapshot.field.node_indices.clone()
    }

    #[must_use]
    pub fn field_excitatory(&self) -> Vec<f32> {
        self.snapshot.field.excitatory.clone()
    }

    #[must_use]
    pub fn field_inhibitory(&self) -> Vec<f32> {
        self.snapshot.field.inhibitory.clone()
    }

    #[must_use]
    pub fn field_wave_activity(&self) -> Vec<f32> {
        self.snapshot.field.wave_activity.clone()
    }

    #[must_use]
    pub fn laminar_excitatory(&self) -> Vec<f32> {
        self.snapshot.corticothalamic.excitatory.to_vec()
    }

    #[must_use]
    pub fn laminar_inhibitory(&self) -> Vec<f32> {
        self.snapshot.corticothalamic.inhibitory.to_vec()
    }

    #[must_use]
    pub fn thalamic_relay(&self) -> f32 {
        self.snapshot.corticothalamic.relay
    }

    #[must_use]
    pub fn thalamic_trn(&self) -> f32 {
        self.snapshot.corticothalamic.trn
    }

    #[must_use]
    pub fn thalamic_rebound(&self) -> f32 {
        self.snapshot.corticothalamic.rebound
    }

    #[must_use]
    pub fn relay_drive_to_l4(&self) -> f32 {
        self.snapshot.corticothalamic.relay_drive_to_l4
    }

    #[must_use]
    pub fn layer6_feedback(&self) -> f32 {
        self.snapshot.corticothalamic.layer6_feedback
    }
}

fn js_error(error: impl core::fmt::Display) -> JsValue {
    JsValue::from_str(&error.to_string())
}

#[wasm_bindgen]
impl WasmLaminarEngine {
    /// Creates the Wasm-facing engine with a fixed step in seconds.
    ///
    /// # Errors
    ///
    /// Returns a JavaScript error when the step is not positive and finite.
    #[wasm_bindgen(constructor)]
    pub fn new(dt_seconds: f64) -> Result<Self, JsValue> {
        let config = LaminarConfig {
            dt: Seconds::try_new(dt_seconds)
                .map_err(|error| JsValue::from_str(&error.to_string()))?,
            ..LaminarConfig::default()
        };
        LaminarEngine::new(config)
            .map(|inner| Self { inner })
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }

    #[must_use]
    pub fn schema_version() -> u32 {
        ENGINE_SCHEMA_VERSION
    }

    #[must_use]
    pub fn tick(&self) -> u64 {
        self.inner.tick()
    }

    pub fn reset(&mut self) {
        self.inner.reset();
    }

    /// Advances one fixed tick with an external drive applied to layer IV.
    ///
    /// # Errors
    ///
    /// Returns a JavaScript error when the drive is negative or non-finite.
    pub fn step_with_layer_four_drive(&mut self, drive: f64) -> Result<(), JsValue> {
        let mut external_drive = [0.0; LAYER_COUNT];
        external_drive[CorticalLayer::L4.index()] = drive;
        self.inner
            .step(external_drive)
            .map(|_| ())
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }

    #[must_use]
    pub fn excitatory(&self) -> Vec<f64> {
        self.inner.snapshot().excitatory.to_vec()
    }

    #[must_use]
    pub fn inhibitory(&self) -> Vec<f64> {
        self.inner.snapshot().inhibitory.to_vec()
    }
}
