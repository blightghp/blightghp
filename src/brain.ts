import * as THREE from "three";

export type BrainRegion = "leftHemi" | "rightHemi" | "cerebellum" | "stem";

export interface BrainData {
  nodes: THREE.Vector3[];
  edges: [number, number][];
  paths: number[][];
  signalPaths: number[][];
  regionByNode: BrainRegion[];
  groups: Record<BrainRegion, number[]>;
}

export interface BrainGenerationOptions {
  seed?: number;
  surfaceNodesPerHemisphere?: number;
  innerNodesPerHemisphere?: number;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

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

export function generateBrainData(options: BrainGenerationOptions = {}): BrainData {
  const {
    seed = 0x51a7c0de,
    surfaceNodesPerHemisphere = 620,
    innerNodesPerHemisphere = 110,
  } = options;
  const random = mulberry32(seed);
  const nodes: THREE.Vector3[] = [];
  const regionByNode: BrainRegion[] = [];
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

  const buildPath = (minimumLength: number, maximumLength: number): number[] => {
    const start = Math.floor(random() * nodes.length);
    const path = [start];
    const targetLength = minimumLength + Math.floor(random() * (maximumLength - minimumLength + 1));
    let current = start;
    for (let i = 1; i < targetLength; i += 1) {
      const previous = path[path.length - 2];
      const candidates = adjacency[current].filter((node) => node !== previous);
      if (candidates.length === 0) break;
      current = candidates[Math.floor(random() * candidates.length)];
      path.push(current);
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

  return { nodes, edges, paths, signalPaths, regionByNode, groups };
}
