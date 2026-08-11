use brain_engine::{ChemicalSignal, ChemicalTrack, Seconds, CHEMICAL_TRACK_SCHEMA_VERSION};
use serde::Deserialize;

const FIXTURE: &str = include_str!("../../../fixtures/replay/chemical-track-v1.json");

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Fixture {
    schema_version: u32,
    model: String,
    tick_seconds: f64,
    transmitter_order: [String; 2],
    receptor_order: [String; 4],
    inputs: Vec<TickInput>,
    checkpoints: Vec<Checkpoint>,
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TickInput {
    excitatory_spikes: u32,
    inhibitory_spikes: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Checkpoint {
    time_seconds: f64,
    solver_step_index: u64,
    release_event_indices: [u32; 2],
    presynaptic_spike_counts: [u32; 2],
    vesicle_available_fraction: [f64; 2],
    vesicle_utilization_fraction: [f64; 2],
    latest_release_moles: [f64; 2],
    latest_release_time_seconds: [f64; 2],
    total_released_moles: [f64; 2],
    cleft_moles: [f64; 2],
    cleft_concentration_moles_per_cubic_meter: [f64; 2],
    receptor_bound_moles: [f64; 4],
    receptor_occupancy_fraction: [f64; 4],
    cleared_moles: [f64; 2],
    state_hash_hex: String,
}

fn assert_f64_array<const N: usize>(actual: [f64; N], expected: [f64; N]) {
    for (index, (actual, expected)) in actual.into_iter().zip(expected).enumerate() {
        assert_eq!(
            actual.to_bits(),
            expected.to_bits(),
            "f64 mismatch at index {index}"
        );
    }
}

fn assert_checkpoint(actual: ChemicalSignal, expected: &Checkpoint) {
    assert_eq!(
        actual.time_seconds.to_bits(),
        expected.time_seconds.to_bits()
    );
    assert_eq!(actual.solver_step_index, expected.solver_step_index);
    assert_eq!(actual.release_event_indices, expected.release_event_indices);
    assert_eq!(
        actual.presynaptic_spike_counts,
        expected.presynaptic_spike_counts
    );
    assert_f64_array(
        actual.vesicle_available_fraction,
        expected.vesicle_available_fraction,
    );
    assert_f64_array(
        actual.vesicle_utilization_fraction,
        expected.vesicle_utilization_fraction,
    );
    assert_f64_array(actual.latest_release_moles, expected.latest_release_moles);
    assert_f64_array(
        actual.latest_release_time_seconds,
        expected.latest_release_time_seconds,
    );
    assert_f64_array(actual.total_released_moles, expected.total_released_moles);
    assert_f64_array(actual.cleft_moles, expected.cleft_moles);
    assert_f64_array(
        actual.cleft_concentration_moles_per_cubic_meter,
        expected.cleft_concentration_moles_per_cubic_meter,
    );
    assert_f64_array(actual.receptor_bound_moles, expected.receptor_bound_moles);
    assert_f64_array(
        actual.receptor_occupancy_fraction,
        expected.receptor_occupancy_fraction,
    );
    assert_f64_array(actual.cleared_moles, expected.cleared_moles);
    assert_eq!(
        actual.state_hash,
        u64::from_str_radix(&expected.state_hash_hex, 16).unwrap()
    );
}

#[test]
fn integrated_chemical_track_replays_every_published_v6_buffer_exactly() {
    let fixture: Fixture = serde_json::from_str(FIXTURE).expect("fixture must be valid");
    assert_eq!(fixture.schema_version, CHEMICAL_TRACK_SCHEMA_VERSION);
    assert_eq!(fixture.model, "representative-synaptic-chemical-track");
    assert_eq!(fixture.transmitter_order, ["glutamate", "gaba"]);
    assert_eq!(fixture.receptor_order, ["ampa", "nmda", "gaba-a", "gaba-b"]);
    assert_eq!(fixture.inputs.len(), fixture.checkpoints.len());
    let tick = Seconds::try_new(fixture.tick_seconds).unwrap();
    let mut track = ChemicalTrack::learning_preset();
    for (input, checkpoint) in fixture.inputs.into_iter().zip(fixture.checkpoints) {
        let actual = track
            .advance_tick(tick, input.excitatory_spikes, input.inhibitory_spikes)
            .unwrap();
        assert_checkpoint(actual, &checkpoint);
    }
}
