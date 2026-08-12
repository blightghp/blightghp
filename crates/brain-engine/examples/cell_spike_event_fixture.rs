use brain_engine::{CellPatch, CellPatchConfig, CellPatchDrive, ResolutionMap, Seconds};
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Fixture {
    schema_version: u32,
    event_schema_version: u32,
    seed: u32,
    macro_step_seconds: f64,
    drive: Drive,
    batches: Vec<Batch>,
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
struct Batch {
    macro_tick: u32,
    micro_tick: u64,
    cell_ids: Vec<u32>,
    time_offset_bits_hex: Vec<String>,
}

fn main() {
    let seed = 0x5eed_0009;
    let macro_step_seconds = 1.0 / 60.0;
    let drive = Drive {
        excitatory_rate_hz: 70.0,
        inhibitory_rate_hz: 30.0,
        boundary_current_amperes: 420.0e-12,
    };
    let mut patch = CellPatch::new(
        seed,
        CellPatchConfig::default(),
        ResolutionMap::learning_patch(Some(0)).expect("fixture map must be valid"),
    )
    .expect("fixture patch must be valid");
    let duration = Seconds::try_new(macro_step_seconds).expect("fixture step must be valid");
    let mut batches = Vec::new();
    for macro_tick in 1..=3 {
        let snapshot = patch
            .advance_interval(
                duration,
                CellPatchDrive {
                    excitatory_rate_hz: drive.excitatory_rate_hz,
                    inhibitory_rate_hz: drive.inhibitory_rate_hz,
                    boundary_current_amperes: drive.boundary_current_amperes,
                },
            )
            .expect("fixture advance must succeed");
        batches.push(Batch {
            macro_tick,
            micro_tick: snapshot.tick,
            cell_ids: snapshot
                .spike_events
                .iter()
                .map(|event| event.cell_id)
                .collect(),
            time_offset_bits_hex: snapshot
                .spike_events
                .iter()
                .map(|event| format!("{:016x}", event.time_offset_seconds.to_bits()))
                .collect(),
        });
    }
    let fixture = Fixture {
        schema_version: 1,
        event_schema_version: brain_engine::CELL_SPIKE_EVENT_SCHEMA_VERSION,
        seed,
        macro_step_seconds,
        drive,
        batches,
    };
    println!(
        "{}",
        serde_json::to_string_pretty(&fixture).expect("fixture serialization must succeed")
    );
}
