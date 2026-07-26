use brain_engine::{random_u32, FixedStepClock, Seconds, SynapseCsr, SynapseEndpoint};
use serde::Deserialize;

const FIXTURE: &str = include_str!("../../../fixtures/parity/discrete-v1.json");

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ParityFixture {
    schema_version: u32,
    random_vectors: Vec<RandomVector>,
    clock_vectors: Vec<ClockVector>,
    csr_vector: CsrVector,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RandomVector {
    seed: u32,
    stream: u32,
    entity_id: u32,
    tick: u64,
    event_ordinal: u32,
    expected: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClockVector {
    step_seconds: f64,
    chunks_seconds: Vec<f64>,
    expected_tick: u64,
    expected_alpha: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CsrVector {
    node_count: u32,
    synapses: Vec<EndpointFixture>,
    outgoing_offsets: Vec<u32>,
    outgoing_synapse_ids: Vec<u32>,
    incoming_offsets: Vec<u32>,
    incoming_synapse_ids: Vec<u32>,
}

#[derive(Debug, Deserialize)]
struct EndpointFixture {
    from: u32,
    to: u32,
}

fn fixture() -> ParityFixture {
    serde_json::from_str(FIXTURE).expect("discrete parity fixture must be valid")
}

#[test]
fn rust_rng_matches_the_shared_typescript_vectors_exactly() {
    let fixture = fixture();
    assert_eq!(fixture.schema_version, 1);
    for vector in fixture.random_vectors {
        assert_eq!(
            random_u32(
                vector.seed,
                vector.stream,
                vector.entity_id,
                vector.tick,
                vector.event_ordinal,
            ),
            vector.expected
        );
    }
}

#[test]
fn rust_clock_matches_the_shared_typescript_vectors() {
    for vector in fixture().clock_vectors {
        let step = Seconds::try_new(vector.step_seconds).unwrap();
        let mut clock = FixedStepClock::new(step, Seconds::try_new(0.1).unwrap());
        for chunk in vector.chunks_seconds {
            clock.advance_exact(chunk, 1.0).unwrap();
        }
        assert_eq!(clock.target_tick().get(), vector.expected_tick);
        assert!(
            (clock.interpolation_alpha() - vector.expected_alpha).abs() <= 1.0e-12,
            "unexpected interpolation alpha for step {}",
            vector.step_seconds
        );
    }
}

#[test]
fn rust_csr_matches_the_shared_typescript_vector_exactly() {
    let vector = fixture().csr_vector;
    let endpoints = vector
        .synapses
        .into_iter()
        .map(|endpoint| SynapseEndpoint {
            from: endpoint.from,
            to: endpoint.to,
        })
        .collect::<Vec<_>>();
    let csr = SynapseCsr::build(vector.node_count, &endpoints).unwrap();

    assert_eq!(csr.outgoing_offsets, vector.outgoing_offsets);
    assert_eq!(csr.outgoing_synapse_ids, vector.outgoing_synapse_ids);
    assert_eq!(csr.incoming_offsets, vector.incoming_offsets);
    assert_eq!(csr.incoming_synapse_ids, vector.incoming_synapse_ids);
}

#[test]
fn clock_and_csr_reject_invalid_boundaries() {
    let mut clock = FixedStepClock::new(
        Seconds::try_new(0.01).unwrap(),
        Seconds::try_new(0.1).unwrap(),
    );
    assert!(clock.observe(f64::NAN, 1.0).is_err());
    assert!(clock.advance_exact(-1.0, 1.0).is_err());

    let invalid = [SynapseEndpoint { from: 0, to: 2 }];
    assert!(SynapseCsr::build(2, &invalid).is_err());
}
