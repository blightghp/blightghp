use core::fmt;

use crate::{
    mean_absolute_weight, random_unit, CorticothalamicConfig, CorticothalamicDrive,
    CorticothalamicEngine, FieldConfig, FieldSnapshot, FieldTopology, LaminarConfig, NeuronKind,
    PopulationField, PopulationFiringRate, Seconds, SynapseCsr, SynapseEndpoint, LAYER_COUNT,
    MAX_SAFE_TICK,
};

pub const SIMULATION_SCHEMA_VERSION: u32 = 4;
const MIN_EXCITATORY_WEIGHT: f64 = 0.12;
const MAX_EXCITATORY_WEIGHT: f64 = 0.92;
const MAX_SIGNALS_IN_FLIGHT: usize = 900;
const FIRING_RATE_WINDOW_SECONDS: f64 = 0.2;
const RANDOM_STREAM_CELL_THRESHOLD: u32 = 0;
const RANDOM_STREAM_CELL_REFRACTORY: u32 = 1;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SimulationSynapse {
    pub from: u32,
    pub to: u32,
    pub weight: f32,
    pub delay_seconds: f64,
    pub plastic: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SimulationConfig {
    pub seed: u32,
    pub fixed_step: Seconds,
    pub neuron_kinds: Vec<NeuronKind>,
    pub synapses: Vec<SimulationSynapse>,
    pub cortical_nodes: Vec<u32>,
    pub node_z: Vec<f64>,
    pub field_topology: FieldTopology,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct NeuralStimulus {
    pub intensity: f64,
    pub confidence: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SignalBatch {
    pub synapse_ids: Vec<u32>,
    pub progress: Vec<f32>,
    pub strength: Vec<f32>,
    pub inhibitory: Vec<u8>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CorticothalamicSignal {
    pub excitatory: [f32; LAYER_COUNT],
    pub inhibitory: [f32; LAYER_COUNT],
    pub relay: f32,
    pub trn: f32,
    pub rebound: f32,
    pub relay_drive_to_l4: f32,
    pub layer6_feedback: f32,
    pub state_hash: u64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SimulationSnapshot {
    pub schema_version: u32,
    pub tick: u64,
    pub time_seconds: f64,
    pub firing_rate: f64,
    pub spikes: u32,
    pub mean_weight: f64,
    pub potentials: Vec<f32>,
    pub activations: Vec<f32>,
    pub weights: Vec<f32>,
    pub signals: SignalBatch,
    pub field: FieldSnapshot,
    pub corticothalamic: CorticothalamicSignal,
    pub state_hash: u64,
}

#[derive(Clone, Debug)]
struct SignalInFlight {
    synapse_id: u32,
    elapsed: f64,
    duration: f64,
    progress: f64,
    strength: f32,
    inhibitory: bool,
}

#[derive(Clone, Debug)]
pub struct NeuralSimulation {
    seed: u32,
    fixed_step: Seconds,
    neuron_kinds: Vec<NeuronKind>,
    synapses: Vec<SimulationSynapse>,
    csr: SynapseCsr,
    population_field: PopulationField,
    corticothalamic: CorticothalamicEngine,
    potentials: Vec<f32>,
    activations: Vec<f32>,
    conductance_ampa: Vec<f32>,
    conductance_gaba: Vec<f32>,
    initial_weights: Vec<f32>,
    weights: Vec<f32>,
    delay_steps: Vec<u16>,
    thresholds: Vec<f32>,
    refractory: Vec<f32>,
    pre_trace: Vec<f32>,
    post_trace: Vec<f32>,
    spiked: Vec<u8>,
    pending: Vec<Vec<f32>>,
    input_nodes: Vec<u32>,
    input_phases: Vec<f64>,
    firing_rate_observable: PopulationFiringRate,
    signals_in_flight: Vec<SignalInFlight>,
    queue_cursor: usize,
    tick: u64,
    firing_rate: f64,
    latest_spike_count: u32,
    learning_rate: f64,
}

impl NeuralSimulation {
    /// Creates the complete 0.4-compatible neural engine in Rust.
    ///
    /// # Errors
    ///
    /// Returns [`SimulationError`] for inconsistent node/synapse buffers,
    /// invalid delays or invalid field topology.
    #[expect(
        clippy::too_many_lines,
        reason = "construction validates and allocates the complete simulation atomically"
    )]
    pub fn new(config: SimulationConfig) -> Result<Self, SimulationError> {
        let node_count = config.neuron_kinds.len();
        if node_count == 0 || config.node_z.len() != node_count {
            return Err(SimulationError::InvalidTopology(
                "neuron kinds and z coordinates must have equal non-zero length",
            ));
        }
        let node_count_u32 = u32::try_from(node_count)
            .map_err(|_| SimulationError::InvalidTopology("node count exceeds u32"))?;
        for &node in &config.cortical_nodes {
            if node >= node_count_u32 {
                return Err(SimulationError::InvalidTopology(
                    "cortical input node exceeds node count",
                ));
            }
        }

        let mut endpoints = Vec::with_capacity(config.synapses.len());
        let mut initial_weights = Vec::with_capacity(config.synapses.len());
        let mut delay_steps = Vec::with_capacity(config.synapses.len());
        let mut longest_delay = 1_u16;
        for synapse in &config.synapses {
            if synapse.from >= node_count_u32 || synapse.to >= node_count_u32 {
                return Err(SimulationError::InvalidTopology(
                    "synapse endpoint exceeds node count",
                ));
            }
            if !synapse.weight.is_finite()
                || !synapse.delay_seconds.is_finite()
                || synapse.delay_seconds <= 0.0
            {
                return Err(SimulationError::InvalidSynapse);
            }
            endpoints.push(SynapseEndpoint {
                from: synapse.from,
                to: synapse.to,
            });
            initial_weights.push(synapse.weight);
            let delay = (synapse.delay_seconds / config.fixed_step.get())
                .round()
                .max(1.0);
            if delay > f64::from(u16::MAX) {
                return Err(SimulationError::DelayOverflow);
            }
            #[expect(
                clippy::cast_possible_truncation,
                clippy::cast_sign_loss,
                reason = "delay was checked within the positive u16 range"
            )]
            let delay = delay as u16;
            delay_steps.push(delay);
            longest_delay = longest_delay.max(delay);
        }
        let csr = SynapseCsr::build(node_count_u32, &endpoints)
            .map_err(|_| SimulationError::InvalidTopology("invalid synapse CSR"))?;

        let field_config = FieldConfig {
            dt: config.fixed_step,
            ..FieldConfig::default()
        };
        let population_field = PopulationField::new(config.field_topology, field_config)
            .map_err(SimulationError::Field)?;
        let corticothalamic = CorticothalamicEngine::new(CorticothalamicConfig {
            laminar: LaminarConfig {
                dt: config.fixed_step,
                ..LaminarConfig::default()
            },
            ..CorticothalamicConfig::default()
        })
        .map_err(SimulationError::Corticothalamic)?;
        let thresholds = thresholds(config.seed, node_count);
        let firing_rate_observable = PopulationFiringRate::new(
            node_count_u32,
            config.fixed_step,
            Seconds::try_new(FIRING_RATE_WINDOW_SECONDS)
                .map_err(|_| SimulationError::InvalidTime)?,
        )
        .map_err(|_| SimulationError::InvalidTime)?;

        let cortical_inputs = config
            .cortical_nodes
            .iter()
            .copied()
            .filter(|&node| {
                usize::try_from(node).is_ok_and(|index| {
                    config.neuron_kinds[index] == NeuronKind::Excitatory
                        && config.node_z[index] > 0.58
                })
            })
            .collect::<Vec<_>>();
        let stride = (cortical_inputs.len() / 48).max(1);
        let input_nodes = cortical_inputs
            .into_iter()
            .step_by(stride)
            .take(48)
            .collect::<Vec<_>>();
        let input_phases = (0..input_nodes.len())
            .map(|index| (usize_to_f64(index) * 0.618_033_988_75) % 1.0)
            .collect::<Vec<_>>();
        let pending_length = usize::from(longest_delay) + 2;

        Ok(Self {
            seed: config.seed,
            fixed_step: config.fixed_step,
            neuron_kinds: config.neuron_kinds,
            synapses: config.synapses,
            csr,
            population_field,
            corticothalamic,
            potentials: vec![0.0; node_count],
            activations: vec![0.0; node_count],
            conductance_ampa: vec![0.0; node_count],
            conductance_gaba: vec![0.0; node_count],
            initial_weights: initial_weights.clone(),
            weights: initial_weights,
            delay_steps,
            thresholds,
            refractory: vec![0.0; node_count],
            pre_trace: vec![0.0; node_count],
            post_trace: vec![0.0; node_count],
            spiked: vec![0; node_count],
            pending: vec![vec![0.0; node_count]; pending_length],
            input_nodes,
            input_phases,
            firing_rate_observable,
            signals_in_flight: Vec::new(),
            queue_cursor: 0,
            tick: 0,
            firing_rate: 0.0,
            latest_spike_count: 0,
            learning_rate: 0.004,
        })
    }

    #[must_use]
    pub const fn tick(&self) -> u64 {
        self.tick
    }

    pub fn set_plasticity(&mut self, rate: f64) {
        self.learning_rate = rate.clamp(0.0, 0.02);
    }

    /// Advances to a monotonic target tick with a constant stimulus.
    ///
    /// # Errors
    ///
    /// Returns [`SimulationError`] on tick regression, overflow or field
    /// integration failure.
    pub fn advance_to(
        &mut self,
        target_tick: u64,
        stimulus: NeuralStimulus,
    ) -> Result<SimulationSnapshot, SimulationError> {
        if target_tick < self.tick {
            return Err(SimulationError::TickRegression);
        }
        if target_tick > MAX_SAFE_TICK {
            return Err(SimulationError::TickOverflow);
        }
        while self.tick < target_tick {
            self.step(stimulus)?;
        }
        Ok(self.snapshot())
    }

    /// Advances exactly one fixed tick.
    ///
    /// # Errors
    ///
    /// Returns [`SimulationError`] on tick overflow or field failure.
    pub fn step(&mut self, stimulus: NeuralStimulus) -> Result<(), SimulationError> {
        let dt = self.fixed_step.get();
        let intensity = stimulus.intensity.clamp(0.0, 1.0);
        let confidence = stimulus.confidence.clamp(0.0, 1.0);
        let next_tick = self
            .tick
            .checked_add(1)
            .filter(|&tick| tick <= MAX_SAFE_TICK)
            .ok_or(SimulationError::TickOverflow)?;
        let current_time = tick_to_f64(self.tick) * dt;
        let next_time = tick_to_f64(next_tick) * dt;
        self.age_signals(dt);

        let membrane_decay = (-dt / 0.32).exp();
        let ampa_decay = (-dt / 0.005).exp();
        let gaba_decay = (-dt / 0.010).exp();
        let activity_decay = (-dt / 0.16).exp();
        let trace_decay = (-dt / 0.2).exp();
        let arriving = &mut self.pending[self.queue_cursor];
        self.spiked.fill(0);

        for (node, arrived) in arriving.iter_mut().enumerate() {
            let arrived_pulse = *arrived;
            if arrived_pulse > 0.0 {
                self.conductance_ampa[node] =
                    quantize_f32(f64::from(self.conductance_ampa[node]) + f64::from(arrived_pulse));
            } else if arrived_pulse < 0.0 {
                self.conductance_gaba[node] = quantize_f32(
                    f64::from(self.conductance_gaba[node]) + f64::from(arrived_pulse.abs()),
                );
            }
            *arrived = 0.0;

            self.conductance_ampa[node] =
                quantize_f32(f64::from(self.conductance_ampa[node]) * ampa_decay);
            self.conductance_gaba[node] =
                quantize_f32(f64::from(self.conductance_gaba[node]) * gaba_decay);
            let synaptic_current =
                f64::from(self.conductance_ampa[node] - self.conductance_gaba[node]);
            self.potentials[node] = quantize_f32(
                (f64::from(self.potentials[node]) * membrane_decay + synaptic_current)
                    .clamp(-1.4, 1.8),
            );
            self.activations[node] =
                quantize_f32(f64::from(self.activations[node]) * activity_decay);
            self.pre_trace[node] = quantize_f32(f64::from(self.pre_trace[node]) * trace_decay);
            self.post_trace[node] = quantize_f32(f64::from(self.post_trace[node]) * trace_decay);
            self.refractory[node] = quantize_f32((f64::from(self.refractory[node]) - dt).max(0.0));
        }

        self.inject_stimulus(current_time, next_time, intensity, confidence);

        let mut spikes = 0_u32;
        for node in 0..self.potentials.len() {
            if self.refractory[node] > 0.0 || self.potentials[node] < self.thresholds[node] {
                continue;
            }
            self.spiked[node] = 1;
            self.potentials[node] = 0.0;
            self.activations[node] = 1.0;
            self.refractory[node] = quantize_f32(
                0.055
                    + random_unit(
                        self.seed,
                        RANDOM_STREAM_CELL_REFRACTORY,
                        u32::try_from(node).map_err(|_| SimulationError::NodeOverflow)?,
                        self.tick,
                        0,
                    ) * 0.035,
            );
            spikes = spikes
                .checked_add(1)
                .ok_or(SimulationError::SpikeOverflow)?;
        }

        self.apply_plasticity()?;
        self.propagate_spikes()?;
        for node in 0..self.spiked.len() {
            if self.spiked[node] != 0 {
                self.pre_trace[node] = 1.0;
                self.post_trace[node] = 1.0;
            }
        }

        self.population_field
            .step(&self.spiked, &self.neuron_kinds, self.fixed_step)
            .map_err(SimulationError::Field)?;
        for node in 0..self.potentials.len() {
            let field_modulation = self.population_field.coupling_current(node);
            self.potentials[node] = quantize_f32(
                (f64::from(self.potentials[node]) + field_modulation * dt).clamp(-1.4, 1.8),
            );
        }
        self.corticothalamic
            .step(CorticothalamicDrive {
                sensory: intensity,
                contextual: confidence,
            })
            .map_err(SimulationError::Corticothalamic)?;

        self.firing_rate = self.firing_rate_observable.sample(spikes);
        self.latest_spike_count = spikes;
        self.tick = next_tick;
        self.queue_cursor = (self.queue_cursor + 1) % self.pending.len();
        Ok(())
    }

    pub fn reset(&mut self, seed: Option<u32>) {
        if let Some(seed) = seed {
            self.seed = seed;
            self.thresholds = thresholds(seed, self.potentials.len());
        }
        self.potentials.fill(0.0);
        self.activations.fill(0.0);
        self.conductance_ampa.fill(0.0);
        self.conductance_gaba.fill(0.0);
        self.population_field.reset();
        self.corticothalamic.reset();
        self.refractory.fill(0.0);
        self.pre_trace.fill(0.0);
        self.post_trace.fill(0.0);
        self.spiked.fill(0);
        for slot in &mut self.pending {
            slot.fill(0.0);
        }
        self.weights.copy_from_slice(&self.initial_weights);
        self.signals_in_flight.clear();
        self.queue_cursor = 0;
        self.tick = 0;
        self.firing_rate_observable.reset();
        self.firing_rate = 0.0;
        self.latest_spike_count = 0;
    }

    #[must_use]
    pub fn snapshot(&self) -> SimulationSnapshot {
        let signals = self.signal_batch();
        let field = self.population_field.snapshot();
        let corticothalamic = corticothalamic_signal(self.corticothalamic.snapshot());
        let state_hash = state_hash(
            self.tick,
            self.latest_spike_count,
            &self.potentials,
            &self.activations,
            &self.weights,
            &field,
        );
        SimulationSnapshot {
            schema_version: SIMULATION_SCHEMA_VERSION,
            tick: self.tick,
            time_seconds: tick_to_f64(self.tick) * self.fixed_step.get(),
            firing_rate: self.firing_rate,
            spikes: self.latest_spike_count,
            mean_weight: mean_absolute_weight_f32(&self.weights),
            potentials: self.potentials.clone(),
            activations: self.activations.clone(),
            weights: self.weights.clone(),
            signals,
            field,
            corticothalamic,
            state_hash,
        }
    }

    fn inject_stimulus(
        &mut self,
        current_time: f64,
        next_time: f64,
        intensity: f64,
        confidence: f64,
    ) {
        let frequency = 1.4 + intensity * 8.6;
        let drive = 0.96 + intensity * 0.24 + confidence * 0.12;
        for (index, &node) in self.input_nodes.iter().enumerate() {
            let phase = self.input_phases[index];
            let previous_cycle = (current_time * frequency + phase).floor();
            let next_cycle = (next_time * frequency + phase).floor();
            if next_cycle > previous_cycle {
                let node = usize::try_from(node).expect("validated node must fit usize");
                self.potentials[node] = quantize_f32(f64::from(self.potentials[node]) + drive);
            }
        }
    }

    fn apply_plasticity(&mut self) -> Result<(), SimulationError> {
        if self.learning_rate == 0.0 {
            return Ok(());
        }
        for node in 0..self.spiked.len() {
            if self.spiked[node] == 0 {
                continue;
            }
            let node_u32 = u32::try_from(node).map_err(|_| SimulationError::NodeOverflow)?;
            for &synapse_id in self
                .csr
                .incoming_row(node_u32)
                .ok_or(SimulationError::InvalidCsr)?
            {
                let index = usize::try_from(synapse_id).map_err(|_| SimulationError::InvalidCsr)?;
                let synapse = self.synapses[index];
                if !synapse.plastic || self.weights[index] <= 0.0 {
                    continue;
                }
                let from =
                    usize::try_from(synapse.from).map_err(|_| SimulationError::NodeOverflow)?;
                let potentiation = self.learning_rate * f64::from(self.pre_trace[from]);
                self.weights[index] = quantize_f32(
                    (f64::from(self.weights[index]) + potentiation)
                        .clamp(MIN_EXCITATORY_WEIGHT, MAX_EXCITATORY_WEIGHT),
                );
            }
            for &synapse_id in self
                .csr
                .outgoing_row(node_u32)
                .ok_or(SimulationError::InvalidCsr)?
            {
                let index = usize::try_from(synapse_id).map_err(|_| SimulationError::InvalidCsr)?;
                let synapse = self.synapses[index];
                if !synapse.plastic || self.weights[index] <= 0.0 {
                    continue;
                }
                let to = usize::try_from(synapse.to).map_err(|_| SimulationError::NodeOverflow)?;
                let depression = self.learning_rate * 0.82 * f64::from(self.post_trace[to]);
                self.weights[index] = quantize_f32(
                    (f64::from(self.weights[index]) - depression)
                        .clamp(MIN_EXCITATORY_WEIGHT, MAX_EXCITATORY_WEIGHT),
                );
            }
        }
        Ok(())
    }

    fn propagate_spikes(&mut self) -> Result<(), SimulationError> {
        for node in 0..self.spiked.len() {
            if self.spiked[node] == 0 {
                continue;
            }
            let node_u32 = u32::try_from(node).map_err(|_| SimulationError::NodeOverflow)?;
            for &synapse_id in self
                .csr
                .outgoing_row(node_u32)
                .ok_or(SimulationError::InvalidCsr)?
            {
                let index = usize::try_from(synapse_id).map_err(|_| SimulationError::InvalidCsr)?;
                let synapse = self.synapses[index];
                let target_slot =
                    (self.queue_cursor + usize::from(self.delay_steps[index])) % self.pending.len();
                let target =
                    usize::try_from(synapse.to).map_err(|_| SimulationError::NodeOverflow)?;
                let weight = self.weights[index];
                self.pending[target_slot][target] =
                    quantize_f32(f64::from(self.pending[target_slot][target]) + f64::from(weight));
                self.signals_in_flight.push(SignalInFlight {
                    synapse_id,
                    elapsed: 0.0,
                    duration: f64::from(self.delay_steps[index]) * self.fixed_step.get(),
                    progress: 0.0,
                    strength: weight.abs(),
                    inhibitory: weight < 0.0,
                });
            }
        }
        if self.signals_in_flight.len() > MAX_SIGNALS_IN_FLIGHT {
            let excess = self.signals_in_flight.len() - MAX_SIGNALS_IN_FLIGHT;
            self.signals_in_flight.drain(0..excess);
        }
        Ok(())
    }

    fn age_signals(&mut self, delta: f64) {
        for signal in &mut self.signals_in_flight {
            signal.elapsed += delta;
            signal.progress = if signal.duration == 0.0 {
                1.0
            } else {
                signal.elapsed / signal.duration
            };
        }
        self.signals_in_flight
            .retain(|signal| signal.progress < 1.0);
    }

    fn signal_batch(&self) -> SignalBatch {
        SignalBatch {
            synapse_ids: self
                .signals_in_flight
                .iter()
                .map(|signal| signal.synapse_id)
                .collect(),
            progress: self
                .signals_in_flight
                .iter()
                .map(|signal| quantize_f32(signal.progress))
                .collect(),
            strength: self
                .signals_in_flight
                .iter()
                .map(|signal| signal.strength)
                .collect(),
            inhibitory: self
                .signals_in_flight
                .iter()
                .map(|signal| u8::from(signal.inhibitory))
                .collect(),
        }
    }
}

fn thresholds(seed: u32, node_count: usize) -> Vec<f32> {
    (0..node_count)
        .map(|node| {
            quantize_f32(
                0.9 + random_unit(
                    seed,
                    RANDOM_STREAM_CELL_THRESHOLD,
                    u32::try_from(node).expect("supported node count must fit u32"),
                    0,
                    0,
                ) * 0.22,
            )
        })
        .collect()
}

fn mean_absolute_weight_f32(weights: &[f32]) -> f64 {
    let promoted = weights
        .iter()
        .map(|&value| f64::from(value))
        .collect::<Vec<_>>();
    mean_absolute_weight(&promoted)
}

fn state_hash(
    tick: u64,
    spikes: u32,
    potentials: &[f32],
    activations: &[f32],
    weights: &[f32],
    field: &FieldSnapshot,
) -> u64 {
    let mut hash = 0xcbf2_9ce4_8422_2325_u64;
    for byte in tick
        .to_le_bytes()
        .into_iter()
        .chain(spikes.to_le_bytes())
        .chain(f32_bytes(potentials))
        .chain(f32_bytes(activations))
        .chain(f32_bytes(weights))
        .chain(f32_bytes(&field.excitatory))
        .chain(f32_bytes(&field.inhibitory))
    {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    hash
}

fn corticothalamic_signal(snapshot: crate::CorticothalamicSnapshot) -> CorticothalamicSignal {
    let excitatory = snapshot.laminar.excitatory.map(quantize_f32);
    let inhibitory = snapshot.laminar.inhibitory.map(quantize_f32);
    let relay = quantize_f32(snapshot.relay);
    let trn = quantize_f32(snapshot.trn);
    let rebound = quantize_f32(snapshot.rebound);
    let relay_drive_to_l4 = quantize_f32(snapshot.relay_drive_to_l4);
    let layer6_feedback = quantize_f32(snapshot.layer6_feedback);
    let mut hash = 0xcbf2_9ce4_8422_2325_u64;
    for byte in snapshot
        .tick
        .to_le_bytes()
        .into_iter()
        .chain(f32_bytes(&excitatory))
        .chain(f32_bytes(&inhibitory))
        .chain(relay.to_bits().to_le_bytes())
        .chain(trn.to_bits().to_le_bytes())
        .chain(rebound.to_bits().to_le_bytes())
    {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    CorticothalamicSignal {
        excitatory,
        inhibitory,
        relay,
        trn,
        rebound,
        relay_drive_to_l4,
        layer6_feedback,
        state_hash: hash,
    }
}

fn f32_bytes(values: &[f32]) -> impl Iterator<Item = u8> + '_ {
    values
        .iter()
        .flat_map(|value| value.to_bits().to_le_bytes())
}

#[expect(
    clippy::cast_possible_truncation,
    reason = "the simulation protocol intentionally publishes Float32Array-compatible state"
)]
fn quantize_f32(value: f64) -> f32 {
    value as f32
}

