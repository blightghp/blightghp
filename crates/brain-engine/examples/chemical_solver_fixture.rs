use brain_engine::{
    ChemicalSolver, ChemicalSolverAdvance, ChemicalSolverConfig, ChemicalSolverSnapshot,
    ChemicalSynapseConfig, ReceptorBindingConfig, ReceptorFamily, Seconds, TransmitterKind,
    CHEMICAL_SOLVER_SCHEMA_VERSION, RECEPTOR_FAMILY_ORDER, TRANSMITTER_ORDER,
};
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Fixture {
    schema_version: u32,
    method: &'static str,
    subtransition_order: [&'static str; 12],
    solver_config: SolverConfig,
    chemical_config: ChemicalConfig,
    operations: Vec<Operation>,
    checkpoints: Vec<Checkpoint>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
#[allow(clippy::struct_field_names)]
struct SolverConfig {
    maximum_step_seconds: f64,
    maximum_dimensionless_operator_step: f64,
    maximum_substeps_per_interval: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ChemicalConfig {
    cleft_volume_cubic_meters: f64,
    clearance_time_constants_seconds: [f64; 2],
    receptor_bindings: Vec<BindingConfig>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BindingConfig {
    family: &'static str,
    site_capacity_moles: f64,
    association_rate_cubic_meters_per_mole_second: f64,
    dissociation_rate_per_second: f64,
}

#[derive(Clone, Copy, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
enum Operation {
    Release {
        transmitter: &'static str,
        released_moles: f64,
    },
    Advance {
        duration_seconds: f64,
    },
}

#[derive(Serialize)]
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AdvanceCheckpoint {
    substeps_used: u32,
    maximum_dimensionless_operator_step_observed: f64,
}

fn main() {
    let solver_config = ChemicalSolverConfig::default();
    let chemical_config = ChemicalSynapseConfig::default();
    let operations = vec![
        Operation::Release {
            transmitter: "glutamate",
            released_moles: 4.0e-19,
        },
        Operation::Advance {
            duration_seconds: 0.001,
        },
        Operation::Release {
            transmitter: "gaba",
            released_moles: 3.0e-19,
        },
        Operation::Advance {
            duration_seconds: 0.002,
        },
        Operation::Advance {
            duration_seconds: 0.005,
        },
    ];
    let mut solver = ChemicalSolver::new(solver_config, chemical_config);
    let checkpoints = operations
        .iter()
        .enumerate()
        .map(|(index, operation)| {
            let advance = apply_operation(&mut solver, *operation);
            checkpoint(index + 1, solver.snapshot(), advance)
        })
        .collect();
    let fixture = Fixture {
        schema_version: CHEMICAL_SOLVER_SCHEMA_VERSION,
        method: "adaptive-palindromic-strang",
        subtransition_order: [
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
        ],
        solver_config: fixture_solver_config(solver_config),
        chemical_config: fixture_chemical_config(chemical_config),
        operations,
        checkpoints,
    };
    println!(
        "{}",
        serde_json::to_string_pretty(&fixture).expect("fixture serialization must succeed")
    );
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
                .release_into_cleft(parse_transmitter(transmitter), released_moles)
                .expect("fixture release must succeed");
            None
        }
        Operation::Advance { duration_seconds } => Some(
            solver
                .advance_interval(Seconds::try_new(duration_seconds).unwrap())
                .expect("fixture advance must succeed"),
        ),
    }
}

fn checkpoint(
    after_operation: usize,
    snapshot: ChemicalSolverSnapshot,
    advance: Option<ChemicalSolverAdvance>,
) -> Checkpoint {
    let chemical = snapshot.chemical;
    Checkpoint {
        after_operation: u32::try_from(after_operation).expect("fixture operation must fit u32"),
        time_seconds: snapshot.time_seconds,
        step_index: snapshot.step_index,
        chemical_operation_index: chemical.operation_index,
        total_released_moles: chemical.total_released_moles,
        cleft_moles: chemical.cleft_moles,
        cleft_concentration_moles_per_cubic_meter: chemical
            .cleft_concentration_moles_per_cubic_meter,
        receptor_bound_moles: chemical.receptor_bound_moles,
        receptor_occupancy_fraction: chemical.receptor_occupancy_fraction,
        cleared_moles: chemical.cleared_moles,
        chemical_state_hash_hex: format!("{:016x}", chemical.state_hash),
        solver_state_hash_hex: format!("{:016x}", snapshot.state_hash),
        advance: advance.map(|report| AdvanceCheckpoint {
            substeps_used: report.substeps_used,
            maximum_dimensionless_operator_step_observed: report
                .maximum_dimensionless_operator_step_observed,
        }),
    }
}

fn fixture_solver_config(config: ChemicalSolverConfig) -> SolverConfig {
    SolverConfig {
        maximum_step_seconds: config.maximum_step().get(),
        maximum_dimensionless_operator_step: config.maximum_dimensionless_operator_step().get(),
        maximum_substeps_per_interval: config.maximum_substeps_per_interval(),
    }
}

fn fixture_chemical_config(config: ChemicalSynapseConfig) -> ChemicalConfig {
    ChemicalConfig {
        cleft_volume_cubic_meters: config.cleft_volume_cubic_meters(),
        clearance_time_constants_seconds: TRANSMITTER_ORDER
            .map(|transmitter| config.clearance_time_constant(transmitter).get()),
        receptor_bindings: RECEPTOR_FAMILY_ORDER
            .into_iter()
            .map(|family| binding_config(family, config.receptor_binding(family)))
            .collect(),
    }
}

fn binding_config(family: ReceptorFamily, binding: ReceptorBindingConfig) -> BindingConfig {
    BindingConfig {
        family: family.as_str(),
        site_capacity_moles: binding.site_capacity_moles(),
        association_rate_cubic_meters_per_mole_second: binding
            .association_rate_cubic_meters_per_mole_second(),
        dissociation_rate_per_second: binding.dissociation_rate_per_second(),
    }
}

fn parse_transmitter(value: &str) -> TransmitterKind {
    match value {
        "glutamate" => TransmitterKind::Glutamate,
        "gaba" => TransmitterKind::Gaba,
        _ => panic!("unknown fixture transmitter"),
    }
}
