use brain_engine::{
    analytic_response_area, response_area, AMPA_TIME_CONSTANT_SECONDS, GABAA_TIME_CONSTANT_SECONDS,
};

fn errors(tau: f64) -> [f64; 4] {
    let duration = tau * 8.0;
    let oracle = analytic_response_area(duration, tau).unwrap();
    [0.001, 0.000_5, 0.000_25, 0.000_125]
        .map(|step| (response_area(step, duration, tau).unwrap() - oracle).abs())
}

#[test]
fn ampa_and_gabaa_currents_converge_under_step_refinement() {
    for tau in [AMPA_TIME_CONSTANT_SECONDS, GABAA_TIME_CONSTANT_SECONDS] {
        let refinement_errors = errors(tau);
        for pair in refinement_errors.windows(2) {
            assert!(
                pair[1] < pair[0],
                "errors must decrease: {refinement_errors:?}"
            );
            let observed_order = (pair[0] / pair[1]).log2();
            assert!(
                observed_order > 0.90,
                "expected first-order convergence, got {observed_order}"
            );
        }
        assert!(refinement_errors[3] / tau < 0.013);
    }
}
