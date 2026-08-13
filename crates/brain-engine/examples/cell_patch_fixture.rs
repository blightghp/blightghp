use brain_engine::{CellPatch, CellPatchConfig, CellPatchDrive, ResolutionMap, Seconds};
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Fixture {
    schema_version: u32,
    seed: u32,
    macro_step_seconds: f64,
    drive: Drive,
    checkpoints: Vec<Checkpoint>,
}

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
struct Drive {
    excitatory_rate_hz: f64,
    inhibitory_rate_hz: f64,
    boundary_current_amperes: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Checkpoint {
    macro_tick: u32,
    micro_tick: u64,
    state_hash_hex: String,
    membrane_volts_0: f32,
    dendrite_proximal_volts_0: f32,
    dendrite_distal_volts_0: f32,
    firing_rate_hz: f64,
    first_spike_seconds: Option<f64>,
}

fn main() {
    let seed = 0x5eed_0007;
    let macro_step_seconds = 1.0 / 60.0;
    let drive = Drive {
        excitatory_rate_hz: 62.0,
        inhibitory_rate_hz: 28.0,
        boundary_current_amperes: 420.0e-12,
    };
    let mut patch = CellPatch::new(
        seed,
        CellPatchConfig::default(),
        ResolutionMap::learning_patch(Some(0)).expect("fixture map must be valid"),
    )
    .expect("fixture patch must be valid");
    let mut checkpoints = Vec::new();
    for macro_tick in 1..=60 {
        let snapshot = patch
            .advance_interval(
                Seconds::try_new(macro_step_seconds).expect("fixture step must be valid"),
                CellPatchDrive {
                    excitatory_rate_hz: drive.excitatory_rate_hz,
                    inhibitory_rate_hz: drive.inhibitory_rate_hz,
                    boundary_current_amperes: drive.boundary_current_amperes,
                },
            )
            .expect("fixture advance must succeed");
        if [1, 10, 30, 60].contains(&macro_tick) {
            checkpoints.push(Checkpoint {
                macro_tick,
                micro_tick: snapshot.tick,
                state_hash_hex: format!("{:016x}", snapshot.state_hash),
                membrane_volts_0: snapshot.membrane_volts[0],
                dendrite_proximal_volts_0: snapshot.dendrite_proximal_volts[0],
                dendrite_distal_volts_0: snapshot.dendrite_distal_volts[0],
                firing_rate_hz: snapshot.firing_rate_hz,
                first_spike_seconds: snapshot.first_spike_seconds,
            });
        }
    }
    let fixture = Fixture {
        schema_version: 2,
        seed,
        macro_step_seconds,
        drive,
        checkpoints,
    };
    println!(
        "{}",
        serde_json::to_string_pretty(&fixture).expect("fixture serialization must succeed")
    );
}
