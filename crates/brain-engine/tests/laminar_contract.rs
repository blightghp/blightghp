use brain_engine::{
    projection_kind, CorticalLayer, EngineError, LaminarConfig, LaminarEngine, ProjectionKind,
    LAYER_COUNT,
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
