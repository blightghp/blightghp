use brain_engine::{
    CellPatch, CellPatchConfig, CellPatchDrive, ResolutionMap, Seconds,
    CELL_SPIKE_EVENT_SCHEMA_VERSION, MAX_CELL_SPIKE_EVENTS_PER_INTERVAL,
};
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Fixture {
    schema_version: u32,
    event_schema_version: u32,
    seed: u32,
    macro_step_seconds: f64,
    drive: Drive,
    batches: Vec<Batch>,
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
struct Batch {
    macro_tick: u32,
    micro_tick: u64,
    cell_ids: Vec<u32>,
    time_offset_bits_hex: Vec<String>,
}

#[test]
fn cell_spike_events_replay_in_canonical_order() {
    let fixture: Fixture = serde_json::from_str(include_str!(
        "../../../fixtures/replay/cell-spike-events-v1.json"
    ))
    .expect("cell spike event fixture must be valid");
    assert_eq!(fixture.schema_version, 1);
    assert_eq!(
        fixture.event_schema_version,
        CELL_SPIKE_EVENT_SCHEMA_VERSION
    );
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
    let mut total_events = 0;
    for expected in fixture.batches {
        let snapshot = patch.advance_interval(duration, drive).unwrap();
        assert_eq!(snapshot.tick, expected.micro_tick);
        assert_eq!(snapshot.tick / 200, u64::from(expected.macro_tick));
        assert_eq!(snapshot.spike_events.len(), expected.cell_ids.len());
        assert!(snapshot.spike_events.len() <= MAX_CELL_SPIKE_EVENTS_PER_INTERVAL);
        assert_eq!(
            snapshot
                .spike_events
                .iter()
                .map(|event| event.cell_id)
                .collect::<Vec<_>>(),
            expected.cell_ids
        );
        assert_eq!(
            snapshot
                .spike_events
                .iter()
                .map(|event| format!("{:016x}", event.time_offset_seconds.to_bits()))
                .collect::<Vec<_>>(),
            expected.time_offset_bits_hex
        );
        assert!(snapshot.spike_events.windows(2).all(|events| {
            (events[0].time_offset_seconds, events[0].cell_id)
                <= (events[1].time_offset_seconds, events[1].cell_id)
        }));
        total_events += snapshot.spike_events.len();
    }
    assert!(total_events > 0, "the replay must exercise stamped events");
}
