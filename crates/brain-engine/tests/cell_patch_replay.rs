use brain_engine::{CellPatch, CellPatchConfig, CellPatchDrive, ResolutionMap, Seconds};
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Fixture {
    schema_version: u32,
    seed: u32,
    macro_step_seconds: f64,
    drive: Drive,
    checkpoints: Vec<Checkpoint>,
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Drive {
    excitatory_rate_hz: f64,
    inhibitory_rate_hz: f64,
    boundary_current_amperes: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Checkpoint {
    macro_tick: u32,
    micro_tick: u64,
    state_hash_hex: String,
    membrane_volts_0: f32,
    dendrite_volts_0: f32,
    firing_rate_hz: f64,
    first_spike_seconds: f64,
}

#[test]
fn cell_patch_replays_the_versioned_artifact_exactly() {
    let fixture: Fixture =
        serde_json::from_str(include_str!("../../../fixtures/replay/cell-patch-v1.json"))
            .expect("cell patch fixture must be valid");
    assert_eq!(fixture.schema_version, 1);
    let mut patch = CellPatch::new(
        fixture.seed,
        CellPatchConfig::default(),
        ResolutionMap::learning_patch(Some(0)).unwrap(),
    )
    .unwrap();
    let duration = Seconds::try_new(fixture.macro_step_seconds).unwrap();
    let drive = CellPatchDrive {
        excitatory_rate_hz: fixture.drive.excitatory_rate_hz,
        inhibitory_rate_hz: fixture.drive.inhibitory_rate_hz,
        boundary_current_amperes: fixture.drive.boundary_current_amperes,
    };
    let mut checkpoint_index = 0;
    for macro_tick in 1..=fixture.checkpoints.last().unwrap().macro_tick {
        let snapshot = patch.advance_interval(duration, drive).unwrap();
        let expected = &fixture.checkpoints[checkpoint_index];
        if macro_tick != expected.macro_tick {
            continue;
        }
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
            snapshot.dendrite_volts[0].to_bits(),
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
