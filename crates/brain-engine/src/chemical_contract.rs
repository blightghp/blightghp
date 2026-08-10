use core::fmt;

/// A dimensionless closed interval used for utilization and available resource.
#[derive(Clone, Copy, Debug, PartialEq, PartialOrd)]
#[repr(transparent)]
pub struct UnitFraction(f64);

impl UnitFraction {
    /// Builds a finite fraction in the inclusive interval `[0, 1]`.
    ///
    /// # Errors
    ///
    /// Returns [`ChemicalContractError::InvalidFraction`] outside the interval.
    pub fn try_new(value: f64) -> Result<Self, ChemicalContractError> {
        if !value.is_finite() || !(0.0..=1.0).contains(&value) {
            return Err(ChemicalContractError::InvalidFraction);
        }
        Ok(Self(value))
    }

    #[must_use]
    pub const fn get(self) -> f64 {
        self.0
    }
}

/// Immutable resource inputs for one deterministic presynaptic release event.
///
/// `available` and `utilization` are fractions, never molecule counts and never
/// Bernoulli probabilities. The 0.8-b dynamics will mutate its own state only
/// after consuming the release amount produced by this contract.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct VesicularResourceContract {
    pool_capacity_moles: f64,
    available: UnitFraction,
    utilization: UnitFraction,
}

impl VesicularResourceContract {
    /// Creates a vesicular pool contract in SI moles.
    ///
    /// # Errors
    ///
    /// Returns [`ChemicalContractError::InvalidMoles`] for a non-positive or
    /// non-finite capacity.
    pub fn try_new(
        pool_capacity_moles: f64,
        available: UnitFraction,
        utilization: UnitFraction,
    ) -> Result<Self, ChemicalContractError> {
        if !pool_capacity_moles.is_finite() || pool_capacity_moles <= 0.0 {
            return Err(ChemicalContractError::InvalidMoles);
        }
        Ok(Self {
            pool_capacity_moles,
            available,
            utilization,
        })
    }

    #[must_use]
    pub const fn pool_capacity_moles(self) -> f64 {
        self.pool_capacity_moles
    }

    #[must_use]
    pub const fn available(self) -> UnitFraction {
        self.available
    }

    #[must_use]
    pub const fn utilization(self) -> UnitFraction {
        self.utilization
    }

    /// Computes the deterministic amount `uR` without mutating either stock.
    #[must_use]
    pub fn planned_release(self) -> DeterministicRelease {
        let released_fraction = self.available.get() * self.utilization.get();
        DeterministicRelease {
            released_fraction,
            released_moles: self.pool_capacity_moles * released_fraction,
        }
    }
}

/// Output of the deterministic `uR` release contract.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct DeterministicRelease {
    released_fraction: f64,
    released_moles: f64,
}

impl DeterministicRelease {
    #[must_use]
    pub const fn released_fraction(self) -> f64 {
        self.released_fraction
    }

    #[must_use]
    pub const fn released_moles(self) -> f64 {
        self.released_moles
    }
}

/// Stocks of transmitter-equivalent mass in SI moles.
///
/// Degraded material remains in an explicit equivalent-mass sink so chemical
/// removal cannot silently destroy the conserved transmitter moiety.
#[derive(Clone, Copy, Debug, PartialEq)]
// Unit suffixes are intentional: MODEL_SPEC forbids unit-ambiguous fields.
#[allow(clippy::struct_field_names)]
pub struct TransmitterMassLedger {
    vesicular_moles: f64,
    cleft_moles: f64,
    receptor_bound_moles: f64,
    recovered_moles: f64,
    degraded_equivalent_moles: f64,
}

impl TransmitterMassLedger {
    /// Validates that every chemical stock is finite and non-negative.
    ///
    /// # Errors
    ///
    /// Returns [`ChemicalContractError::InvalidMoles`] for an invalid stock.
    pub fn try_new(
        vesicular_moles: f64,
        cleft_moles: f64,
        receptor_bound_moles: f64,
        recovered_moles: f64,
        degraded_equivalent_moles: f64,
    ) -> Result<Self, ChemicalContractError> {
        let stocks = [
            vesicular_moles,
            cleft_moles,
            receptor_bound_moles,
            recovered_moles,
            degraded_equivalent_moles,
        ];
        if stocks
            .iter()
            .any(|stock| !stock.is_finite() || *stock < 0.0)
        {
            return Err(ChemicalContractError::InvalidMoles);
        }
        Ok(Self {
            vesicular_moles,
            cleft_moles,
            receptor_bound_moles,
            recovered_moles,
            degraded_equivalent_moles,
        })
    }

    #[must_use]
    pub fn total_equivalent_moles(self) -> f64 {
        self.vesicular_moles
            + self.cleft_moles
            + self.receptor_bound_moles
            + self.recovered_moles
            + self.degraded_equivalent_moles
    }

