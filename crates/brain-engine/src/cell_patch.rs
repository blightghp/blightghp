use core::fmt;

use crate::{random_unit, Seconds};

pub const CELL_PATCH_SCHEMA_VERSION: u32 = 2;
pub const LEGACY_CELL_PATCH_SCHEMA_VERSION: u32 = 1;
pub const CELL_SPIKE_EVENT_SCHEMA_VERSION: u32 = 1;
pub const CELL_COUNT: usize = 12;
pub const EXCITATORY_CELL_COUNT: usize = 8;
pub const DEFAULT_CELL_STEP_SECONDS: f64 = 1.0 / 12_000.0;
pub const MAX_CELL_SUBSTEPS_PER_INTERVAL: usize = 4_096;
pub const MAX_CELL_SPIKE_EVENTS_PER_INTERVAL: usize = 4_096;
pub const MAX_PATCH_DRIVE_HZ: f64 = 500.0;
pub const MAX_BOUNDARY_CURRENT_AMPERES: f64 = 1.0e-9;

const STREAM_EXTERNAL_EXCITATORY: u32 = 40;
const STREAM_EXTERNAL_INHIBITORY: u32 = 41;
const EXCITATORY_REVERSAL_VOLTS: f64 = 0.0;
const GABAA_REVERSAL_VOLTS: f64 = -0.070;
const GABAB_REVERSAL_VOLTS: f64 = -0.090;
const MAGNESIUM_MILLIMOLAR: f64 = 1.0;
const AMPA_TAU_SECONDS: f64 = 0.005;
const NMDA_TAU_SECONDS: f64 = 0.080;
const GABAA_TAU_SECONDS: f64 = 0.010;
const GABAB_TAU_SECONDS: f64 = 0.150;
const SPIKE_THRESHOLD_VOLTS: f64 = -0.030;
const RESTING_VOLTS: f64 = -0.070;
const MIN_COMPARTMENT_VOLTS: f64 = -0.120;
const MAX_COMPARTMENT_VOLTS: f64 = 0.060;
const SOMA_CAPACITANCE_FARADS: f64 = 200.0e-12;
const PROXIMAL_CAPACITANCE_FARADS: f64 = 60.0e-12;
const DISTAL_CAPACITANCE_FARADS: f64 = 40.0e-12;
const SOMA_LEAK_SIEMENS: f64 = 10.0e-9;
const PROXIMAL_LEAK_SIEMENS: f64 = 4.0e-9;
const DISTAL_LEAK_SIEMENS: f64 = 2.0e-9;
const SOMA_PROXIMAL_COUPLING_SIEMENS: f64 = 6.0e-9;
const PROXIMAL_DISTAL_COUPLING_SIEMENS: f64 = 4.0e-9;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u8)]
pub enum PatchCellKind {
    Excitatory = 0,
    Inhibitory = 1,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum CellPatchModel {
    LegacySingleDendriteV1,
    MultiCompartmentV2,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CellPatchConfig {
    pub dt: Seconds,
    pub model: CellPatchModel,
}

impl Default for CellPatchConfig {
    fn default() -> Self {
        Self {
            dt: Seconds::try_new(DEFAULT_CELL_STEP_SECONDS)
                .expect("the default cell step is positive and finite"),
            model: CellPatchModel::MultiCompartmentV2,
        }
    }
}

impl CellPatchConfig {
    #[must_use]
    pub const fn legacy_v1(dt: Seconds) -> Self {
        Self {
            dt,
            model: CellPatchModel::LegacySingleDendriteV1,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CellPatchDrive {
    pub excitatory_rate_hz: f64,
    pub inhibitory_rate_hz: f64,
    pub boundary_current_amperes: f64,
}

impl CellPatchDrive {
    fn validate(self) -> Result<Self, CellPatchError> {
        if !self.excitatory_rate_hz.is_finite()
            || !self.inhibitory_rate_hz.is_finite()
            || !(0.0..=MAX_PATCH_DRIVE_HZ).contains(&self.excitatory_rate_hz)
            || !(0.0..=MAX_PATCH_DRIVE_HZ).contains(&self.inhibitory_rate_hz)
            || !self.boundary_current_amperes.is_finite()
            || !(0.0..=MAX_BOUNDARY_CURRENT_AMPERES).contains(&self.boundary_current_amperes)
        {
            return Err(CellPatchError::InvalidDrive);
        }
        Ok(self)
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct ResolutionMap {
    pub patch_id: u32,
    pub field_vertices: Vec<u32>,
    pub cells: Vec<u32>,
    pub cell_to_field_weights: Vec<f32>,
    pub boundary_weights: Vec<f32>,
    pub blend_by_vertex: Vec<f32>,
}

impl ResolutionMap {
    /// Builds the single-vertex learning patch used by the 0.7 preset.
    ///
    /// # Errors
    ///
    /// Returns [`CellPatchError`] when no field vertex is available.
    pub fn learning_patch(field_vertex: Option<u32>) -> Result<Self, CellPatchError> {
        let vertex = field_vertex.ok_or(CellPatchError::InvalidResolutionMap)?;
        let cell_weight = 1.0 / 12.0;
        let cells = (0..CELL_COUNT)
            .map(|cell| u32::try_from(cell).map_err(|_| CellPatchError::CellOverflow))
            .collect::<Result<Vec<_>, _>>()?;
        Ok(Self {
            patch_id: 0,
            field_vertices: vec![vertex],
            cells,
            cell_to_field_weights: vec![cell_weight; CELL_COUNT],
            boundary_weights: vec![1.0],
            blend_by_vertex: vec![1.0],
        })
    }

    /// Validates lengths, domains and conservative weights.
    ///
    /// # Errors
    ///
    /// Returns [`CellPatchError::InvalidResolutionMap`] for any inconsistency.
    pub fn validate(&self) -> Result<(), CellPatchError> {
        if self.field_vertices.is_empty()
            || self.cells.len() != CELL_COUNT
            || self.cell_to_field_weights.len() != self.cells.len()
            || self.boundary_weights.len() != self.field_vertices.len()
            || self.blend_by_vertex.len() != self.field_vertices.len()
            || self
                .cells
                .iter()
                .enumerate()
                .any(|(index, &cell)| usize::try_from(cell).ok() != Some(index))
            || self
                .cell_to_field_weights
                .iter()
                .chain(&self.boundary_weights)
                .chain(&self.blend_by_vertex)
                .any(|value| !value.is_finite() || !(0.0..=1.0).contains(value))
        {
            return Err(CellPatchError::InvalidResolutionMap);
        }
        let cell_sum = self
            .cell_to_field_weights
            .iter()
            .map(|&value| f64::from(value))
            .sum::<f64>();
        let boundary_sum = self
            .boundary_weights
            .iter()
            .map(|&value| f64::from(value))
            .sum::<f64>();
        if (cell_sum - 1.0).abs() > 1.0e-6 || (boundary_sum - 1.0).abs() > 1.0e-6 {
            return Err(CellPatchError::InvalidResolutionMap);
        }
        Ok(())
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct CellSpikeEvent {
    pub cell_id: u32,
    pub time_offset_seconds: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct CellPatchSnapshot {
    pub schema_version: u32,
    pub tick: u64,
    pub time_seconds: f64,
    pub kinds: Vec<u8>,
    pub membrane_volts: Vec<f32>,
    pub dendrite_proximal_volts: Vec<f32>,
    pub dendrite_distal_volts: Vec<f32>,
    pub adaptation_amperes: Vec<f32>,
    pub ampa_amperes: Vec<f32>,
    pub nmda_amperes: Vec<f32>,
    pub gabaa_amperes: Vec<f32>,
    pub gabab_amperes: Vec<f32>,
    pub spiked: Vec<u8>,
    pub spike_events: Vec<CellSpikeEvent>,
    pub firing_rate_hz: f64,
    pub excitatory_inhibitory_ratio: f64,
    pub first_spike_seconds: Option<f64>,
    pub field_vertex: u32,
    pub blend: f32,
    pub state_hash: u64,
}

#[derive(Clone, Debug)]
pub struct CellPatch {
    config: CellPatchConfig,
    resolution: ResolutionMap,
    seed: u32,
    tick: u64,
    kinds: [PatchCellKind; CELL_COUNT],
    v_soma: [f64; CELL_COUNT],
    v_proximal: [f64; CELL_COUNT],
    v_distal: [f64; CELL_COUNT],
    adaptation_amperes: [f64; CELL_COUNT],
    ampa_siemens: [f64; CELL_COUNT],
    nmda_siemens: [f64; CELL_COUNT],
    gabaa_siemens: [f64; CELL_COUNT],
    gabab_siemens: [f64; CELL_COUNT],
    ampa_amperes: [f64; CELL_COUNT],
    nmda_amperes: [f64; CELL_COUNT],
    gabaa_amperes: [f64; CELL_COUNT],
    gabab_amperes: [f64; CELL_COUNT],
    spiked: [u8; CELL_COUNT],
    interval_spikes: u32,
    firing_rate_hz: f64,
    first_spike_seconds: Option<f64>,
    interval_start_tick: u64,
    interval_spike_events: Vec<CellSpikeEvent>,
}

impl CellPatch {
    /// Creates the deterministic 0.7 learning patch.
    ///
    /// # Errors
    ///
    /// Returns [`CellPatchError`] for an invalid step or resolution map.
    pub fn new(
        seed: u32,
        config: CellPatchConfig,
        resolution: ResolutionMap,
    ) -> Result<Self, CellPatchError> {
        resolution.validate()?;
        if config.dt.get() > 0.001 {
            return Err(CellPatchError::StepTooCoarse);
        }
        let kinds = core::array::from_fn(|index| {
            if index < EXCITATORY_CELL_COUNT {
                PatchCellKind::Excitatory
            } else {
                PatchCellKind::Inhibitory
            }
        });
        Ok(Self {
            config,
            resolution,
            seed,
            tick: 0,
            kinds,
            v_soma: [RESTING_VOLTS; CELL_COUNT],
            v_proximal: [RESTING_VOLTS; CELL_COUNT],
            v_distal: [RESTING_VOLTS; CELL_COUNT],
            adaptation_amperes: [0.0; CELL_COUNT],
            ampa_siemens: [0.0; CELL_COUNT],
            nmda_siemens: [0.0; CELL_COUNT],
            gabaa_siemens: [0.0; CELL_COUNT],
            gabab_siemens: [0.0; CELL_COUNT],
            ampa_amperes: [0.0; CELL_COUNT],
            nmda_amperes: [0.0; CELL_COUNT],
            gabaa_amperes: [0.0; CELL_COUNT],
            gabab_amperes: [0.0; CELL_COUNT],
            spiked: [0; CELL_COUNT],
            interval_spikes: 0,
            firing_rate_hz: 0.0,
            first_spike_seconds: None,
            interval_start_tick: 0,
            interval_spike_events: Vec::new(),
        })
    }

    /// Advances one macroscopic interval through fixed microscopic substeps.
    ///
    /// # Errors
    ///
    /// Returns [`CellPatchError`] for invalid drive, incompatible duration,
    /// excessive work, overflow or non-finite state.
    pub fn advance_interval(
        &mut self,
        duration: Seconds,
        drive: CellPatchDrive,
    ) -> Result<CellPatchSnapshot, CellPatchError> {
        self.advance_interval_with_event_limit(duration, drive, MAX_CELL_SPIKE_EVENTS_PER_INTERVAL)
    }

    fn advance_interval_with_event_limit(
        &mut self,
        duration: Seconds,
        drive: CellPatchDrive,
        spike_event_limit: usize,
    ) -> Result<CellPatchSnapshot, CellPatchError> {
        let drive = drive.validate()?;
        let exact_steps = duration.get() / self.config.dt.get();
        let rounded_steps = exact_steps.round();
        if (exact_steps - rounded_steps).abs() > 1.0e-9 || rounded_steps < 1.0 {
            return Err(CellPatchError::IncompatibleInterval);
        }
        #[expect(
            clippy::cast_possible_truncation,
            clippy::cast_sign_loss,
            reason = "the positive integral substep count is bounded immediately below"
        )]
        let steps = rounded_steps as usize;
        if steps > MAX_CELL_SUBSTEPS_PER_INTERVAL {
            return Err(CellPatchError::WorkLimitExceeded);
        }
        let mut candidate = self.clone();
        let snapshot =
            candidate.advance_interval_candidate(duration, drive, steps, spike_event_limit)?;
        *self = candidate;
        Ok(snapshot)
    }

    fn advance_interval_candidate(
        &mut self,
        duration: Seconds,
        drive: CellPatchDrive,
        steps: usize,
        spike_event_limit: usize,
    ) -> Result<CellPatchSnapshot, CellPatchError> {
        self.interval_spikes = 0;
        self.interval_start_tick = self.tick;
        self.interval_spike_events.clear();
        for _ in 0..steps {
            self.step(drive, spike_event_limit)?;
        }
        self.firing_rate_hz = f64::from(self.interval_spikes) / (12.0 * duration.get());
        Ok(self.snapshot())
    }

    pub fn reset(&mut self, seed: Option<u32>) {
        if let Some(seed) = seed {
            self.seed = seed;
        }
        self.tick = 0;
        self.v_soma.fill(RESTING_VOLTS);
        self.v_proximal.fill(RESTING_VOLTS);
        self.v_distal.fill(RESTING_VOLTS);
        self.adaptation_amperes.fill(0.0);
        self.ampa_siemens.fill(0.0);
        self.nmda_siemens.fill(0.0);
        self.gabaa_siemens.fill(0.0);
        self.gabab_siemens.fill(0.0);
        self.ampa_amperes.fill(0.0);
        self.nmda_amperes.fill(0.0);
        self.gabaa_amperes.fill(0.0);
        self.gabab_amperes.fill(0.0);
        self.spiked.fill(0);
        self.interval_spikes = 0;
        self.firing_rate_hz = 0.0;
        self.first_spike_seconds = None;
        self.interval_start_tick = 0;
        self.interval_spike_events.clear();
    }

    #[must_use]
    pub fn activity(&self) -> f64 {
        (self.firing_rate_hz / 100.0).clamp(0.0, 1.0)
    }

    #[must_use]
    pub fn snapshot(&self) -> CellPatchSnapshot {
        let excitatory = self
            .ampa_amperes
            .iter()
            .zip(&self.nmda_amperes)
            .map(|(ampa, nmda)| (ampa + nmda).max(0.0))
            .sum::<f64>();
        let inhibitory = self
            .gabaa_amperes
            .iter()
            .zip(&self.gabab_amperes)
            .map(|(gabaa, gabab)| (gabaa + gabab).abs())
            .sum::<f64>();
        let ratio = if inhibitory <= f64::EPSILON {
            0.0
        } else {
            excitatory / inhibitory
        };
        let state_hash = match self.config.model {
            CellPatchModel::LegacySingleDendriteV1 => patch_hash_v1(
                self.tick,
                &self.v_soma,
                &self.v_proximal,
                &self.adaptation_amperes,
                &self.ampa_siemens,
                &self.nmda_siemens,
                &self.gabaa_siemens,
                &self.gabab_siemens,
            ),
            CellPatchModel::MultiCompartmentV2 => patch_hash_v2(
                self.tick,
                &self.v_soma,
                &self.v_proximal,
                &self.v_distal,
                &self.adaptation_amperes,
                &self.ampa_siemens,
                &self.nmda_siemens,
                &self.gabaa_siemens,
                &self.gabab_siemens,
            ),
        };
        CellPatchSnapshot {
            schema_version: match self.config.model {
                CellPatchModel::LegacySingleDendriteV1 => LEGACY_CELL_PATCH_SCHEMA_VERSION,
                CellPatchModel::MultiCompartmentV2 => CELL_PATCH_SCHEMA_VERSION,
            },
            tick: self.tick,
            time_seconds: tick_to_f64(self.tick) * self.config.dt.get(),
            kinds: self.kinds.iter().map(|kind| *kind as u8).collect(),
            membrane_volts: self.v_soma.map(quantize_f32).to_vec(),
            dendrite_proximal_volts: self.v_proximal.map(quantize_f32).to_vec(),
            dendrite_distal_volts: self.v_distal.map(quantize_f32).to_vec(),
            adaptation_amperes: self.adaptation_amperes.map(quantize_f32).to_vec(),
            ampa_amperes: self.ampa_amperes.map(quantize_f32).to_vec(),
            nmda_amperes: self.nmda_amperes.map(quantize_f32).to_vec(),
            gabaa_amperes: self.gabaa_amperes.map(quantize_f32).to_vec(),
            gabab_amperes: self.gabab_amperes.map(quantize_f32).to_vec(),
            spiked: self.spiked.to_vec(),
            spike_events: self.interval_spike_events.clone(),
            firing_rate_hz: self.firing_rate_hz,
            excitatory_inhibitory_ratio: ratio,
            first_spike_seconds: self.first_spike_seconds,
            field_vertex: self.resolution.field_vertices[0],
            blend: self.resolution.blend_by_vertex[0],
            state_hash,
        }
    }

    fn step(
        &mut self,
        drive: CellPatchDrive,
        spike_event_limit: usize,
    ) -> Result<(), CellPatchError> {
        let dt = self.config.dt.get();
        let next_tick = self
            .tick
            .checked_add(1)
            .ok_or(CellPatchError::TickOverflow)?;
        self.spiked.fill(0);
        decay_array(&mut self.ampa_siemens, dt, AMPA_TAU_SECONDS);
        decay_array(&mut self.nmda_siemens, dt, NMDA_TAU_SECONDS);
        decay_array(&mut self.gabaa_siemens, dt, GABAA_TAU_SECONDS);
        decay_array(&mut self.gabab_siemens, dt, GABAB_TAU_SECONDS);

        for cell in 0..CELL_COUNT {
            let cell_id = u32::try_from(cell).map_err(|_| CellPatchError::CellOverflow)?;
            if random_unit(self.seed, STREAM_EXTERNAL_EXCITATORY, cell_id, self.tick, 0)
                < drive.excitatory_rate_hz * dt
            {
                self.ampa_siemens[cell] += 0.9e-9;
                self.nmda_siemens[cell] += 0.22e-9;
            }
            if random_unit(self.seed, STREAM_EXTERNAL_INHIBITORY, cell_id, self.tick, 0)
                < drive.inhibitory_rate_hz * dt
            {
                self.gabaa_siemens[cell] += 0.75e-9;
                self.gabab_siemens[cell] += 0.06e-9;
            }
        }

        for cell in 0..CELL_COUNT {
            self.update_currents(cell);
            match self.config.model {
                CellPatchModel::LegacySingleDendriteV1 => self.integrate_legacy_cell(
                    cell,
                    drive.boundary_current_amperes,
                    dt,
                    spike_event_limit,
                )?,
                CellPatchModel::MultiCompartmentV2 => self.integrate_multicompartment_cell(
                    cell,
                    drive.boundary_current_amperes,
                    dt,
                    spike_event_limit,
                )?,
            }
        }
        self.propagate_spikes();
        if self.config.model == CellPatchModel::MultiCompartmentV2 {
            for cell in 0..CELL_COUNT {
                self.update_currents(cell);
            }
        }
        self.tick = next_tick;
        Ok(())
    }

    fn update_currents(&mut self, cell: usize) {
        let soma = self.v_soma[cell];
        let proximal = self.v_proximal[cell];
        let distal = match self.config.model {
            CellPatchModel::LegacySingleDendriteV1 => proximal,
            CellPatchModel::MultiCompartmentV2 => self.v_distal[cell],
        };
        self.ampa_amperes[cell] = self.ampa_siemens[cell] * (EXCITATORY_REVERSAL_VOLTS - distal);
        self.nmda_amperes[cell] = self.nmda_siemens[cell]
            * nmda_magnesium_block(distal)
            * (EXCITATORY_REVERSAL_VOLTS - distal);
        self.gabaa_amperes[cell] = self.gabaa_siemens[cell] * (GABAA_REVERSAL_VOLTS - proximal);
        let gabab_voltage = match self.config.model {
            CellPatchModel::LegacySingleDendriteV1 => proximal,
            CellPatchModel::MultiCompartmentV2 => soma,
        };
        self.gabab_amperes[cell] =
            self.gabab_siemens[cell] * (GABAB_REVERSAL_VOLTS - gabab_voltage);
    }

    fn integrate_legacy_cell(
        &mut self,
        cell: usize,
        boundary_current: f64,
        dt: f64,
        spike_event_limit: usize,
    ) -> Result<(), CellPatchError> {
        let excitatory = self.kinds[cell] == PatchCellKind::Excitatory;
        let capacitance = if excitatory { 200.0e-12 } else { 100.0e-12 };
        let leak = if excitatory { 10.0e-9 } else { 12.0e-9 };
        let slope = if excitatory { 2.0e-3 } else { 0.5e-3 };
        let adaptation_a = if excitatory { 2.0e-9 } else { 0.0 };
        let adaptation_b = if excitatory { 40.0e-12 } else { 0.0 };
        let adaptation_tau = if excitatory { 0.200 } else { 0.030 };
        let rest = RESTING_VOLTS;
        let threshold = -0.050;
        let reset_voltage = if excitatory { -0.058 } else { -0.055 };
        let coupling = 4.0e-9;
        let dendrite_capacitance = 100.0e-12;
        let dendrite_leak = 5.0e-9;
        let soma = self.v_soma[cell];
        let dendrite = self.v_proximal[cell];
        let synaptic = self.ampa_amperes[cell]
            + self.nmda_amperes[cell]
            + self.gabaa_amperes[cell]
            + self.gabab_amperes[cell];
        let dendrite_derivative =
            (-dendrite_leak * (dendrite - rest) + coupling * (soma - dendrite) + synaptic)
                / dendrite_capacitance;
        let exponential = leak * slope * ((soma - threshold) / slope).min(20.0).exp();
        let soma_derivative = (-leak * (soma - rest) + exponential - self.adaptation_amperes[cell]
            + coupling * (dendrite - soma)
            + boundary_current)
            / capacitance;
        let adaptation_derivative =
            (adaptation_a * (soma - rest) - self.adaptation_amperes[cell]) / adaptation_tau;
        self.v_proximal[cell] = (dendrite + dt * dendrite_derivative).clamp(-0.110, 0.020);
        self.v_distal[cell] = self.v_proximal[cell];
        self.v_soma[cell] = (soma + dt * soma_derivative).clamp(-0.110, 0.020);
        self.adaptation_amperes[cell] =
            (self.adaptation_amperes[cell] + dt * adaptation_derivative).max(0.0);
        self.register_spike_if_needed(cell, reset_voltage, adaptation_b, dt, spike_event_limit)?;
        if !self.v_soma[cell].is_finite()
            || !self.v_proximal[cell].is_finite()
            || !self.v_distal[cell].is_finite()
            || !self.adaptation_amperes[cell].is_finite()
        {
            return Err(CellPatchError::NonFiniteState);
        }
        Ok(())
    }

    fn integrate_multicompartment_cell(
        &mut self,
        cell: usize,
        boundary_current: f64,
        dt: f64,
        spike_event_limit: usize,
    ) -> Result<(), CellPatchError> {
        let excitatory = self.kinds[cell] == PatchCellKind::Excitatory;
        let slope = if excitatory { 2.0e-3 } else { 0.5e-3 };
        let adaptation_a = if excitatory { 2.0e-9 } else { 0.0 };
        let adaptation_b = if excitatory { 40.0e-12 } else { 0.0 };
        let adaptation_tau = if excitatory { 0.200 } else { 0.030 };
        let threshold = -0.050;
        let reset_voltage = if excitatory { -0.058 } else { -0.055 };
        let soma = self.v_soma[cell];
        let proximal = self.v_proximal[cell];
        let distal = self.v_distal[cell];

        // Passive leak and axial coupling are solved implicitly as one fixed
        // tridiagonal system. AdEx, adaptation, injection and receptor currents
        // remain explicit at the beginning of the microscopic step.
        let soma_diagonal =
            SOMA_CAPACITANCE_FARADS / dt + SOMA_LEAK_SIEMENS + SOMA_PROXIMAL_COUPLING_SIEMENS;
        let proximal_diagonal = PROXIMAL_CAPACITANCE_FARADS / dt
            + PROXIMAL_LEAK_SIEMENS
            + SOMA_PROXIMAL_COUPLING_SIEMENS
            + PROXIMAL_DISTAL_COUPLING_SIEMENS;
        let distal_diagonal =
            DISTAL_CAPACITANCE_FARADS / dt + DISTAL_LEAK_SIEMENS + PROXIMAL_DISTAL_COUPLING_SIEMENS;
        let soma_to_proximal = -SOMA_PROXIMAL_COUPLING_SIEMENS;
        let proximal_to_distal = -PROXIMAL_DISTAL_COUPLING_SIEMENS;
        let exponential = SOMA_LEAK_SIEMENS * slope * ((soma - threshold) / slope).min(20.0).exp();
        let soma_rhs =
            SOMA_CAPACITANCE_FARADS / dt * soma + SOMA_LEAK_SIEMENS * RESTING_VOLTS + exponential
                - self.adaptation_amperes[cell]
                + boundary_current
                + self.gabab_amperes[cell];
        let proximal_rhs = PROXIMAL_CAPACITANCE_FARADS / dt * proximal
            + PROXIMAL_LEAK_SIEMENS * RESTING_VOLTS
            + self.gabaa_amperes[cell];
        let distal_rhs = DISTAL_CAPACITANCE_FARADS / dt * distal
            + DISTAL_LEAK_SIEMENS * RESTING_VOLTS
            + self.ampa_amperes[cell]
            + self.nmda_amperes[cell];

        let upper_soma = soma_to_proximal / soma_diagonal;
        let rhs_soma = soma_rhs / soma_diagonal;
        let proximal_pivot = proximal_diagonal - soma_to_proximal * upper_soma;
        let upper_proximal = proximal_to_distal / proximal_pivot;
        let rhs_proximal = (proximal_rhs - soma_to_proximal * rhs_soma) / proximal_pivot;
        let distal_pivot = distal_diagonal - proximal_to_distal * upper_proximal;
        if !proximal_pivot.is_finite()
            || !distal_pivot.is_finite()
            || proximal_pivot <= 0.0
            || distal_pivot <= 0.0
        {
            return Err(CellPatchError::NonFiniteState);
        }
        let next_distal = (distal_rhs - proximal_to_distal * rhs_proximal) / distal_pivot;
        let next_proximal = rhs_proximal - upper_proximal * next_distal;
        let next_soma = rhs_soma - upper_soma * next_proximal;
        let adaptation_derivative = (adaptation_a * (soma - RESTING_VOLTS)
            - self.adaptation_amperes[cell])
            / adaptation_tau;

        self.v_soma[cell] = next_soma.clamp(MIN_COMPARTMENT_VOLTS, MAX_COMPARTMENT_VOLTS);
        self.v_proximal[cell] = next_proximal.clamp(MIN_COMPARTMENT_VOLTS, MAX_COMPARTMENT_VOLTS);
        self.v_distal[cell] = next_distal.clamp(MIN_COMPARTMENT_VOLTS, MAX_COMPARTMENT_VOLTS);
        self.adaptation_amperes[cell] =
            (self.adaptation_amperes[cell] + dt * adaptation_derivative).max(0.0);
        self.register_spike_if_needed(cell, reset_voltage, adaptation_b, dt, spike_event_limit)?;
        if !self.v_soma[cell].is_finite()
            || !self.v_proximal[cell].is_finite()
            || !self.v_distal[cell].is_finite()
            || !self.adaptation_amperes[cell].is_finite()
        {
            return Err(CellPatchError::NonFiniteState);
        }
        Ok(())
    }

    fn register_spike_if_needed(
        &mut self,
        cell: usize,
        reset_voltage: f64,
        adaptation_increment: f64,
        dt: f64,
        spike_event_limit: usize,
    ) -> Result<(), CellPatchError> {
        if self.v_soma[cell] < SPIKE_THRESHOLD_VOLTS {
            return Ok(());
        }
        self.v_soma[cell] = reset_voltage;
        self.adaptation_amperes[cell] += adaptation_increment;
        self.spiked[cell] = 1;
        self.interval_spikes = self
            .interval_spikes
            .checked_add(1)
            .ok_or(CellPatchError::SpikeOverflow)?;
        if self.interval_spike_events.len() >= spike_event_limit {
            return Err(CellPatchError::SpikeEventLimitExceeded);
        }
        self.interval_spike_events.push(CellSpikeEvent {
            cell_id: u32::try_from(cell).map_err(|_| CellPatchError::CellOverflow)?,
            time_offset_seconds: tick_to_f64(
                self.tick
                    .checked_sub(self.interval_start_tick)
                    .ok_or(CellPatchError::TickOverflow)?,
            ) * dt,
        });
        if self.first_spike_seconds.is_none() {
            self.first_spike_seconds = Some(tick_to_f64(self.tick) * dt);
        }
        Ok(())
    }

    fn propagate_spikes(&mut self) {
        for source in 0..CELL_COUNT {
            if self.spiked[source] == 0 {
                continue;
            }
            for target in 0..CELL_COUNT {
                if source == target {
                    continue;
                }
                match self.kinds[source] {
                    PatchCellKind::Excitatory => {
                        self.ampa_siemens[target] += 0.45e-9;
                        self.nmda_siemens[target] += 0.12e-9;
                    }
                    PatchCellKind::Inhibitory => {
                        self.gabaa_siemens[target] += 0.80e-9;
                        self.gabab_siemens[target] += 0.08e-9;
                    }
                }
            }
        }
    }
}

fn decay_array(values: &mut [f64; CELL_COUNT], dt: f64, tau: f64) {
    let decay = (-dt / tau).exp();
    for value in values {
        *value *= decay;
    }
}

fn nmda_magnesium_block(volts: f64) -> f64 {
    let millivolts = volts * 1_000.0;
    1.0 / (1.0 + MAGNESIUM_MILLIMOLAR / 3.57 * (-0.062 * millivolts).exp())
}

#[expect(
    clippy::too_many_arguments,
    clippy::similar_names,
    reason = "the state hash names every independent receptor array explicitly"
)]
fn patch_hash_v1(
    tick: u64,
    membrane: &[f64],
    dendrite: &[f64],
    adaptation: &[f64],
    ampa: &[f64],
    nmda: &[f64],
    gabaa: &[f64],
    gabab: &[f64],
) -> u64 {
    let mut hash = 0xcbf2_9ce4_8422_2325_u64;
    for byte in tick.to_le_bytes().into_iter().chain(
        membrane
            .iter()
            .chain(dendrite)
            .chain(adaptation)
            .chain(ampa)
            .chain(nmda)
            .chain(gabaa)
            .chain(gabab)
            .flat_map(|value| value.to_bits().to_le_bytes()),
    ) {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    hash
}

#[expect(
    clippy::too_many_arguments,
    clippy::similar_names,
    reason = "the v2 state hash names every independent compartment and receptor array"
)]
fn patch_hash_v2(
    tick: u64,
    soma: &[f64],
    proximal: &[f64],
    distal: &[f64],
    adaptation: &[f64],
    ampa: &[f64],
    nmda: &[f64],
    gabaa: &[f64],
    gabab: &[f64],
) -> u64 {
    let mut hash = 0xcbf2_9ce4_8422_2325_u64;
    hash_tagged_bytes(
        &mut hash,
        b"brain.cell.patch",
        &CELL_PATCH_SCHEMA_VERSION.to_le_bytes(),
    );
    hash_tagged_bytes(&mut hash, b"tick", &tick.to_le_bytes());
    for (tag, values) in [
        (b"soma".as_slice(), soma),
        (b"proximal".as_slice(), proximal),
        (b"distal".as_slice(), distal),
        (b"adaptation".as_slice(), adaptation),
        (b"ampa".as_slice(), ampa),
        (b"nmda".as_slice(), nmda),
        (b"gabaa".as_slice(), gabaa),
        (b"gabab".as_slice(), gabab),
    ] {
        let length = u32::try_from(values.len()).unwrap_or(u32::MAX);
        hash_tagged_bytes(&mut hash, tag, &length.to_le_bytes());
        for value in values {
            hash_bytes(&mut hash, &value.to_bits().to_le_bytes());
        }
    }
    hash
}

fn hash_tagged_bytes(hash: &mut u64, tag: &[u8], bytes: &[u8]) {
    hash_bytes(
        hash,
        &u32::try_from(tag.len()).unwrap_or(u32::MAX).to_le_bytes(),
    );
    hash_bytes(hash, tag);
    hash_bytes(hash, bytes);
}

fn hash_bytes(hash: &mut u64, bytes: &[u8]) {
    for &byte in bytes {
        *hash ^= u64::from(byte);
        *hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
}

#[expect(
    clippy::cast_precision_loss,
    reason = "patch ticks remain below the f64 exact-integer boundary in supported runs"
)]
fn tick_to_f64(value: u64) -> f64 {
    value as f64
}

#[expect(
    clippy::cast_possible_truncation,
    reason = "the ABI intentionally publishes Float32Array-compatible state"
)]
fn quantize_f32(value: f64) -> f32 {
    value as f32
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CellPatchError {
    InvalidResolutionMap,
    InvalidDrive,
    StepTooCoarse,
    IncompatibleInterval,
    WorkLimitExceeded,
    CellOverflow,
    TickOverflow,
    SpikeOverflow,
    SpikeEventLimitExceeded,
    NonFiniteState,
}

impl fmt::Display for CellPatchError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidResolutionMap => formatter.write_str("invalid patch resolution map"),
            Self::InvalidDrive => formatter.write_str("invalid cell patch drive"),
            Self::StepTooCoarse => formatter.write_str("cell patch step exceeds 1 ms"),
            Self::IncompatibleInterval => {
                formatter.write_str("macro interval is not divisible by the cell step")
            }
            Self::WorkLimitExceeded => formatter.write_str("cell patch substep limit exceeded"),
            Self::CellOverflow => formatter.write_str("cell index overflow"),
            Self::TickOverflow => formatter.write_str("cell patch tick overflow"),
            Self::SpikeOverflow => formatter.write_str("cell patch spike count overflow"),
            Self::SpikeEventLimitExceeded => {
                formatter.write_str("cell patch spike event limit exceeded")
            }
            Self::NonFiniteState => formatter.write_str("cell patch produced non-finite state"),
        }
    }
}

