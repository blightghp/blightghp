use core::fmt;
use std::collections::BTreeMap;

use crate::MAX_SAFE_TICK;

/// Stable address of an external input in a deterministic replay.
#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub struct InputAddress {
    pub tick: u64,
    pub sequence: u64,
}

/// One external input ordered canonically by `(tick, sequence)`.
#[derive(Clone, Debug, PartialEq)]
pub struct ScheduledInput<T> {
    pub address: InputAddress,
    pub payload: T,
}

/// Bounded, deterministic queue shared by interactive input and replay.
#[derive(Clone, Debug)]
pub struct DeterministicInputQueue<T> {
    entries: BTreeMap<InputAddress, T>,
    maximum_entries: usize,
}

impl<T> DeterministicInputQueue<T> {
    /// Creates an empty queue with an explicit resource envelope.
    ///
    /// # Errors
    ///
    /// Returns [`InputQueueError::InvalidCapacity`] for a zero capacity.
    pub fn new(maximum_entries: usize) -> Result<Self, InputQueueError> {
        if maximum_entries == 0 {
            return Err(InputQueueError::InvalidCapacity);
        }
        Ok(Self {
            entries: BTreeMap::new(),
            maximum_entries,
        })
    }

    /// Adds an input that will be applied before the addressed tick is stepped.
    ///
    /// # Errors
    ///
    /// Rejects past/current ticks, unsafe ticks, duplicate addresses and queue
    /// growth beyond the declared resource envelope.
    pub fn schedule(
        &mut self,
        current_tick: u64,
        tick: u64,
        sequence: u64,
        payload: T,
    ) -> Result<(), InputQueueError> {
        if tick <= current_tick {
            return Err(InputQueueError::TickNotFuture { current_tick, tick });
        }
        if tick > MAX_SAFE_TICK {
            return Err(InputQueueError::TickOverflow);
        }
        let address = InputAddress { tick, sequence };
        if self.entries.contains_key(&address) {
            return Err(InputQueueError::DuplicateAddress(address));
        }
        if self.entries.len() >= self.maximum_entries {
            return Err(InputQueueError::CapacityExceeded {
                maximum: self.maximum_entries,
            });
        }
        self.entries.insert(address, payload);
        Ok(())
    }

    /// Removes all inputs for `tick`, preserving ascending sequence order.
    pub fn drain_tick(&mut self, tick: u64) -> Vec<ScheduledInput<T>> {
        let start = InputAddress { tick, sequence: 0 };
        let end = InputAddress {
            tick,
            sequence: u64::MAX,
        };
        let addresses = self
            .entries
            .range(start..=end)
            .map(|(address, _)| *address)
            .collect::<Vec<_>>();
        addresses
            .into_iter()
            .filter_map(|address| {
                self.entries
                    .remove(&address)
                    .map(|payload| ScheduledInput { address, payload })
            })
            .collect()
    }

    pub fn clear(&mut self) {
        self.entries.clear();
    }

    #[must_use]
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum InputQueueError {
    InvalidCapacity,
    TickNotFuture { current_tick: u64, tick: u64 },
    TickOverflow,
    DuplicateAddress(InputAddress),
    CapacityExceeded { maximum: usize },
}

impl fmt::Display for InputQueueError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidCapacity => formatter.write_str("input queue capacity must be positive"),
            Self::TickNotFuture { current_tick, tick } => write!(
                formatter,
                "input tick {tick} must be greater than current tick {current_tick}"
            ),
            Self::TickOverflow => formatter.write_str("input tick exceeds the safe range"),
            Self::DuplicateAddress(address) => write!(
                formatter,
                "duplicate input address ({}, {})",
                address.tick, address.sequence
            ),
            Self::CapacityExceeded { maximum } => {
                write!(formatter, "input queue exceeds its {maximum}-entry limit")
            }
        }
    }
}

impl std::error::Error for InputQueueError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn drains_by_tick_and_sequence_independently_of_insertion_order() {
        let mut queue = DeterministicInputQueue::new(4).unwrap();
        queue.schedule(0, 4, 8, "third").unwrap();
        queue.schedule(0, 2, 9, "later-tick-first").unwrap();
        queue.schedule(0, 4, 2, "second").unwrap();
        queue.schedule(0, 4, 1, "first").unwrap();
        assert_eq!(
            queue
                .drain_tick(4)
                .into_iter()
                .map(|entry| entry.payload)
                .collect::<Vec<_>>(),
            ["first", "second", "third"]
        );
        assert_eq!(queue.len(), 1);
    }

    #[test]
    fn rejects_ambiguous_and_unbounded_schedules() {
        let mut queue = DeterministicInputQueue::new(1).unwrap();
        assert!(matches!(
            queue.schedule(5, 5, 0, ()),
            Err(InputQueueError::TickNotFuture { .. })
        ));
        queue.schedule(5, 6, 0, ()).unwrap();
        assert!(matches!(
            queue.schedule(5, 7, 0, ()),
            Err(InputQueueError::CapacityExceeded { maximum: 1 })
        ));
    }
}
