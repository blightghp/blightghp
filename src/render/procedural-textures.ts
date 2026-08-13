import * as THREE from "three";

export type ProceduralNormalMapType = "cortical" | "membrane" | "vesicle";

const DEFAULT_NORMAL_MAP_SIZE = 256;
const DEFAULT_SEEDS: Readonly<Record<ProceduralNormalMapType, number>> = {
  cortical: 0xc07a1ca1,
  membrane: 0xb11a9e01,
  vesicle: 0x7e51c1e0,
};

function fnv1a(value: number): number {
  let hash = 0x811c9dc5;
  for (let shift = 0; shift < 32; shift += 8) {
    hash ^= (value >>> shift) & 0xff;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function createPrng(seed: number): () => number {
  let state = fnv1a(seed >>> 0) || 0x6d2b79f5;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
  };
}

function wrappedIndex(value: number, size: number): number {
  return ((value % size) + size) % size;
}

function blurWrapped(source: Float32Array, width: number, height: number, passes: number): Float32Array {
  let current = source;
  for (let pass = 0; pass < passes; pass += 1) {
    const next = new Float32Array(current.length);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let total = 0;
        let weight = 0;
        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
          for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            const sampleWeight = offsetX === 0 && offsetY === 0 ? 4 : 1;
            const sampleX = wrappedIndex(x + offsetX, width);
            const sampleY = wrappedIndex(y + offsetY, height);
            total += current[sampleY * width + sampleX] * sampleWeight;
            weight += sampleWeight;
          }
        }
        next[y * width + x] = total / weight;
      }
    }
    current = next;
  }
  return current;
}

function corticalHeightField(width: number, height: number, random: () => number): Float32Array {
  const field = new Float32Array(width * height);
  const waves = Array.from({ length: 7 }, (_, index) => ({
    direction: random() * Math.PI,
    frequency: 1.35 + index * 0.58 + random() * 0.35,
    phase: random() * Math.PI * 2,
    amplitude: 0.8 / (1 + index * 0.42),
  }));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const u = x / width;
      const v = y / height;
      let heightValue = 0;
      for (const wave of waves) {
        const projected = u * Math.cos(wave.direction) + v * Math.sin(wave.direction);
        const ridge = Math.sin(projected * Math.PI * 2 * wave.frequency + wave.phase);
        heightValue += Math.tanh(ridge * 1.45) * wave.amplitude;
      }
      field[y * width + x] = heightValue;
    }
  }
  return blurWrapped(field, width, height, 3);
}

function granularHeightField(
  width: number,
  height: number,
  random: () => number,
  type: "membrane" | "vesicle",
): Float32Array {
  const field = new Float32Array(width * height);
  const amplitude = type === "membrane" ? 1 : 0.34;
  for (let index = 0; index < field.length; index += 1) {
    field[index] = (random() * 2 - 1) * amplitude;
  }
  const blurred = blurWrapped(field, width, height, type === "membrane" ? 1 : 4);
  if (type === "vesicle") {
    const phase = random() * Math.PI * 2;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        blurred[index] += Math.sin((x / width + y / height) * Math.PI * 4 + phase) * 0.035;
      }
    }
  }
  return blurred;
}

function createHeightField(
  width: number,
  height: number,
  type: ProceduralNormalMapType,
  seed: number,
): Float32Array {
  const random = createPrng(seed ^ fnv1a(type.length));
  return type === "cortical"
    ? corticalHeightField(width, height, random)
    : granularHeightField(width, height, random, type);
}

/**
 * Generates a deterministic tangent-space normal map entirely in a canvas.
 * The texture is presentation-only, tileable, and uses no external asset.
 */
export function generateProceduralNormalMap(
  width: number,
  height: number,
  type: ProceduralNormalMapType,
  seed: number,
): THREE.CanvasTexture {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2) {
    throw new Error("procedural normal-map dimensions must be integers greater than one");
  }
  if (typeof document === "undefined") {
    throw new Error("procedural normal maps require a canvas-capable document");
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas is unavailable for procedural normal maps");

  const heights = createHeightField(width, height, type, seed);
  const image = context.createImageData(width, height);
  const derivativeStrength = type === "cortical" ? 1.8 : type === "membrane" ? 1.15 : 0.52;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const left = heights[y * width + wrappedIndex(x - 1, width)];
      const right = heights[y * width + wrappedIndex(x + 1, width)];
      const down = heights[wrappedIndex(y - 1, height) * width + x];
      const up = heights[wrappedIndex(y + 1, height) * width + x];
      const normalX = (left - right) * derivativeStrength;
      const normalY = (down - up) * derivativeStrength;
      const inverseLength = 1 / Math.sqrt(normalX * normalX + normalY * normalY + 1);
      const pixel = (y * width + x) * 4;
      image.data[pixel] = Math.round((normalX * inverseLength * 0.5 + 0.5) * 255);
      image.data[pixel + 1] = Math.round((normalY * inverseLength * 0.5 + 0.5) * 255);
      image.data[pixel + 2] = Math.round((inverseLength * 0.5 + 0.5) * 255);
      image.data[pixel + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.name = `r09-f-${type}-normal-${width}x${height}-${seed >>> 0}`;
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/** Owns the three shared 256² procedural normal maps used by R09-F. */
export interface ProceduralNormalMapProvider {
  get(type: ProceduralNormalMapType): THREE.Texture;
  count(): number;
  estimatedBytes(): number;
  dispose(): void;
}

export class ProceduralNormalMapCache implements ProceduralNormalMapProvider {
  private readonly textures = new Map<ProceduralNormalMapType, THREE.CanvasTexture>();
  private disposed = false;

  get(type: ProceduralNormalMapType): THREE.CanvasTexture {
    if (this.disposed) throw new Error("procedural normal-map cache is disposed");
    const existing = this.textures.get(type);
    if (existing) return existing;
    const texture = generateProceduralNormalMap(
      DEFAULT_NORMAL_MAP_SIZE,
      DEFAULT_NORMAL_MAP_SIZE,
      type,
      DEFAULT_SEEDS[type],
    );
    this.textures.set(type, texture);
    return texture;
  }

  count(): number {
    return this.textures.size;
  }

  estimatedBytes(): number {
    return Math.ceil([...this.textures.values()].reduce(
      (total, texture) => total + texture.image.width * texture.image.height * 4 * 4 / 3,
      0,
    ));
  }

  dispose(): void {
    if (this.disposed) return;
    for (const texture of this.textures.values()) texture.dispose();
    this.textures.clear();
    this.disposed = true;
  }
}
