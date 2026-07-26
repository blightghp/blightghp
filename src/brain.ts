import * as THREE from "three";

export type BrainRegion = "leftHemi" | "rightHemi" | "cerebellum" | "stem";
export type NeuronKind = "excitatory" | "inhibitory";

export interface Synapse {
  from: number;
  to: number;
  weight: number;
  delay: number;
  plastic: boolean;
}

export interface CorticalFieldTopology {
  /**
   * Maps each field vertex to the procedural node that carries its position.
   * Only the outer left/right cortical samples belong to this domain.
   */
  nodeIndices: Uint32Array;
  /** Maps every procedural node to a field vertex, or -1 outside the cortex. */
  vertexByNode: Int32Array;
  /** CSR adjacency for the undirected cortical graph. */
  rowOffsets: Uint32Array;
  neighbors: Uint32Array;
  /** Euclidean edge lengths in the procedural spatial unit. */
  edgeLengths: Float32Array;
}

export interface BrainData {
  seed: number;
  generation: Required<BrainGenerationOptions>;
  nodes: THREE.Vector3[];
  edges: [number, number][];
  synapses: Synapse[];
  paths: number[][];
  signalPaths: number[][];
  regionByNode: BrainRegion[];
  neuronKindByNode: NeuronKind[];
  groups: Record<BrainRegion, number[]>;
  corticalField: CorticalFieldTopology;
}

