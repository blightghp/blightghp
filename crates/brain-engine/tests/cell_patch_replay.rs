use brain_engine::{
    CellPatch, CellPatchConfig, CellPatchDrive, ResolutionMap, Seconds,
    LEGACY_CELL_PATCH_SCHEMA_VERSION,
};
use serde::Deserialize;

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Drive {
    excitatory_rate_hz: f64,
    inhibitory_rate_hz: f64,
    boundary_current_amperes: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FixtureV1 {
    schema_version: u32,
    seed: u32,
    macro_step_seconds: f64,
    drive: Drive,
    checkpoints: Vec<CheckpointV1>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CheckpointV1 {
    macro_tick: u32,
    micro_tick: u64,
    state_hash_hex: String,
    membrane_volts_0: f32,
    dendrite_volts_0: f32,
    firing_rate_hz: f64,
    first_spike_seconds: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FixtureV2 {
    schema_version: u32,
    seed: u32,
    macro_step_seconds: f64,
    drive: Drive,
    checkpoints: Vec<CheckpointV2>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CheckpointV2 {
    macro_tick: u32,
    micro_tick: u64,
    state_hash_hex: String,
    membrane_volts_0: f32,
    dendrite_proximal_volts_0: f32,
    dendrite_distal_volts_0: f32,
    firing_rate_hz: f64,
    first_spike_seconds: Option<f64>,
}

fn patch(seed: u32, config: CellPatchConfig) -> CellPatch {
    CellPatch::new(
        seed,
        config,
        ResolutionMap::learning_patch(Some(0)).unwrap(),
    )
    .unwrap()
}

fn drive(value: Drive) -> CellPatchDrive {
    CellPatchDrive {
        excitatory_rate_hz: value.excitatory_rate_hz,
        inhibitory_rate_hz: value.inhibitory_rate_hz,
        boundary_current_amperes: value.boundary_current_amperes,
    }
}

#[test]
fn cell_patch_replays_the_frozen_v1_artifact_exactly() {
    let fixture: FixtureV1 =
        serde_json::from_str(include_str!("../../../fixtures/replay/cell-patch-v1.json"))
            .expect("v1 cell patch fixture must be valid");
    assert_eq!(fixture.schema_version, LEGACY_CELL_PATCH_SCHEMA_VERSION);
    let dt = Seconds::try_new(1.0 / 12_000.0).unwrap();
    let mut patch = patch(fixture.seed, CellPatchConfig::legacy_v1(dt));
    let duration = Seconds::try_new(fixture.macro_step_seconds).unwrap();
    let mut checkpoint_index = 0;
    for macro_tick in 1..=fixture.checkpoints.last().unwrap().macro_tick {
        let snapshot = patch
            .advance_interval(duration, drive(fixture.drive))
            .unwrap();
        let expected = &fixture.checkpoints[checkpoint_index];
        if macro_tick != expected.macro_tick {
            continue;
        }
        assert_eq!(snapshot.schema_version, LEGACY_CELL_PATCH_SCHEMA_VERSION);
        assert_eq!(snapshot.tick, expected.micro_tick);
        assert_eq!(
            format!("{:016x}", snapshot.state_hash),
            expected.state_hash_hex
        );
        assert_eq!(
            snapshot.membrane_volts[0].to_bits(),
            expected.membrane_volts_0.to_bits()
        );
        assert_eq!(
            snapshot.dendrite_proximal_volts[0].to_bits(),
            expected.dendrite_volts_0.to_bits()
        );
        assert_eq!(
            snapshot.dendrite_distal_volts[0].to_bits(),
            expected.dendrite_volts_0.to_bits()
        );
        assert_eq!(
            snapshot.firing_rate_hz.to_bits(),
            expected.firing_rate_hz.to_bits()
        );
        assert_eq!(
            snapshot.first_spike_seconds.map(f64::to_bits),
            Some(expected.first_spike_seconds.to_bits())
        );
        checkpoint_index += 1;
        if checkpoint_index == fixture.checkpoints.len() {
            break;
        }
    }
    assert_eq!(checkpoint_index, fixture.checkpoints.len());
}

#[test]
fn cell_patch_replays_the_multicompartment_v2_artifact_exactly() {
    let fixture: FixtureV2 =
        serde_json::from_str(include_str!("../../../fixtures/replay/cell-patch-v2.json"))
            .expect("v2 cell patch fixture must be valid");
    assert_eq!(fixture.schema_version, 2);
    let mut patch = patch(fixture.seed, CellPatchConfig::default());
    let duration = Seconds::try_new(fixture.macro_step_seconds).unwrap();
    let mut checkpoint_index = 0;
    for macro_tick in 1..=fixture.checkpoints.last().unwrap().macro_tick {
        let snapshot = patch
            .advance_interval(duration, drive(fixture.drive))
            .unwrap();
        let expected = &fixture.checkpoints[checkpoint_index];
        if macro_tick != expected.macro_tick {
            continue;
        }
        assert_eq!(snapshot.schema_version, fixture.schema_version);
        assert_eq!(snapshot.tick, expected.micro_tick);
        assert_eq!(
            format!("{:016x}", snapshot.state_hash),
            expected.state_hash_hex
        );
        assert_eq!(
            snapshot.membrane_volts[0].to_bits(),
            expected.membrane_volts_0.to_bits()
        );
        assert_eq!(
            snapshot.dendrite_proximal_volts[0].to_bits(),
            expected.dendrite_proximal_volts_0.to_bits()
        );
        assert_eq!(
            snapshot.dendrite_distal_volts[0].to_bits(),
            expected.dendrite_distal_volts_0.to_bits()
        );
        assert_eq!(
            snapshot.firing_rate_hz.to_bits(),
            expected.firing_rate_hz.to_bits()
        );
        assert_eq!(
            snapshot.first_spike_seconds.map(f64::to_bits),
            expected.first_spike_seconds.map(f64::to_bits)
        );
        checkpoint_index += 1;
        if checkpoint_index == fixture.checkpoints.len() {
            break;
        }
    }
    assert_eq!(checkpoint_index, fixture.checkpoints.len());
}
