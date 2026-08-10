use brain_engine::{
    ChemicalCleftSnapshot, ChemicalSynapse, ChemicalSynapseConfig, ReceptorBindingConfig,
    ReceptorFamily, Seconds, TransmitterKind, CHEMICAL_CLEFT_SCHEMA_VERSION, RECEPTOR_FAMILY_ORDER,
    TRANSMITTER_ORDER,
};
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Fixture {
    schema_version: u32,
    model: &'static str,
    transmitter_order: Vec<&'static str>,
    receptor_family_order: Vec<&'static str>,
    config: Config,
    operations: Vec<Operation>,
    checkpoints: Vec<Checkpoint>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Config {
    cleft_volume_cubic_meters: f64,
    clearance_time_constants_seconds: Vec<f64>,
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
    Bind {
        family: &'static str,
        duration_seconds: f64,
    },
    Clear {
        transmitter: &'static str,
        duration_seconds: f64,
    },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Checkpoint {
    after_operation: u64,
    total_released_moles: [f64; 2],
    cleft_moles: [f64; 2],
    cleft_concentration_moles_per_cubic_meter: [f64; 2],
    receptor_bound_moles: [f64; 4],
    receptor_occupancy_fraction: [f64; 4],
    cleared_moles: [f64; 2],
    state_hash_hex: String,
}

fn main() {
    let config = ChemicalSynapseConfig::default();
    let operations = vec![
        Operation::Release {
            transmitter: "glutamate",
            released_moles: 4.0e-19,
        },
        Operation::Bind {
            family: "ampa",
            duration_seconds: 0.0005,
        },
        Operation::Bind {
            family: "nmda",
            duration_seconds: 0.0005,
        },
        Operation::Clear {
            transmitter: "glutamate",
            duration_seconds: 0.001,
        },
        Operation::Release {
            transmitter: "gaba",
            released_moles: 3.0e-19,
        },
        Operation::Bind {
            family: "gaba-a",
            duration_seconds: 0.001,
        },
        Operation::Bind {
            family: "gaba-b",
            duration_seconds: 0.001,
        },
        Operation::Clear {
            transmitter: "gaba",
            duration_seconds: 0.002,
        },
        Operation::Bind {
            family: "ampa",
            duration_seconds: 0.001,
        },
        Operation::Clear {
            transmitter: "glutamate",
            duration_seconds: 0.003,
        },
    ];
    let mut synapse = ChemicalSynapse::new(config);
    let mut checkpoints = Vec::new();
    for (index, operation) in operations.iter().enumerate() {
        apply_operation(&mut synapse, *operation);
        if [1, 4, 8, 10].contains(&(index + 1)) {
            checkpoints.push(checkpoint(synapse.snapshot()));
        }
    }
    let fixture = Fixture {
        schema_version: CHEMICAL_CLEFT_SCHEMA_VERSION,
        model: "local-cleft-occupancy-atomic-operators",
        transmitter_order: TRANSMITTER_ORDER
            .into_iter()
            .map(TransmitterKind::as_str)
            .collect(),
        receptor_family_order: RECEPTOR_FAMILY_ORDER
            .into_iter()
            .map(ReceptorFamily::as_str)
            .collect(),
        config: fixture_config(config),
        operations,
        checkpoints,
    };
    println!(
        "{}",
        serde_json::to_string_pretty(&fixture).expect("fixture serialization must succeed")
    );
}

fn apply_operation(synapse: &mut ChemicalSynapse, operation: Operation) {
    match operation {
        Operation::Release {
            transmitter,
            released_moles,
        } => {
            synapse
                .release_into_cleft(parse_transmitter(transmitter), released_moles)
                .expect("fixture release must succeed");
        }
        Operation::Bind {
            family,
            duration_seconds,
        } => {
            synapse
                .advance_receptor_binding(
                    parse_family(family),
                    Seconds::try_new(duration_seconds).unwrap(),
                )
                .expect("fixture binding must succeed");
        }
        Operation::Clear {
            transmitter,
            duration_seconds,
        } => {
            synapse
                .clear_transmitter(
                    parse_transmitter(transmitter),
                    Seconds::try_new(duration_seconds).unwrap(),
                )
                .expect("fixture clearance must succeed");
        }
    }
}

fn fixture_config(config: ChemicalSynapseConfig) -> Config {
    Config {
        cleft_volume_cubic_meters: config.cleft_volume_cubic_meters(),
        clearance_time_constants_seconds: TRANSMITTER_ORDER
            .map(|transmitter| config.clearance_time_constant(transmitter).get())
            .to_vec(),
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

fn checkpoint(snapshot: ChemicalCleftSnapshot) -> Checkpoint {
    Checkpoint {
        after_operation: snapshot.operation_index,
        total_released_moles: snapshot.total_released_moles,
        cleft_moles: snapshot.cleft_moles,
        cleft_concentration_moles_per_cubic_meter: snapshot
            .cleft_concentration_moles_per_cubic_meter,
        receptor_bound_moles: snapshot.receptor_bound_moles,
        receptor_occupancy_fraction: snapshot.receptor_occupancy_fraction,
        cleared_moles: snapshot.cleared_moles,
        state_hash_hex: format!("{:016x}", snapshot.state_hash),
    }
}

fn parse_transmitter(value: &str) -> TransmitterKind {
    match value {
        "glutamate" => TransmitterKind::Glutamate,
        "gaba" => TransmitterKind::Gaba,
        _ => panic!("unknown fixture transmitter"),
    }
}

fn parse_family(value: &str) -> ReceptorFamily {
    match value {
        "ampa" => ReceptorFamily::Ampa,
        "nmda" => ReceptorFamily::Nmda,
        "gaba-a" => ReceptorFamily::GabaA,
        "gaba-b" => ReceptorFamily::GabaB,
        _ => panic!("unknown fixture receptor family"),
    }
}
