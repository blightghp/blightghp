// A posição de cada sinapse no array de origem já é seu ID estável, atribuído uma vez
// na geração da topologia. O CSR só reordena esses IDs em duas direções de leitura.

export interface SynapseEndpoints {
  from: number;
  to: number;
}

export interface SynapseCsr {
  nodeCount: number;
  synapseCount: number;
  outgoingOffsets: Uint32Array;
  outgoingSynapseIds: Uint32Array;
  incomingOffsets: Uint32Array;
  incomingSynapseIds: Uint32Array;
}

interface RowIndex {
  offsets: Uint32Array;
  ids: Uint32Array;
}

function buildRowIndex(
  synapseCount: number,
  nodeCount: number,
  rowOf: (synapseId: number) => number,
  columnOf: (synapseId: number) => number,
): RowIndex {
  const degree = new Uint32Array(nodeCount);
  for (let id = 0; id < synapseCount; id += 1) degree[rowOf(id)] += 1;

  const offsets = new Uint32Array(nodeCount + 1);
  for (let node = 0; node < nodeCount; node += 1) {
    offsets[node + 1] = offsets[node] + degree[node];
  }

  const order = Array.from({ length: synapseCount }, (_, id) => id);
  order.sort((a, b) => rowOf(a) - rowOf(b) || columnOf(a) - columnOf(b) || a - b);

  return { offsets, ids: Uint32Array.from(order) };
}

export function buildSynapseCsr(
  nodeCount: number,
  synapses: readonly SynapseEndpoints[],
): SynapseCsr {
  const synapseCount = synapses.length;
  const from = (id: number): number => synapses[id].from;
  const to = (id: number): number => synapses[id].to;

  const outgoing = buildRowIndex(synapseCount, nodeCount, from, to);
  const incoming = buildRowIndex(synapseCount, nodeCount, to, from);

  return {
    nodeCount,
    synapseCount,
    outgoingOffsets: outgoing.offsets,
    outgoingSynapseIds: outgoing.ids,
    incomingOffsets: incoming.offsets,
    incomingSynapseIds: incoming.ids,
  };
}

export function outgoingRow(csr: SynapseCsr, node: number): Uint32Array {
  return csr.outgoingSynapseIds.subarray(csr.outgoingOffsets[node], csr.outgoingOffsets[node + 1]);
}

export function incomingRow(csr: SynapseCsr, node: number): Uint32Array {
  return csr.incomingSynapseIds.subarray(csr.incomingOffsets[node], csr.incomingOffsets[node + 1]);
}
