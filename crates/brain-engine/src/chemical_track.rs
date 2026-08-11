use core::fmt;

use crate::{
    ChemicalSolver, ChemicalSolverConfig, ChemicalSolverError, ChemicalSynapseConfig, Seconds,
    ShortTermPlasticity, ShortTermPlasticityConfig, ShortTermPlasticityError, TransmitterKind,
    UnitFraction, RECEPTOR_FAMILY_COUNT, TRANSMITTER_COUNT,
};

pub const CHEMICAL_TRACK_SCHEMA_VERSION: u32 = 1;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ChemicalSignal {
    pub schema_version: u32,
    pub time_seconds: f64,
    pub solver_step_index: u64,
    pub release_event_indices: [u32; TRANSMITTER_COUNT],
    pub presynaptic_spike_counts: [u32; TRANSMITTER_COUNT],
    pub vesicle_available_fraction: [f64; TRANSMITTER_COUNT],
    pub vesicle_utilization_fraction: [f64; TRANSMITTER_COUNT],
    pub latest_release_moles: [f64; TRANSMITTER_COUNT],
    pub latest_release_time_seconds: [f64; TRANSMITTER_COUNT],
    pub total_released_moles: [f64; TRANSMITTER_COUNT],
    pub cleft_moles: [f64; TRANSMITTER_COUNT],
    pub cleft_concentration_moles_per_cubic_meter: [f64; TRANSMITTER_COUNT],
    pub receptor_bound_moles: [f64; RECEPTOR_FAMILY_COUNT],
    pub receptor_occupancy_fraction: [f64; RECEPTOR_FAMILY_COUNT],
    pub cleared_moles: [f64; TRANSMITTER_COUNT],
    pub state_hash: u64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ChemicalTrack {
    vesicles: [ShortTermPlasticity; TRANSMITTER_COUNT],
    solver: ChemicalSolver,
    presynaptic_spike_counts: [u32; TRANSMITTER_COUNT],
    latest_release_moles: [f64; TRANSMITTER_COUNT],
    latest_release_time_seconds: [f64; TRANSMITTER_COUNT],
}

impl ChemicalTrack {
    /// Creates the fixed learning preset used by the ABI v6 microdomain.
    ///
    /// # Panics
    ///
    /// Panics only if the compile-time preset constants violate their typed
    /// constructors.
    #[must_use]
    pub fn learning_preset() -> Self {
        let vesicle_config = |baseline, pool_capacity_moles| {
            ShortTermPlasticityConfig::try_new(
                UnitFraction::try_new(baseline).expect("preset utilization must be valid"),
                Seconds::try_new(0.8).expect("preset depression time must be valid"),
                Seconds::try_new(0.25).expect("preset facilitation time must be valid"),
                Seconds::try_new(0.08).expect("preset conductance time must be valid"),
                pool_capacity_moles,
                1.5e-9,
            )
            .expect("chemical track vesicle preset must be valid")
        };
        Self {
            vesicles: [
                ShortTermPlasticity::new(vesicle_config(0.18, 2.0e-18)),
                ShortTermPlasticity::new(vesicle_config(0.14, 1.5e-18)),
            ],
            solver: ChemicalSolver::new(
                ChemicalSolverConfig::default(),
                ChemicalSynapseConfig::default(),
            ),
            presynaptic_spike_counts: [0; TRANSMITTER_COUNT],
            latest_release_moles: [0.0; TRANSMITTER_COUNT],
            latest_release_time_seconds: [-1.0; TRANSMITTER_COUNT],
        }
    }

    /// Advances one representative excitatory/inhibitory microdomain atomically.
    ///
    /// Spike counts are published for provenance, while at most one vesicular
    /// event per transmitter is applied at a tick boundary. The track therefore
    /// describes one synapse, not a population-wide sum of unrelated clefts.
    ///
    /// # Errors
    ///
    /// Returns a typed error if any vesicular or chemical transition fails. No
    /// partial state is retained.
    pub fn advance_tick(
        &mut self,
        duration: Seconds,
        excitatory_spikes: u32,
        inhibitory_spikes: u32,
    ) -> Result<ChemicalSignal, ChemicalTrackError> {
        let mut candidate = self.clone();
        candidate.advance_tick_candidate(duration, [excitatory_spikes, inhibitory_spikes])?;
        *self = candidate;
        Ok(self.snapshot())
    }

    fn advance_tick_candidate(
        &mut self,
        duration: Seconds,
        spike_counts: [u32; TRANSMITTER_COUNT],
    ) -> Result<(), ChemicalTrackError> {
        let target_time = self.solver.snapshot().time_seconds + duration.get();
        self.solver.advance_interval(duration)?;
        self.presynaptic_spike_counts = spike_counts;

        for transmitter in [TransmitterKind::Glutamate, TransmitterKind::Gaba] {
            let index = transmitter.index();
            self.vesicles[index].advance_to(target_time)?;
            if spike_counts[index] == 0 {
                continue;
            }
            let event = self.vesicles[index].process_presynaptic_event(target_time)?;
            self.solver
                .release_into_cleft(transmitter, event.release.released_moles())?;
            self.latest_release_moles[index] = event.release.released_moles();
            self.latest_release_time_seconds[index] = target_time;
        }
        Ok(())
    }

    #[must_use]
    pub fn snapshot(&self) -> ChemicalSignal {
        let solver = self.solver.snapshot();
        let vesicles = self.vesicles.each_ref().map(ShortTermPlasticity::snapshot);
        let release_event_indices =
            vesicles.map(|snapshot| u32::try_from(snapshot.event_index).unwrap_or(u32::MAX));
        let vesicle_available_fraction = vesicles.map(|snapshot| snapshot.available_fraction);
        let vesicle_utilization_fraction = vesicles.map(|snapshot| snapshot.utilization_fraction);
        let chemical = solver.chemical;
        let state_hash = state_hash(
            solver.state_hash,
            vesicles.map(|snapshot| snapshot.state_hash),
            self.presynaptic_spike_counts,
            self.latest_release_moles,
            self.latest_release_time_seconds,
        );
        ChemicalSignal {
            schema_version: CHEMICAL_TRACK_SCHEMA_VERSION,
            time_seconds: solver.time_seconds,
            solver_step_index: solver.step_index,
            release_event_indices,
            presynaptic_spike_counts: self.presynaptic_spike_counts,
            vesicle_available_fraction,
            vesicle_utilization_fraction,
            latest_release_moles: self.latest_release_moles,
            latest_release_time_seconds: self.latest_release_time_seconds,
            total_released_moles: chemical.total_released_moles,
            cleft_moles: chemical.cleft_moles,
            cleft_concentration_moles_per_cubic_meter: chemical
                .cleft_concentration_moles_per_cubic_meter,
            receptor_bound_moles: chemical.receptor_bound_moles,
            receptor_occupancy_fraction: chemical.receptor_occupancy_fraction,
            cleared_moles: chemical.cleared_moles,
            state_hash,
        }
    }

    pub fn reset(&mut self) {
        self.vesicles
            .iter_mut()
            .for_each(ShortTermPlasticity::reset);
        self.solver.reset();
        self.presynaptic_spike_counts = [0; TRANSMITTER_COUNT];
        self.latest_release_moles = [0.0; TRANSMITTER_COUNT];
        self.latest_release_time_seconds = [-1.0; TRANSMITTER_COUNT];
    }
}

fn state_hash(
    solver_hash: u64,
    vesicle_hashes: [u64; TRANSMITTER_COUNT],
    spike_counts: [u32; TRANSMITTER_COUNT],
    latest_release_moles: [f64; TRANSMITTER_COUNT],
    latest_release_times: [f64; TRANSMITTER_COUNT],
) -> u64 {
    let mut hash = 0xcbf2_9ce4_8422_2325_u64;
    for byte in CHEMICAL_TRACK_SCHEMA_VERSION
        .to_le_bytes()
        .into_iter()
        .chain(solver_hash.to_le_bytes())
        .chain(vesicle_hashes.into_iter().flat_map(u64::to_le_bytes))
        .chain(spike_counts.into_iter().flat_map(u32::to_le_bytes))
        .chain(
            latest_release_moles
                .into_iter()
                .flat_map(|value| value.to_bits().to_le_bytes()),
        )
        .chain(
            latest_release_times
                .into_iter()
                .flat_map(|value| value.to_bits().to_le_bytes()),
        )
    {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    hash
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum ChemicalTrackError {
    Vesicle(ShortTermPlasticityError),
    Solver(ChemicalSolverError),
}

impl From<ShortTermPlasticityError> for ChemicalTrackError {
    fn from(error: ShortTermPlasticityError) -> Self {
        Self::Vesicle(error)
    }
}

impl From<ChemicalSolverError> for ChemicalTrackError {
    fn from(error: ChemicalSolverError) -> Self {
        Self::Solver(error)
    }
}

impl fmt::Display for ChemicalTrackError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Vesicle(error) => write!(formatter, "vesicle transition failed: {error}"),
            Self::Solver(error) => write!(formatter, "chemical solver failed: {error}"),
        }
    }
}