impl std::error::Error for CellPatchError {}

#[cfg(test)]
mod tests {
    use super::*;

    fn patch(dt: f64, seed: u32) -> CellPatch {
        CellPatch::new(
            seed,
            CellPatchConfig {
                dt: Seconds::try_new(dt).unwrap(),
                model: CellPatchModel::MultiCompartmentV2,
            },
            ResolutionMap::learning_patch(Some(0)).unwrap(),
        )
        .unwrap()
    }

    #[test]
    fn resolution_map_is_conservative_and_rejects_missing_vertices() {
        let map = ResolutionMap::learning_patch(Some(4)).unwrap();
        assert_eq!(map.field_vertices, [4]);
        assert!(map.validate().is_ok());
        assert_eq!(
            ResolutionMap::learning_patch(None),
            Err(CellPatchError::InvalidResolutionMap)
        );
    }

    #[test]
    fn patch_is_deterministic_finite_and_publishes_si_units() {
        let mut first = patch(DEFAULT_CELL_STEP_SECONDS, 91);
        let mut second = patch(DEFAULT_CELL_STEP_SECONDS, 91);
        let drive = CellPatchDrive {
            excitatory_rate_hz: 35.0,
            inhibitory_rate_hz: 18.0,
            boundary_current_amperes: 180.0e-12,
        };
        for _ in 0..20 {
            let left = first
                .advance_interval(Seconds::try_new(1.0 / 60.0).unwrap(), drive)
                .unwrap();
            let right = second
                .advance_interval(Seconds::try_new(1.0 / 60.0).unwrap(), drive)
                .unwrap();
            assert_eq!(left, right);
            assert!(left
                .membrane_volts
                .iter()
                .chain(&left.dendrite_proximal_volts)
                .chain(&left.dendrite_distal_volts)
                .chain(&left.ampa_amperes)
                .chain(&left.nmda_amperes)
                .chain(&left.gabaa_amperes)
                .chain(&left.gabab_amperes)
                .all(|value| value.is_finite()));
            assert!(left
                .membrane_volts
                .iter()
                .chain(&left.dendrite_proximal_volts)
                .chain(&left.dendrite_distal_volts)
                .all(|value| (-0.12..=0.06).contains(value)));
            assert!(left.ampa_amperes.iter().all(|value| *value >= 0.0));
            assert!(left.gabab_amperes.iter().all(|value| *value <= 0.0));
        }
    }

