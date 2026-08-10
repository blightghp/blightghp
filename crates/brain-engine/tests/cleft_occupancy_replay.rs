use brain_engine::{
    ChemicalCleftSnapshot, ChemicalSynapse, ChemicalSynapseConfig, ConservationTolerance,
    ReceptorBindingConfig, ReceptorFamily, Seconds, TransmitterKind, UnitFraction,
    CHEMICAL_CLEFT_SCHEMA_VERSION, RECEPTOR_FAMILY_ORDER, TRANSMITTER_ORDER,
};
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Fixture {
    schema_version: u32,
    model: String,
    transmitter_order: Vec<String>,
    receptor_family_order: Vec<String>,
    config: Config,
    operations: Vec<Operation>,
    checkpoints: Vec<Checkpoint>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Config {
    cleft_volume_cubic_meters: f64,
    clearance_time_constants_seconds: Vec<f64>,
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
    Bind {
        family: String,
        duration_seconds: f64,
    },
    Clear {
        transmitter: String,
        duration_seconds: f64,
    },
}

#[derive(Deserialize)]
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

#[test]
fn cleft_and_occupancy_replay_the_versioned_oracle_exactly() {
    let fixture: Fixture = serde_json::from_str(include_str!(
        "../../../fixtures/replay/cleft-occupancy-v1.json"
    ))
    .expect("cleft occupancy fixture must be valid");
    assert_eq!(fixture.schema_version, CHEMICAL_CLEFT_SCHEMA_VERSION);
    assert_eq!(fixture.model, "local-cleft-occupancy-atomic-operators");
    assert_eq!(
        fixture.transmitter_order,
        TRANSMITTER_ORDER
            .into_iter()
            .map(TransmitterKind::as_str)
            .collect::<Vec<_>>()
    );
    assert_eq!(
        fixture.receptor_family_order,
        RECEPTOR_FAMILY_ORDER
            .into_iter()
            .map(ReceptorFamily::as_str)
            .collect::<Vec<_>>()
    );

    let mut synapse = ChemicalSynapse::new(build_config(fixture.config));
    let mut checkpoint_index = 0;
    for operation in fixture.operations {
        apply_operation(&mut synapse, operation);
        let expected = &fixture.checkpoints[checkpoint_index];
        if synapse.snapshot().operation_index != expected.after_operation {
            continue;
        }
        assert_snapshot(synapse.snapshot(), expected);
        checkpoint_index += 1;
        if checkpoint_index == fixture.checkpoints.len() {
            break;
        }
    }
    assert_eq!(checkpoint_index, fixture.checkpoints.len());
    synapse
        .verify_mass_conserved(
            ConservationTolerance::try_new(1.0e-30, UnitFraction::try_new(1.0e-12).unwrap())
                .unwrap(),
        )
        .unwrap();
}

fn build_config(config: Config) -> ChemicalSynapseConfig {
    let clearance_time_constants = config
        .clearance_time_constants_seconds
        .into_iter()
        .map(|value| Seconds::try_new(value).unwrap())
        .collect::<Vec<_>>()
        .try_into()
        .expect("fixture must contain two clearance constants");
    let receptor_bindings = config
        .receptor_bindings
        .into_iter()
        .enumerate()
        .map(|(index, binding)| {
            assert_eq!(
                binding.family,
                RECEPTOR_FAMILY_ORDER[index].as_str(),
                "binding config order must be canonical"
            );
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
    ChemicalSynapseConfig::try_new(
        config.cleft_volume_cubic_meters,
        clearance_time_constants,
        receptor_bindings,
    )
    .unwrap()
}

fn apply_operation(synapse: &mut ChemicalSynapse, operation: Operation) {
    match operation {
        Operation::Release {
            transmitter,
            released_moles,
        } => {
            synapse
                .release_into_cleft(parse_transmitter(&transmitter), released_moles)
                .unwrap();
        }
        Operation::Bind {
            family,
            duration_seconds,
        } => {
            synapse
                .advance_receptor_binding(
                    parse_family(&family),
                    Seconds::try_new(duration_seconds).unwrap(),
                )
                .unwrap();
        }
        Operation::Clear {
            transmitter,
            duration_seconds,
        } => {
            synapse
                .clear_transmitter(
                    parse_transmitter(&transmitter),
                    Seconds::try_new(duration_seconds).unwrap(),
                )
                .unwrap();
        }
    }
}

fn assert_snapshot(actual: ChemicalCleftSnapshot, expected: &Checkpoint) {
    assert_eq!(actual.operation_index, expected.after_operation);
    assert_array_bits(actual.total_released_moles, expected.total_released_moles);
    assert_array_bits(actual.cleft_moles, expected.cleft_moles);
    assert_array_bits(
        actual.cleft_concentration_moles_per_cubic_meter,
        expected.cleft_concentration_moles_per_cubic_meter,
    );
    assert_array_bits(actual.receptor_bound_moles, expected.receptor_bound_moles);
    assert_array_bits(
        actual.receptor_occupancy_fraction,
        expected.receptor_occupancy_fraction,
    );
    assert_array_bits(actual.cleared_moles, expected.cleared_moles);
    assert_eq!(
        format!("{:016x}", actual.state_hash),
        expected.state_hash_hex
    );
}

fn assert_array_bits<const LENGTH: usize>(actual: [f64; LENGTH], expected: [f64; LENGTH]) {
    assert_eq!(actual.map(f64::to_bits), expected.map(f64::to_bits));
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
