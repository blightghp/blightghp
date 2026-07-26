use core::fmt;

use crate::Seconds;

/// Largest exact integer representable by the JavaScript number wire type.
pub const MAX_SAFE_TICK: u64 = 9_007_199_254_740_991;
const MAX_SAFE_TICK_F64: f64 = 9_007_199_254_740_991.0;

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
#[repr(transparent)]
pub struct SimulationTick(u64);

impl SimulationTick {
    pub const ZERO: Self = Self(0);

    /// Creates a tick compatible with the JavaScript wire protocol.
    ///
    /// # Errors
    ///
    /// Returns [`ClockError`] above [`MAX_SAFE_TICK`].
    pub const fn try_new(value: u64) -> Result<Self, ClockError> {
        if value <= MAX_SAFE_TICK {
            Ok(Self(value))
        } else {
            Err(ClockError::TickOverflow)
        }
    }

    #[must_use]
    pub const fn get(self) -> u64 {
        self.0
    }

    fn checked_add(self, count: u64) -> Result<Self, ClockError> {
        let value = self.0.checked_add(count).ok_or(ClockError::TickOverflow)?;
        Self::try_new(value)
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ClockFrame {
    pub target_tick: SimulationTick,
    pub render_time_seconds: f64,
    pub frame_delta_seconds: f64,
    pub interpolation_alpha: f64,
    pub dropped_frame_seconds: f64,
    pub dropped_total_seconds: f64,
}

/// Platform-neutral scheduler matching the TypeScript 0.4 clock contract.
#[derive(Clone, Debug)]
pub struct FixedStepClock {
    step: Seconds,
    max_interactive_delta: Seconds,
    target: SimulationTick,
    remainder_seconds: f64,
    last_timestamp_milliseconds: Option<f64>,
    presentation_seconds: f64,
    total_dropped_seconds: f64,
}

impl FixedStepClock {
    #[must_use]
    pub fn new(step: Seconds, max_interactive_delta: Seconds) -> Self {
        Self {
            step,
            max_interactive_delta,
            target: SimulationTick::ZERO,
            remainder_seconds: 0.0,
            last_timestamp_milliseconds: None,
            presentation_seconds: 0.0,
            total_dropped_seconds: 0.0,
        }
    }

    /// Observes a monotonic wall timestamp in milliseconds.
    ///
    /// # Errors
    ///
    /// Returns [`ClockError`] for invalid inputs or tick overflow.
    pub fn observe(
        &mut self,
        timestamp_milliseconds: f64,
        speed: f64,
    ) -> Result<ClockFrame, ClockError> {
        validate_non_negative("timestamp_milliseconds", timestamp_milliseconds)?;
        validate_non_negative("speed", speed)?;

        let Some(previous) = self.last_timestamp_milliseconds else {
            self.last_timestamp_milliseconds = Some(timestamp_milliseconds);
            return Ok(self.frame(0.0, 0.0));
        };
        if timestamp_milliseconds <= previous {
            return Ok(self.frame(0.0, 0.0));
        }

        let wall_delta_seconds = (timestamp_milliseconds - previous) / 1_000.0;
        self.last_timestamp_milliseconds = Some(timestamp_milliseconds);
        self.presentation_seconds += wall_delta_seconds;
        let accepted_seconds = wall_delta_seconds.min(self.max_interactive_delta.get());
        let dropped_seconds = wall_delta_seconds - accepted_seconds;
        self.total_dropped_seconds += dropped_seconds;
        self.schedule(accepted_seconds * speed)?;
        Ok(self.frame(accepted_seconds, dropped_seconds))
    }

    /// Advances a deterministic capture interval without interactive clamping.
    ///
    /// # Errors
    ///
    /// Returns [`ClockError`] for invalid inputs or tick overflow.
    pub fn advance_exact(
        &mut self,
        delta_seconds: f64,
        speed: f64,
    ) -> Result<ClockFrame, ClockError> {
        validate_non_negative("delta_seconds", delta_seconds)?;
        validate_non_negative("speed", speed)?;
        self.schedule(delta_seconds * speed)?;
        Ok(self.frame(delta_seconds, 0.0))
    }

    /// Advances an integer number of ticks.
    ///
    /// # Errors
    ///
    /// Returns [`ClockError`] on tick overflow.
    pub fn advance_ticks(&mut self, count: u64) -> Result<ClockFrame, ClockError> {
        self.target = self.target.checked_add(count)?;
        Ok(self.frame(0.0, 0.0))
    }

    pub fn synchronize(&mut self, tick: SimulationTick) {
        self.target = tick;
        self.remainder_seconds = 0.0;
    }

    /// Rebases wall time without scheduling the hidden interval.
    ///
    /// # Errors
    ///
    /// Returns [`ClockError`] for an invalid timestamp.
    pub fn rebase(&mut self, timestamp_milliseconds: f64) -> Result<(), ClockError> {
        validate_non_negative("timestamp_milliseconds", timestamp_milliseconds)?;
        self.last_timestamp_milliseconds = Some(timestamp_milliseconds);
        Ok(())
    }

    /// Resets scheduling, presentation and dropped-time state.
    ///
    /// # Errors
    ///
    /// Returns [`ClockError`] for an invalid optional wall timestamp.
    pub fn reset(
        &mut self,
        tick: SimulationTick,
        timestamp_milliseconds: Option<f64>,
    ) -> Result<(), ClockError> {
        if let Some(timestamp) = timestamp_milliseconds {
            validate_non_negative("timestamp_milliseconds", timestamp)?;
        }
        self.synchronize(tick);
        self.last_timestamp_milliseconds = timestamp_milliseconds;
        self.presentation_seconds = 0.0;
        self.total_dropped_seconds = 0.0;
        Ok(())
    }

    #[must_use]
    pub const fn target_tick(&self) -> SimulationTick {
        self.target
    }

    #[must_use]
    pub fn interpolation_alpha(&self) -> f64 {
        self.remainder_seconds / self.step.get()
    }

    fn schedule(&mut self, simulation_seconds: f64) -> Result<(), ClockError> {
        if !simulation_seconds.is_finite() {
            return Err(ClockError::InvalidValue {
                name: "scheduled_seconds",
                value: simulation_seconds,
            });
        }
        self.remainder_seconds += simulation_seconds;
        let tolerance = self.step.get() * 1.0e-10;
        let elapsed = ((self.remainder_seconds + tolerance) / self.step.get()).floor();
        if elapsed < 1.0 {
            return Ok(());
        }
        if elapsed > MAX_SAFE_TICK_F64 {
            return Err(ClockError::TickOverflow);
        }
        #[expect(
            clippy::cast_possible_truncation,
            clippy::cast_sign_loss,
            reason = "elapsed was checked as finite, positive and within MAX_SAFE_TICK"
        )]
        let elapsed_ticks = elapsed as u64;
        self.remainder_seconds -= elapsed * self.step.get();
        if self.remainder_seconds < 0.0 && self.remainder_seconds > -tolerance {
            self.remainder_seconds = 0.0;
        }
        self.target = self.target.checked_add(elapsed_ticks)?;
        Ok(())
    }

    fn frame(&self, frame_delta_seconds: f64, dropped_frame_seconds: f64) -> ClockFrame {
        ClockFrame {
            target_tick: self.target,
            render_time_seconds: self.presentation_seconds,
            frame_delta_seconds,
            interpolation_alpha: self.interpolation_alpha(),
            dropped_frame_seconds,
            dropped_total_seconds: self.total_dropped_seconds,
        }
    }
}

fn validate_non_negative(name: &'static str, value: f64) -> Result<(), ClockError> {
    if value.is_finite() && value >= 0.0 {
        Ok(())
    } else {
        Err(ClockError::InvalidValue { name, value })
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum ClockError {
    InvalidValue { name: &'static str, value: f64 },
    TickOverflow,
}

impl fmt::Display for ClockError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidValue { name, value } => {
                write!(
                    formatter,
                    "{name} must be finite and non-negative, got {value}"
                )
            }
            Self::TickOverflow => formatter.write_str("clock exceeded the safe tick range"),
        }
    }
}

impl std::error::Error for ClockError {}
