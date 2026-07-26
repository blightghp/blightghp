use core::fmt;

use crate::Seconds;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum NeuronKind {
    Excitatory,
    Inhibitory,
}

#[derive(Clone, Debug, PartialEq)]
pub struct FieldTopology {
    pub node_indices: Vec<u32>,
    pub vertex_by_node: Vec<i32>,
    pub row_offsets: Vec<u32>,
    pub neighbors: Vec<u32>,
    pub edge_lengths: Vec<f32>,
}

impl FieldTopology {
    /// Validates buffer sizes, CSR offsets, neighbor IDs and node projection.
    ///
    /// # Errors
    ///
    /// Returns [`FieldError`] when the topology does not form a complete,
    /// bounded CSR graph.
    pub fn validate(&self) -> Result<(), FieldError> {
        let vertex_count = self.node_indices.len();
        if self.row_offsets.len() != vertex_count + 1 {
            return Err(FieldError::InvalidTopology(
                "row_offsets must contain vertex_count + 1 entries",
            ));
        }
        if self.neighbors.len() != self.edge_lengths.len() {
            return Err(FieldError::InvalidTopology(
                "neighbors and edge_lengths must have equal length",
            ));
        }
        if self.row_offsets.first().copied() != Some(0) {
            return Err(FieldError::InvalidTopology(
                "the first row offset must be zero",
            ));
        }
        let edge_count = u32::try_from(self.neighbors.len())
            .map_err(|_| FieldError::InvalidTopology("edge count exceeds u32"))?;
        if self.row_offsets.last().copied() != Some(edge_count) {
            return Err(FieldError::InvalidTopology(
                "the final row offset must equal edge count",
            ));
        }
        if self
            .row_offsets
            .windows(2)
            .any(|offsets| offsets[0] > offsets[1])
        {
            return Err(FieldError::InvalidTopology("row offsets must be monotonic"));
        }
        let vertex_count_u32 = u32::try_from(vertex_count)
            .map_err(|_| FieldError::InvalidTopology("vertex count exceeds u32"))?;
        if self
            .neighbors
            .iter()
            .any(|&neighbor| neighbor >= vertex_count_u32)
        {
            return Err(FieldError::InvalidTopology(
                "neighbor index exceeds vertex count",
            ));
        }
        if self
            .edge_lengths
            .iter()
            .any(|length| !length.is_finite() || *length < 0.0)
        {
            return Err(FieldError::InvalidTopology(
                "edge lengths must be finite and non-negative",
            ));
        }
        if self.node_indices.iter().any(|&node| {
            usize::try_from(node).map_or(true, |index| index >= self.vertex_by_node.len())
        }) {
            return Err(FieldError::InvalidTopology(
                "surface node index exceeds vertex projection",
            ));
        }
        for (vertex, &node) in self.node_indices.iter().enumerate() {
            let node = usize::try_from(node)
                .map_err(|_| FieldError::InvalidTopology("node index exceeds usize"))?;
            let expected = i32::try_from(vertex)
                .map_err(|_| FieldError::InvalidTopology("vertex count exceeds i32"))?;
            if self.vertex_by_node[node] != expected {
                return Err(FieldError::InvalidTopology(
                    "surface node projection must point back to its vertex",
                ));
            }
        }
        if self.vertex_by_node.iter().any(|&vertex| {
            vertex < -1 || usize::try_from(vertex).is_ok_and(|index| index >= vertex_count)
        }) {
            return Err(FieldError::InvalidTopology(
                "node projection exceeds vertex count",
            ));
        }
        Ok(())
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct FieldConfig {
    pub dt: Seconds,
    pub tau_excitatory: Seconds,
    pub tau_inhibitory: Seconds,
    pub propagation_excitatory_per_second: f64,
    pub propagation_inhibitory_per_second: f64,
    pub coupling_gain: f64,
    pub conduction_speed_units_per_second: f64,
    pub spatial_kernel_scale: f64,
    pub excitatory_spike_impulse: f64,
    pub inhibitory_spike_impulse: f64,
    pub max_activity: f64,
}

impl Default for FieldConfig {
    fn default() -> Self {
        Self {
            dt: Seconds::try_new(1.0 / 60.0).expect("default field dt must be valid"),
            tau_excitatory: Seconds::try_new(0.016).expect("default field tau must be valid"),
            tau_inhibitory: Seconds::try_new(0.024).expect("default field tau must be valid"),
            propagation_excitatory_per_second: 1.8,
            propagation_inhibitory_per_second: 1.2,
            coupling_gain: 0.08,
            conduction_speed_units_per_second: 1.6,
            spatial_kernel_scale: 0.22,
            excitatory_spike_impulse: 0.45,
            inhibitory_spike_impulse: 0.55,
            max_activity: 2.5,
        }
    }
}

impl FieldConfig {
    /// Validates dimensionless gains and spatial quantities.
    ///
    /// # Errors
    ///
    /// Returns [`FieldError`] for negative, zero or non-finite parameters.
    pub fn validate(&self) -> Result<(), FieldError> {
        validate_non_negative(
            "propagation_excitatory_per_second",
            self.propagation_excitatory_per_second,
        )?;
        validate_non_negative(
            "propagation_inhibitory_per_second",
            self.propagation_inhibitory_per_second,
        )?;
        validate_non_negative("coupling_gain", self.coupling_gain)?;
        validate_positive(
            "conduction_speed_units_per_second",
            self.conduction_speed_units_per_second,
        )?;
        validate_positive("spatial_kernel_scale", self.spatial_kernel_scale)?;
        validate_positive("excitatory_spike_impulse", self.excitatory_spike_impulse)?;
        validate_positive("inhibitory_spike_impulse", self.inhibitory_spike_impulse)?;
        validate_positive("max_activity", self.max_activity)
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct ProjectedSpikeDrive {
    pub excitatory: Vec<f32>,
    pub inhibitory: Vec<f32>,
}

/// Aggregates each projected cortical spike exactly once.
///
/// # Errors
///
/// Returns [`FieldError`] when node buffers differ in length, topology is
/// invalid or an impulse is not positive and finite.
pub fn project_spikes_to_field(
    topology: &FieldTopology,
    spiked: &[u8],
    neuron_kinds: &[NeuronKind],
    excitatory_impulse: f64,
    inhibitory_impulse: f64,
) -> Result<ProjectedSpikeDrive, FieldError> {
    topology.validate()?;
    if spiked.len() != topology.vertex_by_node.len() || neuron_kinds.len() != spiked.len() {
        return Err(FieldError::MismatchedNodeBuffers);
    }
    validate_positive("excitatory_impulse", excitatory_impulse)?;
    validate_positive("inhibitory_impulse", inhibitory_impulse)?;

    Ok(project_spikes_validated(
        topology,
        spiked,
        neuron_kinds,
        excitatory_impulse,
        inhibitory_impulse,
    ))
}

fn project_spikes_validated(
    topology: &FieldTopology,
    spiked: &[u8],
    neuron_kinds: &[NeuronKind],
    excitatory_impulse: f64,
    inhibitory_impulse: f64,
) -> ProjectedSpikeDrive {
    let mut excitatory = vec![0.0_f32; topology.node_indices.len()];
    let mut inhibitory = vec![0.0_f32; topology.node_indices.len()];
    for (node, &did_spike) in spiked.iter().enumerate() {
        if did_spike == 0 {
            continue;
        }
        let vertex = topology.vertex_by_node[node];
        let Ok(vertex) = usize::try_from(vertex) else {
            continue;
        };
        let target = match neuron_kinds[node] {
            NeuronKind::Excitatory => &mut excitatory,
            NeuronKind::Inhibitory => &mut inhibitory,
        };
        let impulse = match neuron_kinds[node] {
            NeuronKind::Excitatory => excitatory_impulse,
            NeuronKind::Inhibitory => inhibitory_impulse,
        };
        target[vertex] = quantize_f32(f64::from(target[vertex]) + impulse);
    }
    ProjectedSpikeDrive {
        excitatory,
        inhibitory,
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct FieldSnapshot {
    pub node_indices: Vec<u32>,
    pub excitatory: Vec<f32>,
    pub inhibitory: Vec<f32>,
    pub wave_activity: Vec<f32>,
}

#[derive(Clone, Debug)]
pub struct PopulationField {
    topology: FieldTopology,
    config: FieldConfig,
    neighbor_weights: Vec<f32>,
    conduction_delay_steps: Vec<u16>,
    history_excitatory: Vec<f32>,
    history_inhibitory: Vec<f32>,
    history_length: usize,
    history_cursor: usize,
    excitatory: Vec<f32>,
    inhibitory: Vec<f32>,
    wave_activity: Vec<f32>,
    next_excitatory: Vec<f32>,
    next_inhibitory: Vec<f32>,
}

impl PopulationField {
    /// Creates a delayed graph-kernel E/I field.
    ///
    /// # Errors
    ///
    /// Returns [`FieldError`] for an invalid topology, configuration or delay
    /// beyond the `u16` protocol.
    pub fn new(topology: FieldTopology, config: FieldConfig) -> Result<Self, FieldError> {
        topology.validate()?;
        config.validate()?;
        let vertex_count = topology.node_indices.len();
        let mut neighbor_weights = vec![0.0_f32; topology.neighbors.len()];
        let mut conduction_delay_steps = vec![0_u16; topology.neighbors.len()];
        let mut maximum_delay = 1_u16;

        for vertex in 0..vertex_count {
            let start = offset(&topology.row_offsets, vertex)?;
            let end = offset(&topology.row_offsets, vertex + 1)?;
            let mut weight_sum = 0.0_f64;
            for edge in start..end {
                let length = f64::from(topology.edge_lengths[edge]);
                let weight = (-length / config.spatial_kernel_scale).exp();
                neighbor_weights[edge] = quantize_f32(weight);
                weight_sum += weight;
                let raw_delay =
                    length / (config.conduction_speed_units_per_second * config.dt.get());
                let delay = raw_delay.round().max(1.0);
                if delay > f64::from(u16::MAX) {
                    return Err(FieldError::DelayOverflow);
                }
                #[expect(
                    clippy::cast_possible_truncation,
                    clippy::cast_sign_loss,
                    reason = "delay was checked within the positive u16 range"
                )]
                let delay = delay as u16;
                conduction_delay_steps[edge] = delay;
                maximum_delay = maximum_delay.max(delay);
            }
            if weight_sum > 0.0 {
                for weight in &mut neighbor_weights[start..end] {
                    *weight = quantize_f32(f64::from(*weight) / weight_sum);
                }
            }
        }

        let history_length = usize::from(maximum_delay) + 1;
        let history_size = history_length
            .checked_mul(vertex_count)
            .ok_or(FieldError::AllocationOverflow)?;
        Ok(Self {
            topology,
            config,
            neighbor_weights,
            conduction_delay_steps,
            history_excitatory: vec![0.0; history_size],
            history_inhibitory: vec![0.0; history_size],
            history_length,
            history_cursor: 0,
            excitatory: vec![0.0; vertex_count],
            inhibitory: vec![0.0; vertex_count],
            wave_activity: vec![0.0; vertex_count],
            next_excitatory: vec![0.0; vertex_count],
            next_inhibitory: vec![0.0; vertex_count],
        })
    }

    /// Advances exactly one fixed field tick.
    ///
    /// # Errors
    ///
    /// Returns [`FieldError`] for mismatched node buffers or a variable step.
    pub fn step(
        &mut self,
        spiked: &[u8],
        neuron_kinds: &[NeuronKind],
        dt: Seconds,
    ) -> Result<(), FieldError> {
        if (dt.get() - self.config.dt.get()).abs() > f64::EPSILON * 8.0 {
            return Err(FieldError::VariableTimeStep);
        }
        if spiked.len() != self.topology.vertex_by_node.len() || neuron_kinds.len() != spiked.len()
        {
            return Err(FieldError::MismatchedNodeBuffers);
        }
        let drive = project_spikes_validated(
            &self.topology,
            spiked,
            neuron_kinds,
            self.config.excitatory_spike_impulse,
            self.config.inhibitory_spike_impulse,
        );
        for vertex in 0..self.excitatory.len() {
            self.excitatory[vertex] = quantize_f32(
                f64::from(self.excitatory[vertex]) + f64::from(drive.excitatory[vertex]),
            );
            self.inhibitory[vertex] = quantize_f32(
                f64::from(self.inhibitory[vertex]) + f64::from(drive.inhibitory[vertex]),
            );
        }

        let history_base = self.history_cursor * self.excitatory.len();
        let history_range = history_base..history_base + self.excitatory.len();
        self.history_excitatory[history_range.clone()].copy_from_slice(&self.excitatory);
        self.history_inhibitory[history_range].copy_from_slice(&self.inhibitory);

        let decay_excitatory = (-dt.get() / self.config.tau_excitatory.get()).exp();
        let decay_inhibitory = (-dt.get() / self.config.tau_inhibitory.get()).exp();
        for vertex in 0..self.excitatory.len() {
            let current_excitatory = f64::from(self.excitatory[vertex]);
            let current_inhibitory = f64::from(self.inhibitory[vertex]);
            let mut delayed_mean_excitatory = 0.0_f64;
            let mut delayed_mean_inhibitory = 0.0_f64;
            let start = offset(&self.topology.row_offsets, vertex)?;
            let end = offset(&self.topology.row_offsets, vertex + 1)?;
            for edge in start..end {
                let neighbor = usize::try_from(self.topology.neighbors[edge])
                    .map_err(|_| FieldError::InvalidTopology("neighbor exceeds usize"))?;
                let delay = usize::from(self.conduction_delay_steps[edge]);
                let delayed_cursor =
                    (self.history_cursor + self.history_length - delay) % self.history_length;
                let delayed_index = delayed_cursor * self.excitatory.len() + neighbor;
                let weight = f64::from(self.neighbor_weights[edge]);
                delayed_mean_excitatory +=
                    f64::from(self.history_excitatory[delayed_index]) * weight;
                delayed_mean_inhibitory +=
                    f64::from(self.history_inhibitory[delayed_index]) * weight;
            }

            let propagated_excitatory = current_excitatory * decay_excitatory
                + self.config.propagation_excitatory_per_second
                    * (delayed_mean_excitatory - current_excitatory)
                    * dt.get();
            let propagated_inhibitory = current_inhibitory * decay_inhibitory
                + self.config.propagation_inhibitory_per_second
                    * (delayed_mean_inhibitory - current_inhibitory)
                    * dt.get();
            self.next_excitatory[vertex] =
                quantize_f32(propagated_excitatory.clamp(0.0, self.config.max_activity));
            self.next_inhibitory[vertex] =
                quantize_f32(propagated_inhibitory.clamp(0.0, self.config.max_activity));
            self.wave_activity[vertex] = quantize_f32(
                (f64::from(self.next_excitatory[vertex]) * 0.7
                    + f64::from(self.next_inhibitory[vertex]) * 0.3)
                    .min(1.0),
            );
        }

        self.excitatory.copy_from_slice(&self.next_excitatory);
        self.inhibitory.copy_from_slice(&self.next_inhibitory);
        self.history_cursor = (self.history_cursor + 1) % self.history_length;
        Ok(())
    }

    /// Sets a vertex state for a declared initial-condition experiment.
    ///
    /// # Errors
    ///
    /// Returns [`FieldError`] for an invalid vertex or state outside the
    /// configured activity interval.
    pub fn set_activity(
        &mut self,
        vertex: usize,
        excitatory: f32,
        inhibitory: f32,
    ) -> Result<(), FieldError> {
        if vertex >= self.excitatory.len() {
            return Err(FieldError::InvalidVertex(vertex));
        }
        if !excitatory.is_finite()
            || !inhibitory.is_finite()
            || excitatory < 0.0
            || inhibitory < 0.0
            || f64::from(excitatory) > self.config.max_activity
            || f64::from(inhibitory) > self.config.max_activity
        {
            return Err(FieldError::InvalidActivity);
        }
        self.excitatory[vertex] = excitatory;
        self.inhibitory[vertex] = inhibitory;
        Ok(())
    }

    #[must_use]
    pub fn excitatory(&self) -> &[f32] {
        &self.excitatory
    }

    #[must_use]
    pub fn inhibitory(&self) -> &[f32] {
        &self.inhibitory
    }

    #[must_use]
    pub fn wave_activity(&self) -> &[f32] {
        &self.wave_activity
    }

    #[must_use]
    pub fn field_vertex_for_node(&self, node: usize) -> Option<usize> {
        self.topology
            .vertex_by_node
            .get(node)
            .and_then(|&vertex| usize::try_from(vertex).ok())
    }

    #[must_use]
    pub fn coupling_current(&self, node: usize) -> f64 {
        self.field_vertex_for_node(node).map_or(0.0, |vertex| {
            (f64::from(self.excitatory[vertex]) - f64::from(self.inhibitory[vertex]))
                * self.config.coupling_gain
        })
    }

    #[must_use]
    pub fn conduction_delay_steps(&self, source: usize, target: usize) -> Option<u16> {
        if source >= self.excitatory.len() || target >= self.excitatory.len() {
            return None;
        }
        let start = offset(&self.topology.row_offsets, target).ok()?;
        let end = offset(&self.topology.row_offsets, target + 1).ok()?;
        (start..end)
            .find(|&edge| usize::try_from(self.topology.neighbors[edge]) == Ok(source))
            .map(|edge| self.conduction_delay_steps[edge])
    }

    pub fn reset(&mut self) {
        self.excitatory.fill(0.0);
        self.inhibitory.fill(0.0);
        self.wave_activity.fill(0.0);
        self.next_excitatory.fill(0.0);
        self.next_inhibitory.fill(0.0);
        self.history_excitatory.fill(0.0);
        self.history_inhibitory.fill(0.0);
        self.history_cursor = 0;
    }

    #[must_use]
    pub fn snapshot(&self) -> FieldSnapshot {
        FieldSnapshot {
            node_indices: self.topology.node_indices.clone(),
            excitatory: self.excitatory.clone(),
            inhibitory: self.inhibitory.clone(),
            wave_activity: self.wave_activity.clone(),
        }
    }
}

fn offset(offsets: &[u32], index: usize) -> Result<usize, FieldError> {
    usize::try_from(offsets[index]).map_err(|_| FieldError::InvalidTopology("offset exceeds usize"))
}

#[expect(
    clippy::cast_possible_truncation,
    reason = "the field wire contract intentionally quantizes every published state to f32"
)]
fn quantize_f32(value: f64) -> f32 {
    value as f32
}

fn validate_positive(name: &'static str, value: f64) -> Result<(), FieldError> {
    if value.is_finite() && value > 0.0 {
        Ok(())
    } else {
        Err(FieldError::InvalidParameter { name, value })
    }
}

fn validate_non_negative(name: &'static str, value: f64) -> Result<(), FieldError> {
    if value.is_finite() && value >= 0.0 {
        Ok(())
    } else {
        Err(FieldError::InvalidParameter { name, value })
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum FieldError {
    InvalidParameter { name: &'static str, value: f64 },
    InvalidTopology(&'static str),
    MismatchedNodeBuffers,
    DelayOverflow,
    AllocationOverflow,
    VariableTimeStep,
    InvalidVertex(usize),
    InvalidActivity,
}

impl fmt::Display for FieldError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidParameter { name, value } => {
                write!(formatter, "{name} has an invalid value: {value}")
            }
            Self::InvalidTopology(reason) => write!(formatter, "invalid field topology: {reason}"),
            Self::MismatchedNodeBuffers => {
                formatter.write_str("spikes, neuron kinds and node projection must have equal size")
            }
            Self::DelayOverflow => formatter.write_str("field delay exceeds the u16 protocol"),
            Self::AllocationOverflow => formatter.write_str("field history allocation overflow"),
            Self::VariableTimeStep => {
                formatter.write_str("field must advance with its declared fixed step")
            }
            Self::InvalidVertex(vertex) => write!(formatter, "invalid field vertex: {vertex}"),
            Self::InvalidActivity => formatter.write_str("invalid field activity"),
        }
    }
}

impl std::error::Error for FieldError {}
