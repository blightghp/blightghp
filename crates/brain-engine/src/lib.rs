#![forbid(unsafe_code)]

use core::fmt;

mod clock;
mod field;
mod network;
mod observables;
mod random;
mod simulation;

pub use clock::{ClockError, ClockFrame, FixedStepClock, SimulationTick, MAX_SAFE_TICK};
pub use field::{
    project_spikes_to_field, FieldConfig, FieldError, FieldSnapshot, FieldTopology, NeuronKind,
    PopulationField, ProjectedSpikeDrive,
};
pub use network::{CsrError, SynapseCsr, SynapseEndpoint};
pub use observables::{mean_absolute_weight, ObservableError, PopulationFiringRate};
pub use random::{random_u32, random_unit};
pub use simulation::{
    NeuralSimulation, NeuralStimulus, SignalBatch, SimulationConfig, SimulationError,
    SimulationSnapshot, SimulationSynapse, SIMULATION_SCHEMA_VERSION,
};

pub const ENGINE_SCHEMA_VERSION: u32 = 1;
pub const LAYER_COUNT: usize = 6;
pub const MAX_LAMINAR_GAIN: f64 = 4.0;
pub const MAX_EXTERNAL_DRIVE: f64 = 16.0;

/// A finite, strictly positive duration represented in SI seconds.
///
/// Keeping the constructor fallible prevents milliseconds, zero and invalid
/// floating-point values from entering a solver unnoticed.
#[derive(Clone, Copy, Debug, PartialEq, PartialOrd)]
#[repr(transparent)]
pub struct Seconds(f64);

impl Seconds {
    /// Creates a positive duration from seconds.
    ///
    /// # Errors
    ///
    /// Returns [`EngineError`] when `value` is zero, negative or non-finite.
    pub fn try_new(value: f64) -> Result<Self, EngineError> {
        validate_positive_finite("seconds", value)?;
        Ok(Self(value))
    }

    #[must_use]
    pub const fn get(self) -> f64 {
        self.0
    }

    const fn trusted(value: f64) -> Self {
        Self(value)
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u8)]
pub enum CorticalLayer {
    L1 = 0,
    L2 = 1,
    L3 = 2,
    L4 = 3,
    L5 = 4,
    L6 = 5,
}

impl CorticalLayer {
    pub const ALL: [Self; LAYER_COUNT] =
        [Self::L1, Self::L2, Self::L3, Self::L4, Self::L5, Self::L6];

    #[must_use]
    pub const fn index(self) -> usize {
        self as usize
    }
}

