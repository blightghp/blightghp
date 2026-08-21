import * as THREE from "three";
import type { BrainData, BrainRegion } from "../brain";

export const PROCEDURAL_SURFACE_SCHEMA_VERSION = 1 as const;
export const PROCEDURAL_SURFACE_ALGORITHM_VERSION = "r10-d-simplex-ridge-v1" as const;
export const PROCEDURAL_SURFACE_BUILD_CEILING_MS = 120;
export const PROCEDURAL_SURFACE_HIGH_TRIANGLE_CEILING = 52_000;
export const PROCEDURAL_SURFACE_LOW_TRIANGLE_CEILING = 14_000;

export const PROCEDURAL_SURFACE_REGIONS = [
  "leftHemi",
  "rightHemi",
  "cerebellum",
  "stem",
] as const satisfies readonly BrainRegion[];

export type ProceduralSurfaceLod = "high" | "low";

const LOD_DETAILS: Readonly<Record<ProceduralSurfaceLod, Readonly<Record<BrainRegion, number>>>> = {
  high: { leftHemi: 9, rightHemi: 9, cerebellum: 7, stem: 4 },
  low: { leftHemi: 4, rightHemi: 4, cerebellum: 3, stem: 2 },
};

const REGION_STREAMS: Readonly<Record<BrainRegion, number>> = {
  leftHemi: 0x2d17a4c3,
  rightHemi: 0x71c39e25,
  cerebellum: 0x49b8d60f,
  stem: 0x13e7ac91,
};

const MAXIMUM_REGION_POINTS = 4_096;
const MAXIMUM_COORDINATE_MAGNITUDE = 16;
const FNV_OFFSET_HIGH = 0xcbf29ce4;
const FNV_OFFSET_LOW = 0x84222325;
const FNV_PRIME_LOW = 0x1b3;
const UINT32_RANGE = 0x1_0000_0000;

export interface ProceduralSurfaceRegionAudit {
  readonly region: BrainRegion;
  readonly lod: ProceduralSurfaceLod;
  readonly seed: number;
  readonly stream: number;
  readonly algorithm: typeof PROCEDURAL_SURFACE_ALGORITHM_VERSION;
  readonly detail: number;
  readonly vertices: number;
  readonly triangles: number;
  readonly geometryBytes: number;
  readonly hash: string;
  readonly bakedAttributes: readonly ["aoFactor", "curvature", "thickness"];
}

export interface ProceduralSurfaceSetAudit {
  readonly schemaVersion: typeof PROCEDURAL_SURFACE_SCHEMA_VERSION;
  readonly algorithmVersion: typeof PROCEDURAL_SURFACE_ALGORITHM_VERSION;
  readonly seed: number;
  readonly buildMilliseconds: number;
  readonly buildCeilingMilliseconds: number;
  readonly totalTriangles: Readonly<Record<ProceduralSurfaceLod, number>>;
  readonly totalGeometryBytes: Readonly<Record<ProceduralSurfaceLod, number>>;
  readonly regions: readonly ProceduralSurfaceRegionAudit[];
  readonly surfaceGeometryHash: string;
  readonly contractReady: boolean;
}

export interface ProceduralSurfaceSet {
  readonly geometries: Readonly<
    Record<BrainRegion, Readonly<Record<ProceduralSurfaceLod, THREE.BufferGeometry>>>
  >;
  readonly audit: ProceduralSurfaceSetAudit;
}

export interface ProceduralSurfaceBuildOptions {
  readonly buildCeilingMilliseconds?: number;
  readonly now?: () => number;
}

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const GRAD_X = new Float32Array([1, -1, 1, -1, 1, -1, 1, -1, 0, 0, 0, 0]);
const GRAD_Y = new Float32Array([1, 1, -1, -1, 0, 0, 0, 0, 1, -1, 1, -1]);
const GRAD_Z = new Float32Array([0, 0, 0, 0, 1, 1, -1, -1, 1, 1, -1, -1]);