    #[must_use]
    pub const fn vesicular_moles(self) -> f64 {
        self.vesicular_moles
    }

    #[must_use]
    pub const fn cleft_moles(self) -> f64 {
        self.cleft_moles
    }

    #[must_use]
    pub const fn receptor_bound_moles(self) -> f64 {
        self.receptor_bound_moles
    }

    #[must_use]
    pub const fn recovered_moles(self) -> f64 {
        self.recovered_moles
    }

    #[must_use]
    pub const fn degraded_equivalent_moles(self) -> f64 {
        self.degraded_equivalent_moles
    }

    /// Verifies the closed-system transmitter-moiety balance.
    ///
    /// # Errors
    ///
    /// Returns [`ChemicalContractError::MassNotConserved`] when the discrepancy
    /// exceeds the declared absolute plus relative tolerance.
    pub fn verify_conserved(
        self,
        initial_equivalent_moles: f64,
        tolerance: ConservationTolerance,
    ) -> Result<(), ChemicalContractError> {
        if !initial_equivalent_moles.is_finite() || initial_equivalent_moles < 0.0 {
            return Err(ChemicalContractError::InvalidMoles);
        }
        let discrepancy = self.total_equivalent_moles() - initial_equivalent_moles;
        if discrepancy.abs() > tolerance.allowed_error(initial_equivalent_moles) {
            return Err(ChemicalContractError::MassNotConserved {
                discrepancy_moles: discrepancy,
            });
        }
        Ok(())
    }
}

/// Explicit absolute and relative tolerances for a conservation proof.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ConservationTolerance {
    absolute_moles: f64,
    relative_fraction: UnitFraction,
}

impl ConservationTolerance {
    /// Creates non-negative finite tolerances.
    ///
    /// # Errors
    ///
    /// Returns [`ChemicalContractError::InvalidTolerance`] for invalid values.
    pub fn try_new(
        absolute_moles: f64,
        relative_fraction: UnitFraction,
    ) -> Result<Self, ChemicalContractError> {
        if !absolute_moles.is_finite() || absolute_moles < 0.0 {
            return Err(ChemicalContractError::InvalidTolerance);
        }
        Ok(Self {
            absolute_moles,
            relative_fraction,
        })
    }

    #[must_use]
    pub fn allowed_error(self, reference: f64) -> f64 {
        self.relative_fraction
            .get()
            .mul_add(reference.abs(), self.absolute_moles)
    }
}

/// Equal-and-opposite charge transfer across one membrane in SI coulombs.
///
/// Positive intracellular charge follows the engine's positive inward-current
/// convention. This ledger deliberately does not convert transmitter mass into
/// electrical charge; receptor electrodiffusion is a separate balance.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct MembraneChargeTransfer {
    intracellular_delta_coulombs: f64,
    extracellular_delta_coulombs: f64,
}

impl MembraneChargeTransfer {
    /// Creates a finite charge transfer.
    ///
    /// # Errors
    ///
    /// Returns [`ChemicalContractError::InvalidCharge`] for non-finite values.
    pub fn try_new(
        intracellular_delta_coulombs: f64,
        extracellular_delta_coulombs: f64,
    ) -> Result<Self, ChemicalContractError> {
        if !intracellular_delta_coulombs.is_finite() || !extracellular_delta_coulombs.is_finite() {
            return Err(ChemicalContractError::InvalidCharge);
        }
        Ok(Self {
            intracellular_delta_coulombs,
            extracellular_delta_coulombs,
        })
    }

    #[must_use]
    pub const fn intracellular_delta_coulombs(self) -> f64 {
        self.intracellular_delta_coulombs
    }

    #[must_use]
    pub const fn extracellular_delta_coulombs(self) -> f64 {
        self.extracellular_delta_coulombs
    }

    /// Verifies that membrane transfer creates no net electrical charge.
    ///
    /// # Errors
    ///
    /// Returns [`ChemicalContractError::ChargeNotConserved`] outside tolerance.
    pub fn verify_conserved(self, tolerance_coulombs: f64) -> Result<(), ChemicalContractError> {
        if !tolerance_coulombs.is_finite() || tolerance_coulombs < 0.0 {
            return Err(ChemicalContractError::InvalidTolerance);
        }
        let discrepancy = self.intracellular_delta_coulombs + self.extracellular_delta_coulombs;
        if discrepancy.abs() > tolerance_coulombs {
            return Err(ChemicalContractError::ChargeNotConserved {
                discrepancy_coulombs: discrepancy,
            });
        }
        Ok(())
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum ChemicalContractError {
    InvalidFraction,
    InvalidMoles,
    InvalidCharge,
    InvalidTolerance,
    MassNotConserved { discrepancy_moles: f64 },
    ChargeNotConserved { discrepancy_coulombs: f64 },
}

impl fmt::Display for ChemicalContractError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidFraction => formatter.write_str("fraction must be finite and in [0, 1]"),
            Self::InvalidMoles => formatter.write_str("mole stock must be finite and non-negative"),
            Self::InvalidCharge => formatter.write_str("charge transfer must be finite"),
            Self::InvalidTolerance => {
                formatter.write_str("tolerance must be finite and non-negative")
            }
            Self::MassNotConserved { discrepancy_moles } => {
                write!(
                    formatter,
                    "transmitter mass discrepancy: {discrepancy_moles} mol"
                )
            }
            Self::ChargeNotConserved {
                discrepancy_coulombs,
            } => write!(
                formatter,
                "membrane charge discrepancy: {discrepancy_coulombs} C"
            ),
        }
    }
}

