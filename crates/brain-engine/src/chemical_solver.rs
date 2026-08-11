use core::fmt;

use crate::{
    ChemicalCleftSnapshot, ChemicalSynapse, ChemicalSynapseConfig, ChemicalSynapseError,
    ReceptorFamily, ReleaseIntoCleft, Seconds, TransmitterKind, UnitFraction,
};

pub const CHEMICAL_SOLVER_SCHEMA_VERSION: u32 = 1;
pub const MAX_CHEMICAL_SOLVER_SUBSTEPS: u32 = 1_000_000;
pub const STRANG_SUBTRANSITIONS_PER_STEP: u64 = 12;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ChemicalSubtransition {
    Clear(TransmitterKind),
    Bind(ReceptorFamily),
}

pub const STRANG_SUBTRANSITION_ORDER: [ChemicalSubtransition; 12] = [
    ChemicalSubtransition::Clear(TransmitterKind::Glutamate),
    ChemicalSubtransition::Clear(TransmitterKind::Gaba),
    ChemicalSubtransition::Bind(ReceptorFamily::Ampa),
    ChemicalSubtransition::Bind(ReceptorFamily::Nmda),
    ChemicalSubtransition::Bind(ReceptorFamily::GabaA),
    ChemicalSubtransition::Bind(ReceptorFamily::GabaB),
    ChemicalSubtransition::Bind(ReceptorFamily::GabaB),
    ChemicalSubtransition::Bind(ReceptorFamily::GabaA),
    ChemicalSubtransition::Bind(ReceptorFamily::Nmda),
    ChemicalSubtransition::Bind(ReceptorFamily::Ampa),
    ChemicalSubtransition::Clear(TransmitterKind::Gaba),
    ChemicalSubtransition::Clear(TransmitterKind::Glutamate),
];

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ChemicalSolverConfig {
    step_limit: Seconds,
    operator_exposure_limit: UnitFraction,
    substep_budget: u32,
}

impl ChemicalSolverConfig {
    /// Creates the adaptive Strang-splitting resource envelope.
    ///
    /// # Errors
    ///
    /// Rejects a zero exposure limit, a zero substep budget or a budget above
    /// [`MAX_CHEMICAL_SOLVER_SUBSTEPS`].
    pub fn try_new(
        maximum_step: Seconds,
        maximum_dimensionless_operator_step: UnitFraction,
        maximum_substeps_per_interval: u32,
    ) -> Result<Self, ChemicalSolverError> {
        if maximum_dimensionless_operator_step.get() <= 0.0 {
            return Err(ChemicalSolverError::InvalidOperatorStepLimit);
        }
        if maximum_substeps_per_interval == 0
            || maximum_substeps_per_interval > MAX_CHEMICAL_SOLVER_SUBSTEPS
        {
            return Err(ChemicalSolverError::InvalidSubstepBudget);
        }
        Ok(Self {
            step_limit: maximum_step,
            operator_exposure_limit: maximum_dimensionless_operator_step,
            substep_budget: maximum_substeps_per_interval,
        })
    }

    #[must_use]
    pub const fn maximum_step(self) -> Seconds {
        self.step_limit
    }

    #[must_use]
    pub const fn maximum_dimensionless_operator_step(self) -> UnitFraction {
        self.operator_exposure_limit
    }

    #[must_use]
    pub const fn maximum_substeps_per_interval(self) -> u32 {
        self.substep_budget
    }
}

