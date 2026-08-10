use core::fmt;

use crate::{
    chemical_contract::{DeterministicRelease, UnitFraction, VesicularResourceContract},
    Seconds,
};

pub const SHORT_TERM_PLASTICITY_SCHEMA_VERSION: u32 = 1;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ReleaseUpdatePhase {
    ReleaseFromPreEventState,
    ConductanceIncrement,
    ResourceDepletion,
    FacilitationForNextEvent,
}

impl ReleaseUpdatePhase {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::ReleaseFromPreEventState => "release-from-pre-event-state",
            Self::ConductanceIncrement => "conductance-increment",
            Self::ResourceDepletion => "resource-depletion",
            Self::FacilitationForNextEvent => "facilitation-for-next-event",
        }
    }
}

pub const RELEASE_UPDATE_ORDER: [ReleaseUpdatePhase; 4] = [
    ReleaseUpdatePhase::ReleaseFromPreEventState,
    ReleaseUpdatePhase::ConductanceIncrement,
    ReleaseUpdatePhase::ResourceDepletion,
    ReleaseUpdatePhase::FacilitationForNextEvent,
];

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ShortTermPlasticityConfig {
    baseline_utilization: UnitFraction,
    depression_time_constant: Seconds,
    facilitation_time_constant: Seconds,
    conductance_time_constant: Seconds,
    pool_capacity_moles: f64,
    conductance_per_released_fraction_siemens: f64,
}

impl ShortTermPlasticityConfig {
    /// Creates the deterministic Tsodyks–Markram configuration in SI units.
    ///
    /// # Errors
    ///
    /// Returns [`ShortTermPlasticityError::InvalidPoolCapacity`] or
    /// [`ShortTermPlasticityError::InvalidConductanceScale`] for non-positive,
    /// non-finite scalar inputs. Time constants and utilization are validated
    /// by [`Seconds`] and [`UnitFraction`] before this boundary.
    pub fn try_new(
        baseline_utilization: UnitFraction,
        depression_time_constant: Seconds,
        facilitation_time_constant: Seconds,
        conductance_time_constant: Seconds,
        pool_capacity_moles: f64,
        conductance_per_released_fraction_siemens: f64,
    ) -> Result<Self, ShortTermPlasticityError> {
        if !pool_capacity_moles.is_finite() || pool_capacity_moles <= 0.0 {
            return Err(ShortTermPlasticityError::InvalidPoolCapacity);
        }
        if !conductance_per_released_fraction_siemens.is_finite()
            || conductance_per_released_fraction_siemens <= 0.0
        {
            return Err(ShortTermPlasticityError::InvalidConductanceScale);
        }
        Ok(Self {
            baseline_utilization,
            depression_time_constant,
            facilitation_time_constant,
            conductance_time_constant,
            pool_capacity_moles,
            conductance_per_released_fraction_siemens,
        })
    }

    #[must_use]
    pub const fn baseline_utilization(self) -> UnitFraction {
        self.baseline_utilization
    }

    #[must_use]
    pub const fn depression_time_constant(self) -> Seconds {
        self.depression_time_constant
    }

    #[must_use]
    pub const fn facilitation_time_constant(self) -> Seconds {
        self.facilitation_time_constant
    }

    #[must_use]
    pub const fn conductance_time_constant(self) -> Seconds {
        self.conductance_time_constant
    }

    #[must_use]
    pub const fn pool_capacity_moles(self) -> f64 {
        self.pool_capacity_moles
    }