impl std::error::Error for ChemicalTrackError {}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ReceptorFamily;

    fn tick() -> Seconds {
        Seconds::try_new(1.0 / 60.0).unwrap()
    }

    #[test]
    fn published_stages_follow_only_declared_spikes() {
        let mut track = ChemicalTrack::learning_preset();
        let resting = track.advance_tick(tick(), 0, 0).unwrap();
        assert_eq!(resting.release_event_indices, [0, 0]);
        assert!(resting
            .total_released_moles
            .into_iter()
            .all(|value| value.to_bits() == 0.0_f64.to_bits()));

        let released = track.advance_tick(tick(), 3, 0).unwrap();
        assert_eq!(released.presynaptic_spike_counts, [3, 0]);
        assert_eq!(released.release_event_indices, [1, 0]);
        assert!(released.latest_release_moles[0] > 0.0);
        assert!(released.cleft_concentration_moles_per_cubic_meter[0] > 0.0);
        assert_eq!(
            released.latest_release_moles[1].to_bits(),
            0.0_f64.to_bits()
        );

        let clearing = track.advance_tick(tick(), 0, 0).unwrap();
        assert!(clearing.cleared_moles[0] > released.cleared_moles[0]);
        assert!(clearing.cleft_moles[0] < released.cleft_moles[0]);
        assert!(clearing.receptor_occupancy_fraction[ReceptorFamily::Ampa.index()] > 0.0);
    }

    #[test]
    fn reset_restores_the_exact_initial_snapshot() {
        let mut track = ChemicalTrack::learning_preset();
        let initial = track.snapshot();
        track.advance_tick(tick(), 1, 1).unwrap();
        track.reset();
        assert_eq!(track.snapshot(), initial);
    }

    #[test]
    fn identical_spike_trains_have_identical_chemical_hashes() {
        let mut first = ChemicalTrack::learning_preset();
        let mut second = ChemicalTrack::learning_preset();
        for index in 0..240 {
            let excitatory = u32::from(index % 7 == 0);
            let inhibitory = u32::from(index % 11 == 0);
            assert_eq!(
                first.advance_tick(tick(), excitatory, inhibitory).unwrap(),
                second.advance_tick(tick(), excitatory, inhibitory).unwrap(),
            );
        }
    }
}
