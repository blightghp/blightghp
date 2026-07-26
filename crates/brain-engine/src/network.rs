use core::fmt;

/// Stable directed endpoints for one synapse.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct SynapseEndpoint {
    pub from: u32,
    pub to: u32,
}

/// Bidirectional compressed sparse row indexes over stable synapse IDs.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SynapseCsr {
    pub node_count: u32,
    pub synapse_count: u32,
    pub outgoing_offsets: Vec<u32>,
    pub outgoing_synapse_ids: Vec<u32>,
    pub incoming_offsets: Vec<u32>,
    pub incoming_synapse_ids: Vec<u32>,
}

impl SynapseCsr {
    /// Builds canonically ordered outgoing and incoming indexes.
    ///
    /// # Errors
    ///
    /// Returns [`CsrError`] when a synapse endpoint is outside the node buffer
    /// or the number of synapses cannot be represented by the `u32` wire
    /// protocol.
    pub fn build(node_count: u32, synapses: &[SynapseEndpoint]) -> Result<Self, CsrError> {
        let synapse_count = u32::try_from(synapses.len()).map_err(|_| CsrError::TooManySynapses)?;
        for (id, endpoint) in synapses.iter().copied().enumerate() {
            if endpoint.from >= node_count {
                return Err(CsrError::InvalidEndpoint {
                    synapse_id: id,
                    endpoint: endpoint.from,
                    node_count,
                });
            }
            if endpoint.to >= node_count {
                return Err(CsrError::InvalidEndpoint {
                    synapse_id: id,
                    endpoint: endpoint.to,
                    node_count,
                });
            }
        }

        let outgoing = build_row_index(node_count, synapses, |edge| edge.from, |edge| edge.to)?;
        let incoming = build_row_index(node_count, synapses, |edge| edge.to, |edge| edge.from)?;
        Ok(Self {
            node_count,
            synapse_count,
            outgoing_offsets: outgoing.0,
            outgoing_synapse_ids: outgoing.1,
            incoming_offsets: incoming.0,
            incoming_synapse_ids: incoming.1,
        })
    }

    #[must_use]
    pub fn outgoing_row(&self, node: u32) -> Option<&[u32]> {
        row(
            node,
            self.node_count,
            &self.outgoing_offsets,
            &self.outgoing_synapse_ids,
        )
    }

    #[must_use]
    pub fn incoming_row(&self, node: u32) -> Option<&[u32]> {
        row(
            node,
            self.node_count,
            &self.incoming_offsets,
            &self.incoming_synapse_ids,
        )
    }
}

type RowIndex = (Vec<u32>, Vec<u32>);

fn build_row_index(
    node_count: u32,
    synapses: &[SynapseEndpoint],
    row_of: impl Fn(SynapseEndpoint) -> u32,
    column_of: impl Fn(SynapseEndpoint) -> u32,
) -> Result<RowIndex, CsrError> {
    let node_len = usize::try_from(node_count).map_err(|_| CsrError::TooManyNodes)?;
    let mut degree = vec![0_u32; node_len];
    for endpoint in synapses.iter().copied() {
        let row = usize::try_from(row_of(endpoint)).map_err(|_| CsrError::TooManyNodes)?;
        degree[row] = degree[row]
            .checked_add(1)
            .ok_or(CsrError::TooManySynapses)?;
    }

    let mut offsets = vec![0_u32; node_len + 1];
    for node in 0..node_len {
        offsets[node + 1] = offsets[node]
            .checked_add(degree[node])
            .ok_or(CsrError::TooManySynapses)?;
    }

    let mut ids = (0..synapses.len()).collect::<Vec<_>>();
    ids.sort_unstable_by_key(|&id| {
        let endpoint = synapses[id];
        (row_of(endpoint), column_of(endpoint), id)
    });
    let ids = ids
        .into_iter()
        .map(|id| u32::try_from(id).map_err(|_| CsrError::TooManySynapses))
        .collect::<Result<Vec<_>, _>>()?;
    Ok((offsets, ids))
}

fn row<'a>(node: u32, node_count: u32, offsets: &[u32], ids: &'a [u32]) -> Option<&'a [u32]> {
    if node >= node_count {
        return None;
    }
    let node = usize::try_from(node).ok()?;
    let start = usize::try_from(offsets[node]).ok()?;
    let end = usize::try_from(offsets[node + 1]).ok()?;
    ids.get(start..end)
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CsrError {
    InvalidEndpoint {
        synapse_id: usize,
        endpoint: u32,
        node_count: u32,
    },
    TooManyNodes,
    TooManySynapses,
}

impl fmt::Display for CsrError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidEndpoint {
                synapse_id,
                endpoint,
                node_count,
            } => write!(
                formatter,
                "synapse {synapse_id} endpoint {endpoint} exceeds node count {node_count}"
            ),
            Self::TooManyNodes => formatter.write_str("node count exceeds this platform"),
            Self::TooManySynapses => {
                formatter.write_str("synapse count exceeds the u32 wire protocol")
            }
        }
    }
}

impl std::error::Error for CsrError {}