const ICOSAHEDRON_RATIO = (1 + Math.sqrt(5)) / 2;
const ICOSAHEDRON_VERTICES = [
  [-1, ICOSAHEDRON_RATIO, 0], [1, ICOSAHEDRON_RATIO, 0],
  [-1, -ICOSAHEDRON_RATIO, 0], [1, -ICOSAHEDRON_RATIO, 0],
  [0, -1, ICOSAHEDRON_RATIO], [0, 1, ICOSAHEDRON_RATIO],
  [0, -1, -ICOSAHEDRON_RATIO], [0, 1, -ICOSAHEDRON_RATIO],
  [ICOSAHEDRON_RATIO, 0, -1], [ICOSAHEDRON_RATIO, 0, 1],
  [-ICOSAHEDRON_RATIO, 0, -1], [-ICOSAHEDRON_RATIO, 0, 1],
] as const;
const ICOSAHEDRON_FACES = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
  [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
  [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
] as const;

interface IcosphereTopology {
  readonly positions: Float32Array;
  readonly indices: Uint16Array;
}

const ICOSPHERE_TOPOLOGY_CACHE = new Map<number, IcosphereTopology>();

function createIcosphereTopology(frequency: number): IcosphereTopology {
  const cached = ICOSPHERE_TOPOLOGY_CACHE.get(frequency);
  if (cached) return cached;
  const coordinates: number[] = [];
  const indices: number[] = [];
  const vertexByPosition = new Map<string, number>();
  const vertexIndex = (x: number, y: number, z: number): number => {
    const inverseLength = 1 / Math.hypot(x, y, z);
    const nx = x * inverseLength;
    const ny = y * inverseLength;
    const nz = z * inverseLength;
    const key = `${Math.round(nx * 1e8)},${Math.round(ny * 1e8)},${Math.round(nz * 1e8)}`;
    const existing = vertexByPosition.get(key);
    if (existing !== undefined) return existing;
    const index = coordinates.length / 3;
    coordinates.push(nx, ny, nz);
    vertexByPosition.set(key, index);
    return index;
  };
  for (const [aIndex, bIndex, cIndex] of ICOSAHEDRON_FACES) {
    const a = ICOSAHEDRON_VERTICES[aIndex];
    const b = ICOSAHEDRON_VERTICES[bIndex];
    const c = ICOSAHEDRON_VERTICES[cIndex];
    const grid: number[][] = [];
    for (let row = 0; row <= frequency; row += 1) {
      const values: number[] = [];
      for (let column = 0; column <= frequency - row; column += 1) {
        const aWeight = (frequency - row - column) / frequency;
        const bWeight = row / frequency;
        const cWeight = column / frequency;
        values.push(vertexIndex(
          a[0] * aWeight + b[0] * bWeight + c[0] * cWeight,
          a[1] * aWeight + b[1] * bWeight + c[1] * cWeight,
          a[2] * aWeight + b[2] * bWeight + c[2] * cWeight,
        ));
      }
      grid.push(values);
    }
    for (let row = 0; row < frequency; row += 1) {
      for (let column = 0; column < frequency - row; column += 1) {
        const aVertex = grid[row][column];
        const bVertex = grid[row + 1][column];
        const cVertex = grid[row][column + 1];
        indices.push(aVertex, bVertex, cVertex);
        if (column < frequency - row - 1) {
          indices.push(bVertex, grid[row + 1][column + 1], cVertex);
        }
      }
    }
  }
  if (coordinates.length / 3 > 0xffff) {
    throw new Error("procedural icosphere exceeds 16-bit topology budget");
  }
  const topology = {
    positions: Float32Array.from(coordinates),
    indices: Uint16Array.from(indices),
  };
  ICOSPHERE_TOPOLOGY_CACHE.set(frequency, topology);
  return topology;
}

function createIcosphereGeometry(detail: number): THREE.BufferGeometry {
  const topology = createIcosphereTopology(detail + 1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(topology.positions.slice(), 3));
  geometry.setIndex(new THREE.BufferAttribute(topology.indices.slice(), 1));
  return geometry;
}

class SimplexNoise3D {
  private readonly permutation = new Uint8Array(512);

  constructor(seed: number) {
    const random = mulberry32(seed);
    const values = Uint8Array.from({ length: 256 }, (_, index) => index);
    for (let index = values.length - 1; index > 0; index -= 1) {
      const target = Math.floor(random() * (index + 1));
      const current = values[index];
      values[index] = values[target];
      values[target] = current;
    }
    for (let index = 0; index < 512; index += 1) {
      this.permutation[index] = values[index & 255];
    }
  }

  noise(x: number, y: number, z: number): number {
    const skew = (x + y + z) / 3;
    const i = Math.floor(x + skew);
    const j = Math.floor(y + skew);
    const k = Math.floor(z + skew);
    const unskew = (i + j + k) / 6;
    const x0 = x - (i - unskew);
    const y0 = y - (j - unskew);
    const z0 = z - (k - unskew);

    let i1 = 0;
    let j1 = 0;
    let k1 = 0;
    let i2 = 0;
    let j2 = 0;
    let k2 = 0;
    if (x0 >= y0) {
      if (y0 >= z0) {
        i1 = 1; i2 = 1; j2 = 1;
      } else if (x0 >= z0) {
        i1 = 1; i2 = 1; k2 = 1;
      } else {
        k1 = 1; i2 = 1; k2 = 1;
      }
    } else if (y0 < z0) {
      k1 = 1; j2 = 1; k2 = 1;
    } else if (x0 < z0) {
      j1 = 1; j2 = 1; k2 = 1;
    } else {
      j1 = 1; i2 = 1; j2 = 1;
    }

    const x1 = x0 - i1 + 1 / 6;
    const y1 = y0 - j1 + 1 / 6;
    const z1 = z0 - k1 + 1 / 6;
    const x2 = x0 - i2 + 1 / 3;
    const y2 = y0 - j2 + 1 / 3;
    const z2 = z0 - k2 + 1 / 3;
    const x3 = x0 - 0.5;
    const y3 = y0 - 0.5;
    const z3 = z0 - 0.5;
    const ii = i & 255;
    const jj = j & 255;
    const kk = k & 255;
    const gi0 = this.permutation[ii + this.permutation[jj + this.permutation[kk]]] % 12;
    const gi1 = this.permutation[
      ii + i1 + this.permutation[jj + j1 + this.permutation[kk + k1]]
    ] % 12;
    const gi2 = this.permutation[
      ii + i2 + this.permutation[jj + j2 + this.permutation[kk + k2]]
    ] % 12;
    const gi3 = this.permutation[
      ii + 1 + this.permutation[jj + 1 + this.permutation[kk + 1]]
    ] % 12;
    return 32 * (
      this.corner(gi0, x0, y0, z0) +
      this.corner(gi1, x1, y1, z1) +
      this.corner(gi2, x2, y2, z2) +
      this.corner(gi3, x3, y3, z3)
    );
  }

  private corner(gi: number, x: number, y: number, z: number): number {
    const attenuation = 0.6 - x * x - y * y - z * z;
    if (attenuation <= 0) return 0;
    const t2 = attenuation * attenuation;
    return t2 * t2 * (GRAD_X[gi] * x + GRAD_Y[gi] * y + GRAD_Z[gi] * z);
  }
}

function validateRegionInput(region: BrainRegion, points: readonly THREE.Vector3[], seed: number): void {
  if (!PROCEDURAL_SURFACE_REGIONS.includes(region)) {
    throw new Error(`unknown procedural surface region: ${String(region)}`);
  }
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new Error("procedural surface seed must be an unsigned 32-bit integer");
  }
  if (points.length < 4 || points.length > MAXIMUM_REGION_POINTS) {
    throw new Error(`procedural surface point count is outside 4..${MAXIMUM_REGION_POINTS}`);
  }
  for (const point of points) {
    if (
      ![point.x, point.y, point.z].every(Number.isFinite) ||
      Math.max(Math.abs(point.x), Math.abs(point.y), Math.abs(point.z)) >
        MAXIMUM_COORDINATE_MAGNITUDE
    ) {
      throw new Error("procedural surface contains an invalid point");
    }
  }
}