    #[test]
    fn event_limit_failure_rolls_back_the_complete_interval() {
        let mut engine = patch(DEFAULT_CELL_STEP_SECONDS, 91);
        let before = engine.snapshot();
        let duration = Seconds::try_new(0.2).unwrap();
        let drive = CellPatchDrive {
            excitatory_rate_hz: 500.0,
            inhibitory_rate_hz: 0.0,
            boundary_current_amperes: 1.0e-9,
        };
        assert_eq!(
            engine.advance_interval_with_event_limit(duration, drive, 0),
            Err(CellPatchError::SpikeEventLimitExceeded)
        );
        assert_eq!(engine.snapshot(), before);
    }

    #[test]
    fn first_spike_time_converges_under_refinement() {
        let drive = CellPatchDrive {
            excitatory_rate_hz: 0.0,
            inhibitory_rate_hz: 0.0,
            boundary_current_amperes: 420.0e-12,
        };
        let mut times = Vec::new();
        for dt in [1.0 / 6_000.0, 1.0 / 12_000.0, 1.0 / 24_000.0] {
            let mut engine = patch(dt, 7);
            let interval = Seconds::try_new(1.0 / 60.0).unwrap();
            for _ in 0..12 {
                engine.advance_interval(interval, drive).unwrap();
                if engine.first_spike_seconds.is_some() {
                    break;
                }
            }
            times.push(engine.first_spike_seconds.unwrap());
        }
        let coarse_error = (times[0] - times[2]).abs();
        let medium_error = (times[1] - times[2]).abs();
        assert!(medium_error <= coarse_error);
        assert!(medium_error <= 0.000_25);
    }