#[expect(
    clippy::cast_precision_loss,
    reason = "simulation array indexes remain far below the f64 exact-integer boundary"
)]
fn usize_to_f64(value: usize) -> f64 {
    value as f64
}

#[expect(
    clippy::cast_precision_loss,
    reason = "ticks are bounded by MAX_SAFE_TICK and therefore exact in f64"
)]
fn tick_to_f64(value: u64) -> f64 {
    value as f64
}

#[derive(Debug)]
pub enum SimulationError {
    InvalidTopology(&'static str),
    InvalidSynapse,
    InvalidTime,
    DelayOverflow,
    NodeOverflow,
    SpikeOverflow,
    TickOverflow,
    TickRegression,
    InvalidCsr,
    Field(crate::FieldError),
    Corticothalamic(crate::EngineError),
}

impl fmt::Display for SimulationError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidTopology(reason) => write!(formatter, "invalid topology: {reason}"),
            Self::InvalidSynapse => formatter.write_str("invalid synapse"),
            Self::InvalidTime => formatter.write_str("invalid simulation time"),
            Self::DelayOverflow => formatter.write_str("synapse delay exceeds u16"),
            Self::NodeOverflow => formatter.write_str("node index overflow"),
            Self::SpikeOverflow => formatter.write_str("spike count overflow"),
            Self::TickOverflow => formatter.write_str("simulation tick overflow"),
            Self::TickRegression => formatter.write_str("target tick cannot move backwards"),
            Self::InvalidCsr => formatter.write_str("invalid synapse CSR"),
            Self::Field(error) => write!(formatter, "field error: {error}"),
            Self::Corticothalamic(error) => write!(formatter, "corticothalamic error: {error}"),
        }
    }
}

impl std::error::Error for SimulationError {}