interface RegionEnvelope {
  readonly centerX: number;
  readonly centerY: number;
  readonly centerZ: number;
  readonly halfExtentX: number;
  readonly halfExtentY: number;
  readonly halfExtentZ: number;
  readonly anchorCount: number;
  readonly anchorX: Float32Array;
  readonly anchorY: Float32Array;
  readonly anchorZ: Float32Array;
  readonly anchorRadius: Float32Array;
  readonly meanAnchorRadius: number;
}

function deriveEnvelope(points: readonly THREE.Vector3[]): RegionEnvelope {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  const centerX = (minX + maxX) * 0.5;
  const centerY = (minY + maxY) * 0.5;
  const centerZ = (minZ + maxZ) * 0.5;
  const halfExtentX = Math.max(0.08, (maxX - minX) * 0.5 * 1.025);
  const halfExtentY = Math.max(0.08, (maxY - minY) * 0.5 * 1.025);
  const halfExtentZ = Math.max(0.08, (maxZ - minZ) * 0.5 * 1.025);

  const candX: number[] = [];
  const candY: number[] = [];
  const candZ: number[] = [];
  const candR: number[] = [];

  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    const lx = (p.x - centerX) / halfExtentX;
    const ly = (p.y - centerY) / halfExtentY;
    const lz = (p.z - centerZ) / halfExtentZ;
    const len = Math.hypot(lx, ly, lz);
    if (len >= 0.72) {
      const inv = len > 0 ? 1 / len : 0;
      candX.push(lx * inv);
      candY.push(ly * inv);
      candZ.push(lz * inv);
      candR.push(len);
    }
  }

  const stride = Math.max(1, Math.floor(candX.length / 48));
  const count = Math.min(48, Math.ceil(candX.length / stride));
  const anchorX = new Float32Array(count);
  const anchorY = new Float32Array(count);
  const anchorZ = new Float32Array(count);
  const anchorRadius = new Float32Array(count);
  let sumRadius = 0;
  let outIdx = 0;
  for (let i = 0; i < candX.length && outIdx < 48; i += stride) {
    anchorX[outIdx] = candX[i];
    anchorY[outIdx] = candY[i];
    anchorZ[outIdx] = candZ[i];
    anchorRadius[outIdx] = candR[i];
    sumRadius += candR[i];
    outIdx += 1;
  }
  const meanAnchorRadius = sumRadius / Math.max(1, outIdx);
  return {
    centerX,
    centerY,
    centerZ,
    halfExtentX,
    halfExtentY,
    halfExtentZ,
    anchorCount: outIdx,
    anchorX: anchorX.subarray(0, outIdx),
    anchorY: anchorY.subarray(0, outIdx),
    anchorZ: anchorZ.subarray(0, outIdx),
    anchorRadius: anchorRadius.subarray(0, outIdx),
    meanAnchorRadius,
  };
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function envelopeScale(
  dirX: number,
  dirY: number,
  dirZ: number,
  envelope: RegionEnvelope,
): number {
  let weightedRadius = 0;
  let totalWeight = 0;
  const count = envelope.anchorCount;
  const ax = envelope.anchorX;
  const ay = envelope.anchorY;
  const az = envelope.anchorZ;
  const ar = envelope.anchorRadius;
  for (let i = 0; i < count; i += 1) {
    const dot = dirX * ax[i] + dirY * ay[i] + dirZ * az[i];
    if (dot > 0) {
      const d2 = dot * dot;
      const d4 = d2 * d2;
      const d8 = d4 * d4;
      const weight = d8 * d2;
      weightedRadius += ar[i] * weight;
      totalWeight += weight;
    }
  }
  if (totalWeight <= Number.EPSILON) return 1;
  return THREE.MathUtils.clamp(
    0.94 + 0.08 * (weightedRadius / totalWeight / envelope.meanAnchorRadius),
    0.92,
    1.065,
  );
}

