use brain_engine::{
    mean_absolute_weight, project_spikes_to_field, FieldConfig, FieldTopology, NeuralSimulation,
    NeuralStimulus, NeuronKind, PopulationField, PopulationFiringRate, Seconds, SimulationConfig,
    SimulationSynapse,
};
use serde::Deserialize;

const FIXTURE: &str = include_str!("../../../fixtures/parity/field-observables-v1.json");

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Fixture {
    schema_version: u32,
    input: Input,
    expected: Expected,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Input {
    topology: TopologyFixture,
    neuron_kinds: Vec<String>,
    config: ConfigFixture,
    projection_spikes: Vec<u8>,
    field_steps: Vec<Vec<usize>>,
    observable: ObservableFixture,
    simulation: SimulationFixture,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TopologyFixture {
    node_indices: Vec<u32>,
    vertex_by_node: Vec<i32>,
    row_offsets: Vec<u32>,
    neighbors: Vec<u32>,
    edge_lengths: Vec<f32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConfigFixture {
    dt_seconds: f64,
    tau_e_seconds: f64,
    tau_i_seconds: f64,
    propagation_e_per_second: f64,
    propagation_i_per_second: f64,
    coupling_gain: f64,
    conduction_speed_units_per_second: f64,
    spatial_kernel_scale: f64,
    excitatory_spike_impulse: f64,
    inhibitory_spike_impulse: f64,
    max_activity: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ObservableFixture {
    weights: Vec<f64>,
    population_size: u32,
    dt_seconds: f64,
    window_seconds: f64,
    spike_samples: Vec<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SimulationFixture {
    seed: u32,
    node_z: Vec<f64>,
    groups: GroupsFixture,
    synapses: Vec<SimulationSynapseFixture>,
    advances: Vec<AdvanceFixture>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GroupsFixture {
    left_hemi: Vec<u32>,
    right_hemi: Vec<u32>,
}

#[derive(Debug, Deserialize)]
struct SimulationSynapseFixture {
    from: u32,
    to: u32,
    weight: f32,
    delay: f64,
    plastic: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AdvanceFixture {
    target_tick: u64,
    intensity: f64,
    confidence: f64,
    learning_rate: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Expected {
    projected_excitatory: Vec<f32>,
    projected_inhibitory: Vec<f32>,
    field_snapshots: Vec<SnapshotFixture>,
    mean_absolute_weight: f64,
    firing_rates: Vec<f64>,
    simulation_snapshots: Vec<SimulationSnapshotFixture>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SnapshotFixture {
    excitatory: Vec<f32>,
    inhibitory: Vec<f32>,
    wave_activity: Vec<f32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SimulationSnapshotFixture {
    tick: u64,
    firing_rate: f64,
    spikes: u32,
    mean_weight: f64,
    potentials: Vec<f32>,
    activations: Vec<f32>,
    weights: Vec<f32>,
    signal_synapse_ids: Vec<u32>,
    signal_progress: Vec<f32>,
    signal_strength: Vec<f32>,
    signal_inhibitory: Vec<u8>,
    field_excitatory: Vec<f32>,
    field_inhibitory: Vec<f32>,
    hash: String,
}

fn fixture() -> Fixture {
    serde_json::from_str(FIXTURE).expect("field parity fixture must be valid")
}

fn topology(value: TopologyFixture) -> FieldTopology {
    FieldTopology {
        node_indices: value.node_indices,
        vertex_by_node: value.vertex_by_node,
        row_offsets: value.row_offsets,
        neighbors: value.neighbors,
        edge_lengths: value.edge_lengths,
    }
}

fn config(value: &ConfigFixture) -> FieldConfig {
    FieldConfig {
        dt: Seconds::try_new(value.dt_seconds).unwrap(),
        tau_excitatory: Seconds::try_new(value.tau_e_seconds).unwrap(),
        tau_inhibitory: Seconds::try_new(value.tau_i_seconds).unwrap(),
        propagation_excitatory_per_second: value.propagation_e_per_second,
        propagation_inhibitory_per_second: value.propagation_i_per_second,
        coupling_gain: value.coupling_gain,
        conduction_speed_units_per_second: value.conduction_speed_units_per_second,
        spatial_kernel_scale: value.spatial_kernel_scale,
        excitatory_spike_impulse: value.excitatory_spike_impulse,
        inhibitory_spike_impulse: value.inhibitory_spike_impulse,
        max_activity: value.max_activity,
    }
}

fn neuron_kinds(values: &[String]) -> Vec<NeuronKind> {
    values
        .iter()
        .map(|value| match value.as_str() {
            "excitatory" => NeuronKind::Excitatory,
            "inhibitory" => NeuronKind::Inhibitory,
            other => panic!("unknown neuron kind: {other}"),
        })
        .collect()
}

fn assert_f32_vectors_close(actual: &[f32], expected: &[f32]) {
    assert_eq!(actual.len(), expected.len());
    for (index, (&actual, &expected)) in actual.iter().zip(expected).enumerate() {
        assert!(
            (actual - expected).abs() <= 2.0e-7,
            "index {index}: {actual} != {expected}"
        );
    }
}

#[test]
fn rust_field_matches_the_typescript_oracle_fixture() {
    let fixture = fixture();
    assert_eq!(fixture.schema_version, 1);
    let topology = topology(fixture.input.topology);
    let kinds = neuron_kinds(&fixture.input.neuron_kinds);
    let config = config(&fixture.input.config);

    let projection = project_spikes_to_field(
        &topology,
        &fixture.input.projection_spikes,
        &kinds,
        config.excitatory_spike_impulse,
        config.inhibitory_spike_impulse,
    )
    .unwrap();
    assert_f32_vectors_close(
        &projection.excitatory,
        &fixture.expected.projected_excitatory,
    );
    assert_f32_vectors_close(
        &projection.inhibitory,
        &fixture.expected.projected_inhibitory,
    );

    let node_count = kinds.len();
    let mut field = PopulationField::new(topology, config).unwrap();
    for (step, spiking_nodes) in fixture.input.field_steps.iter().enumerate() {
        let mut spikes = vec![0_u8; node_count];
        for &node in spiking_nodes {
            spikes[node] = 1;
        }
        field.step(&spikes, &kinds, config.dt).unwrap();
        let expected = &fixture.expected.field_snapshots[step];
        assert_f32_vectors_close(field.excitatory(), &expected.excitatory);
        assert_f32_vectors_close(field.inhibitory(), &expected.inhibitory);
        assert_f32_vectors_close(field.wave_activity(), &expected.wave_activity);
    }
}

#[test]
fn rust_observables_match_the_typescript_oracle_fixture() {
    let fixture = fixture();
    let observable = fixture.input.observable;
    assert!(
        (mean_absolute_weight(&observable.weights) - fixture.expected.mean_absolute_weight).abs()
            <= f64::EPSILON
    );

    let mut rate = PopulationFiringRate::new(
        observable.population_size,
        Seconds::try_new(observable.dt_seconds).unwrap(),
        Seconds::try_new(observable.window_seconds).unwrap(),
    )
    .unwrap();
    for (spikes, expected) in observable
        .spike_samples
        .into_iter()
        .zip(fixture.expected.firing_rates)
    {
        assert!((rate.sample(spikes) - expected).abs() <= 1.0e-12);
    }
}

#[test]
fn complete_rust_simulation_matches_the_typescript_replay() {
    let fixture = fixture();
    let kinds = neuron_kinds(&fixture.input.neuron_kinds);
    let field_topology = topology(fixture.input.topology);
    let simulation_fixture = fixture.input.simulation;
    let mut cortical_nodes = simulation_fixture.groups.left_hemi;
    cortical_nodes.extend(simulation_fixture.groups.right_hemi);
    let synapses = simulation_fixture
        .synapses
        .into_iter()
        .map(|synapse| SimulationSynapse {
            from: synapse.from,
            to: synapse.to,
            weight: synapse.weight,
            delay_seconds: synapse.delay,
            plastic: synapse.plastic,
        })
        .collect();
    let mut simulation = NeuralSimulation::new(SimulationConfig {
        seed: simulation_fixture.seed,
        fixed_step: Seconds::try_new(fixture.input.config.dt_seconds).unwrap(),
        neuron_kinds: kinds,
        synapses,
        cortical_nodes,
        node_z: simulation_fixture.node_z,
        field_topology,
    })
    .unwrap();
    let mut previous_corticothalamic_hash = simulation.snapshot().corticothalamic.state_hash;
    let mut previous_cell_patch_hash = simulation.snapshot().cell_patch.state_hash;
    let mut previous_chemical_hash = simulation.snapshot().chemical.state_hash;

    for (advance, expected) in simulation_fixture
        .advances
        .into_iter()
        .zip(fixture.expected.simulation_snapshots)
    {
        simulation.set_plasticity(advance.learning_rate).unwrap();
        let snapshot = simulation
            .advance_to(
                advance.target_tick,
                NeuralStimulus {
                    intensity: advance.intensity,
                    confidence: advance.confidence,
                },
            )
            .unwrap();
        assert_eq!(snapshot.tick, expected.tick);
        assert_eq!(snapshot.schema_version, 6);
        assert_eq!(snapshot.spikes, expected.spikes);
        assert!((snapshot.firing_rate - expected.firing_rate).abs() <= 1.0e-12);
        assert!((snapshot.mean_weight - expected.mean_weight).abs() <= 1.0e-12);
        assert_f32_vectors_close(&snapshot.potentials, &expected.potentials);
        assert_f32_vectors_close(&snapshot.activations, &expected.activations);
        assert_f32_vectors_close(&snapshot.weights, &expected.weights);
        assert_eq!(snapshot.signals.synapse_ids, expected.signal_synapse_ids);
        assert_f32_vectors_close(&snapshot.signals.progress, &expected.signal_progress);
        assert_f32_vectors_close(&snapshot.signals.strength, &expected.signal_strength);
        assert_eq!(snapshot.signals.inhibitory, expected.signal_inhibitory);
        assert_f32_vectors_close(&snapshot.field.excitatory, &expected.field_excitatory);
        assert_f32_vectors_close(&snapshot.field.inhibitory, &expected.field_inhibitory);
        assert_eq!(snapshot.cell_patch.field_vertex, 0);
        assert_eq!(snapshot.cell_patch.blend.to_bits(), 1.0_f32.to_bits());
        assert!(
            (snapshot.chemical.time_seconds - snapshot.time_seconds).abs() <= 4.0e-15,
            "chemical and macro clocks must remain within four femtoseconds"
        );
        assert!(snapshot
            .chemical
            .vesicle_available_fraction
            .into_iter()
            .chain(snapshot.chemical.vesicle_utilization_fraction)
            .chain(snapshot.chemical.receptor_occupancy_fraction)
            .all(|value| value.is_finite() && (0.0..=1.0).contains(&value)));
        assert!(
            (f64::from(snapshot.field.wave_activity[0])
                - (snapshot.cell_patch.firing_rate_hz / 100.0).clamp(0.0, 1.0))
            .abs()
                <= f64::from(f32::EPSILON),
            "the microscopic patch must substitute, not add to, its field vertex"
        );
        assert_eq!(
            snapshot.state_hash,
            u64::from_str_radix(&expected.hash, 16).unwrap()
        );
        assert!(snapshot
            .corticothalamic
            .excitatory
            .into_iter()
            .chain(snapshot.corticothalamic.inhibitory)
            .all(|value| value.is_finite() && (0.0..=1.0).contains(&value)));
        assert_ne!(
            snapshot.corticothalamic.state_hash,
            previous_corticothalamic_hash
        );
        previous_corticothalamic_hash = snapshot.corticothalamic.state_hash;
        assert_ne!(snapshot.cell_patch.state_hash, previous_cell_patch_hash);
        previous_cell_patch_hash = snapshot.cell_patch.state_hash;
        assert_ne!(snapshot.chemical.state_hash, previous_chemical_hash);
        previous_chemical_hash = snapshot.chemical.state_hash;
    }
}

#[test]
fn field_rejects_invalid_boundaries_and_reset_clears_history() {
    let fixture = fixture();
    let topology = topology(fixture.input.topology);
    let kinds = neuron_kinds(&fixture.input.neuron_kinds);
    let config = config(&fixture.input.config);
    let mut field = PopulationField::new(topology, config).unwrap();

    assert!(field.step(&[0, 0], &kinds, config.dt).is_err());
    let mut spikes = vec![0; kinds.len()];
    spikes[0] = 1;
    field.step(&spikes, &kinds, config.dt).unwrap();
    field.reset();
    for _ in 0..8 {
        field
            .step(&vec![0; kinds.len()], &kinds, config.dt)
            .unwrap();
    }
    assert!(field.excitatory().iter().all(|value| *value == 0.0));
    assert!(field.inhibitory().iter().all(|value| *value == 0.0));
}

#[test]
fn finer_field_step_reduces_error_against_reference() {
    fn run(dt: f64, steps: usize) -> Vec<f32> {
        let topology = FieldTopology {
            node_indices: vec![0],
            vertex_by_node: vec![0],
            row_offsets: vec![0, 1],
            neighbors: vec![0],
            edge_lengths: vec![0.0],
        };
        let config = FieldConfig {
            dt: Seconds::try_new(dt).unwrap(),
            tau_excitatory: Seconds::try_new(0.08).unwrap(),
            propagation_excitatory_per_second: 1.4,
            ..FieldConfig::default()
        };
        let mut field = PopulationField::new(topology, config).unwrap();
        field.set_activity(0, 1.0, 0.0).unwrap();
        for _ in 0..steps {
            field
                .step(&[0], &[NeuronKind::Excitatory], config.dt)
                .unwrap();
        }
        field.excitatory().to_vec()
    }

    fn error(candidate: &[f32], reference: &[f32]) -> f64 {
        candidate
            .iter()
            .zip(reference)
            .map(|(&candidate, &reference)| f64::from((candidate - reference).abs()))
            .sum()
    }

    let coarse = run(1.0 / 60.0, 12);
    let medium = run(1.0 / 120.0, 24);
    let reference = run(1.0 / 480.0, 96);
    assert!(error(&medium, &reference) < error(&coarse, &reference));
}