impl Default for ChemicalSolverConfig {
    fn default() -> Self {
        Self::try_new(
            Seconds::try_new(0.00025).expect("default chemical step must be valid"),
            UnitFraction::try_new(0.1).expect("default operator exposure must be valid"),
            4_096,
        )
        .expect("default chemical solver config must be valid")
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ChemicalSolverSnapshot {
    pub schema_version: u32,
    pub time_seconds: f64,
    pub step_index: u64,
    pub chemical: ChemicalCleftSnapshot,
    pub state_hash: u64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ChemicalSolverAdvance {
    pub start_time_seconds: f64,
    pub end_time_seconds: f64,
    pub substeps_used: u32,
    pub maximum_dimensionless_operator_step_observed: f64,
    pub snapshot: ChemicalSolverSnapshot,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ChemicalSolver {
    config: ChemicalSolverConfig,
    chemical: ChemicalSynapse,
    time_seconds: f64,
    step_index: u64,
}

impl ChemicalSolver {
    #[must_use]
    pub fn new(config: ChemicalSolverConfig, chemical_config: ChemicalSynapseConfig) -> Self {
        Self {
            config,
            chemical: ChemicalSynapse::new(chemical_config),
            time_seconds: 0.0,
            step_index: 0,
        }
    }

    #[must_use]
    pub fn snapshot(&self) -> ChemicalSolverSnapshot {
        let chemical = self.chemical.snapshot();
        ChemicalSolverSnapshot {
            schema_version: CHEMICAL_SOLVER_SCHEMA_VERSION,
            time_seconds: self.time_seconds,
            step_index: self.step_index,
            chemical,
            state_hash: self.state_hash(chemical.state_hash),
        }
    }

    /// Adds an explicit presynaptic source at the current solver time.
    ///
    /// # Errors
    ///
    /// Propagates validation and overflow errors from the chemical compartment.
    pub fn release_into_cleft(
        &mut self,
        transmitter: TransmitterKind,
        released_moles: f64,
    ) -> Result<ReleaseIntoCleft, ChemicalSolverError> {
        self.chemical
            .release_into_cleft(transmitter, released_moles)
            .map_err(ChemicalSolverError::ChemicalTransition)
    }

    /// Advances the coupled cleft and binding state with adaptive Strang steps.
    ///
    /// Each substep is palindromic: half-clearance, a forward half-sweep over
    /// receptor families, a reverse half-sweep, then reverse half-clearance.
    /// Elementary transitions are exact and positive. The adaptive step keeps
    /// `rate × dt` below the declared dimensionless limit; no explicit-Euler
    /// fallback exists.
    ///
    /// The complete interval is atomic. Failure leaves time, counters, stocks,
    /// occupancy and hashes unchanged.
    ///
    /// # Errors
    ///
    /// Rejects non-finite target time, numerical step underflow, exhausted
    /// substep budget, step-index overflow or an invalid chemical transition.
    pub fn advance_interval(
        &mut self,
        duration: Seconds,
    ) -> Result<ChemicalSolverAdvance, ChemicalSolverError> {
        let end_time_seconds = self.time_seconds + duration.get();
        if !end_time_seconds.is_finite() {
            return Err(ChemicalSolverError::NonFiniteTargetTime);
        }
        let mut candidate = self.clone();
        let mut elapsed_seconds = 0.0;
        let mut substeps_used = 0_u32;
        let mut maximum_exposure_observed = 0.0_f64;
        while elapsed_seconds < duration.get() {
            if substeps_used == self.config.substep_budget {
                return Err(ChemicalSolverError::SubstepBudgetExceeded);
            }
            let remaining_seconds = duration.get() - elapsed_seconds;
            let maximum_rate = candidate.chemical.maximum_operator_rate_per_second();
            if !maximum_rate.is_finite() || maximum_rate <= 0.0 {
                return Err(ChemicalSolverError::NonFiniteOperatorRate);
            }
            let exposure_limited_step = self.config.operator_exposure_limit.get() / maximum_rate;
            let step_seconds = remaining_seconds
                .min(self.config.step_limit.get())
                .min(exposure_limited_step);
            let completes_interval = step_seconds >= remaining_seconds;
            let minimum_progress = f64::EPSILON * elapsed_seconds.abs().max(f64::MIN_POSITIVE);
            if !step_seconds.is_finite() || step_seconds <= 0.0 || step_seconds <= minimum_progress
            {
                return Err(ChemicalSolverError::NumericalStepUnderflow);
            }
            let exposure = maximum_rate * step_seconds;
            maximum_exposure_observed = maximum_exposure_observed.max(exposure);
            candidate.apply_strang_substep(step_seconds)?;
            substeps_used += 1;
            if completes_interval {
                elapsed_seconds = duration.get();
            } else {
                elapsed_seconds += step_seconds;
            }
        }
        candidate.time_seconds = end_time_seconds;
        let snapshot = candidate.snapshot();
        *self = candidate;
        Ok(ChemicalSolverAdvance {
            start_time_seconds: end_time_seconds - duration.get(),
            end_time_seconds,
            substeps_used,
            maximum_dimensionless_operator_step_observed: maximum_exposure_observed,
            snapshot,
        })
    }

    pub fn reset(&mut self) {
        self.chemical.reset();
        self.time_seconds = 0.0;
        self.step_index = 0;
    }

    fn apply_strang_substep(&mut self, step_seconds: f64) -> Result<(), ChemicalSolverError> {
        let next_step_index = self
            .step_index
            .checked_add(1)
            .ok_or(ChemicalSolverError::StepOverflow)?;
        let half_step = Seconds::try_new(step_seconds * 0.5)
            .map_err(|_| ChemicalSolverError::NumericalStepUnderflow)?;
        for transition in STRANG_SUBTRANSITION_ORDER {
            match transition {
                ChemicalSubtransition::Clear(transmitter) => {
                    self.chemical
                        .clear_transmitter(transmitter, half_step)
                        .map_err(ChemicalSolverError::ChemicalTransition)?;
                }
                ChemicalSubtransition::Bind(family) => {
                    self.advance_binding(family, half_step)?;
                }
            }
        }
        self.step_index = next_step_index;
        Ok(())
    }

    fn advance_binding(
        &mut self,
        family: ReceptorFamily,
        duration: Seconds,
    ) -> Result<(), ChemicalSolverError> {
        self.chemical
            .advance_receptor_binding(family, duration)
            .map(|_| ())
            .map_err(ChemicalSolverError::ChemicalTransition)
    }

    fn state_hash(&self, chemical_state_hash: u64) -> u64 {
        let mut hash = 0xcbf2_9ce4_8422_2325_u64;
        for byte in CHEMICAL_SOLVER_SCHEMA_VERSION
            .to_le_bytes()
            .into_iter()
            .chain(self.config.step_limit.get().to_bits().to_le_bytes())
            .chain(
                self.config
                    .operator_exposure_limit
                    .get()
                    .to_bits()
                    .to_le_bytes(),
            )
            .chain(self.config.substep_budget.to_le_bytes())
            .chain(self.time_seconds.to_bits().to_le_bytes())
            .chain(self.step_index.to_le_bytes())
            .chain(chemical_state_hash.to_le_bytes())
        {
            hash ^= u64::from(byte);
            hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
        }
        hash
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ChemicalSolverError {
    InvalidOperatorStepLimit,
    InvalidSubstepBudget,
    NonFiniteTargetTime,
    NonFiniteOperatorRate,
    NumericalStepUnderflow,
    SubstepBudgetExceeded,
    StepOverflow,
    ChemicalTransition(ChemicalSynapseError),
}

impl fmt::Display for ChemicalSolverError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidOperatorStepLimit => {
                formatter.write_str("operator step limit must be in (0, 1]")
            }
            Self::InvalidSubstepBudget => formatter.write_str(
                "chemical substep budget must be positive and within the resource envelope",
            ),
            Self::NonFiniteTargetTime => formatter.write_str("chemical target time is non-finite"),
            Self::NonFiniteOperatorRate => {
                formatter.write_str("chemical operator rate is non-finite or non-positive")
            }
            Self::NumericalStepUnderflow => {
                formatter.write_str("chemical adaptive step underflowed")
            }
            Self::SubstepBudgetExceeded => formatter.write_str("chemical substep budget exceeded"),
            Self::StepOverflow => formatter.write_str("chemical solver step index overflow"),
            Self::ChemicalTransition(error) => write!(formatter, "chemical transition: {error}"),
        }
    }
}

impl std::error::Error for ChemicalSolverError {}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{ConservationTolerance, RECEPTOR_FAMILY_COUNT, TRANSMITTER_COUNT};

    fn seconds(value: f64) -> Seconds {
        Seconds::try_new(value).unwrap()
    }

    fn solver_config(
        maximum_step_seconds: f64,
        maximum_exposure: f64,
        maximum_substeps: u32,
    ) -> ChemicalSolverConfig {
        ChemicalSolverConfig::try_new(
            seconds(maximum_step_seconds),
            UnitFraction::try_new(maximum_exposure).unwrap(),
            maximum_substeps,
        )
        .unwrap()
    }

    fn tolerance() -> ConservationTolerance {
        ConservationTolerance::try_new(1.0e-30, UnitFraction::try_new(1.0e-12).unwrap()).unwrap()
    }

    #[test]
    fn one_strang_step_has_a_public_palindromic_operation_count() {
        assert_eq!(STRANG_SUBTRANSITIONS_PER_STEP, 12);
        assert_eq!(
            STRANG_SUBTRANSITION_ORDER,
            [
                ChemicalSubtransition::Clear(TransmitterKind::Glutamate),
                ChemicalSubtransition::Clear(TransmitterKind::Gaba),
                ChemicalSubtransition::Bind(ReceptorFamily::Ampa),
                ChemicalSubtransition::Bind(ReceptorFamily::Nmda),
                ChemicalSubtransition::Bind(ReceptorFamily::GabaA),
                ChemicalSubtransition::Bind(ReceptorFamily::GabaB),
                ChemicalSubtransition::Bind(ReceptorFamily::GabaB),
                ChemicalSubtransition::Bind(ReceptorFamily::GabaA),
                ChemicalSubtransition::Bind(ReceptorFamily::Nmda),
                ChemicalSubtransition::Bind(ReceptorFamily::Ampa),
                ChemicalSubtransition::Clear(TransmitterKind::Gaba),
                ChemicalSubtransition::Clear(TransmitterKind::Glutamate),
            ]
        );
        let mut solver = ChemicalSolver::new(
            solver_config(0.0001, 1.0, 16),
            ChemicalSynapseConfig::default(),
        );
        solver
            .release_into_cleft(TransmitterKind::Glutamate, 4.0e-19)
            .unwrap();
        let advance = solver.advance_interval(seconds(0.0001)).unwrap();
        assert_eq!(advance.substeps_used, 1);
        assert_eq!(advance.snapshot.step_index, 1);
        assert_eq!(
            advance.snapshot.chemical.operation_index,
            1 + STRANG_SUBTRANSITIONS_PER_STEP
        );
    }

    #[test]
    fn stiffness_limit_adapts_without_explicit_euler() {
        let mut solver = ChemicalSolver::new(
            solver_config(0.001, 0.1, 64),
            ChemicalSynapseConfig::default(),
        );
        solver
            .release_into_cleft(TransmitterKind::Glutamate, 4.0e-19)
            .unwrap();
        let advance = solver.advance_interval(seconds(0.001)).unwrap();
        assert!(advance.substeps_used > 1);
        assert!(advance.maximum_dimensionless_operator_step_observed <= 0.1);
        assert!(advance.snapshot.chemical.cleft_moles[0] >= 0.0);
        assert!(advance
            .snapshot
            .chemical
            .receptor_occupancy_fraction
            .into_iter()
            .all(|value| (0.0..=1.0).contains(&value)));
    }

    #[test]
    fn exhausted_budget_rejects_the_whole_interval_atomically() {
        let mut solver = ChemicalSolver::new(
            solver_config(0.01, 0.01, 1),
            ChemicalSynapseConfig::default(),
        );
        solver
            .release_into_cleft(TransmitterKind::Glutamate, 4.0e-19)
            .unwrap();
        let before = solver.snapshot();
        assert_eq!(
            solver.advance_interval(seconds(0.01)),
            Err(ChemicalSolverError::SubstepBudgetExceeded)
        );
        assert_eq!(solver.snapshot(), before);
    }

    #[test]
    fn long_solver_run_is_positive_conservative_and_deterministic() {
        let mut first = ChemicalSolver::new(
            ChemicalSolverConfig::default(),
            ChemicalSynapseConfig::default(),
        );
        let mut second = first.clone();
        for interval in 0..500 {
            if interval % 25 == 0 {
                let transmitter = if interval % 50 == 0 {
                    TransmitterKind::Glutamate
                } else {
                    TransmitterKind::Gaba
                };
                for solver in [&mut first, &mut second] {
                    solver.release_into_cleft(transmitter, 1.0e-19).unwrap();
                }
            }
            let left = first.advance_interval(seconds(0.0005)).unwrap();
            let right = second.advance_interval(seconds(0.0005)).unwrap();
            assert_eq!(left, right);
        }
        let snapshot = first.snapshot().chemical;
        assert!(snapshot
            .cleft_moles
            .into_iter()
            .chain(snapshot.receptor_bound_moles)
            .chain(snapshot.cleared_moles)
            .all(|value| value.is_finite() && value >= 0.0));
        assert!(snapshot
            .receptor_occupancy_fraction
            .into_iter()
            .all(|value| (0.0..=1.0).contains(&value)));
        first.chemical.verify_mass_conserved(tolerance()).unwrap();
    }

    #[test]
    fn strang_refinement_reduces_error_against_a_fine_reference() {
        let reference = convergence_snapshot(0.000_031_25);
        let coarse = convergence_error(convergence_snapshot(0.001), reference);
        let medium = convergence_error(convergence_snapshot(0.0005), reference);
        let fine = convergence_error(convergence_snapshot(0.00025), reference);
        assert!(
            medium < coarse,
            "medium {medium} must improve coarse {coarse}"
        );
        assert!(fine < medium, "fine {fine} must improve medium {medium}");
    }

    #[test]
    fn invalid_config_is_rejected_and_reset_restores_origin() {
        assert_eq!(
            ChemicalSolverConfig::try_new(seconds(0.001), UnitFraction::ZERO, 1),
            Err(ChemicalSolverError::InvalidOperatorStepLimit)
        );
        assert_eq!(
            ChemicalSolverConfig::try_new(seconds(0.001), UnitFraction::ONE, 0),
            Err(ChemicalSolverError::InvalidSubstepBudget)
        );
        let mut solver = ChemicalSolver::new(
            ChemicalSolverConfig::default(),
            ChemicalSynapseConfig::default(),
        );
        solver
            .release_into_cleft(TransmitterKind::Gaba, 1.0e-19)
            .unwrap();
        solver.advance_interval(seconds(0.001)).unwrap();
        solver.reset();
        let snapshot = solver.snapshot();
        assert_eq!(snapshot.time_seconds.to_bits(), 0.0_f64.to_bits());
        assert_eq!(snapshot.step_index, 0);
        assert_eq!(snapshot.chemical.operation_index, 0);
    }

    fn convergence_snapshot(maximum_step_seconds: f64) -> ChemicalCleftSnapshot {
        let mut solver = ChemicalSolver::new(
            solver_config(maximum_step_seconds, 1.0, 10_000),
            ChemicalSynapseConfig::default(),
        );
        solver
            .release_into_cleft(TransmitterKind::Glutamate, 4.0e-19)
            .unwrap();
        solver
            .release_into_cleft(TransmitterKind::Gaba, 3.0e-19)
            .unwrap();
        solver.advance_interval(seconds(0.01)).unwrap();
        solver.snapshot().chemical
    }

    fn convergence_error(
        candidate: ChemicalCleftSnapshot,
        reference: ChemicalCleftSnapshot,
    ) -> f64 {
        normalized_array_error::<TRANSMITTER_COUNT>(candidate.cleft_moles, reference.cleft_moles)
            + normalized_array_error::<RECEPTOR_FAMILY_COUNT>(
                candidate.receptor_occupancy_fraction,
                reference.receptor_occupancy_fraction,
            )
    }

    fn normalized_array_error<const LENGTH: usize>(
        candidate: [f64; LENGTH],
        reference: [f64; LENGTH],
    ) -> f64 {
        candidate
            .into_iter()
            .zip(reference)
            .map(|(actual, expected)| (actual - expected).abs() / expected.abs().max(1.0e-30))
            .sum()
    }
}
