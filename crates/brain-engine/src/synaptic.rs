/// Fast ionotropic conductance constants used by the 0.6 baseline.
pub const AMPA_TIME_CONSTANT_SECONDS: f64 = 0.005;
pub const GABAA_TIME_CONSTANT_SECONDS: f64 = 0.010;

/// Exact exponential decay over one fixed step.
#[must_use]
#[expect(
    clippy::cast_possible_truncation,
    reason = "simulation snapshots intentionally store conductance traces as f32"
)]
pub(crate) fn decay_conductance(current: f32, step_seconds: f64, tau_seconds: f64) -> f32 {
    (f64::from(current) * (-step_seconds / tau_seconds).exp()) as f32
}

/// Left-rectangle estimate of the area under a unit conductance response.
#[must_use]
#[expect(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    clippy::cast_precision_loss,
    reason = "validated convergence studies are bounded to one million exact loop indexes"
)]
pub fn response_area(step_seconds: f64, duration_seconds: f64, tau_seconds: f64) -> Option<f64> {
    if !step_seconds.is_finite()
        || !duration_seconds.is_finite()
        || !tau_seconds.is_finite()
        || step_seconds <= 0.0
        || duration_seconds <= 0.0
        || tau_seconds <= 0.0
    {
        return None;
    }
    let steps = (duration_seconds / step_seconds).round();
    if !(1.0..=1_000_000.0).contains(&steps) {
        return None;
    }
    Some(
        (0..steps as u64)
            .map(|step| (-(step as f64 * step_seconds) / tau_seconds).exp() * step_seconds)
            .sum(),
    )
}

#[must_use]
pub fn analytic_response_area(duration_seconds: f64, tau_seconds: f64) -> Option<f64> {
    if !duration_seconds.is_finite()
        || !tau_seconds.is_finite()
        || duration_seconds <= 0.0
        || tau_seconds <= 0.0
    {
        return None;
    }
    Some(tau_seconds * (1.0 - (-duration_seconds / tau_seconds).exp()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn conductance_decay_is_finite_non_negative_and_receptor_specific() {
        let ampa = decay_conductance(1.0, 0.001, AMPA_TIME_CONSTANT_SECONDS);
        let gabaa = decay_conductance(1.0, 0.001, GABAA_TIME_CONSTANT_SECONDS);
        assert!(ampa.is_finite() && ampa >= 0.0);
        assert!(gabaa.is_finite() && gabaa >= 0.0);
        assert!(ampa < gabaa);
    }

    #[test]
    fn convergence_instrument_rejects_invalid_or_excessive_work() {
        assert_eq!(response_area(0.0, 1.0, 0.01), None);
        assert_eq!(response_area(1.0e-9, 1.0, 0.01), None);
        assert_eq!(analytic_response_area(f64::NAN, 0.01), None);
    }
}