function octaveNoise(noise: SimplexNoise3D, x: number, y: number, z: number): number {
  let value = 0;
  let amplitude = 0.58;
  let frequency = 1;
  let normalization = 0;
  for (let octave = 0; octave < 3; octave += 1) {
    value += noise.noise(x * frequency, y * frequency, z * frequency) * amplitude;
    normalization += amplitude;
    frequency *= 2.03;
    amplitude *= 0.5;
  }
  return value / normalization;
}

interface SurfaceSampleOut {
  x: number;
  y: number;
  z: number;
  aoFactor: number;
  curvature: number;
  thickness: number;
}

function sampleSurface(
  region: BrainRegion,
  dirX: number,
  dirY: number,
  dirZ: number,
  envelope: RegionEnvelope,
  noise: SimplexNoise3D,
  out: SurfaceSampleOut,
): void {
  const scale = envelopeScale(dirX, dirY, dirZ, envelope);
  const warpX = noise.noise(dirX * 1.13 + 7.1, dirY * 1.13, dirZ * 1.13) * 0.32;
  const warpY = noise.noise(dirX * 1.13, dirY * 1.13 + 13.7, dirZ * 1.13) * 0.32;
  const warpZ = noise.noise(dirX * 1.13, dirY * 1.13, dirZ * 1.13 + 19.3) * 0.32;

  let amplitude = 0.024;
  let grooveDepth = 0;
  let displacement = 0;
  if (region === "leftHemi" || region === "rightHemi") {
    amplitude = 0.132;
    const frequency = 2.85;
    const folded = octaveNoise(
      noise,
      dirX * frequency + warpX,
      dirY * frequency + warpY,
      dirZ * frequency + warpZ,
    );
    const secondary = noise.noise(
      dirX * 6.4 - warpZ,
      dirY * 6.4 + warpX,
      dirZ * 6.4 + warpY,
    );
    grooveDepth = THREE.MathUtils.clamp((1 - Math.abs(folded)) ** 2.4 *
      (0.72 + Math.abs(secondary) * 0.28), 0, 1);
    displacement = amplitude * (0.18 - grooveDepth * 1.08 + secondary * 0.055);
  } else if (region === "cerebellum") {
    amplitude = 0.072;
    const phase = (dirY * 0.92 + dirZ * 0.16 + warpY * 0.07) *
      Math.PI * 8.5;
    const band = Math.sin(phase);
    const crossNoise = octaveNoise(noise, dirX * 3.8, dirY * 3.8, dirZ * 3.8);
    grooveDepth = THREE.MathUtils.clamp((1 - Math.abs(band)) ** 4 *
      (0.84 + Math.abs(crossNoise) * 0.16), 0, 1);
    displacement = amplitude * (0.14 - grooveDepth * 1.18 + crossNoise * 0.04);
  } else {
    const stemNoise = octaveNoise(
      noise,
      dirX * 2.2 + warpX,
      dirY * 2.2 + warpY,
      dirZ * 2.2 + warpZ,
    );
    grooveDepth = (1 - Math.abs(stemNoise)) ** 2 * 0.32;
    displacement = amplitude * (0.1 - grooveDepth * 0.45);
  }

  let posX = envelope.centerX + dirX * envelope.halfExtentX * scale + dirX * displacement;
  const posY = envelope.centerY + dirY * envelope.halfExtentY * scale + dirY * displacement;
  const posZ = envelope.centerZ + dirZ * envelope.halfExtentZ * scale + dirZ * displacement;

  if (region === "leftHemi" || region === "rightHemi") {
    const side = region === "leftHemi" ? -1 : 1;
    const medialDirection = -side * dirX;
    const medialBlend = smoothstep(0.16, 0.78, medialDirection);
    posX = THREE.MathUtils.lerp(posX, side * 0.085, medialBlend * 0.94);
  }

  out.x = posX;
  out.y = posY;
  out.z = posZ;
  out.aoFactor = THREE.MathUtils.clamp(1 - grooveDepth * 0.52, 0.42, 1);
  out.curvature = THREE.MathUtils.clamp(0.18 - grooveDepth * 1.18, -1, 1);
  out.thickness = THREE.MathUtils.clamp(
    0.56 + (1 - Math.abs(dirY)) * 0.18 + (1 - grooveDepth) * 0.16,
    0,
    1,
  );
}

