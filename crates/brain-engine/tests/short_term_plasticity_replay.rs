use brain_engine::{
    ReleaseUpdatePhase, Seconds, ShortTermPlasticity, ShortTermPlasticityConfig, UnitFraction,
    RELEASE_UPDATE_ORDER, SHORT_TERM_PLASTICITY_SCHEMA_VERSION,
};
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Fixture {
    schema_version: u32,
    model: String,
    update_order: Vec<String>,
    config: Config,
    event_times_seconds: Vec<f64>,
    checkpoints: Vec<Checkpoint>,
    settled_checkpoint: SettledCheckpoint,
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Config {
    baseline_utilization: f64,
    depression_time_constant_seconds: f64,
    facilitation_time_constant_seconds: f64,
    conductance_time_constant_seconds: f64,
    pool_capacity_moles: f64,
    conductance_per_released_fraction_siemens: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Checkpoint {
    event_index: u64,
    time_seconds: f64,
    available_before: f64,
    utilization_before: f64,
    released_fraction: f64,
    released_moles: f64,
    conductance_before_siemens: f64,
    conductance_increment_siemens: f64,
    conductance_after_increment_siemens: f64,
    available_after_depletion: f64,
    utilization_after_facilitation: f64,
    state_hash_hex: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SettledCheckpoint {
    time_seconds: f64,
    event_index: u64,
    available_fraction: f64,
    utilization_fraction: f64,
    conductance_siemens: f64,
    state_hash_hex: String,
}

#[test]
fn short_term_plasticity_replays_the_versioned_oracle_exactly() {
    let fixture: Fixture = serde_json::from_str(include_str!(
        "../../../fixtures/replay/short-term-plasticity-v1.json"
    ))
    .expect("short-term plasticity fixture must be valid");
    assert_eq!(fixture.schema_version, SHORT_TERM_PLASTICITY_SCHEMA_VERSION);
    assert_eq!(fixture.model, "tsodyks-markram-deterministic");
    assert_eq!(
        fixture.update_order,
        RELEASE_UPDATE_ORDER
            .into_iter()
            .map(ReleaseUpdatePhase::as_str)
            .collect::<Vec<_>>()
    );
    assert_eq!(fixture.event_times_seconds.len(), fixture.checkpoints.len());

    let mut dynamics = ShortTermPlasticity::new(build_config(fixture.config));
    for (time_seconds, expected) in fixture
        .event_times_seconds
        .into_iter()
        .zip(&fixture.checkpoints)
    {
        let actual = dynamics.process_presynaptic_event(time_seconds).unwrap();
        assert_eq!(actual.event_index, expected.event_index);
        assert_bits(actual.time_seconds, expected.time_seconds);
        assert_bits(actual.available_before.get(), expected.available_before);
        assert_bits(actual.utilization_before.get(), expected.utilization_before);
        assert_bits(
            actual.release.released_fraction(),
            expected.released_fraction,
        );
        assert_bits(actual.release.released_moles(), expected.released_moles);
        assert_bits(
            actual.conductance_before_siemens,
            expected.conductance_before_siemens,
        );
        assert_bits(
            actual.conductance_increment_siemens,
            expected.conductance_increment_siemens,
        );
        assert_bits(
            actual.conductance_after_increment_siemens,
            expected.conductance_after_increment_siemens,
        );
        assert_bits(
            actual.available_after_depletion.get(),
            expected.available_after_depletion,
        );
        assert_bits(
            actual.utilization_after_facilitation.get(),
            expected.utilization_after_facilitation,
        );
        assert_eq!(
            format!("{:016x}", actual.state_hash),
            expected.state_hash_hex
        );
    }

    let expected = fixture.settled_checkpoint;
    let actual = dynamics.advance_to(expected.time_seconds).unwrap();
    assert_eq!(actual.event_index, expected.event_index);
    assert_bits(actual.time_seconds, expected.time_seconds);
    assert_bits(actual.available_fraction, expected.available_fraction);
    assert_bits(actual.utilization_fraction, expected.utilization_fraction);
    assert_bits(actual.conductance_siemens, expected.conductance_siemens);
    assert_eq!(
        format!("{:016x}", actual.state_hash),
        expected.state_hash_hex
    );
}

fn build_config(config: Config) -> ShortTermPlasticityConfig {
    ShortTermPlasticityConfig::try_new(
        UnitFraction::try_new(config.baseline_utilization).unwrap(),
        Seconds::try_new(config.depression_time_constant_seconds).unwrap(),
        Seconds::try_new(config.facilitation_time_constant_seconds).unwrap(),
        Seconds::try_new(config.conductance_time_constant_seconds).unwrap(),
        config.pool_capacity_moles,
        config.conductance_per_released_fraction_siemens,
    )
    .unwrap()
}

fn assert_bits(actual: f64, expected: f64) {
    assert_eq!(
        actual.to_bits(),
        expected.to_bits(),
        "actual {actual:?} differs from fixture {expected:?}"
    );
}
