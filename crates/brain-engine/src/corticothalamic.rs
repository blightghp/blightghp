use crate::{
    exponential_relaxation, saturating_transfer, validate_non_negative_finite, CorticalLayer,
    EngineError, LaminarConfig, LaminarEngine, LaminarSnapshot, Seconds, LAYER_COUNT,
};
use std::time::Duration;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CorticothalamicConfig {
    pub laminar: LaminarConfig,
    pub tau_relay: Seconds,
    pub tau_trn: Seconds,
    pub tau_rebound: Seconds,
    pub relay_to_trn_delay: Seconds,
    pub trn_to_relay_delay: Seconds,
    pub sensory_to_relay_gain: f64,
    pub relay_to_trn_gain: f64,
    pub trn_to_relay_gain: f64,
    pub l6_to_relay_gain: f64,
    pub l6_to_trn_gain: f64,
    pub rebound_to_relay_gain: f64,
    pub relay_to_l4_gain: f64,
}

impl Default for CorticothalamicConfig {
    fn default() -> Self {
        Self {
            laminar: LaminarConfig::default(),
            tau_relay: Seconds::trusted(0.012),
            tau_trn: Seconds::trusted(0.020),
            tau_rebound: Seconds::trusted(0.060),
            relay_to_trn_delay: Seconds::trusted(0.018),
            trn_to_relay_delay: Seconds::trusted(0.024),
            sensory_to_relay_gain: 1.10,
            relay_to_trn_gain: 1.35,
            trn_to_relay_gain: 1.60,
            l6_to_relay_gain: 0.45,
            l6_to_trn_gain: 0.35,
            rebound_to_relay_gain: 0.85,
            relay_to_l4_gain: 1.05,
        }
    }
}

