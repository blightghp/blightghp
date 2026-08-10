use core::fmt;

use crate::{
    ChemicalContractError, ConservationTolerance, Seconds, TransmitterMassLedger, UnitFraction,
};

pub const CHEMICAL_CLEFT_SCHEMA_VERSION: u32 = 1;
pub const TRANSMITTER_COUNT: usize = 2;
pub const RECEPTOR_FAMILY_COUNT: usize = 4;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum TransmitterKind {
    Glutamate,
    Gaba,
}

impl TransmitterKind {
    #[must_use]
    pub const fn index(self) -> usize {
        match self {
            Self::Glutamate => 0,
            Self::Gaba => 1,
        }
    }

    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Glutamate => "glutamate",
            Self::Gaba => "gaba",
        }
    }
}

pub const TRANSMITTER_ORDER: [TransmitterKind; TRANSMITTER_COUNT] =
    [TransmitterKind::Glutamate, TransmitterKind::Gaba];

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ReceptorFamily {
    Ampa,
    Nmda,
    GabaA,
    GabaB,
}

impl ReceptorFamily {
    #[must_use]
    pub const fn index(self) -> usize {
        match self {
            Self::Ampa => 0,
            Self::Nmda => 1,
            Self::GabaA => 2,
            Self::GabaB => 3,
        }
    }

    #[must_use]
    pub const fn transmitter(self) -> TransmitterKind {
        match self {
            Self::Ampa | Self::Nmda => TransmitterKind::Glutamate,
            Self::GabaA | Self::GabaB => TransmitterKind::Gaba,
        }
    }

    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Ampa => "ampa",
            Self::Nmda => "nmda",
            Self::GabaA => "gaba-a",
            Self::GabaB => "gaba-b",
        }
    }
}

pub const RECEPTOR_FAMILY_ORDER: [ReceptorFamily; RECEPTOR_FAMILY_COUNT] = [
    ReceptorFamily::Ampa,
    ReceptorFamily::Nmda,
    ReceptorFamily::GabaA,
    ReceptorFamily::GabaB,
];

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ReceptorBindingConfig {
    site_capacity_moles: f64,
    association_rate_cubic_meters_per_mole_second: f64,
    dissociation_rate_per_second: f64,
}

impl ReceptorBindingConfig {
    /// Creates one receptor-family binding contract in SI units.
    ///
    /// # Errors
    ///
    /// Rejects non-positive or non-finite capacity and rate constants.
    pub fn try_new(
        site_capacity_moles: f64,
        association_rate_cubic_meters_per_mole_second: f64,
        dissociation_rate_per_second: f64,
    ) -> Result<Self, ChemicalSynapseError> {
        if !site_capacity_moles.is_finite() || site_capacity_moles <= 0.0 {
            return Err(ChemicalSynapseError::InvalidBindingCapacity);
        }
        if !association_rate_cubic_meters_per_mole_second.is_finite()
            || association_rate_cubic_meters_per_mole_second <= 0.0
        {
            return Err(ChemicalSynapseError::InvalidAssociationRate);
        }
        if !dissociation_rate_per_second.is_finite() || dissociation_rate_per_second <= 0.0 {
            return Err(ChemicalSynapseError::InvalidDissociationRate);
        }
        Ok(Self {
            site_capacity_moles,
            association_rate_cubic_meters_per_mole_second,
            dissociation_rate_per_second,
        })
    }

    #[must_use]
    pub const fn site_capacity_moles(self) -> f64 {
        self.site_capacity_moles
    }

    #[must_use]
    pub const fn association_rate_cubic_meters_per_mole_second(self) -> f64 {
        self.association_rate_cubic_meters_per_mole_second
    }