    #[test]
    fn passive_cable_refinement_reduces_voltage_error() {
        fn response(dt: f64, steps: usize) -> [f64; 3] {
            let mut engine = patch(dt, 7);
            engine.v_soma[0] = -0.045;
            engine.v_proximal[0] = -0.065;
            engine.v_distal[0] = -0.085;
            for _ in 0..steps {
                engine
                    .integrate_multicompartment_cell(0, 0.0, dt, usize::MAX)
                    .unwrap();
            }
            [engine.v_soma[0], engine.v_proximal[0], engine.v_distal[0]]
        }

        fn error(sample: [f64; 3], reference: [f64; 3]) -> f64 {
            sample
                .into_iter()
                .zip(reference)
                .map(|(left, right)| (left - right).abs())
                .sum()
        }

        let coarse = response(1.0 / 6_000.0, 24);
        let medium = response(1.0 / 12_000.0, 48);
        let reference = response(1.0 / 96_000.0, 384);
        assert!(error(medium, reference) < error(coarse, reference));
    }

    #[test]
    fn passive_cable_attenuates_a_subthreshold_somatic_drive() {
        let mut engine = patch(DEFAULT_CELL_STEP_SECONDS, 9);
        for _ in 0..24 {
            engine
                .integrate_multicompartment_cell(
                    0,
                    100.0e-12,
                    DEFAULT_CELL_STEP_SECONDS,
                    usize::MAX,
                )
                .unwrap();
        }
        assert!(engine.v_soma[0] > engine.v_proximal[0]);
        assert!(engine.v_proximal[0] > engine.v_distal[0]);
        assert!(engine.v_distal[0] > RESTING_VOLTS);
    }

