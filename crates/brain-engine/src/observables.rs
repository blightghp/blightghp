use core::fmt;

use crate::Seconds;

#[must_use]
pub fn mean_absolute_weight(weights: &[f64]) -> f64 {
    if weights.is_empty() {
        return 0.0;
    }
    weights.iter().map(|value| value.abs()).sum::<f64>() / usize_to_f64(weights.len())
}

#[derive(Clone, Debug)]
pub struct PopulationFiringRate {
    counts: Vec<u32>,
    dt: Seconds,
    population_size: u32,
    window_ticks: u32,
    cursor: usize,
    filled_ticks: u32,
    sum: f64,
}

impl PopulationFiringRate {
    /// Creates a sliding-window population firing-rate observable.
    ///
    /// # Errors
    ///
    /// Returns [`ObservableError`] for an empty population or a window whose
    /// tick count cannot be represented on the current platform.
    pub fn new(
        population_size: u32,
        dt: Seconds,
        window: Seconds,
    ) -> Result<Self, ObservableError> {
        if population_size == 0 {
            return Err(ObservableError::EmptyPopulation);
        }
        let window_ticks = (window.get() / dt.get()).round().max(1.0);
        if window_ticks > f64::from(u32::MAX) {
            return Err(ObservableError::WindowOverflow);
        }
        #[expect(
            clippy::cast_possible_truncation,
            clippy::cast_sign_loss,
            reason = "window tick count was checked as positive and within u32"
        )]
        let window_ticks = window_ticks as u32;
        let allocation_length =
            usize::try_from(window_ticks).map_err(|_| ObservableError::WindowOverflow)?;
        Ok(Self {
            counts: vec![0; allocation_length],
            dt,
            population_size,
            window_ticks,
            cursor: 0,
            filled_ticks: 0,
            sum: 0.0,
        })
    }

    /// Adds one tick's spike count and returns Hz per population unit.
    pub fn sample(&mut self, spikes: u32) -> f64 {
        self.sum -= f64::from(self.counts[self.cursor]);
        self.counts[self.cursor] = spikes;
        self.sum += f64::from(spikes);
        self.cursor = (self.cursor + 1) % self.counts.len();
        self.filled_ticks = (self.filled_ticks + 1).min(self.window_ticks);

        let covered_seconds = f64::from(self.filled_ticks) * self.dt.get();
        self.sum / covered_seconds / f64::from(self.population_size)
    }

    #[must_use]
    pub fn effective_window_seconds(&self) -> f64 {
        f64::from(self.window_ticks) * self.dt.get()
    }

    pub fn reset(&mut self) {
        self.counts.fill(0);
        self.cursor = 0;
        self.filled_ticks = 0;
        self.sum = 0.0;
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ObservableError {
    EmptyPopulation,
    WindowOverflow,
}

impl fmt::Display for ObservableError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::EmptyPopulation => {
                formatter.write_str("population must contain at least one unit")
            }
            Self::WindowOverflow => formatter.write_str("observable window exceeds this platform"),
        }
    }
}

impl std::error::Error for ObservableError {}

#[expect(
    clippy::cast_precision_loss,
    reason = "an in-memory slice cannot reach the f64 exact-integer boundary"
)]
fn usize_to_f64(value: usize) -> f64 {
    value as f64
}
