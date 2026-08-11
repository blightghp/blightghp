use brain_engine::{ChemicalSignal, ChemicalTrack, Seconds, CHEMICAL_TRACK_SCHEMA_VERSION};
use serde::Serialize;

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
struct TickInput {
    excitatory_spikes: u32,
    inhibitory_spikes: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Fixture {
    schema_version: u32,
    model: &'static str,
    tick_seconds: f64,
    transmitter_order: [&'static str; 2],
    receptor_order: [&'static str; 4],
    inputs: Vec<TickInput>,
    checkpoints: Vec<Checkpoint>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Checkpoint {
    time_seconds: f64,
    solver_step_index: u64,
    release_event_indices: [u32; 2],
    presynaptic_spike_counts: [u32; 2],
    vesicle_available_fraction: [f64; 2],
    vesicle_utilization_fraction: [f64; 2],
    latest_release_moles: [f64; 2],
    latest_release_time_seconds: [f64; 2],
    total_released_moles: [f64; 2],
    cleft_moles: [f64; 2],
    cleft_concentration_moles_per_cubic_meter: [f64; 2],
    receptor_bound_moles: [f64; 4],
    receptor_occupancy_fraction: [f64; 4],
    cleared_moles: [f64; 2],
    state_hash_hex: String,
}

impl From<ChemicalSignal> for Checkpoint {
    fn from(signal: ChemicalSignal) -> Self {
        Self {
            time_seconds: signal.time_seconds,
            solver_step_index: signal.solver_step_index,
            release_event_indices: signal.release_event_indices,
            presynaptic_spike_counts: signal.presynaptic_spike_counts,
            vesicle_available_fraction: signal.vesicle_available_fraction,
            vesicle_utilization_fraction: signal.vesicle_utilization_fraction,
            latest_release_moles: signal.latest_release_moles,
            latest_release_time_seconds: signal.latest_release_time_seconds,
            total_released_moles: signal.total_released_moles,
            cleft_moles: signal.cleft_moles,
            cleft_concentration_moles_per_cubic_meter: signal
                .cleft_concentration_moles_per_cubic_meter,
            receptor_bound_moles: signal.receptor_bound_moles,
            receptor_occupancy_fraction: signal.receptor_occupancy_fraction,
            cleared_moles: signal.cleared_moles,
            state_hash_hex: format!("{:016x}", signal.state_hash),
        }
    }
}

fn main() {
    let tick_seconds = 1.0 / 60.0;
    let tick = Seconds::try_new(tick_seconds).expect("fixture tick must be valid");
    let inputs = vec![
        TickInput {
            excitatory_spikes: 0,
            inhibitory_spikes: 0,
        },
        TickInput {
            excitatory_spikes: 3,
            inhibitory_spikes: 0,
        },
        TickInput {
            excitatory_spikes: 0,
            inhibitory_spikes: 0,
        },
        TickInput {
            excitatory_spikes: 0,
            inhibitory_spikes: 2,
        },
        TickInput {
            excitatory_spikes: 1,
            inhibitory_spikes: 1,
        },
        TickInput {
            excitatory_spikes: 0,
            inhibitory_spikes: 0,
        },
    ];
    let mut track = ChemicalTrack::learning_preset();
    let checkpoints = inputs
        .iter()
        .map(|input| {
            track
                .advance_tick(tick, input.excitatory_spikes, input.inhibitory_spikes)
                .expect("fixture tick must succeed")
                .into()
        })
        .collect();
    let fixture = Fixture {
        schema_version: CHEMICAL_TRACK_SCHEMA_VERSION,
        model: "representative-synaptic-chemical-track",
        tick_seconds,
        transmitter_order: ["glutamate", "gaba"],
        receptor_order: ["ampa", "nmda", "gaba-a", "gaba-b"],
        inputs,
        checkpoints,
    };
    println!(
        "{}",
        serde_json::to_string_pretty(&fixture).expect("fixture serialization must succeed")
    );
}