    #[test]
    fn coupling_currents_conserve_charge_and_receptors_use_declared_compartments() {
        let soma = -0.050;
        let proximal = -0.065;
        let distal = -0.080;
        let soma_current = SOMA_PROXIMAL_COUPLING_SIEMENS * (proximal - soma);
        let proximal_current = SOMA_PROXIMAL_COUPLING_SIEMENS * (soma - proximal)
            + PROXIMAL_DISTAL_COUPLING_SIEMENS * (distal - proximal);
        let distal_current = PROXIMAL_DISTAL_COUPLING_SIEMENS * (proximal - distal);
        assert!((soma_current + proximal_current + distal_current).abs() <= f64::EPSILON);

        let mut engine = patch(DEFAULT_CELL_STEP_SECONDS, 11);
        engine.v_soma[0] = soma;
        engine.v_proximal[0] = proximal;
        engine.v_distal[0] = distal;
        engine.ampa_siemens[0] = 1.0e-9;
        engine.nmda_siemens[0] = 1.0e-9;
        engine.gabaa_siemens[0] = 1.0e-9;
        engine.gabab_siemens[0] = 1.0e-9;
        engine.update_currents(0);
        assert!(
            (engine.ampa_amperes[0] - 1.0e-9 * (EXCITATORY_REVERSAL_VOLTS - distal)).abs()
                <= f64::EPSILON
        );
        assert!(
            (engine.gabaa_amperes[0] - 1.0e-9 * (GABAA_REVERSAL_VOLTS - proximal)).abs()
                <= f64::EPSILON
        );
        assert!(
            (engine.gabab_amperes[0] - 1.0e-9 * (GABAB_REVERSAL_VOLTS - soma)).abs()
                <= f64::EPSILON
        );
        assert!(
            (engine.nmda_amperes[0]
                - 1.0e-9 * nmda_magnesium_block(distal) * (EXCITATORY_REVERSAL_VOLTS - distal))
                .abs()
                <= f64::EPSILON
        );
    }