impl CorticothalamicConfig {
    /// Validates the embedded laminar configuration and circuit gains.
    ///
    /// # Errors
    ///
    /// Returns [`EngineError`] when a gain is negative or non-finite, or when
    /// the laminar configuration is invalid.
    pub fn validate(&self) -> Result<(), EngineError> {
        self.laminar.validate()?;
        for (name, value) in [
            ("sensory_to_relay_gain", self.sensory_to_relay_gain),
            ("relay_to_trn_gain", self.relay_to_trn_gain),
            ("trn_to_relay_gain", self.trn_to_relay_gain),
            ("l6_to_relay_gain", self.l6_to_relay_gain),
            ("l6_to_trn_gain", self.l6_to_trn_gain),
            ("rebound_to_relay_gain", self.rebound_to_relay_gain),
            ("relay_to_l4_gain", self.relay_to_l4_gain),
        ] {
            validate_non_negative_finite(name, value)?;
        }
        Ok(())
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct CorticothalamicDrive {
    pub sensory: f64,
    pub contextual: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CorticothalamicSnapshot {
    pub tick: u64,
    pub laminar: LaminarSnapshot,
    pub relay: f64,
    pub trn: f64,
    pub rebound: f64,
    pub relay_drive_to_l4: f64,
    pub layer6_feedback: f64,
}

#[derive(Clone, Debug)]
pub struct CorticothalamicEngine {
    config: CorticothalamicConfig,
    laminar: LaminarEngine,
    relay: f64,
    trn: f64,
    rebound: f64,
    relay_history: Vec<f64>,
    trn_history: Vec<f64>,
    relay_cursor: usize,
    trn_cursor: usize,
}

impl CorticothalamicEngine {
    /// Creates a deterministic relay–TRN–cortex circuit.
    ///
    /// # Errors
    ///
    /// Returns [`EngineError`] when any configuration value violates its
    /// numerical contract.
    pub fn new(config: CorticothalamicConfig) -> Result<Self, EngineError> {
        config.validate()?;
        let relay_delay_steps =
            delay_steps(config.relay_to_trn_delay.get(), config.laminar.dt.get());
        let trn_delay_steps = delay_steps(config.trn_to_relay_delay.get(), config.laminar.dt.get());
        let laminar = LaminarEngine::new(config.laminar)?;
        Ok(Self {
            config,
            laminar,
            relay: 0.0,
            trn: 0.0,
            rebound: 0.0,
            relay_history: vec![0.0; relay_delay_steps],
            trn_history: vec![0.0; trn_delay_steps],
            relay_cursor: 0,
            trn_cursor: 0,
        })
    }

    #[must_use]
    pub const fn config(&self) -> &CorticothalamicConfig {
        &self.config
    }

    #[must_use]
    pub const fn snapshot(&self) -> CorticothalamicSnapshot {
        let laminar = self.laminar.snapshot();
        CorticothalamicSnapshot {
            tick: laminar.tick,
            laminar,
            relay: self.relay,
            trn: self.trn,
            rebound: self.rebound,
            relay_drive_to_l4: self.relay * self.config.relay_to_l4_gain,
            layer6_feedback: laminar.excitatory[CorticalLayer::L6.index()],
        }
    }

    pub fn reset(&mut self) {
        self.laminar.reset();
        self.relay = 0.0;
        self.trn = 0.0;
        self.rebound = 0.0;
        self.relay_history.fill(0.0);
        self.trn_history.fill(0.0);
        self.relay_cursor = 0;
        self.trn_cursor = 0;
    }

    /// Advances the complete circuit by one fixed tick.
    ///
    /// # Errors
    ///
    /// Returns [`EngineError`] for invalid drives or a laminar tick overflow.
    pub fn step(
        &mut self,
        drive: CorticothalamicDrive,
    ) -> Result<CorticothalamicSnapshot, EngineError> {
        validate_non_negative_finite("corticothalamic_sensory_drive", drive.sensory)?;
        validate_non_negative_finite("corticothalamic_contextual_drive", drive.contextual)?;

        let delayed_relay = self.relay_history[self.relay_cursor];
        let delayed_trn = self.trn_history[self.trn_cursor];
        let layer6 = self.laminar.snapshot().excitatory[CorticalLayer::L6.index()];

        let relay_input = self.config.sensory_to_relay_gain * drive.sensory
            + self.config.l6_to_relay_gain * layer6
            + self.config.rebound_to_relay_gain * self.rebound
            - self.config.trn_to_relay_gain * delayed_trn;
        let trn_input =
            self.config.relay_to_trn_gain * delayed_relay + self.config.l6_to_trn_gain * layer6;
        let rebound_target = self.trn * (1.0 - self.relay);

        let dt = self.config.laminar.dt.get();
        self.relay = exponential_relaxation(
            self.relay,
            saturating_transfer(relay_input),
            dt,
            self.config.tau_relay.get(),
        );
        self.trn = exponential_relaxation(
            self.trn,
            saturating_transfer(trn_input),
            dt,
            self.config.tau_trn.get(),
        );
        self.rebound = exponential_relaxation(
            self.rebound,
            rebound_target,
            dt,
            self.config.tau_rebound.get(),
        );

        self.relay_history[self.relay_cursor] = self.relay;
        self.trn_history[self.trn_cursor] = self.trn;
        self.relay_cursor = (self.relay_cursor + 1) % self.relay_history.len();
        self.trn_cursor = (self.trn_cursor + 1) % self.trn_history.len();

        let mut layer_drive = [0.0; LAYER_COUNT];
        layer_drive[CorticalLayer::L4.index()] = self.relay * self.config.relay_to_l4_gain;
        layer_drive[CorticalLayer::L1.index()] = drive.contextual;
        self.laminar.step(layer_drive)?;
        Ok(self.snapshot())
    }
}

fn delay_steps(delay: f64, dt: f64) -> usize {
    let delay_nanos = Duration::from_secs_f64(delay).as_nanos();
    let dt_nanos = Duration::from_secs_f64(dt).as_nanos();
    usize::try_from(delay_nanos.div_ceil(dt_nanos))
        .unwrap_or(usize::MAX)
        .max(1)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deterministic_circuits_match_tick_for_tick() {
        let mut first = CorticothalamicEngine::new(CorticothalamicConfig::default()).unwrap();
        let mut second = CorticothalamicEngine::new(CorticothalamicConfig::default()).unwrap();
        let drive = CorticothalamicDrive {
            sensory: 0.8,
            contextual: 0.15,
        };

        for _ in 0..2_000 {
            assert_eq!(first.step(drive), second.step(drive));
        }
    }

    #[test]
    fn relay_drives_layer_four_and_the_cortical_column() {
        let mut engine = CorticothalamicEngine::new(CorticothalamicConfig::default()).unwrap();
        let mut snapshot = engine.snapshot();
        for _ in 0..500 {
            snapshot = engine
                .step(CorticothalamicDrive {
                    sensory: 0.9,
                    contextual: 0.0,
                })
                .unwrap();
        }

        assert!(snapshot.relay > 0.0);
        assert!(snapshot.trn > 0.0);
        assert!(snapshot.laminar.excitatory[CorticalLayer::L4.index()] > 0.0);
        assert!(snapshot.laminar.excitatory[CorticalLayer::L2.index()] > 0.0);
    }

    #[test]
    fn reset_clears_circuit_and_delay_lines() {
        let mut engine = CorticothalamicEngine::new(CorticothalamicConfig::default()).unwrap();
        engine
            .step(CorticothalamicDrive {
                sensory: 1.0,
                contextual: 0.2,
            })
            .unwrap();
        engine.reset();

        assert_eq!(
            engine.snapshot(),
            CorticothalamicEngine::new(CorticothalamicConfig::default())
                .unwrap()
                .snapshot()
        );
        assert!(engine.relay_history.iter().all(|value| *value == 0.0));
        assert!(engine.trn_history.iter().all(|value| *value == 0.0));
    }
}