    #[must_use]
    pub const fn conductance_per_released_fraction_siemens(self) -> f64 {
        self.conductance_per_released_fraction_siemens
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ShortTermPlasticitySnapshot {
    pub schema_version: u32,
    pub event_index: u64,
    pub time_seconds: f64,
    pub available_fraction: f64,
    pub utilization_fraction: f64,
    pub conductance_siemens: f64,
    pub state_hash: u64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PresynapticReleaseEvent {
    pub event_index: u64,
    pub time_seconds: f64,
    pub available_before: UnitFraction,
    pub utilization_before: UnitFraction,
    pub release: DeterministicRelease,
    pub conductance_before_siemens: f64,
    pub conductance_increment_siemens: f64,
    pub conductance_after_increment_siemens: f64,
    pub available_after_depletion: UnitFraction,
    pub utilization_after_facilitation: UnitFraction,
    pub state_hash: u64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ShortTermPlasticity {
    config: ShortTermPlasticityConfig,
    event_index: u64,
    time_seconds: f64,
    available: UnitFraction,
    utilization: UnitFraction,
    conductance_siemens: f64,
}

impl ShortTermPlasticity {
    #[must_use]
    pub fn new(config: ShortTermPlasticityConfig) -> Self {
        Self {
            config,
            event_index: 0,
            time_seconds: 0.0,
            available: trusted_fraction(1.0),
            utilization: config.baseline_utilization,
            conductance_siemens: 0.0,
        }
    }

    #[must_use]
    pub fn snapshot(&self) -> ShortTermPlasticitySnapshot {
        ShortTermPlasticitySnapshot {
            schema_version: SHORT_TERM_PLASTICITY_SCHEMA_VERSION,
            event_index: self.event_index,
            time_seconds: self.time_seconds,
            available_fraction: self.available.get(),
            utilization_fraction: self.utilization.get(),
            conductance_siemens: self.conductance_siemens,
            state_hash: state_hash(
                self.event_index,
                self.time_seconds,
                self.available,
                self.utilization,
                self.conductance_siemens,
            ),
        }
    }

    /// Advances recovery and conductance decay exactly to an absolute time.
    ///
    /// # Errors
    ///
    /// Rejects non-finite time and any move backwards. Equal timestamps are
    /// accepted so canonically ordered coincident events remain replayable.
    pub fn advance_to(
        &mut self,
        time_seconds: f64,
    ) -> Result<ShortTermPlasticitySnapshot, ShortTermPlasticityError> {
        validate_event_time(self.time_seconds, time_seconds)?;
        let canonical_time_seconds = if time_seconds == 0.0 {
            0.0
        } else {
            time_seconds
        };
        let elapsed = canonical_time_seconds - self.time_seconds;
        if elapsed > 0.0 {
            let recovered_available = 1.0
                - (1.0 - self.available.get())
                    * (-elapsed / self.config.depression_time_constant.get()).exp();
            let baseline = self.config.baseline_utilization.get();
            let recovered_utilization = baseline
                + (self.utilization.get() - baseline)
                    * (-elapsed / self.config.facilitation_time_constant.get()).exp();
            let decayed_conductance = self.conductance_siemens
                * (-elapsed / self.config.conductance_time_constant.get()).exp();
            if !recovered_available.is_finite()
                || !recovered_utilization.is_finite()
                || !decayed_conductance.is_finite()
                || decayed_conductance < 0.0
            {
                return Err(ShortTermPlasticityError::NonFiniteState);
            }
            self.available = UnitFraction::try_new(recovered_available)
                .map_err(|_| ShortTermPlasticityError::NonFiniteState)?;
            self.utilization = UnitFraction::try_new(recovered_utilization)
                .map_err(|_| ShortTermPlasticityError::NonFiniteState)?;
            self.conductance_siemens = decayed_conductance;
            self.time_seconds = canonical_time_seconds;
        }
        Ok(self.snapshot())
    }

    /// Applies one deterministic presynaptic event using [`RELEASE_UPDATE_ORDER`].
    ///
    /// Release is computed from the recovered pre-event `uR`, conductance is
    /// incremented from that immutable amount, resources are depleted, and
    /// facilitation is stored only for the next event.
    ///
    /// # Errors
    ///
    /// Rejects invalid time, time reversal, event-index overflow and any
    /// non-finite state transition.
    pub fn process_presynaptic_event(
        &mut self,
        time_seconds: f64,
    ) -> Result<PresynapticReleaseEvent, ShortTermPlasticityError> {
        let event_index = self
            .event_index
            .checked_add(1)
            .ok_or(ShortTermPlasticityError::EventOverflow)?;
        self.advance_to(time_seconds)?;

        let available_before = self.available;
        let utilization_before = self.utilization;
        let contract = VesicularResourceContract::try_new(
            self.config.pool_capacity_moles,
            available_before,
            utilization_before,
        )
        .map_err(|_| ShortTermPlasticityError::NonFiniteState)?;
        let release = contract.planned_release();
        let conductance_before_siemens = self.conductance_siemens;
        let conductance_increment_siemens =
            self.config.conductance_per_released_fraction_siemens * release.released_fraction();
        let conductance_after_increment_siemens =
            conductance_before_siemens + conductance_increment_siemens;
        let available_after_depletion_value = available_before.get() - release.released_fraction();
        let baseline = self.config.baseline_utilization.get();
        let utilization_after_facilitation_value =
            baseline.mul_add(1.0 - utilization_before.get(), utilization_before.get());
        if !conductance_after_increment_siemens.is_finite()
            || conductance_after_increment_siemens < 0.0
            || !available_after_depletion_value.is_finite()
            || !utilization_after_facilitation_value.is_finite()
        {
            return Err(ShortTermPlasticityError::NonFiniteState);
        }

        let available_after_depletion = UnitFraction::try_new(available_after_depletion_value)
            .map_err(|_| ShortTermPlasticityError::NonFiniteState)?;
        let utilization_after_facilitation =
            UnitFraction::try_new(utilization_after_facilitation_value)
                .map_err(|_| ShortTermPlasticityError::NonFiniteState)?;
        self.event_index = event_index;
        self.available = available_after_depletion;
        self.utilization = utilization_after_facilitation;
        self.conductance_siemens = conductance_after_increment_siemens;
        let state_hash = self.snapshot().state_hash;

        Ok(PresynapticReleaseEvent {
            event_index,
            time_seconds: self.time_seconds,
            available_before,
            utilization_before,
            release,
            conductance_before_siemens,
            conductance_increment_siemens,
            conductance_after_increment_siemens,
            available_after_depletion,
            utilization_after_facilitation,
            state_hash,
        })
    }

    pub fn reset(&mut self) {
        self.event_index = 0;
        self.time_seconds = 0.0;
        self.available = trusted_fraction(1.0);
        self.utilization = self.config.baseline_utilization;
        self.conductance_siemens = 0.0;
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ShortTermPlasticityError {
    InvalidPoolCapacity,
    InvalidConductanceScale,
    InvalidEventTime,
    TimeReversal,
    EventOverflow,
    NonFiniteState,
}

impl fmt::Display for ShortTermPlasticityError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidPoolCapacity => {
                formatter.write_str("vesicular pool capacity must be positive and finite")
            }
            Self::InvalidConductanceScale => {
                formatter.write_str("conductance scale must be positive and finite")
            }
            Self::InvalidEventTime => {
                formatter.write_str("event time must be finite and non-negative")
            }
            Self::TimeReversal => formatter.write_str("event time cannot move backwards"),
            Self::EventOverflow => formatter.write_str("presynaptic event index overflow"),
            Self::NonFiniteState => {
                formatter.write_str("short-term plasticity produced invalid state")
            }
        }
    }
}

impl std::error::Error for ShortTermPlasticityError {}

fn validate_event_time(
    current_time_seconds: f64,
    requested_time_seconds: f64,
) -> Result<(), ShortTermPlasticityError> {
    if !requested_time_seconds.is_finite() || requested_time_seconds < 0.0 {
        return Err(ShortTermPlasticityError::InvalidEventTime);
    }
    if requested_time_seconds < current_time_seconds {
        return Err(ShortTermPlasticityError::TimeReversal);
    }
    Ok(())
}

fn trusted_fraction(value: f64) -> UnitFraction {
    UnitFraction::try_new(value).expect("internally clamped fraction must be valid")
}

fn state_hash(
    event_index: u64,
    time_seconds: f64,
    available: UnitFraction,
    utilization: UnitFraction,
    conductance_siemens: f64,
) -> u64 {
    let mut hash = 0xcbf2_9ce4_8422_2325_u64;
    for byte in SHORT_TERM_PLASTICITY_SCHEMA_VERSION
        .to_le_bytes()
        .into_iter()
        .chain(event_index.to_le_bytes())
        .chain(time_seconds.to_bits().to_le_bytes())
        .chain(available.get().to_bits().to_le_bytes())
        .chain(utilization.get().to_bits().to_le_bytes())
        .chain(conductance_siemens.to_bits().to_le_bytes())
    {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    hash
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fraction(value: f64) -> UnitFraction {
        UnitFraction::try_new(value).unwrap()
    }

    fn seconds(value: f64) -> Seconds {
        Seconds::try_new(value).unwrap()
    }

    fn config(utilization: f64) -> ShortTermPlasticityConfig {
        ShortTermPlasticityConfig::try_new(
            fraction(utilization),
            seconds(0.8),
            seconds(0.25),
            seconds(0.08),
            2.0e-18,
            1.5e-9,
        )
        .unwrap()
    }

    #[test]
    fn first_event_uses_baseline_then_updates_in_declared_order() {
        assert_eq!(
            RELEASE_UPDATE_ORDER,
            [
                ReleaseUpdatePhase::ReleaseFromPreEventState,
                ReleaseUpdatePhase::ConductanceIncrement,
                ReleaseUpdatePhase::ResourceDepletion,
                ReleaseUpdatePhase::FacilitationForNextEvent,
            ]
        );
        let mut dynamics = ShortTermPlasticity::new(config(0.2));
        let event = dynamics.process_presynaptic_event(0.0).unwrap();
        assert!((event.release.released_fraction() - 0.2).abs() < f64::EPSILON);
        assert_eq!(event.available_before.get().to_bits(), 1.0_f64.to_bits());
        assert!((event.conductance_increment_siemens - 0.3e-9).abs() < 1.0e-24);
        assert!((event.available_after_depletion.get() - 0.8).abs() < f64::EPSILON);
        assert!((event.utilization_after_facilitation.get() - 0.36).abs() < f64::EPSILON);
    }

    #[test]
    fn recovery_and_decay_match_the_analytic_solution() {
        let mut dynamics = ShortTermPlasticity::new(config(0.2));
        let event = dynamics.process_presynaptic_event(0.0).unwrap();
        let snapshot = dynamics.advance_to(0.1).unwrap();
        let expected_available =
            1.0 - (1.0 - event.available_after_depletion.get()) * (-0.1_f64 / 0.8).exp();
        let expected_utilization =
            0.2 + (event.utilization_after_facilitation.get() - 0.2) * (-0.1_f64 / 0.25).exp();
        let expected_conductance =
            event.conductance_after_increment_siemens * (-0.1_f64 / 0.08).exp();
        assert_eq!(
            snapshot.available_fraction.to_bits(),
            expected_available.to_bits()
        );
        assert_eq!(
            snapshot.utilization_fraction.to_bits(),
            expected_utilization.to_bits()
        );
        assert_eq!(
            snapshot.conductance_siemens.to_bits(),
            expected_conductance.to_bits()
        );
    }

    #[test]
    fn short_interval_can_facilitate_or_depress_by_declared_parameters() {
        let mut facilitating = ShortTermPlasticity::new(config(0.1));
        let first_facilitating = facilitating.process_presynaptic_event(0.0).unwrap();
        let second_facilitating = facilitating.process_presynaptic_event(0.01).unwrap();
        assert!(
            second_facilitating.release.released_fraction()
                > first_facilitating.release.released_fraction()
        );

        let mut depressing = ShortTermPlasticity::new(config(0.7));
        let first_depressing = depressing.process_presynaptic_event(0.0).unwrap();
        let second_depressing = depressing.process_presynaptic_event(0.01).unwrap();
        assert!(
            second_depressing.release.released_fraction()
                < first_depressing.release.released_fraction()
        );
    }

    #[test]
    fn long_train_remains_positive_bounded_and_deterministic() {
        let mut first = ShortTermPlasticity::new(config(0.18));
        let mut second = first.clone();
        for event_index in 0_u32..20_000 {
            let time = f64::from(event_index) * 0.001;
            let left = first.process_presynaptic_event(time).unwrap();
            let right = second.process_presynaptic_event(time).unwrap();
            assert_eq!(left, right);
            assert!((0.0..=1.0).contains(&left.available_after_depletion.get()));
            assert!((0.0..=1.0).contains(&left.utilization_after_facilitation.get()));
            assert!(left.conductance_after_increment_siemens.is_finite());
            assert!(left.conductance_after_increment_siemens >= 0.0);
            assert!(left.release.released_fraction() <= left.available_before.get());
        }
    }

    #[test]
    fn rejects_invalid_boundaries_and_reset_restores_baseline() {
        assert_eq!(
            ShortTermPlasticityConfig::try_new(
                fraction(0.2),
                seconds(0.8),
                seconds(0.25),
                seconds(0.08),
                0.0,
                1.0e-9,
            ),
            Err(ShortTermPlasticityError::InvalidPoolCapacity)
        );
        let mut dynamics = ShortTermPlasticity::new(config(0.2));
        dynamics.process_presynaptic_event(0.1).unwrap();
        assert_eq!(
            dynamics.process_presynaptic_event(0.09),
            Err(ShortTermPlasticityError::TimeReversal)
        );
        assert_eq!(
            dynamics.process_presynaptic_event(f64::NAN),
            Err(ShortTermPlasticityError::InvalidEventTime)
        );
        dynamics.reset();
        let snapshot = dynamics.snapshot();
        assert_eq!(snapshot.event_index, 0);
        assert_eq!(snapshot.time_seconds.to_bits(), 0.0_f64.to_bits());
        assert_eq!(snapshot.available_fraction.to_bits(), 1.0_f64.to_bits());
        assert_eq!(snapshot.utilization_fraction.to_bits(), 0.2_f64.to_bits());
        assert_eq!(snapshot.conductance_siemens.to_bits(), 0.0_f64.to_bits());
    }
}