interface Fnv64State {
  high: number;
  low: number;
}

function createHash(): Fnv64State {
  return { high: FNV_OFFSET_HIGH, low: FNV_OFFSET_LOW };
}

function updateHashByte(hash: Fnv64State, value: number): void {
  const low = (hash.low ^ (value & 0xff)) >>> 0;
  const lowProduct = low * FNV_PRIME_LOW;
  hash.low = lowProduct >>> 0;
  hash.high = (
    hash.high * FNV_PRIME_LOW +
    Math.floor(lowProduct / UINT32_RANGE) +
    low * 0x100
  ) >>> 0;
}

function updateHashInteger(hash: Fnv64State, value: number): void {
  const normalized = value | 0;
  for (let shift = 0; shift < 32; shift += 8) {
    updateHashByte(hash, normalized >>> shift);
  }
}

function hashHex(hash: Fnv64State): string {
  return hash.high.toString(16).padStart(8, "0") +
    hash.low.toString(16).padStart(8, "0");
}

function hashGeometry(
  region: BrainRegion,
  lod: ProceduralSurfaceLod,
  geometry: THREE.BufferGeometry,
): string {
  const hash = createHash();
  for (const byte of new TextEncoder().encode(`${PROCEDURAL_SURFACE_ALGORITHM_VERSION}:${region}:${lod}`)) {
    updateHashByte(hash, byte);
  }
  const position = geometry.getAttribute("position");
  const ao = geometry.getAttribute("aoFactor");
  const curvature = geometry.getAttribute("curvature");
  const thickness = geometry.getAttribute("thickness");
  for (let index = 0; index < position.count; index += 1) {
    updateHashInteger(hash, Math.round(position.getX(index) * 100_000));
    updateHashInteger(hash, Math.round(position.getY(index) * 100_000));
    updateHashInteger(hash, Math.round(position.getZ(index) * 100_000));
    updateHashInteger(hash, Math.round(ao.getX(index) * 100_000));
    updateHashInteger(hash, Math.round(curvature.getX(index) * 100_000));
    updateHashInteger(hash, Math.round(thickness.getX(index) * 100_000));
  }
  const indices = geometry.index;
  if (indices) {
    for (let index = 0; index < indices.count; index += 1) {
      updateHashInteger(hash, indices.getX(index));
    }
  }
  return hashHex(hash);
}