impl TryFrom<u8> for CorticalLayer {
    type Error = EngineError;

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0 => Ok(Self::L1),
            1 => Ok(Self::L2),
            2 => Ok(Self::L3),
            3 => Ok(Self::L4),
            4 => Ok(Self::L5),
            5 => Ok(Self::L6),
            _ => Err(EngineError::InvalidLayer(value)),
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ProjectionKind {
    Recurrent,
    Feedforward,
    Feedback,
}

/// Classifies the deliberately small set of intracolumnar paths represented by
/// the 0.6 model. Absence means that the pair is outside this model's scope.
#[must_use]
pub const fn projection_kind(
    source: CorticalLayer,
    target: CorticalLayer,
) -> Option<ProjectionKind> {
    use CorticalLayer::{L1, L2, L3, L4, L5, L6};
    if source as u8 == target as u8 {
        return Some(ProjectionKind::Recurrent);
    }
    match (source, target) {
        (L4, L2 | L3) | (L2 | L3, L5) => Some(ProjectionKind::Feedforward),
        (L5, L6) | (L6, L1 | L4) => Some(ProjectionKind::Feedback),
        _ => None,
    }
}

/// Returns the learning preset gain for one declared intracolumnar path.
///
/// The values are centralized so validation, visualization and documentation
/// do not carry competing copies of the connectivity matrix.
#[must_use]
pub const fn canonical_projection_gain(source: CorticalLayer, target: CorticalLayer) -> f64 {
    use CorticalLayer::{L1, L2, L3, L4, L5, L6};
    if source as u8 == target as u8 {
        return 0.18;
    }
    match (source, target) {
        (L4, L2) => 0.52,
        (L4, L3) => 0.48,
        (L2, L5) => 0.36,
        (L3, L5) => 0.42,
        (L5, L6) => 0.34,
        (L6, L4) => 0.22,
        (L6, L1) => 0.16,
        _ => 0.0,
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct LaminarConfig {
    pub dt: Seconds,
    pub tau_excitatory: [Seconds; LAYER_COUNT],
    pub tau_inhibitory: [Seconds; LAYER_COUNT],
    /// Excitatory projection matrix indexed as [target][source].
    pub excitatory_projection: [[f64; LAYER_COUNT]; LAYER_COUNT],
    /// Local inhibitory gain for each layer.
    pub inhibitory_gain: [f64; LAYER_COUNT],
    /// Excitatory drive into the local inhibitory population.
    pub excitatory_to_inhibitory_gain: [f64; LAYER_COUNT],
}

impl Default for LaminarConfig {
    fn default() -> Self {
        // This is a learning preset, not a calibrated cortical microcircuit.
        // Non-zero entries encode only the paths classified above.
        let mut projection = [[0.0; LAYER_COUNT]; LAYER_COUNT];
        for (target, row) in projection.iter_mut().enumerate() {
            for (source, gain) in row.iter_mut().enumerate() {
                *gain =
                    canonical_projection_gain(layer_from_index(source), layer_from_index(target));
            }
        }

        Self {
            dt: Seconds::trusted(1.0 / 1_000.0),
            tau_excitatory: [Seconds::trusted(0.020); LAYER_COUNT],
            tau_inhibitory: [Seconds::trusted(0.010); LAYER_COUNT],
            excitatory_projection: projection,
            inhibitory_gain: [0.46; LAYER_COUNT],
            excitatory_to_inhibitory_gain: [0.58; LAYER_COUNT],
        }
    }
}

impl LaminarConfig {
    /// Validates all units, time constants and gains before engine creation.
    ///
    /// # Errors
    ///
    /// Returns [`EngineError`] when a parameter is non-finite, negative where
    /// only non-negative values are allowed. Time quantities are already
    /// protected by [`Seconds`].
    pub fn validate(&self) -> Result<(), EngineError> {
        for (target, row) in self.excitatory_projection.into_iter().enumerate() {
            for (source, value) in row.into_iter().enumerate() {
                validate_bounded_non_negative("excitatory_projection", value, MAX_LAMINAR_GAIN)?;
                if value > 0.0 {
                    let source_layer = layer_from_index(source);
                    let target_layer = layer_from_index(target);
                    if projection_kind(source_layer, target_layer).is_none() {
                        return Err(EngineError::ForbiddenProjection {
                            source: source_layer,
                            target: target_layer,
                        });
                    }
                }
            }
        }
        for value in self
            .inhibitory_gain
            .into_iter()
            .chain(self.excitatory_to_inhibitory_gain)
        {
            validate_bounded_non_negative("laminar_gain", value, MAX_LAMINAR_GAIN)?;
        }
        Ok(())
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct LaminarSnapshot {
    pub schema_version: u32,
    pub tick: u64,
    pub excitatory: [f64; LAYER_COUNT],
    pub inhibitory: [f64; LAYER_COUNT],
}

#[derive(Clone, Debug)]
pub struct LaminarEngine {
    config: LaminarConfig,
    tick: u64,
    excitatory: [f64; LAYER_COUNT],
    inhibitory: [f64; LAYER_COUNT],
}

impl LaminarEngine {
    /// Creates a deterministic laminar engine from a validated configuration.
    ///
    /// # Errors
    ///
    /// Returns [`EngineError`] when the configuration violates a numerical
    /// invariant.
    pub fn new(config: LaminarConfig) -> Result<Self, EngineError> {
        config.validate()?;
        Ok(Self {
            config,
            tick: 0,
            excitatory: [0.0; LAYER_COUNT],
            inhibitory: [0.0; LAYER_COUNT],
        })
    }

    #[must_use]
    pub const fn tick(&self) -> u64 {
        self.tick
    }

    #[must_use]
    pub const fn config(&self) -> &LaminarConfig {
        &self.config
    }

    pub fn reset(&mut self) {
        self.tick = 0;
        self.excitatory = [0.0; LAYER_COUNT];
        self.inhibitory = [0.0; LAYER_COUNT];
    }

    /// Advances exactly one fixed tick using one drive value per cortical layer.
    ///
    /// # Errors
    ///
    /// Returns [`EngineError`] for an invalid drive or if the tick counter
    /// overflows.
    pub fn step(
        &mut self,
        external_drive: [f64; LAYER_COUNT],
    ) -> Result<LaminarSnapshot, EngineError> {
        for value in external_drive {
            validate_bounded_non_negative("external_drive", value, MAX_EXTERNAL_DRIVE)?;
        }

        let mut next_excitatory = [0.0; LAYER_COUNT];
        let mut next_inhibitory = [0.0; LAYER_COUNT];
        for target in 0..LAYER_COUNT {
            let projected_excitation = self.config.excitatory_projection[target]
                .iter()
                .zip(self.excitatory)
                .map(|(weight, state)| weight * state)
                .sum::<f64>();
            let excitatory_input = projected_excitation + external_drive[target]
                - self.config.inhibitory_gain[target] * self.inhibitory[target];
            let inhibitory_input =
                self.config.excitatory_to_inhibitory_gain[target] * self.excitatory[target];

            let target_excitatory = saturating_transfer(excitatory_input);
            let target_inhibitory = saturating_transfer(inhibitory_input);
            next_excitatory[target] = exponential_relaxation(
                self.excitatory[target],
                target_excitatory,
                self.config.dt.get(),
                self.config.tau_excitatory[target].get(),
            );
            next_inhibitory[target] = exponential_relaxation(
                self.inhibitory[target],
                target_inhibitory,
                self.config.dt.get(),
                self.config.tau_inhibitory[target].get(),
            );
        }

        self.excitatory = next_excitatory;
        self.inhibitory = next_inhibitory;
        self.tick = self.tick.checked_add(1).ok_or(EngineError::TickOverflow)?;
        Ok(self.snapshot())
    }

    #[must_use]
    pub const fn snapshot(&self) -> LaminarSnapshot {
        LaminarSnapshot {
            schema_version: ENGINE_SCHEMA_VERSION,
            tick: self.tick,
            excitatory: self.excitatory,
            inhibitory: self.inhibitory,
        }
    }
}

fn saturating_transfer(input: f64) -> f64 {
    if input <= 0.0 {
        0.0
    } else {
        input / (1.0 + input)
    }
}

fn exponential_relaxation(current: f64, target: f64, dt: f64, tau: f64) -> f64 {
    let decay = (-dt / tau).exp();
    (target + (current - target) * decay).clamp(0.0, 1.0)
}

fn validate_positive_finite(name: &'static str, value: f64) -> Result<(), EngineError> {
    if value.is_finite() && value > 0.0 {
        Ok(())
    } else {
        Err(EngineError::InvalidParameter { name, value })
    }
}

fn validate_non_negative_finite(name: &'static str, value: f64) -> Result<(), EngineError> {
    if value.is_finite() && value >= 0.0 {
        Ok(())
    } else {
        Err(EngineError::InvalidParameter { name, value })
    }
}

fn validate_bounded_non_negative(
    name: &'static str,
    value: f64,
    maximum: f64,
) -> Result<(), EngineError> {
    validate_non_negative_finite(name, value)?;
    if value <= maximum {
        Ok(())
    } else {
        Err(EngineError::ParameterOutOfRange {
            name,
            value,
            maximum,
        })
    }
}

const fn layer_from_index(index: usize) -> CorticalLayer {
    CorticalLayer::ALL[index]
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum EngineError {
    InvalidLayer(u8),
    InvalidParameter {
        name: &'static str,
        value: f64,
    },
    ParameterOutOfRange {
        name: &'static str,
        value: f64,
        maximum: f64,
    },
    ForbiddenProjection {
        source: CorticalLayer,
        target: CorticalLayer,
    },
    TickOverflow,
}

impl fmt::Display for EngineError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidLayer(layer) => write!(formatter, "invalid cortical layer: {layer}"),
            Self::InvalidParameter { name, value } => {
                write!(formatter, "{name} must be finite and valid, got {value}")
            }
            Self::ParameterOutOfRange {
                name,
                value,
                maximum,
            } => {
                write!(formatter, "{name} must be <= {maximum}, got {value}")
            }
            Self::ForbiddenProjection { source, target } => {
                write!(
                    formatter,
                    "projection {source:?} -> {target:?} is outside the 0.6 laminar contract"
                )
            }
            Self::TickOverflow => formatter.write_str("simulation tick overflow"),
        }
    }
}

impl std::error::Error for EngineError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cortical_layer_indices_are_stable() {
        for (index, layer) in CorticalLayer::ALL.into_iter().enumerate() {
            assert_eq!(layer.index(), index);
            assert_eq!(
                CorticalLayer::try_from(u8::try_from(index).unwrap()),
                Ok(layer)
            );
        }
        assert!(CorticalLayer::try_from(6).is_err());
    }

    #[test]
    fn canonical_projection_kinds_are_explicit() {
        assert_eq!(
            projection_kind(CorticalLayer::L4, CorticalLayer::L2),
            Some(ProjectionKind::Feedforward)
        );
        assert_eq!(
            projection_kind(CorticalLayer::L6, CorticalLayer::L1),
            Some(ProjectionKind::Feedback)
        );
        assert_eq!(projection_kind(CorticalLayer::L3, CorticalLayer::L4), None);
        for target in CorticalLayer::ALL {
            for source in CorticalLayer::ALL {
                let gain = canonical_projection_gain(source, target);
                assert_eq!(gain > 0.0, projection_kind(source, target).is_some());
            }
        }
    }

    #[test]
    fn rejects_paths_outside_the_laminar_contract() {
        let mut config = LaminarConfig::default();
        config.excitatory_projection[CorticalLayer::L4.index()][CorticalLayer::L3.index()] = 0.2;
        assert!(matches!(
            LaminarEngine::new(config),
            Err(EngineError::ForbiddenProjection {
                source: CorticalLayer::L3,
                target: CorticalLayer::L4,
            })
        ));
    }

    #[test]
    fn rejects_invalid_numerical_parameters() {
        assert!(matches!(
            Seconds::try_new(0.0),
            Err(EngineError::InvalidParameter {
                name: "seconds",
                ..
            })
        ));
        assert!(Seconds::try_new(f64::NAN).is_err());

        let config = LaminarConfig {
            inhibitory_gain: [-1.0; LAYER_COUNT],
            ..LaminarConfig::default()
        };
        assert!(LaminarEngine::new(config).is_err());
    }

    #[test]
    fn deterministic_runs_produce_identical_snapshots() {
        let mut first = LaminarEngine::new(LaminarConfig::default()).unwrap();
        let mut second = LaminarEngine::new(LaminarConfig::default()).unwrap();
        let mut drive = [0.0; LAYER_COUNT];
        drive[CorticalLayer::L4.index()] = 0.8;

        for _ in 0..500 {
            assert_eq!(first.step(drive), second.step(drive));
        }
    }

    #[test]
    fn state_remains_finite_and_bounded() {
        let mut engine = LaminarEngine::new(LaminarConfig::default()).unwrap();
        let drive = [10.0; LAYER_COUNT];
        for _ in 0..10_000 {
            let snapshot = engine.step(drive).unwrap();
            assert!(snapshot
                .excitatory
                .into_iter()
                .chain(snapshot.inhibitory)
                .all(|value| value.is_finite() && (0.0..=1.0).contains(&value)));
        }
    }

    #[test]
    fn layer_four_drive_reaches_supragranular_layers() {
        let mut engine = LaminarEngine::new(LaminarConfig::default()).unwrap();
        let mut drive = [0.0; LAYER_COUNT];
        drive[CorticalLayer::L4.index()] = 0.9;
        let mut snapshot = engine.snapshot();
        for _ in 0..200 {
            snapshot = engine.step(drive).unwrap();
        }

        assert!(snapshot.excitatory[CorticalLayer::L4.index()] > 0.0);
        assert!(snapshot.excitatory[CorticalLayer::L2.index()] > 0.0);
        assert!(snapshot.excitatory[CorticalLayer::L3.index()] > 0.0);
    }

    #[test]
    fn reset_clears_all_state() {
        let mut engine = LaminarEngine::new(LaminarConfig::default()).unwrap();
        engine.step([0.5; LAYER_COUNT]).unwrap();
        engine.reset();
        assert_eq!(engine.snapshot().tick, 0);
        assert!(engine
            .snapshot()
            .excitatory
            .into_iter()
            .all(|value| value.abs() < f64::EPSILON));
        assert!(engine
            .snapshot()
            .inhibitory
            .into_iter()
            .all(|value| value.abs() < f64::EPSILON));
    }
}