impl std::error::Error for ChemicalContractError {}

#[cfg(test)]
mod tests {
    use super::*;

    fn fraction(value: f64) -> UnitFraction {
        UnitFraction::try_new(value).expect("test fraction must be valid")
    }

    #[test]
    fn unit_fraction_accepts_exact_bounds_and_rejects_first_invalid_values() {
        assert_eq!(fraction(0.0).get().to_bits(), 0.0_f64.to_bits());
        assert_eq!(fraction(1.0).get().to_bits(), 1.0_f64.to_bits());
        assert_eq!(
            UnitFraction::try_new(f64::from_bits(1.0_f64.to_bits() + 1)),
            Err(ChemicalContractError::InvalidFraction)
        );
        assert_eq!(
            UnitFraction::try_new(f64::NAN),
            Err(ChemicalContractError::InvalidFraction)
        );
        assert_eq!(
            UnitFraction::try_new(-f64::MIN_POSITIVE),
            Err(ChemicalContractError::InvalidFraction)
        );
        assert_eq!(
            UnitFraction::try_new(f64::INFINITY),
            Err(ChemicalContractError::InvalidFraction)
        );
    }

    #[test]
    fn deterministic_release_keeps_amount_separate_from_probability() {
        let contract = VesicularResourceContract::try_new(2.0e-18, fraction(0.4), fraction(0.25))
            .expect("contract must be valid");
        let release = contract.planned_release();
        assert!((release.released_fraction() - 0.1).abs() < f64::EPSILON);
        assert!((release.released_moles() - 2.0e-19).abs() < 1.0e-34);
        assert!(release.released_fraction() <= contract.available().get());

        for available in [0.0, 0.25, 1.0] {
            for utilization in [0.0, 0.25, 1.0] {
                let bounded = VesicularResourceContract::try_new(
                    1.0,
                    fraction(available),
                    fraction(utilization),
                )
                .expect("bounded resource must be valid")
                .planned_release();
                assert!(bounded.released_fraction() <= available);
            }
        }
    }

    #[test]
    fn transmitter_ledger_conserves_all_declared_stocks() {
        let tolerance = ConservationTolerance::try_new(1.0e-24, fraction(1.0e-12))
            .expect("tolerance must be valid");
        let ledger = TransmitterMassLedger::try_new(6.0e-19, 2.0e-19, 0.5e-19, 1.0e-19, 0.5e-19)
            .expect("ledger must be valid");
        assert_eq!(ledger.verify_conserved(1.0e-18, tolerance), Ok(()));

        let duplicated =
            TransmitterMassLedger::try_new(6.0e-19, 3.0e-19, 0.5e-19, 1.0e-19, 0.5e-19)
                .expect("ledger must be finite");
        assert!(matches!(
            duplicated.verify_conserved(1.0e-18, tolerance),
            Err(ChemicalContractError::MassNotConserved { .. })
        ));
        assert_eq!(
            TransmitterMassLedger::try_new(-1.0, 0.0, 0.0, 0.0, 0.0),
            Err(ChemicalContractError::InvalidMoles)
        );
        assert_eq!(
            ConservationTolerance::try_new(-f64::MIN_POSITIVE, fraction(0.0)),
            Err(ChemicalContractError::InvalidTolerance)
        );
    }

    #[test]
    fn membrane_charge_is_equal_and_opposite() {
        let transfer = MembraneChargeTransfer::try_new(3.0e-15, -3.0e-15)
            .expect("charge transfer must be finite");
        assert_eq!(transfer.verify_conserved(0.0), Ok(()));
        assert_eq!(
            transfer.intracellular_delta_coulombs().to_bits(),
            3.0e-15_f64.to_bits()
        );
        assert_eq!(
            transfer.extracellular_delta_coulombs().to_bits(),
            (-3.0e-15_f64).to_bits()
        );

        let imbalanced = MembraneChargeTransfer::try_new(3.0e-15, -2.0e-15)
            .expect("charge transfer must be finite");
        assert!(matches!(
            imbalanced.verify_conserved(1.0e-18),
            Err(ChemicalContractError::ChargeNotConserved { .. })
        ));
        assert_eq!(
            MembraneChargeTransfer::try_new(f64::INFINITY, 0.0),
            Err(ChemicalContractError::InvalidCharge)
        );
    }
}
