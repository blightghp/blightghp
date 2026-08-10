use brain_engine::{
    ReleaseUpdatePhase, Seconds, ShortTermPlasticity, ShortTermPlasticityConfig, UnitFraction,
    RELEASE_UPDATE_ORDER, SHORT_TERM_PLASTICITY_SCHEMA_VERSION,
};
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Fixture {
    schema_version: u32,
    model: &'static str,
    update_order: Vec<&'static str>,
    config: Config,
    event_times_seconds: Vec<f64>,
    checkpoints: Vec<Checkpoint>,
    settled_checkpoint: SettledCheckpoint,
}

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
struct Config {
    baseline_utilization: f64,
    depression_time_constant_seconds: f64,
    facilitation_time_constant_seconds: f64,
    conductance_time_constant_seconds: f64,
    pool_capacity_moles: f64,
    conductance_per_released_fraction_siemens: f64,
}

#[derive(Serialize)]
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SettledCheckpoint {
    time_seconds: f64,
    event_index: u64,
    available_fraction: f64,
    utilization_fraction: f64,
    conductance_siemens: f64,
    state_hash_hex: String,
}

fn main() {
    let config = Config {
        baseline_utilization: 0.18,
        depression_time_constant_seconds: 0.8,
        facilitation_time_constant_seconds: 0.25,
        conductance_time_constant_seconds: 0.08,
        pool_capacity_moles: 2.0e-18,
        conductance_per_released_fraction_siemens: 1.5e-9,
    };
    let event_times_seconds = vec![0.0, 0.01, 0.02, 0.05, 0.1, 0.25, 0.5];
    let mut dynamics = ShortTermPlasticity::new(build_config(config));
    let checkpoints = event_times_seconds
        .iter()
        .map(|time_seconds| {
            let event = dynamics
                .process_presynaptic_event(*time_seconds)
                .expect("fixture event must succeed");
            Checkpoint {
                event_index: event.event_index,
                time_seconds: event.time_seconds,
                available_before: event.available_before.get(),
                utilization_before: event.utilization_before.get(),
                released_fraction: event.release.released_fraction(),
                released_moles: event.release.released_moles(),
                conductance_before_siemens: event.conductance_before_siemens,
                conductance_increment_siemens: event.conductance_increment_siemens,
                conductance_after_increment_siemens: event.conductance_after_increment_siemens,
                available_after_depletion: event.available_after_depletion.get(),
                utilization_after_facilitation: event.utilization_after_facilitation.get(),
                state_hash_hex: format!("{:016x}", event.state_hash),
            }
        })
        .collect();
    let settled = dynamics
        .advance_to(1.0)
        .expect("fixture settlement must succeed");
    let fixture = Fixture {
        schema_version: SHORT_TERM_PLASTICITY_SCHEMA_VERSION,
        model: "tsodyks-markram-deterministic",
        update_order: RELEASE_UPDATE_ORDER
            .into_iter()
            .map(ReleaseUpdatePhase::as_str)
            .collect(),
        config,
        event_times_seconds,
        checkpoints,
        settled_checkpoint: SettledCheckpoint {
            time_seconds: settled.time_seconds,
            event_index: settled.event_index,
            available_fraction: settled.available_fraction,
            utilization_fraction: settled.utilization_fraction,
            conductance_siemens: settled.conductance_siemens,
            state_hash_hex: format!("{:016x}", settled.state_hash),
        },
    };
    println!(
        "{}",
        serde_json::to_string_pretty(&fixture).expect("fixture serialization must succeed")
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