function geometryBytes(geometry: THREE.BufferGeometry): number {
  const buffers = new Set<ArrayBufferLike>();
  let bytes = 0;
  const attributes = [geometry.index, ...Object.values(geometry.attributes)].filter(
    (attribute): attribute is THREE.BufferAttribute | THREE.InterleavedBufferAttribute =>
      attribute instanceof THREE.BufferAttribute ||
      attribute instanceof THREE.InterleavedBufferAttribute,
  );
  for (const attribute of attributes) {
    const array = attribute instanceof THREE.InterleavedBufferAttribute
      ? attribute.data.array
      : attribute.array;
    if (buffers.has(array.buffer)) continue;
    buffers.add(array.buffer);
    bytes += array.byteLength;
  }
  return bytes;
}

export function buildProceduralSurface(
  region: BrainRegion,
  points: readonly THREE.Vector3[],
  seed: number,
  lod: ProceduralSurfaceLod,
): { geometry: THREE.BufferGeometry; audit: ProceduralSurfaceRegionAudit } {
  validateRegionInput(region, points, seed);
  if (lod !== "high" && lod !== "low") throw new Error(`unknown procedural surface LOD: ${lod}`);
  const detail = LOD_DETAILS[lod][region];
  const stream = (seed ^ REGION_STREAMS[region]) >>> 0;
  const noise = new SimplexNoise3D(stream);
  const envelope = deriveEnvelope(points);
  const geometry = createIcosphereGeometry(detail);
  const positions = geometry.getAttribute("position") as THREE.BufferAttribute;
  const ao = new Float32Array(positions.count);
  const curvature = new Float32Array(positions.count);
  const thickness = new Float32Array(positions.count);
  const colors = new Float32Array(positions.count * 3);
  const uvs = new Float32Array(positions.count * 2);
  const sampleOut: SurfaceSampleOut = {
    x: 0,
    y: 0,
    z: 0,
    aoFactor: 0,
    curvature: 0,
    thickness: 0,
  };
  for (let index = 0; index < positions.count; index += 1) {
    const px = positions.getX(index);
    const py = positions.getY(index);
    const pz = positions.getZ(index);
    const len = Math.hypot(px, py, pz);
    const invLen = len > 0 ? 1 / len : 0;
    const dirX = px * invLen;
    const dirY = py * invLen;
    const dirZ = pz * invLen;
    sampleSurface(region, dirX, dirY, dirZ, envelope, noise, sampleOut);
    positions.setXYZ(index, sampleOut.x, sampleOut.y, sampleOut.z);
    ao[index] = sampleOut.aoFactor;
    curvature[index] = sampleOut.curvature;
    thickness[index] = sampleOut.thickness;
    const shade = 0.22 + sampleOut.aoFactor * 0.78;
    colors[index * 3] = shade * (1 + Math.max(0, sampleOut.curvature) * 0.04);
    colors[index * 3 + 1] = shade;
    colors[index * 3 + 2] = shade * (1 - Math.max(0, -sampleOut.curvature) * 0.055);
    uvs[index * 2] = Math.atan2(dirZ, dirX) / (Math.PI * 2) + 0.5;
    uvs[index * 2 + 1] = Math.asin(THREE.MathUtils.clamp(dirY, -1, 1)) /
      Math.PI + 0.5;
  }
  positions.needsUpdate = true;
  geometry.setAttribute("aoFactor", new THREE.BufferAttribute(ao, 1));
  geometry.setAttribute("curvature", new THREE.BufferAttribute(curvature, 1));
  geometry.setAttribute("thickness", new THREE.BufferAttribute(thickness, 1));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const triangles = (geometry.index?.count ?? positions.count) / 3;
  const hash = hashGeometry(region, lod, geometry);
  geometry.name = `r10-d-${region}-${lod}-${hash}`;
  geometry.userData.presentationGeometryFamily = `r10-d:${region}:surface`;
  geometry.userData.surfaceGeometryHash = hash;
  geometry.userData.proceduralSurfaceLod = lod;
  return {
    geometry,
    audit: {
      region,
      lod,
      seed,
      stream,
      algorithm: PROCEDURAL_SURFACE_ALGORITHM_VERSION,
      detail,
      vertices: positions.count,
      triangles,
      geometryBytes: geometryBytes(geometry),
      hash,
      bakedAttributes: ["aoFactor", "curvature", "thickness"],
    },
  };
}