    #[test]
    fn v2_hash_domain_separates_proximal_and_distal_state() {
        let engine = patch(DEFAULT_CELL_STEP_SECONDS, 17);
        let baseline = engine.snapshot().state_hash;
        let mut proximal_changed = engine.clone();
        proximal_changed.v_proximal[0] += 1.0e-6;
        let mut distal_changed = engine;
        distal_changed.v_distal[0] += 1.0e-6;
        assert_ne!(baseline, proximal_changed.snapshot().state_hash);
        assert_ne!(baseline, distal_changed.snapshot().state_hash);
        assert_ne!(
            proximal_changed.snapshot().state_hash,
            distal_changed.snapshot().state_hash
        );
    }

    #[test]
    fn twelve_cell_batch_stays_within_the_substep_budget() {
        let mut engine = patch(DEFAULT_CELL_STEP_SECONDS, 29);
        let interval = Seconds::try_new(1.0 / 60.0).unwrap();
        let drive = CellPatchDrive {
            excitatory_rate_hz: 62.0,
            inhibitory_rate_hz: 28.0,
            boundary_current_amperes: 420.0e-12,
        };
        let intervals = 20_u32;
        let started = std::time::Instant::now();
        for _ in 0..intervals {
            engine.advance_interval(interval, drive).unwrap();
        }
        let elapsed_per_substep = started.elapsed().as_secs_f64()
            / (f64::from(intervals) * interval.get() / DEFAULT_CELL_STEP_SECONDS);
        eprintln!(
            "R09-E 12-cell integration baseline: {:.3} us/substep",
            elapsed_per_substep * 1.0e6
        );
        assert!(
            elapsed_per_substep < 0.001,
            "{elapsed_per_substep} s/substep"
        );
    }

