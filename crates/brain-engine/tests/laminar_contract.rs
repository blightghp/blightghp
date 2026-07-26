use brain_engine::{
    projection_kind, CorticalLayer, EngineError, LaminarConfig, LaminarEngine, ProjectionKind,
    LAYER_COUNT, MAX_EXTERNAL_DRIVE, MAX_LAMINAR_GAIN,
};

#[test]
fn every_default_nonzero_projection_has_a_declared_kind() {
    let config = LaminarConfig::default();
    for target in 0..LAYER_COUNT {
        for source in 0..LAYER_COUNT {
            if config.excitatory_projection[target][source] == 0.0 {
                continue;
            }
            assert!(
                projection_kind(CorticalLayer::ALL[source], CorticalLayer::ALL[target]).is_some()
            );
        }
    }
}

#[test]
fn projection_direction_is_not_silently_reversed() {
    assert_eq!(
        projection_kind(CorticalLayer::L4, CorticalLayer::L2),
        Some(ProjectionKind::Feedforward)
    );
    assert_eq!(projection_kind(CorticalLayer::L2, CorticalLayer::L4), None);
}

#[test]
fn malformed_numbers_and_forbidden_paths_are_rejected() {
    let mut non_finite = LaminarConfig::default();
    non_finite.excitatory_projection[0][0] = f64::INFINITY;
    assert!(matches!(
        LaminarEngine::new(non_finite),
        Err(EngineError::InvalidParameter { .. })
    ));

    let mut forbidden = LaminarConfig::default();
    forbidden.excitatory_projection[CorticalLayer::L4.index()][CorticalLayer::L3.index()] = 0.1;
    assert!(matches!(
        LaminarEngine::new(forbidden),
        Err(EngineError::ForbiddenProjection { .. })
    ));
}

#[test]
fn gains_and_drives_obey_named_resource_envelopes() {
    let mut at_gain_limit = LaminarConfig::default();
    at_gain_limit.excitatory_projection[CorticalLayer::L2.index()][CorticalLayer::L4.index()] =
        MAX_LAMINAR_GAIN;
    let mut engine = LaminarEngine::new(at_gain_limit).expect("the declared limit is valid");
    engine
        .step([MAX_EXTERNAL_DRIVE; LAYER_COUNT])
        .expect("the declared drive limit is valid");

    let mut excessive_gain = LaminarConfig::default();
    excessive_gain.excitatory_projection[CorticalLayer::L2.index()][CorticalLayer::L4.index()] =
        MAX_LAMINAR_GAIN + f64::EPSILON * 8.0;
    assert!(matches!(
        LaminarEngine::new(excessive_gain),
        Err(EngineError::ParameterOutOfRange {
            name: "excitatory_projection",
            ..
        })
    ));

    assert!(matches!(
        engine.step([MAX_EXTERNAL_DRIVE * 2.0; LAYER_COUNT]),
        Err(EngineError::ParameterOutOfRange {
            name: "external_drive",
            ..
        })
    ));
}