function aggregateHash(audits: readonly ProceduralSurfaceRegionAudit[]): string {
  const hash = createHash();
  for (const audit of audits) {
    for (const byte of new TextEncoder().encode(`${audit.region}:${audit.lod}:${audit.hash}`)) {
      updateHashByte(hash, byte);
    }
  }
  return hashHex(hash);
}

export function buildProceduralSurfaceSet(
  data: BrainData,
  options: ProceduralSurfaceBuildOptions = {},
): ProceduralSurfaceSet {
  const now = options.now ?? (() => performance.now());
  const buildCeilingMilliseconds = options.buildCeilingMilliseconds ??
    PROCEDURAL_SURFACE_BUILD_CEILING_MS;
  if (!Number.isFinite(buildCeilingMilliseconds) || buildCeilingMilliseconds <= 0) {
    throw new Error("procedural surface build ceiling must be finite and positive");
  }
  const started = now();
  const created: THREE.BufferGeometry[] = [];
  const audits: ProceduralSurfaceRegionAudit[] = [];
  const geometries = {} as Record<
    BrainRegion,
    Record<ProceduralSurfaceLod, THREE.BufferGeometry>
  >;
  try {
    for (const region of PROCEDURAL_SURFACE_REGIONS) {
      const regionGeometries = {} as Record<ProceduralSurfaceLod, THREE.BufferGeometry>;
      for (const lod of ["high", "low"] as const) {
        const built = buildProceduralSurface(
          region,
          data.groups[region].map((index) => data.nodes[index]),
          data.seed,
          lod,
        );
        regionGeometries[lod] = built.geometry;
        created.push(built.geometry);
        audits.push(built.audit);
      }
      geometries[region] = regionGeometries;
    }
    const buildMilliseconds = now() - started;
    const totalTriangles = {
      high: audits.filter((audit) => audit.lod === "high")
        .reduce((sum, audit) => sum + audit.triangles, 0),
      low: audits.filter((audit) => audit.lod === "low")
        .reduce((sum, audit) => sum + audit.triangles, 0),
    };
    const totalGeometryBytes = {
      high: audits.filter((audit) => audit.lod === "high")
        .reduce((sum, audit) => sum + audit.geometryBytes, 0),
      low: audits.filter((audit) => audit.lod === "low")
        .reduce((sum, audit) => sum + audit.geometryBytes, 0),
    };
    const contractReady =
      buildMilliseconds <= buildCeilingMilliseconds &&
      totalTriangles.high <= PROCEDURAL_SURFACE_HIGH_TRIANGLE_CEILING &&
      totalTriangles.low <= PROCEDURAL_SURFACE_LOW_TRIANGLE_CEILING &&
      audits.every((audit) => audit.bakedAttributes.length === 3);
    if (!contractReady) {
      throw new Error(
        `procedural surface budget exceeded: ${buildMilliseconds.toFixed(2)} ms, ` +
          `${totalTriangles.high}/${totalTriangles.low} triangles`,
      );
    }
    return {
      geometries,
      audit: {
        schemaVersion: PROCEDURAL_SURFACE_SCHEMA_VERSION,
        algorithmVersion: PROCEDURAL_SURFACE_ALGORITHM_VERSION,
        seed: data.seed,
        buildMilliseconds,
        buildCeilingMilliseconds,
        totalTriangles,
        totalGeometryBytes,
        regions: audits,
        surfaceGeometryHash: aggregateHash(audits),
        contractReady,
      },
    };
  } catch (error) {
    for (const geometry of created) geometry.dispose();
    throw error;
  }
}
