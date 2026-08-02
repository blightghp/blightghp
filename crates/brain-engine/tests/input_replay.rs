use brain_engine::DeterministicInputQueue;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReplayFixture {
    schema_version: u32,
    initial_tick: u64,
    inputs: Vec<ReplayInput>,
    expected: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct ReplayInput {
    tick: u64,
    sequence: u64,
    payload: String,
}

#[test]
fn generic_input_queue_replays_the_versioned_artifact_canonically() {
    let fixture: ReplayFixture =
        serde_json::from_str(include_str!("../../../fixtures/replay/input-queue-v1.json")).unwrap();
    assert_eq!(fixture.schema_version, 1);

    let mut queue = DeterministicInputQueue::new(fixture.inputs.len()).unwrap();
    for input in fixture.inputs {
        queue
            .schedule(
                fixture.initial_tick,
                input.tick,
                input.sequence,
                input.payload,
            )
            .unwrap();
    }

    let mut observed = Vec::new();
    for tick in (fixture.initial_tick + 1)..=14 {
        observed.extend(queue.drain_tick(tick).into_iter().map(|entry| {
            format!(
                "{}:{}:{}",
                entry.address.tick, entry.address.sequence, entry.payload
            )
        }));
    }
    assert_eq!(observed, fixture.expected);
    assert!(queue.is_empty());
}