    #[must_use]
    pub const fn dissociation_rate_per_second(self) -> f64 {
        self.dissociation_rate_per_second
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ChemicalSynapseConfig {
    cleft_volume_cubic_meters: f64,
    clearance_time_constants: [Seconds; TRANSMITTER_COUNT],
    receptor_bindings: [ReceptorBindingConfig; RECEPTOR_FAMILY_COUNT],
}

impl ChemicalSynapseConfig {
    /// Creates the local cleft and receptor-family configuration in SI units.
    ///
    /// Array order is fixed by [`TRANSMITTER_ORDER`] and
    /// [`RECEPTOR_FAMILY_ORDER`].
    ///
    /// # Errors
    ///
    /// Rejects a non-positive or non-finite cleft volume.
    pub fn try_new(
        cleft_volume_cubic_meters: f64,
        clearance_time_constants: [Seconds; TRANSMITTER_COUNT],
        receptor_bindings: [ReceptorBindingConfig; RECEPTOR_FAMILY_COUNT],
    ) -> Result<Self, ChemicalSynapseError> {
        if !cleft_volume_cubic_meters.is_finite() || cleft_volume_cubic_meters <= 0.0 {
            return Err(ChemicalSynapseError::InvalidCleftVolume);
        }
        Ok(Self {
            cleft_volume_cubic_meters,
            clearance_time_constants,
            receptor_bindings,
        })
    }

    #[must_use]
    pub const fn cleft_volume_cubic_meters(self) -> f64 {
        self.cleft_volume_cubic_meters
    }

    #[must_use]
    pub const fn clearance_time_constant(self, transmitter: TransmitterKind) -> Seconds {
        self.clearance_time_constants[transmitter.index()]
    }

    #[must_use]
    pub const fn receptor_binding(self, family: ReceptorFamily) -> ReceptorBindingConfig {
        self.receptor_bindings[family.index()]
    }
}

impl Default for ChemicalSynapseConfig {
    fn default() -> Self {
        let binding = |capacity, association, dissociation| {
            ReceptorBindingConfig::try_new(capacity, association, dissociation)
                .expect("default receptor binding must be valid")
        };
        Self::try_new(
            2.0e-20,
            [
                Seconds::try_new(0.0015).expect("default glutamate clearance must be valid"),
                Seconds::try_new(0.003).expect("default GABA clearance must be valid"),
            ],
            [
                binding(1.0e-21, 12.0, 180.0),
                binding(1.0e-21, 5.0, 40.0),
                binding(1.0e-21, 10.0, 90.0),
                binding(1.0e-21, 1.0, 8.0),
            ],
        )
        .expect("default chemical synapse config must be valid")
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ChemicalCleftSnapshot {
    pub schema_version: u32,
    pub operation_index: u64,
    pub total_released_moles: [f64; TRANSMITTER_COUNT],
    pub cleft_moles: [f64; TRANSMITTER_COUNT],
    pub cleft_concentration_moles_per_cubic_meter: [f64; TRANSMITTER_COUNT],
    pub receptor_bound_moles: [f64; RECEPTOR_FAMILY_COUNT],
    pub receptor_occupancy_fraction: [f64; RECEPTOR_FAMILY_COUNT],
    pub cleared_moles: [f64; TRANSMITTER_COUNT],
    pub state_hash: u64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ReleaseIntoCleft {
    pub operation_index: u64,
    pub transmitter: TransmitterKind,
    pub released_moles: f64,
    pub cleft_moles_after: f64,
    pub concentration_after_moles_per_cubic_meter: f64,
    pub state_hash: u64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ClearanceTransition {
    pub operation_index: u64,
    pub transmitter: TransmitterKind,
    pub duration_seconds: f64,
    pub cleft_moles_before: f64,
    pub removed_moles: f64,
    pub cleft_moles_after: f64,
    pub cleared_moles_after: f64,
    pub state_hash: u64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ReceptorBindingTransition {
    pub operation_index: u64,
    pub family: ReceptorFamily,
    pub transmitter: TransmitterKind,
    pub duration_seconds: f64,
    pub concentration_before_moles_per_cubic_meter: f64,
    pub occupancy_before: UnitFraction,
    pub occupancy_after: UnitFraction,
    pub bound_delta_moles: f64,
    pub cleft_moles_after: f64,
    pub state_hash: u64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ChemicalSynapse {
    config: ChemicalSynapseConfig,
    operation_index: u64,
    total_released_moles: [f64; TRANSMITTER_COUNT],
    cleft_moles: [f64; TRANSMITTER_COUNT],
    receptor_bound_moles: [f64; RECEPTOR_FAMILY_COUNT],
    receptor_occupancy: [UnitFraction; RECEPTOR_FAMILY_COUNT],
    cleared_moles: [f64; TRANSMITTER_COUNT],
}

impl ChemicalSynapse {
    #[must_use]
    pub fn new(config: ChemicalSynapseConfig) -> Self {
        Self {
            config,
            operation_index: 0,
            total_released_moles: [0.0; TRANSMITTER_COUNT],
            cleft_moles: [0.0; TRANSMITTER_COUNT],
            receptor_bound_moles: [0.0; RECEPTOR_FAMILY_COUNT],
            receptor_occupancy: [UnitFraction::ZERO; RECEPTOR_FAMILY_COUNT],
            cleared_moles: [0.0; TRANSMITTER_COUNT],
        }
    }

    #[must_use]
    pub fn snapshot(&self) -> ChemicalCleftSnapshot {
        ChemicalCleftSnapshot {
            schema_version: CHEMICAL_CLEFT_SCHEMA_VERSION,
            operation_index: self.operation_index,
            total_released_moles: self.total_released_moles,
            cleft_moles: self.cleft_moles,
            cleft_concentration_moles_per_cubic_meter: TRANSMITTER_ORDER
                .map(|transmitter| self.concentration_moles_per_cubic_meter(transmitter)),
            receptor_bound_moles: self.receptor_bound_moles,
            receptor_occupancy_fraction: self.receptor_occupancy.map(UnitFraction::get),
            cleared_moles: self.cleared_moles,
            state_hash: self.state_hash(),
        }
    }

    #[must_use]
    pub fn concentration_moles_per_cubic_meter(&self, transmitter: TransmitterKind) -> f64 {
        self.cleft_moles[transmitter.index()] / self.config.cleft_volume_cubic_meters
    }

    /// Adds a finite, non-negative presynaptic release to the selected cleft.
    ///
    /// # Errors
    ///
    /// Rejects invalid amounts, operation overflow and non-finite accumulation.
    pub fn release_into_cleft(
        &mut self,
        transmitter: TransmitterKind,
        released_moles: f64,
    ) -> Result<ReleaseIntoCleft, ChemicalSynapseError> {
        if !released_moles.is_finite() || released_moles < 0.0 {
            return Err(ChemicalSynapseError::InvalidRelease);
        }
        let operation_index = self.next_operation_index()?;
        let transmitter_index = transmitter.index();
        let total_released_after = self.total_released_moles[transmitter_index] + released_moles;
        let cleft_after = self.cleft_moles[transmitter_index] + released_moles;
        if !total_released_after.is_finite() || !cleft_after.is_finite() {
            return Err(ChemicalSynapseError::NonFiniteState);
        }
        self.operation_index = operation_index;
        self.total_released_moles[transmitter_index] = total_released_after;
        self.cleft_moles[transmitter_index] = cleft_after;
        Ok(ReleaseIntoCleft {
            operation_index,
            transmitter,
            released_moles,
            cleft_moles_after: cleft_after,
            concentration_after_moles_per_cubic_meter: self
                .concentration_moles_per_cubic_meter(transmitter),
            state_hash: self.state_hash(),
        })
    }

    /// Applies exact first-order clearance for one transmitter subtransition.
    ///
    /// Removed material is retained in the recovered stock. The caller owns
    /// global operator ordering until the 0.8-d solver freezes it.
    ///
    /// # Errors
    ///
    /// Rejects operation overflow or a non-finite transition.
    pub fn clear_transmitter(
        &mut self,
        transmitter: TransmitterKind,
        duration: Seconds,
    ) -> Result<ClearanceTransition, ChemicalSynapseError> {
        let operation_index = self.next_operation_index()?;
        let transmitter_index = transmitter.index();
        let cleft_before = self.cleft_moles[transmitter_index];
        let tau = self.config.clearance_time_constant(transmitter).get();
        let cleft_after = cleft_before * (-duration.get() / tau).exp();
        let removed_moles = cleft_before - cleft_after;
        let cleared_after = self.cleared_moles[transmitter_index] + removed_moles;
        if !cleft_after.is_finite()
            || cleft_after < 0.0
            || !removed_moles.is_finite()
            || removed_moles < 0.0
            || !cleared_after.is_finite()
        {
            return Err(ChemicalSynapseError::NonFiniteState);
        }
        self.operation_index = operation_index;
        self.cleft_moles[transmitter_index] = cleft_after;
        self.cleared_moles[transmitter_index] = cleared_after;
        Ok(ClearanceTransition {
            operation_index,
            transmitter,
            duration_seconds: duration.get(),
            cleft_moles_before: cleft_before,
            removed_moles,
            cleft_moles_after: cleft_after,
            cleared_moles_after: cleared_after,
            state_hash: self.state_hash(),
        })
    }

    /// Advances one receptor family under the concentration frozen at entry.
    ///
    /// Binding transfers transmitter from the matching cleft to an explicit
    /// bound stock; unbinding returns it. This is an atomic operator, not the
    /// composed 0.8-d solver.
    ///
    /// # Errors
    ///
    /// Rejects operation overflow, invalid state and binding demand greater
    /// than the transmitter currently available in the matching cleft.
    pub fn advance_receptor_binding(
        &mut self,
        family: ReceptorFamily,
        duration: Seconds,
    ) -> Result<ReceptorBindingTransition, ChemicalSynapseError> {
        let operation_index = self.next_operation_index()?;
        let family_index = family.index();
        let transmitter = family.transmitter();
        let transmitter_index = transmitter.index();
        let concentration_before = self.concentration_moles_per_cubic_meter(transmitter);
        let binding = self.config.receptor_binding(family);
        let association_rate =
            binding.association_rate_cubic_meters_per_mole_second * concentration_before;
        let total_rate = association_rate + binding.dissociation_rate_per_second;
        let steady_occupancy = association_rate / total_rate;
        let occupancy_before = self.receptor_occupancy[family_index];
        let occupancy_after_value = steady_occupancy
            + (occupancy_before.get() - steady_occupancy) * (-total_rate * duration.get()).exp();
        let occupancy_after = UnitFraction::try_new(occupancy_after_value)
            .map_err(|_| ChemicalSynapseError::NonFiniteState)?;
        let bound_before = self.receptor_bound_moles[family_index];
        let bound_after = binding.site_capacity_moles * occupancy_after.get();
        let bound_delta_moles = bound_after - bound_before;
        let cleft_before = self.cleft_moles[transmitter_index];
        if bound_delta_moles > cleft_before {
            return Err(ChemicalSynapseError::InsufficientCleftTransmitter);
        }
        let cleft_after = cleft_before - bound_delta_moles;
        if !association_rate.is_finite()
            || !total_rate.is_finite()
            || !bound_after.is_finite()
            || !bound_delta_moles.is_finite()
            || !cleft_after.is_finite()
            || cleft_after < 0.0
        {
            return Err(ChemicalSynapseError::NonFiniteState);
        }
        self.operation_index = operation_index;
        self.receptor_occupancy[family_index] = occupancy_after;
        self.receptor_bound_moles[family_index] = bound_after;
        self.cleft_moles[transmitter_index] = cleft_after;
        Ok(ReceptorBindingTransition {
            operation_index,
            family,
            transmitter,
            duration_seconds: duration.get(),
            concentration_before_moles_per_cubic_meter: concentration_before,
            occupancy_before,
            occupancy_after,
            bound_delta_moles,
            cleft_moles_after: cleft_after,
            state_hash: self.state_hash(),
        })
    }

    /// Returns the aggregate chemical ledger for the open release boundary.
    ///
    /// The cumulative released amount is the reference mass; cleared material
    /// occupies the recovered stock and is never erased.
    ///
    /// # Errors
    ///
    /// Returns a contract error if an internal stock is invalid.
    pub fn mass_ledger(&self) -> Result<TransmitterMassLedger, ChemicalContractError> {
        TransmitterMassLedger::try_new(
            0.0,
            self.cleft_moles.iter().sum(),
            self.receptor_bound_moles.iter().sum(),
            self.cleared_moles.iter().sum(),
            0.0,
        )
    }

    /// Returns the closed ledger for one transmitter kind.
    ///
    /// # Errors
    ///
    /// Returns a contract error if an internal stock is invalid.
    pub fn transmitter_mass_ledger(
        &self,
        transmitter: TransmitterKind,
    ) -> Result<TransmitterMassLedger, ChemicalContractError> {
        let receptor_bound_moles = RECEPTOR_FAMILY_ORDER
            .into_iter()
            .filter(|family| family.transmitter() == transmitter)
            .map(|family| self.receptor_bound_moles[family.index()])
            .sum();
        TransmitterMassLedger::try_new(
            0.0,
            self.cleft_moles[transmitter.index()],
            receptor_bound_moles,
            self.cleared_moles[transmitter.index()],
            0.0,
        )
    }

    /// Verifies cleft, bound and cleared mass against cumulative release.
    ///
    /// # Errors
    ///
    /// Returns the chemical contract error when the declared tolerance fails.
    pub fn verify_mass_conserved(
        &self,
        tolerance: ConservationTolerance,
    ) -> Result<(), ChemicalContractError> {
        for transmitter in TRANSMITTER_ORDER {
            self.transmitter_mass_ledger(transmitter)?
                .verify_conserved(self.total_released_moles[transmitter.index()], tolerance)?;
        }
        Ok(())
    }

    pub fn reset(&mut self) {
        *self = Self::new(self.config);
    }

    fn next_operation_index(&self) -> Result<u64, ChemicalSynapseError> {
        self.operation_index
            .checked_add(1)
            .ok_or(ChemicalSynapseError::OperationOverflow)
    }

    fn state_hash(&self) -> u64 {
        let mut hash = 0xcbf2_9ce4_8422_2325_u64;
        hash_value(&mut hash, &CHEMICAL_CLEFT_SCHEMA_VERSION.to_le_bytes());
        hash_value(
            &mut hash,
            &self
                .config
                .cleft_volume_cubic_meters
                .to_bits()
                .to_le_bytes(),
        );
        for transmitter in TRANSMITTER_ORDER {
            hash_value(
                &mut hash,
                &self
                    .config
                    .clearance_time_constant(transmitter)
                    .get()
                    .to_bits()
                    .to_le_bytes(),
            );
        }
        for family in RECEPTOR_FAMILY_ORDER {
            let binding = self.config.receptor_binding(family);
            for value in [
                binding.site_capacity_moles,
                binding.association_rate_cubic_meters_per_mole_second,
                binding.dissociation_rate_per_second,
            ] {
                hash_value(&mut hash, &value.to_bits().to_le_bytes());
            }
        }
        hash_value(&mut hash, &self.operation_index.to_le_bytes());
        for value in self
            .total_released_moles
            .into_iter()
            .chain(self.cleft_moles)
            .chain(self.receptor_bound_moles)
            .chain(self.receptor_occupancy.map(UnitFraction::get))
            .chain(self.cleared_moles)
        {
            hash_value(&mut hash, &value.to_bits().to_le_bytes());
        }
        hash
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ChemicalSynapseError {
    InvalidCleftVolume,
    InvalidBindingCapacity,
    InvalidAssociationRate,
    InvalidDissociationRate,
    InvalidRelease,
    InsufficientCleftTransmitter,
    OperationOverflow,
    NonFiniteState,
}

impl fmt::Display for ChemicalSynapseError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidCleftVolume => {
                formatter.write_str("cleft volume must be positive and finite")
            }
            Self::InvalidBindingCapacity => {
                formatter.write_str("receptor site capacity must be positive and finite")
            }
            Self::InvalidAssociationRate => {
                formatter.write_str("association rate must be positive and finite")
            }
            Self::InvalidDissociationRate => {
                formatter.write_str("dissociation rate must be positive and finite")
            }
            Self::InvalidRelease => {
                formatter.write_str("released amount must be finite and non-negative")
            }
            Self::InsufficientCleftTransmitter => {
                formatter.write_str("receptor binding exceeds available cleft transmitter")
            }
            Self::OperationOverflow => formatter.write_str("chemical operation index overflow"),
            Self::NonFiniteState => {
                formatter.write_str("chemical transition produced invalid state")
            }
        }
    }
}

impl std::error::Error for ChemicalSynapseError {}

fn hash_value(hash: &mut u64, bytes: &[u8]) {
    for byte in bytes {
        *hash ^= u64::from(*byte);
        *hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seconds(value: f64) -> Seconds {
        Seconds::try_new(value).unwrap()
    }

    fn tolerance() -> ConservationTolerance {
        ConservationTolerance::try_new(1.0e-30, UnitFraction::try_new(1.0e-12).unwrap()).unwrap()
    }

    #[test]
    fn release_publishes_concentration_without_occupancy_or_effect_aliasing() {
        let mut synapse = ChemicalSynapse::new(ChemicalSynapseConfig::default());
        let release = synapse
            .release_into_cleft(TransmitterKind::Glutamate, 4.0e-19)
            .unwrap();
        assert!((release.concentration_after_moles_per_cubic_meter - 20.0).abs() < f64::EPSILON);
        let snapshot = synapse.snapshot();
        assert!(snapshot
            .receptor_occupancy_fraction
            .into_iter()
            .all(|occupancy| occupancy.to_bits() == 0.0_f64.to_bits()));
        assert!(snapshot.cleared_moles.into_iter().all(|moles| moles == 0.0));
        synapse.verify_mass_conserved(tolerance()).unwrap();
    }

    #[test]
    fn clearance_is_exact_positive_and_keeps_removed_mass() {
        let mut synapse = ChemicalSynapse::new(ChemicalSynapseConfig::default());
        synapse
            .release_into_cleft(TransmitterKind::Glutamate, 4.0e-19)
            .unwrap();
        let transition = synapse
            .clear_transmitter(TransmitterKind::Glutamate, seconds(0.0015))
            .unwrap();
        let expected = 4.0e-19 * (-1.0_f64).exp();
        assert_eq!(transition.cleft_moles_after.to_bits(), expected.to_bits());
        assert!(transition.removed_moles > 0.0);
        synapse.verify_mass_conserved(tolerance()).unwrap();
    }

    #[test]
    fn receptor_families_bind_only_their_declared_transmitter() {
        assert_eq!(
            ReceptorFamily::Ampa.transmitter(),
            TransmitterKind::Glutamate
        );
        assert_eq!(
            ReceptorFamily::Nmda.transmitter(),
            TransmitterKind::Glutamate
        );
        assert_eq!(ReceptorFamily::GabaA.transmitter(), TransmitterKind::Gaba);
        assert_eq!(ReceptorFamily::GabaB.transmitter(), TransmitterKind::Gaba);

        let mut synapse = ChemicalSynapse::new(ChemicalSynapseConfig::default());
        synapse
            .release_into_cleft(TransmitterKind::Glutamate, 4.0e-19)
            .unwrap();
        let binding = synapse
            .advance_receptor_binding(ReceptorFamily::Ampa, seconds(0.001))
            .unwrap();
        assert!(binding.occupancy_after.get() > 0.0);
        let snapshot = synapse.snapshot();
        assert!(snapshot.receptor_occupancy_fraction[ReceptorFamily::Ampa.index()] > 0.0);
        assert_eq!(
            snapshot.receptor_occupancy_fraction[ReceptorFamily::GabaA.index()].to_bits(),
            0.0_f64.to_bits()
        );
        synapse.verify_mass_conserved(tolerance()).unwrap();
    }

    #[test]
    fn dissociation_returns_bound_transmitter_to_the_matching_cleft() {
        let mut synapse = ChemicalSynapse::new(ChemicalSynapseConfig::default());
        synapse
            .release_into_cleft(TransmitterKind::Glutamate, 4.0e-19)
            .unwrap();
        let bound = synapse
            .advance_receptor_binding(ReceptorFamily::Ampa, seconds(0.001))
            .unwrap();
        synapse
            .clear_transmitter(TransmitterKind::Glutamate, seconds(0.1))
            .unwrap();
        let cleft_before = synapse.snapshot().cleft_moles[TransmitterKind::Glutamate.index()];
        let unbound = synapse
            .advance_receptor_binding(ReceptorFamily::Ampa, seconds(0.01))
            .unwrap();
        assert!(unbound.occupancy_after < bound.occupancy_after);
        assert!(unbound.bound_delta_moles < 0.0);
        assert!(unbound.cleft_moles_after > cleft_before);
        synapse.verify_mass_conserved(tolerance()).unwrap();
    }

    #[test]
    fn state_hash_names_the_chemical_configuration() {
        let first = ChemicalSynapse::new(ChemicalSynapseConfig::default()).snapshot();
        let default = ChemicalSynapseConfig::default();
        let different_volume = ChemicalSynapseConfig::try_new(
            default.cleft_volume_cubic_meters() * 2.0,
            TRANSMITTER_ORDER.map(|kind| default.clearance_time_constant(kind)),
            RECEPTOR_FAMILY_ORDER.map(|family| default.receptor_binding(family)),
        )
        .unwrap();
        let second = ChemicalSynapse::new(different_volume).snapshot();
        assert_ne!(first.state_hash, second.state_hash);
    }

    #[test]
    fn insufficient_binding_is_rejected_atomically() {
        let oversized = ReceptorBindingConfig::try_new(1.0, 1.0e12, 1.0).unwrap();
        let config = ChemicalSynapseConfig::try_new(
            1.0,
            [seconds(0.001), seconds(0.001)],
            [oversized; RECEPTOR_FAMILY_COUNT],
        )
        .unwrap();
        let mut synapse = ChemicalSynapse::new(config);
        synapse
            .release_into_cleft(TransmitterKind::Glutamate, 1.0e-12)
            .unwrap();
        let before = synapse.snapshot();
        assert_eq!(
            synapse.advance_receptor_binding(ReceptorFamily::Ampa, seconds(1.0)),
            Err(ChemicalSynapseError::InsufficientCleftTransmitter)
        );
        assert_eq!(synapse.snapshot(), before);
    }

    #[test]
    fn long_operation_train_is_bounded_conservative_and_deterministic() {
        let mut first = ChemicalSynapse::new(ChemicalSynapseConfig::default());
        let mut second = first.clone();
        for operation in 0..5_000 {
            let transmitter = if operation % 2 == 0 {
                TransmitterKind::Glutamate
            } else {
                TransmitterKind::Gaba
            };
            let family = if transmitter == TransmitterKind::Glutamate {
                ReceptorFamily::Ampa
            } else {
                ReceptorFamily::GabaA
            };
            for synapse in [&mut first, &mut second] {
                synapse.release_into_cleft(transmitter, 1.0e-20).unwrap();
                synapse
                    .advance_receptor_binding(family, seconds(0.0001))
                    .unwrap();
                synapse
                    .clear_transmitter(transmitter, seconds(0.0001))
                    .unwrap();
            }
            assert_eq!(first.snapshot(), second.snapshot());
        }
        let snapshot = first.snapshot();
        assert!(snapshot
            .cleft_moles
            .into_iter()
            .chain(snapshot.receptor_bound_moles)
            .chain(snapshot.cleared_moles)
            .all(|value| value.is_finite() && value >= 0.0));
        assert!(snapshot
            .receptor_occupancy_fraction
            .into_iter()
            .all(|value| (0.0..=1.0).contains(&value)));
        first.verify_mass_conserved(tolerance()).unwrap();
    }

    #[test]
    fn invalid_boundaries_fail_and_reset_clears_every_buffer() {
        assert_eq!(
            ChemicalSynapseConfig::try_new(
                0.0,
                [seconds(0.001), seconds(0.001)],
                [ReceptorBindingConfig::try_new(1.0, 1.0, 1.0).unwrap(); RECEPTOR_FAMILY_COUNT],
            ),
            Err(ChemicalSynapseError::InvalidCleftVolume)
        );
        assert_eq!(
            ReceptorBindingConfig::try_new(0.0, 1.0, 1.0),
            Err(ChemicalSynapseError::InvalidBindingCapacity)
        );
        let mut synapse = ChemicalSynapse::new(ChemicalSynapseConfig::default());
        assert_eq!(
            synapse.release_into_cleft(TransmitterKind::Gaba, f64::NAN),
            Err(ChemicalSynapseError::InvalidRelease)
        );
        synapse
            .release_into_cleft(TransmitterKind::Gaba, 1.0e-19)
            .unwrap();
        synapse.reset();
        let snapshot = synapse.snapshot();
        assert_eq!(snapshot.operation_index, 0);
        assert!(snapshot
            .total_released_moles
            .into_iter()
            .chain(snapshot.cleft_moles)
            .chain(snapshot.receptor_bound_moles)
            .chain(snapshot.receptor_occupancy_fraction)
            .chain(snapshot.cleared_moles)
            .all(|value| value.to_bits() == 0.0_f64.to_bits()));
    }
}