export interface BrainGenerationOptions {
  seed?: number;
  surfaceNodesPerHemisphere?: number;
  innerNodesPerHemisphere?: number;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const FIELD_NEIGHBORS_PER_VERTEX = 6;

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function corticalScale(x: number, y: number, z: number): number {
  const folds =
    Math.sin(y * 15 + z * 5) * 0.045 +
    Math.sin(z * 18 - x * 7) * 0.035 +
    Math.cos((x + y) * 21) * 0.025;
  return 1 + folds;
}

function addNode(
  nodes: THREE.Vector3[],
  groups: BrainData["groups"],
  regionByNode: BrainRegion[],
  region: BrainRegion,
  point: THREE.Vector3,
): void {
  const index = nodes.push(point) - 1;
  groups[region].push(index);
  regionByNode[index] = region;
}

function buildCorticalFieldTopology(
  nodes: THREE.Vector3[],
  groups: BrainData["groups"],
  corticalSurfaceNodes: Record<"leftHemi" | "rightHemi", number[]>,
): CorticalFieldTopology {
  const nodeIndices = Uint32Array.from([
    ...corticalSurfaceNodes.leftHemi,
    ...corticalSurfaceNodes.rightHemi,
  ]);
  const vertexByNode = new Int32Array(nodes.length);
  vertexByNode.fill(-1);
  nodeIndices.forEach((node, vertex) => {
    vertexByNode[node] = vertex;
  });

  const adjacency = Array.from({ length: nodeIndices.length }, () => new Set<number>());
  const connectNearest = (surfaceNodes: number[]): void => {
    for (const node of surfaceNodes) {
      const vertex = vertexByNode[node];
      const nearest = surfaceNodes
        .filter((candidate) => candidate !== node)
        .map((candidate) => ({
          vertex: vertexByNode[candidate],
          distanceSquared: nodes[node].distanceToSquared(nodes[candidate]),
        }))
        .sort((a, b) =>
          a.distanceSquared - b.distanceSquared || a.vertex - b.vertex
        )
        .slice(0, FIELD_NEIGHBORS_PER_VERTEX);

      for (const candidate of nearest) {
        adjacency[vertex].add(candidate.vertex);
        adjacency[candidate.vertex].add(vertex);
      }
    }
  };
  connectNearest(corticalSurfaceNodes.leftHemi);
  connectNearest(corticalSurfaceNodes.rightHemi);

  // Inner cortical samples project to their closest surface vertex. Cerebellum
  // and stem intentionally remain outside the macroscopic cortical field.
  for (const region of ["leftHemi", "rightHemi"] as const) {
    const surfaceNodes = corticalSurfaceNodes[region];
    const surfaceSet = new Set(surfaceNodes);
    for (const node of groups[region]) {
      if (surfaceSet.has(node)) continue;
      let closest = surfaceNodes[0];
      let closestDistance = nodes[node].distanceToSquared(nodes[closest]);
      for (let index = 1; index < surfaceNodes.length; index += 1) {
        const candidate = surfaceNodes[index];
        const distance = nodes[node].distanceToSquared(nodes[candidate]);
        if (distance < closestDistance) {
          closest = candidate;
          closestDistance = distance;
        }
      }
      vertexByNode[node] = vertexByNode[closest];
    }
  }

  const rowOffsets = new Uint32Array(nodeIndices.length + 1);
  const neighborList: number[] = [];
  const edgeLengthList: number[] = [];
  for (let vertex = 0; vertex < nodeIndices.length; vertex += 1) {
    const orderedNeighbors = [...adjacency[vertex]].sort((a, b) => a - b);
    for (const neighbor of orderedNeighbors) {
      neighborList.push(neighbor);
      edgeLengthList.push(
        nodes[nodeIndices[vertex]].distanceTo(nodes[nodeIndices[neighbor]]),
      );
    }
    rowOffsets[vertex + 1] = neighborList.length;
  }

  return {
    nodeIndices,
    vertexByNode,
    rowOffsets,
    neighbors: Uint32Array.from(neighborList),
    edgeLengths: Float32Array.from(edgeLengthList),
  };
}

export function generateBrainData(options: BrainGenerationOptions = {}): BrainData {
  const {
    seed = 0x51a7c0de,
    surfaceNodesPerHemisphere = 620,
    innerNodesPerHemisphere = 110,
  } = options;
  const random = mulberry32(seed);
  const nodes: THREE.Vector3[] = [];
  const regionByNode: BrainRegion[] = [];
  const corticalSurfaceNodes: Record<"leftHemi" | "rightHemi", number[]> = {
    leftHemi: [],
    rightHemi: [],
  };
  const groups: BrainData["groups"] = {
    leftHemi: [],
    rightHemi: [],
    cerebellum: [],
    stem: [],
  };

  const makeHemisphere = (side: -1 | 1, region: BrainRegion): void => {
    for (let i = 0; i < surfaceNodesPerHemisphere; i += 1) {
      const vertical = 1 - (2 * (i + 0.5)) / surfaceNodesPerHemisphere;
      const ring = Math.sqrt(Math.max(0, 1 - vertical * vertical));
      const angle = i * GOLDEN_ANGLE + (random() - 0.5) * 0.06;
      const lateral = Math.abs(Math.cos(angle) * ring);
      const depth = Math.sin(angle) * ring;
      const scale = corticalScale(lateral, vertical, depth);
      const lowerTaper = 0.82 + 0.18 * Math.min(1, vertical + 1);

      const nodeIndex = nodes.length;
      addNode(
        nodes,
        groups,
        regionByNode,
        region,
        new THREE.Vector3(
          side * (0.075 + 1.14 * lateral * scale * lowerTaper),
          0.18 + 1.02 * vertical * scale,
          0.02 + 1.08 * depth * scale * (0.9 + 0.1 * lateral),
        ),
      );
      corticalSurfaceNodes[region as "leftHemi" | "rightHemi"].push(nodeIndex);
    }

    for (let i = 0; i < innerNodesPerHemisphere; i += 1) {
      const radius = Math.cbrt(random()) * 0.88;
      const vertical = random() * 2 - 1;
      const ring = Math.sqrt(Math.max(0, 1 - vertical * vertical));
      const angle = random() * Math.PI * 2;
      const lateral = Math.abs(Math.cos(angle) * ring);
      const depth = Math.sin(angle) * ring;

      addNode(
        nodes,
        groups,
        regionByNode,
        region,
        new THREE.Vector3(
          side * (0.075 + 1.04 * lateral * radius),
          0.18 + 0.94 * vertical * radius,
          0.02 + 0.98 * depth * radius,
        ),
      );
    }
  };

  makeHemisphere(-1, "leftHemi");
  makeHemisphere(1, "rightHemi");

  const cerebellumCount = 280;
  for (let i = 0; i < cerebellumCount; i += 1) {
    const vertical = 1 - (2 * (i + 0.5)) / cerebellumCount;
    const ring = Math.sqrt(Math.max(0, 1 - vertical * vertical));
    const angle = i * GOLDEN_ANGLE;
    const ripple = 1 + 0.06 * Math.sin(angle * 9) + 0.035 * Math.cos(vertical * 26);
    addNode(
      nodes,
      groups,
      regionByNode,
      "cerebellum",
      new THREE.Vector3(
        0.72 * Math.cos(angle) * ring * ripple,
        -0.72 + 0.4 * vertical,
        -0.73 + 0.36 * Math.sin(angle) * ring * ripple,
      ),
    );
  }

  const stemRings = 15;
  const stemRadial = 10;
  for (let ringIndex = 0; ringIndex < stemRings; ringIndex += 1) {
    const t = ringIndex / (stemRings - 1);
    const radius = 0.2 - t * 0.075;
    const y = -0.9 - t * 0.72;
    const zCenter = -0.22 + t * 0.12;
    for (let radial = 0; radial < stemRadial; radial += 1) {
      const angle = (radial / stemRadial) * Math.PI * 2 + ringIndex * 0.11;
      addNode(
        nodes,
        groups,
        regionByNode,
        "stem",
        new THREE.Vector3(
          Math.cos(angle) * radius,
          y,
          zCenter + Math.sin(angle) * radius * 0.72,
        ),
      );
    }
  }

  const edges: [number, number][] = [];
  const edgeKeys = new Set<string>();
  const adjacency: number[][] = Array.from({ length: nodes.length }, () => []);

  const connect = (a: number, b: number): void => {
    if (a === b) return;
    const u = Math.min(a, b);
    const v = Math.max(a, b);
    const key = `${u}:${v}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push([u, v]);
    adjacency[u].push(v);
    adjacency[v].push(u);
  };

  const connectRegion = (indices: number[], neighbours: number, maxDistance: number): void => {
    for (const index of indices) {
      const nearest: Array<{ index: number; distance: number }> = [];
      for (const candidate of indices) {
        if (candidate === index) continue;
        const distance = nodes[index].distanceToSquared(nodes[candidate]);
        if (distance <= maxDistance * maxDistance) nearest.push({ index: candidate, distance });
      }
      nearest.sort((a, b) => a.distance - b.distance);
      for (const candidate of nearest.slice(0, neighbours)) connect(index, candidate.index);
    }
  };

  connectRegion(groups.leftHemi, 4, 0.31);
  connectRegion(groups.rightHemi, 4, 0.31);
  connectRegion(groups.cerebellum, 5, 0.26);
  connectRegion(groups.stem, 4, 0.24);

  const medialLeft = groups.leftHemi
    .filter((index) => Math.abs(nodes[index].x) < 0.2 && nodes[index].y > -0.55)
    .sort((a, b) => nodes[a].y - nodes[b].y);
  const medialRight = groups.rightHemi.filter(
    (index) => Math.abs(nodes[index].x) < 0.2 && nodes[index].y > -0.55,
  );
  for (const left of medialLeft.filter((_, i) => i % 4 === 0)) {
    const right = medialRight.reduce((best, candidate) =>
      nodes[left].distanceToSquared(nodes[candidate]) < nodes[left].distanceToSquared(nodes[best])
        ? candidate
        : best,
    );
    connect(left, right);
  }

  const connectClosest = (from: number[], to: number[], step: number): void => {
    for (let i = 0; i < from.length; i += step) {
      const source = from[i];
      const target = to.reduce((best, candidate) =>
        nodes[source].distanceToSquared(nodes[candidate]) <
        nodes[source].distanceToSquared(nodes[best])
          ? candidate
          : best,
      );
      connect(source, target);
    }
  };
  connectClosest(groups.cerebellum, [...groups.leftHemi, ...groups.rightHemi], 14);
  connectClosest(groups.stem.slice(0, stemRadial * 3), groups.cerebellum, 5);

  const neuronKindByNode: NeuronKind[] = nodes.map(() =>
    random() < 0.82 ? "excitatory" : "inhibitory",
  );

  const synapses: Synapse[] = [];
  const addSynapse = (from: number, to: number): void => {
    const excitatory = neuronKindByNode[from] === "excitatory";
    const magnitude = excitatory ? 0.36 + random() * 0.28 : 0.3 + random() * 0.22;
    const distance = nodes[from].distanceTo(nodes[to]);
    synapses.push({
      from,
      to,
      weight: excitatory ? magnitude : -magnitude,
      delay: 0.024 + distance * 0.052 + random() * 0.012,
      plastic: excitatory && regionByNode[from] !== "stem",
    });
  };

  for (const [from, to] of edges) {
    addSynapse(from, to);
    addSynapse(to, from);
  }

  const buildPath = (minimumLength: number, maximumLength: number): number[] => {
    const start = Math.floor(random() * nodes.length);
    const path = [start];
    const visited = new Set(path);
    const targetLength = minimumLength + Math.floor(random() * (maximumLength - minimumLength + 1));
    let current = start;
    for (let i = 1; i < targetLength; i += 1) {
      const candidates = adjacency[current].filter((node) => !visited.has(node));
      if (candidates.length === 0) break;
      current = candidates[Math.floor(random() * candidates.length)];
      path.push(current);
      visited.add(current);
    }
    return path;
  };

  const paths = Array.from({ length: 300 }, () => buildPath(10, 22)).filter(
    (path) => path.length >= 6,
  );
  const signalPaths = [...paths]
    .sort((a, b) => {
      const spanA = nodes[a[0]].distanceTo(nodes[a[a.length - 1]]);
      const spanB = nodes[b[0]].distanceTo(nodes[b[b.length - 1]]);
      return spanB - spanA;
    })
    .slice(0, 18);
  const corticalField = buildCorticalFieldTopology(
    nodes,
    groups,
    corticalSurfaceNodes,
  );

  return {
    seed,
    generation: {
      seed,
      surfaceNodesPerHemisphere,
      innerNodesPerHemisphere,
    },
    nodes,
    edges,
    synapses,
    paths,
    signalPaths,
    regionByNode,
    neuronKindByNode,
    groups,
    corticalField,
  };
}