    #[test]
    fn ensemble_seeds_produce_bounded_nonzero_variation() {
        let interval = Seconds::try_new(1.0 / 60.0).unwrap();
        let drive = CellPatchDrive {
            excitatory_rate_hz: 55.0,
            inhibitory_rate_hz: 25.0,
            boundary_current_amperes: 220.0e-12,
        };
        let samples = (0..8)
            .map(|seed| {
                let mut engine = patch(DEFAULT_CELL_STEP_SECONDS, seed);
                let mut rate_sum = 0.0;
                for _ in 0..30 {
                    rate_sum += engine
                        .advance_interval(interval, drive)
                        .unwrap()
                        .firing_rate_hz;
                }
                let snapshot = engine.snapshot();
                (rate_sum / 30.0, snapshot.state_hash)
            })
            .collect::<Vec<_>>();
        assert!(samples
            .iter()
            .all(|(rate, _)| rate.is_finite() && *rate >= 0.0));
        assert!(samples.iter().any(|(_, hash)| *hash != samples[0].1));
    }

    #[test]
    fn reset_clears_all_cell_and_receptor_state() {
        let mut engine = patch(DEFAULT_CELL_STEP_SECONDS, 12);
        engine
            .advance_interval(
                Seconds::try_new(1.0 / 60.0).unwrap(),
                CellPatchDrive {
                    excitatory_rate_hz: 40.0,
                    inhibitory_rate_hz: 20.0,
                    boundary_current_amperes: 300.0e-12,
                },
            )
            .unwrap();
        engine.reset(Some(13));
        let snapshot = engine.snapshot();
        assert_eq!(snapshot.tick, 0);
        assert!(snapshot.spiked.iter().all(|value| *value == 0));
        assert!(snapshot
            .ampa_amperes
            .iter()
            .all(|value| value.abs() < f32::EPSILON));
        assert!(snapshot
            .gabab_amperes
            .iter()
            .all(|value| value.abs() < f32::EPSILON));
    }
}
