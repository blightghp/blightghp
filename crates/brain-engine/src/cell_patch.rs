use core::fmt;

use crate::{random_unit, Seconds};

pub const CELL_PATCH_SCHEMA_VERSION: u32 = 1;
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

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u8)]
pub enum PatchCellKind {
    Excitatory = 0,
    Inhibitory = 1,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CellPatchConfig {
    pub dt: Seconds,
}

impl Default for CellPatchConfig {
    fn default() -> Self {
        Self {
            dt: Seconds::try_new(DEFAULT_CELL_STEP_SECONDS)
                .expect("the default cell step is positive and finite"),
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
    pub dendrite_volts: Vec<f32>,
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
    membrane_volts: [f64; CELL_COUNT],
    dendrite_volts: [f64; CELL_COUNT],
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
            membrane_volts: [-0.070; CELL_COUNT],
            dendrite_volts: [-0.070; CELL_COUNT],
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
        self.interval_spikes = 0;
        self.interval_start_tick = self.tick;
        self.interval_spike_events.clear();
        for _ in 0..steps {
            self.step(drive)?;
        }
        self.firing_rate_hz = f64::from(self.interval_spikes) / (12.0 * duration.get());
        Ok(self.snapshot())
    }

    pub fn reset(&mut self, seed: Option<u32>) {
        if let Some(seed) = seed {
            self.seed = seed;
        }
        self.tick = 0;
        self.membrane_volts.fill(-0.070);
        self.dendrite_volts.fill(-0.070);
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
        let state_hash = patch_hash(
            self.tick,
            &self.membrane_volts,
            &self.dendrite_volts,
            &self.adaptation_amperes,
            &self.ampa_siemens,
            &self.nmda_siemens,
            &self.gabaa_siemens,
            &self.gabab_siemens,
        );
        CellPatchSnapshot {
            schema_version: CELL_PATCH_SCHEMA_VERSION,
            tick: self.tick,
            time_seconds: tick_to_f64(self.tick) * self.config.dt.get(),
            kinds: self.kinds.iter().map(|kind| *kind as u8).collect(),
            membrane_volts: self.membrane_volts.map(quantize_f32).to_vec(),
            dendrite_volts: self.dendrite_volts.map(quantize_f32).to_vec(),
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

    fn step(&mut self, drive: CellPatchDrive) -> Result<(), CellPatchError> {
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
            self.integrate_cell(cell, drive.boundary_current_amperes, dt)?;
        }
        self.propagate_spikes();
        self.tick = next_tick;
        Ok(())
    }

    fn update_currents(&mut self, cell: usize) {
        let dendrite = self.dendrite_volts[cell];
        self.ampa_amperes[cell] = self.ampa_siemens[cell] * (EXCITATORY_REVERSAL_VOLTS - dendrite);
        self.nmda_amperes[cell] = self.nmda_siemens[cell]
            * nmda_magnesium_block(dendrite)
            * (EXCITATORY_REVERSAL_VOLTS - dendrite);
        self.gabaa_amperes[cell] = self.gabaa_siemens[cell] * (GABAA_REVERSAL_VOLTS - dendrite);
        self.gabab_amperes[cell] = self.gabab_siemens[cell] * (GABAB_REVERSAL_VOLTS - dendrite);
    }

    fn integrate_cell(
        &mut self,
        cell: usize,
        boundary_current: f64,
        dt: f64,
    ) -> Result<(), CellPatchError> {
        let excitatory = self.kinds[cell] == PatchCellKind::Excitatory;
        let capacitance = if excitatory { 200.0e-12 } else { 100.0e-12 };
        let leak = if excitatory { 10.0e-9 } else { 12.0e-9 };
        let slope = if excitatory { 2.0e-3 } else { 0.5e-3 };
        let adaptation_a = if excitatory { 2.0e-9 } else { 0.0 };
        let adaptation_b = if excitatory { 40.0e-12 } else { 0.0 };
        let adaptation_tau = if excitatory { 0.200 } else { 0.030 };
        let rest = -0.070;
        let threshold = -0.050;
        let reset_voltage = if excitatory { -0.058 } else { -0.055 };
        let coupling = 4.0e-9;
        let dendrite_capacitance = 100.0e-12;
        let dendrite_leak = 5.0e-9;
        let soma = self.membrane_volts[cell];
        let dendrite = self.dendrite_volts[cell];
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
        self.dendrite_volts[cell] = (dendrite + dt * dendrite_derivative).clamp(-0.110, 0.020);
        self.membrane_volts[cell] = (soma + dt * soma_derivative).clamp(-0.110, 0.020);
        self.adaptation_amperes[cell] =
            (self.adaptation_amperes[cell] + dt * adaptation_derivative).max(0.0);
        if self.membrane_volts[cell] >= SPIKE_THRESHOLD_VOLTS {
            self.membrane_volts[cell] = reset_voltage;
            self.adaptation_amperes[cell] += adaptation_b;
            self.spiked[cell] = 1;
            self.interval_spikes = self
                .interval_spikes
                .checked_add(1)
                .ok_or(CellPatchError::SpikeOverflow)?;
            if self.interval_spike_events.len() >= MAX_CELL_SPIKE_EVENTS_PER_INTERVAL {
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
        }
        if !self.membrane_volts[cell].is_finite()
            || !self.dendrite_volts[cell].is_finite()
            || !self.adaptation_amperes[cell].is_finite()
        {
            return Err(CellPatchError::NonFiniteState);
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
fn patch_hash(
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
                .chain(&left.dendrite_volts)
                .chain(&left.ampa_amperes)
                .chain(&left.nmda_amperes)
                .chain(&left.gabaa_amperes)
                .chain(&left.gabab_amperes)
                .all(|value| value.is_finite()));
            assert!(left
                .membrane_volts
                .iter()
                .all(|value| (-0.12..=0.03).contains(value)));
            assert!(left.ampa_amperes.iter().all(|value| *value >= 0.0));
            assert!(left.gabab_amperes.iter().all(|value| *value <= 0.0));
        }
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
