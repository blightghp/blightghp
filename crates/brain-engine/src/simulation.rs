use core::fmt;

use crate::synaptic::decay_conductance;
use crate::{
    mean_absolute_weight, random_unit, CellPatch, CellPatchConfig, CellPatchDrive, CellPatchModel,
    CellPatchSnapshot, ChemicalSignal, ChemicalTrack, ChemicalTrackError, CorticothalamicConfig,
    CorticothalamicDrive, CorticothalamicEngine, DeterministicInputQueue, FieldConfig,
    FieldSnapshot, FieldTopology, InputQueueError, LaminarConfig, NeuronKind, PopulationField,
    PopulationFiringRate, ResolutionMap, Seconds, SynapseCsr, SynapseEndpoint,
    AMPA_TIME_CONSTANT_SECONDS, CELL_SPIKE_EVENT_SCHEMA_VERSION, GABAA_TIME_CONSTANT_SECONDS,
    LAYER_COUNT, MAX_SAFE_TICK,
};

pub const SIMULATION_SCHEMA_VERSION: u32 = 8;
const MIN_EXCITATORY_WEIGHT: f64 = 0.12;
const MAX_EXCITATORY_WEIGHT: f64 = 0.92;
const MAX_SIGNALS_IN_FLIGHT: usize = 900;
const FIRING_RATE_WINDOW_SECONDS: f64 = 0.2;
const RANDOM_STREAM_CELL_THRESHOLD: u32 = 0;
const RANDOM_STREAM_CELL_REFRACTORY: u32 = 1;
pub const MAX_SCHEDULED_INPUTS: usize = 4_096;
pub const MAX_CELL_SPIKE_EVENTS_PER_SNAPSHOT: usize = 4_096;

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
    pub cell_patch_model: CellPatchModel,
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

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum SimulationInput {
    Stimulus(NeuralStimulus),
    Plasticity(f64),
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
pub struct CellSpikeEventBatch {
    pub schema_version: u32,
    pub start_tick: u64,
    pub end_tick: u64,
    pub cell_ids: Vec<u32>,
    pub time_offsets_seconds: Vec<f64>,
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
    pub cell_patch: CellPatchSnapshot,
    pub cell_spike_events: CellSpikeEventBatch,
    pub chemical: ChemicalSignal,
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
    cell_patch: CellPatch,
    chemical_track: ChemicalTrack,
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
    scheduled_inputs: DeterministicInputQueue<SimulationInput>,
    active_stimulus: NeuralStimulus,
    cell_spike_event_start_tick: u64,
    cell_spike_event_cell_ids: Vec<u32>,
    cell_spike_event_time_offsets_seconds: Vec<f64>,
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
        let resolution =
            ResolutionMap::learning_patch(Some(0)).map_err(SimulationError::CellPatch)?;
        let cell_patch = CellPatch::new(
            config.seed,
            CellPatchConfig {
                model: config.cell_patch_model,
                ..CellPatchConfig::default()
            },
            resolution,
        )
        .map_err(SimulationError::CellPatch)?;
        let chemical_track = ChemicalTrack::learning_preset();
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
        let scheduled_inputs = DeterministicInputQueue::new(MAX_SCHEDULED_INPUTS)
            .map_err(|_| SimulationError::InvalidTopology("invalid input queue capacity"))?;

        Ok(Self {
            seed: config.seed,
            fixed_step: config.fixed_step,
            neuron_kinds: config.neuron_kinds,
            synapses: config.synapses,
            csr,
            population_field,
            corticothalamic,
            cell_patch,
            chemical_track,
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
            scheduled_inputs,
            active_stimulus: NeuralStimulus {
                intensity: 0.0,
                confidence: 0.0,
            },
            cell_spike_event_start_tick: 0,
            cell_spike_event_cell_ids: Vec::new(),
            cell_spike_event_time_offsets_seconds: Vec::new(),
        })
    }

    #[must_use]
    pub const fn tick(&self) -> u64 {
        self.tick
    }

    /// Updates the bounded STDP rate used by subsequent ticks.
    ///
    /// # Errors
    ///
    /// Returns [`SimulationError::InvalidInput`] for non-finite or out-of-range rates.
    pub fn set_plasticity(&mut self, rate: f64) -> Result<(), SimulationError> {
        if !rate.is_finite() || !(0.0..=0.02).contains(&rate) {
            return Err(SimulationError::InvalidInput);
        }
        self.learning_rate = rate;
        Ok(())
    }

    /// Schedules a replayable external input at a canonical address.
    ///
    /// # Errors
    ///
    /// Returns [`SimulationError`] for invalid values or queue addresses.
    pub fn schedule_input(
        &mut self,
        tick: u64,
        sequence: u64,
        input: SimulationInput,
    ) -> Result<(), SimulationError> {
        match input {
            SimulationInput::Stimulus(stimulus)
                if !stimulus.intensity.is_finite()
                    || !stimulus.confidence.is_finite()
                    || !(0.0..=1.0).contains(&stimulus.intensity)
                    || !(0.0..=1.0).contains(&stimulus.confidence) =>
            {
                return Err(SimulationError::InvalidInput)
            }
            SimulationInput::Plasticity(rate)
                if !rate.is_finite() || !(0.0..=0.02).contains(&rate) =>
            {
                return Err(SimulationError::InvalidInput)
            }
            _ => {}
        }
        self.scheduled_inputs
            .schedule(self.tick, tick, sequence, input)
            .map_err(SimulationError::InputQueue)
    }

    /// Advances using only the last scheduled stimulus, initially zero.
    ///
    /// # Errors
    ///
    /// Returns [`SimulationError`] on tick regression, overflow or solver failure.
    pub fn advance_scheduled_to(
        &mut self,
        target_tick: u64,
    ) -> Result<SimulationSnapshot, SimulationError> {
        self.advance_with_default(target_tick, None)
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
        self.advance_with_default(target_tick, Some(stimulus))
    }

    fn advance_with_default(
        &mut self,
        target_tick: u64,
        default_stimulus: Option<NeuralStimulus>,
    ) -> Result<SimulationSnapshot, SimulationError> {
        self.advance_with_event_limit(
            target_tick,
            default_stimulus,
            MAX_CELL_SPIKE_EVENTS_PER_SNAPSHOT,
        )
    }

    fn advance_with_event_limit(
        &mut self,
        target_tick: u64,
        default_stimulus: Option<NeuralStimulus>,
        cell_spike_event_limit: usize,
    ) -> Result<SimulationSnapshot, SimulationError> {
        if default_stimulus.is_some_and(|stimulus| {
            !stimulus.intensity.is_finite()
                || !stimulus.confidence.is_finite()
                || !(0.0..=1.0).contains(&stimulus.intensity)
                || !(0.0..=1.0).contains(&stimulus.confidence)
        }) {
            return Err(SimulationError::InvalidInput);
        }
        if target_tick < self.tick {
            return Err(SimulationError::TickRegression);
        }
        if target_tick > MAX_SAFE_TICK {
            return Err(SimulationError::TickOverflow);
        }
        self.transact(|candidate| {
            candidate.advance_candidate(target_tick, default_stimulus, cell_spike_event_limit)
        })
    }

    fn advance_candidate(
        &mut self,
        target_tick: u64,
        default_stimulus: Option<NeuralStimulus>,
        cell_spike_event_limit: usize,
    ) -> Result<SimulationSnapshot, SimulationError> {
        self.begin_cell_spike_event_batch();
        while self.tick < target_tick {
            if let Some(stimulus) = default_stimulus {
                self.active_stimulus = stimulus;
            }
            let next_tick = self.tick + 1;
            for entry in self.scheduled_inputs.drain_tick(next_tick) {
                match entry.payload {
                    SimulationInput::Stimulus(stimulus) => self.active_stimulus = stimulus,
                    SimulationInput::Plasticity(rate) => self.learning_rate = rate,
                }
            }
            self.step_accumulating_events(self.active_stimulus, cell_spike_event_limit)?;
        }
        Ok(self.snapshot())
    }

    /// Advances exactly one fixed tick.
    ///
    /// # Errors
    ///
    /// Returns [`SimulationError`] on tick overflow or field failure.
    pub fn step(&mut self, stimulus: NeuralStimulus) -> Result<(), SimulationError> {
        self.transact(|candidate| {
            candidate.begin_cell_spike_event_batch();
            candidate.step_accumulating_events(stimulus, MAX_CELL_SPIKE_EVENTS_PER_SNAPSHOT)
        })
    }

    fn transact<T>(
        &mut self,
        operation: impl FnOnce(&mut Self) -> Result<T, SimulationError>,
    ) -> Result<T, SimulationError> {
        let mut candidate = self.clone();
        let output = operation(&mut candidate)?;
        *self = candidate;
        Ok(output)
    }

    fn step_accumulating_events(
        &mut self,
        stimulus: NeuralStimulus,
        cell_spike_event_limit: usize,
    ) -> Result<(), SimulationError> {
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
                decay_conductance(self.conductance_ampa[node], dt, AMPA_TIME_CONSTANT_SECONDS);
            self.conductance_gaba[node] =
                decay_conductance(self.conductance_gaba[node], dt, GABAA_TIME_CONSTANT_SECONDS);
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
        self.advance_cell_patch(intensity, confidence, cell_spike_event_limit)?;
        self.advance_chemical_track()?;

        self.firing_rate = self.firing_rate_observable.sample(spikes);
        self.latest_spike_count = spikes;
        self.tick = next_tick;
        self.queue_cursor = (self.queue_cursor + 1) % self.pending.len();
        Ok(())
    }

    fn advance_chemical_track(&mut self) -> Result<(), SimulationError> {
        let mut chemical_spikes = [0_u32; 2];
        for (&spiked, &kind) in self.spiked.iter().zip(&self.neuron_kinds) {
            if spiked != 0 {
                let index = usize::from(kind == NeuronKind::Inhibitory);
                chemical_spikes[index] = chemical_spikes[index]
                    .checked_add(1)
                    .ok_or(SimulationError::SpikeOverflow)?;
            }
        }
        self.chemical_track
            .advance_tick(self.fixed_step, chemical_spikes[0], chemical_spikes[1])
            .map(|_| ())
            .map_err(SimulationError::ChemicalTrack)
    }

    fn advance_cell_patch(
        &mut self,
        stimulus_intensity: f64,
        stimulus_confidence: f64,
        cell_spike_event_limit: usize,
    ) -> Result<(), SimulationError> {
        let boundary_activity = self
            .population_field
            .snapshot()
            .wave_activity
            .first()
            .copied()
            .map_or(0.0, f64::from);
        let snapshot = self
            .cell_patch
            .advance_interval(
                self.fixed_step,
                CellPatchDrive {
                    excitatory_rate_hz: 8.0 + stimulus_intensity * 70.0,
                    inhibitory_rate_hz: 4.0 + stimulus_confidence * 35.0,
                    boundary_current_amperes: 40.0e-12 + boundary_activity * 260.0e-12,
                },
            )
            .map_err(SimulationError::CellPatch)?;
        let macro_offset = tick_to_f64(
            self.tick
                .checked_sub(self.cell_spike_event_start_tick)
                .ok_or(SimulationError::TickRegression)?,
        ) * self.fixed_step.get();
        if self.cell_spike_event_cell_ids.len() + snapshot.spike_events.len()
            > cell_spike_event_limit
        {
            return Err(SimulationError::CellSpikeEventLimitExceeded);
        }
        for event in snapshot.spike_events {
            self.cell_spike_event_cell_ids.push(event.cell_id);
            self.cell_spike_event_time_offsets_seconds
                .push(macro_offset + event.time_offset_seconds);
        }
        Ok(())
    }

    fn begin_cell_spike_event_batch(&mut self) {
        self.cell_spike_event_start_tick = self.tick;
        self.cell_spike_event_cell_ids.clear();
        self.cell_spike_event_time_offsets_seconds.clear();
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
        self.cell_patch.reset(seed);
        self.chemical_track.reset();
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
        self.scheduled_inputs.clear();
        self.active_stimulus = NeuralStimulus {
            intensity: 0.0,
            confidence: 0.0,
        };
        self.begin_cell_spike_event_batch();
    }

    #[must_use]
    pub fn snapshot(&self) -> SimulationSnapshot {
        let signals = self.signal_batch();
        let mut field = self.population_field.snapshot();
        let raw_field = field.clone();
        let corticothalamic = corticothalamic_signal(self.corticothalamic.snapshot());
        let cell_patch = self.cell_patch.snapshot();
        let chemical = self.chemical_track.snapshot();
        let cell_spike_events = cell_spike_event_batch(
            self.cell_spike_event_start_tick,
            self.tick,
            &self.cell_spike_event_cell_ids,
            &self.cell_spike_event_time_offsets_seconds,
        );
        let state_hash = state_hash(
            self.tick,
            self.latest_spike_count,
            &self.potentials,
            &self.activations,
            &self.weights,
            &raw_field,
        );
        if let Some(value) = field
            .wave_activity
            .get_mut(usize::try_from(cell_patch.field_vertex).unwrap_or(usize::MAX))
        {
            *value = quantize_f32(
                (1.0 - f64::from(cell_patch.blend)) * f64::from(*value)
                    + f64::from(cell_patch.blend) * self.cell_patch.activity(),
            );
        }
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
            cell_patch,
            cell_spike_events,
            chemical,
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

fn cell_spike_event_batch(
    start_tick: u64,
    end_tick: u64,
    cell_ids: &[u32],
    time_offsets_seconds: &[f64],
) -> CellSpikeEventBatch {
    debug_assert_eq!(cell_ids.len(), time_offsets_seconds.len());
    let mut hash = 0xcbf2_9ce4_8422_2325_u64;
    for byte in CELL_SPIKE_EVENT_SCHEMA_VERSION
        .to_le_bytes()
        .into_iter()
        .chain(start_tick.to_le_bytes())
        .chain(end_tick.to_le_bytes())
        .chain(
            u32::try_from(cell_ids.len())
                .unwrap_or(u32::MAX)
                .to_le_bytes(),
        )
        .chain(cell_ids.iter().flat_map(|value| value.to_le_bytes()))
        .chain(
            time_offsets_seconds
                .iter()
                .flat_map(|value| value.to_bits().to_le_bytes()),
        )
    {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    CellSpikeEventBatch {
        schema_version: CELL_SPIKE_EVENT_SCHEMA_VERSION,
        start_tick,
        end_tick,
        cell_ids: cell_ids.to_vec(),
        time_offsets_seconds: time_offsets_seconds.to_vec(),
        state_hash: hash,
    }
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
    CellSpikeEventLimitExceeded,
    TickOverflow,
    TickRegression,
    InvalidCsr,
    InvalidInput,
    InputQueue(InputQueueError),
    CellPatch(crate::CellPatchError),
    ChemicalTrack(ChemicalTrackError),
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
            Self::CellSpikeEventLimitExceeded => {
                formatter.write_str("cell spike event snapshot limit exceeded")
            }
            Self::TickOverflow => formatter.write_str("simulation tick overflow"),
            Self::TickRegression => formatter.write_str("target tick cannot move backwards"),
            Self::InvalidCsr => formatter.write_str("invalid synapse CSR"),
            Self::InvalidInput => formatter.write_str("invalid scheduled simulation input"),
            Self::InputQueue(error) => write!(formatter, "input queue error: {error}"),
            Self::CellPatch(error) => write!(formatter, "cell patch error: {error}"),
            Self::ChemicalTrack(error) => write!(formatter, "chemical track error: {error}"),
            Self::Field(error) => write!(formatter, "field error: {error}"),
            Self::Corticothalamic(error) => write!(formatter, "corticothalamic error: {error}"),
        }
    }
}

impl std::error::Error for SimulationError {}

#[cfg(test)]
mod tests {
    use super::*;

    fn minimal_simulation() -> NeuralSimulation {
        NeuralSimulation::new(SimulationConfig {
            seed: 91,
            fixed_step: Seconds::try_new(1.0 / 60.0).unwrap(),
            cell_patch_model: CellPatchModel::MultiCompartmentV2,
            neuron_kinds: vec![NeuronKind::Excitatory],
            synapses: Vec::new(),
            cortical_nodes: vec![0],
            node_z: vec![0.0],
            field_topology: FieldTopology {
                node_indices: vec![0],
                vertex_by_node: vec![0],
                row_offsets: vec![0, 0],
                neighbors: Vec::new(),
                edge_lengths: Vec::new(),
            },
        })
        .unwrap()
    }

    #[test]
    fn cell_spike_event_hash_is_ordered_and_domain_specific() {
        let left = cell_spike_event_batch(10, 12, &[2, 5, 1], &[0.0, 0.0, 0.02]);
        let right = cell_spike_event_batch(10, 12, &[2, 5, 1], &[0.0, 0.0, 0.02]);
        let reordered = cell_spike_event_batch(10, 12, &[5, 2, 1], &[0.0, 0.0, 0.02]);
        assert_eq!(left, right);
        assert_eq!(left.state_hash, 0xfbda_a0df_afe7_2301);
        assert_ne!(left.state_hash, reordered.state_hash);
        assert_eq!(left.schema_version, CELL_SPIKE_EVENT_SCHEMA_VERSION);
        assert_eq!(left.cell_ids.len(), left.time_offsets_seconds.len());
    }

    #[test]
    fn empty_cell_spike_batch_still_binds_its_interval() {
        let first = cell_spike_event_batch(0, 1, &[], &[]);
        let second = cell_spike_event_batch(1, 2, &[], &[]);
        assert_ne!(first.state_hash, second.state_hash);
    }

    #[test]
    fn identical_runs_match_tick_by_tick_in_all_five_hash_domains() {
        let mut first = minimal_simulation();
        let mut second = minimal_simulation();
        for tick in 1..=60 {
            let stimulus = NeuralStimulus {
                intensity: 0.64,
                confidence: 0.0,
            };
            let left = first.advance_to(tick, stimulus).unwrap();
            let right = second.advance_to(tick, stimulus).unwrap();
            assert_eq!(left.state_hash, right.state_hash);
            assert_eq!(
                left.corticothalamic.state_hash,
                right.corticothalamic.state_hash
            );
            assert_eq!(left.cell_patch.state_hash, right.cell_patch.state_hash);
            assert_eq!(left.chemical.state_hash, right.chemical.state_hash);
            assert_eq!(
                left.cell_spike_events.state_hash,
                right.cell_spike_events.state_hash
            );
        }
    }

    #[test]
    fn event_limit_failure_rolls_back_the_complete_advance() {
        let mut simulation = minimal_simulation();
        let before = simulation.snapshot();
        let result = simulation.transact(|candidate| {
            candidate.begin_cell_spike_event_batch();
            candidate.step_accumulating_events(
                NeuralStimulus {
                    intensity: 1.0,
                    confidence: 0.0,
                },
                MAX_CELL_SPIKE_EVENTS_PER_SNAPSHOT,
            )?;
            Err::<(), _>(SimulationError::CellSpikeEventLimitExceeded)
        });
        assert!(
            matches!(result, Err(SimulationError::CellSpikeEventLimitExceeded)),
            "unexpected result: {result:?}"
        );
        assert_eq!(simulation.snapshot(), before);
    }
}
