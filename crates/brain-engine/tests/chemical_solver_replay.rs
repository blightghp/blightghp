use brain_engine::{
    ChemicalSolver, ChemicalSolverAdvance, ChemicalSolverConfig, ChemicalSolverSnapshot,
    ChemicalSynapseConfig, ConservationTolerance, ReceptorBindingConfig, Seconds, TransmitterKind,
    UnitFraction, CHEMICAL_SOLVER_SCHEMA_VERSION, RECEPTOR_FAMILY_ORDER,
};
use serde::Deserialize;

const SUBTRANSITION_ORDER: [&str; 12] = [
    "clear-glutamate-half",
    "clear-gaba-half",
    "bind-ampa-half",
    "bind-nmda-half",
    "bind-gaba-a-half",
    "bind-gaba-b-half",
    "bind-gaba-b-half",
    "bind-gaba-a-half",
    "bind-nmda-half",
    "bind-ampa-half",
    "clear-gaba-half",
    "clear-glutamate-half",
];

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Fixture {
    schema_version: u32,
    method: String,
    subtransition_order: Vec<String>,
    solver_config: SolverConfig,
    chemical_config: ChemicalConfig,
    operations: Vec<Operation>,
    checkpoints: Vec<Checkpoint>,
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(clippy::struct_field_names)]
struct SolverConfig {
    maximum_step_seconds: f64,
    maximum_dimensionless_operator_step: f64,
    maximum_substeps_per_interval: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChemicalConfig {
    cleft_volume_cubic_meters: f64,
    clearance_time_constants_seconds: [f64; 2],
    receptor_bindings: Vec<BindingConfig>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BindingConfig {
    family: String,
    site_capacity_moles: f64,
    association_rate_cubic_meters_per_mole_second: f64,
    dissociation_rate_per_second: f64,
}

#[derive(Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
enum Operation {
    Release {
        transmitter: String,
        released_moles: f64,
    },
    Advance {
        duration_seconds: f64,
    },
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Checkpoint {
    after_operation: u32,
    time_seconds: f64,
    step_index: u64,
    chemical_operation_index: u64,
    total_released_moles: [f64; 2],
    cleft_moles: [f64; 2],
    cleft_concentration_moles_per_cubic_meter: [f64; 2],
    receptor_bound_moles: [f64; 4],
    receptor_occupancy_fraction: [f64; 4],
    cleared_moles: [f64; 2],
    chemical_state_hash_hex: String,
    solver_state_hash_hex: String,
    advance: Option<AdvanceCheckpoint>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AdvanceCheckpoint {
    substeps_used: u32,
    maximum_dimensionless_operator_step_observed: f64,
}

#[test]
fn adaptive_strang_solver_replays_the_versioned_oracle_exactly() {
    let fixture: Fixture = serde_json::from_str(include_str!(
        "../../../fixtures/replay/chemical-solver-v1.json"
    ))
    .expect("chemical solver fixture must be valid");
    assert_eq!(fixture.schema_version, CHEMICAL_SOLVER_SCHEMA_VERSION);
    assert_eq!(fixture.method, "adaptive-palindromic-strang");
    assert_eq!(fixture.subtransition_order, SUBTRANSITION_ORDER);
    assert_eq!(fixture.operations.len(), fixture.checkpoints.len());

    let solver_config = build_solver_config(fixture.solver_config);
    let chemical_config = build_chemical_config(fixture.chemical_config);
    let mut solver = ChemicalSolver::new(solver_config, chemical_config);
    for (index, (operation, expected)) in fixture
        .operations
        .into_iter()
        .zip(&fixture.checkpoints)
        .enumerate()
    {
        let advance = apply_operation(&mut solver, operation);
        assert_eq!(expected.after_operation, u32::try_from(index + 1).unwrap());
        assert_checkpoint(solver.snapshot(), advance, expected);
    }
    solver
        .snapshot()
        .chemical
        .receptor_occupancy_fraction
        .into_iter()
        .for_each(|occupancy| assert!((0.0..=1.0).contains(&occupancy)));

    let tolerance =
        ConservationTolerance::try_new(1.0e-30, UnitFraction::try_new(1.0e-12).unwrap()).unwrap();
    let final_snapshot = solver.snapshot().chemical;
    let ledger_total = final_snapshot.cleft_moles.into_iter().sum::<f64>()
        + final_snapshot.receptor_bound_moles.into_iter().sum::<f64>()
        + final_snapshot.cleared_moles.into_iter().sum::<f64>();
    let released_total = final_snapshot.total_released_moles.into_iter().sum::<f64>();
    assert!((ledger_total - released_total).abs() <= tolerance.allowed_error(released_total));
}

fn build_solver_config(config: SolverConfig) -> ChemicalSolverConfig {
    ChemicalSolverConfig::try_new(
        Seconds::try_new(config.maximum_step_seconds).unwrap(),
        UnitFraction::try_new(config.maximum_dimensionless_operator_step).unwrap(),
        config.maximum_substeps_per_interval,
    )
    .unwrap()
}

fn build_chemical_config(config: ChemicalConfig) -> ChemicalSynapseConfig {
    let clearance = config
        .clearance_time_constants_seconds
        .map(|value| Seconds::try_new(value).unwrap());
    let bindings = config
        .receptor_bindings
        .into_iter()
        .enumerate()
        .map(|(index, binding)| {
            assert_eq!(binding.family, RECEPTOR_FAMILY_ORDER[index].as_str());
            ReceptorBindingConfig::try_new(
                binding.site_capacity_moles,
                binding.association_rate_cubic_meters_per_mole_second,
                binding.dissociation_rate_per_second,
            )
            .unwrap()
        })
        .collect::<Vec<_>>()
        .try_into()
        .expect("fixture must contain four receptor bindings");
    ChemicalSynapseConfig::try_new(config.cleft_volume_cubic_meters, clearance, bindings).unwrap()
}

fn apply_operation(
    solver: &mut ChemicalSolver,
    operation: Operation,
) -> Option<ChemicalSolverAdvance> {
    match operation {
        Operation::Release {
            transmitter,
            released_moles,
        } => {
            solver
                .release_into_cleft(parse_transmitter(&transmitter), released_moles)
                .unwrap();
            None
        }
        Operation::Advance { duration_seconds } => Some(
            solver
                .advance_interval(Seconds::try_new(duration_seconds).unwrap())
                .unwrap(),
        ),
    }
}

fn assert_checkpoint(
    actual: ChemicalSolverSnapshot,
    advance: Option<ChemicalSolverAdvance>,
    expected: &Checkpoint,
) {
    assert_bits(actual.time_seconds, expected.time_seconds);
    assert_eq!(actual.step_index, expected.step_index);
    assert_eq!(
        actual.chemical.operation_index,
        expected.chemical_operation_index
    );
    assert_array_bits(
        actual.chemical.total_released_moles,
        expected.total_released_moles,
    );
    assert_array_bits(actual.chemical.cleft_moles, expected.cleft_moles);
    assert_array_bits(
        actual.chemical.cleft_concentration_moles_per_cubic_meter,
        expected.cleft_concentration_moles_per_cubic_meter,
    );
    assert_array_bits(
        actual.chemical.receptor_bound_moles,
        expected.receptor_bound_moles,
    );
    assert_array_bits(
        actual.chemical.receptor_occupancy_fraction,
        expected.receptor_occupancy_fraction,
    );
    assert_array_bits(actual.chemical.cleared_moles, expected.cleared_moles);
    assert_eq!(
        format!("{:016x}", actual.chemical.state_hash),
        expected.chemical_state_hash_hex
    );
    assert_eq!(
        format!("{:016x}", actual.state_hash),
        expected.solver_state_hash_hex
    );
    match (advance, &expected.advance) {
        (None, None) => {}
        (Some(report), Some(expected_report)) => {
            assert_eq!(report.substeps_used, expected_report.substeps_used);
            assert_bits(
                report.maximum_dimensionless_operator_step_observed,
                expected_report.maximum_dimensionless_operator_step_observed,
            );
        }
        _ => panic!("advance report presence differs from fixture"),
    }
}

fn assert_array_bits<const LENGTH: usize>(actual: [f64; LENGTH], expected: [f64; LENGTH]) {
    assert_eq!(actual.map(f64::to_bits), expected.map(f64::to_bits));
}

fn assert_bits(actual: f64, expected: f64) {
    assert_eq!(actual.to_bits(), expected.to_bits());
}

fn parse_transmitter(value: &str) -> TransmitterKind {
    match value {
        "glutamate" => TransmitterKind::Glutamate,
        "gaba" => TransmitterKind::Gaba,
        _ => panic!("unknown fixture transmitter"),
    }
}
