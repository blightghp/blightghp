// Amostra endereçada: o resultado depende apenas de (seed, stream, entityId, tick, eventOrdinal),
// nunca da ordem em que as chamadas ocorrem. Isso permite reordenar ou paralelizar o laço
// sem alterar o ruído que cada entidade recebe em cada tick.

export const RANDOM_STREAM_CELL_THRESHOLD = 0;
export const RANDOM_STREAM_CELL_REFRACTORY = 1;

const STREAM_PRIME = 0x9e3779b1;
const ENTITY_PRIME = 0x85ebca77;
const TICK_PRIME = 0xc2b2ae3d;
const EVENT_PRIME = 0x27d4eb2f;

const BIT_NOISE_1 = 0xd2a80a3f;
const BIT_NOISE_2 = 0xa884f197;
const BIT_NOISE_3 = 0x6c736f4b;
const BIT_NOISE_4 = 0xb79f3abb;
const BIT_NOISE_5 = 0x1b56c4f5;

// SquirrelNoise5 (Eiserloh, domínio público): avalanche de posição+seed em cinco passos.
function squirrelNoise5(position: number, seed: number): number {
  let mangled = Math.imul(position >>> 0, BIT_NOISE_1) >>> 0;
  mangled = (mangled + (seed >>> 0)) >>> 0;
  mangled ^= mangled >>> 9;
  mangled = (mangled + BIT_NOISE_2) >>> 0;
  mangled ^= mangled >>> 11;
  mangled = Math.imul(mangled, BIT_NOISE_3) >>> 0;
  mangled ^= mangled >>> 13;
  mangled = (mangled + BIT_NOISE_4) >>> 0;
  mangled ^= mangled >>> 15;
  mangled = Math.imul(mangled, BIT_NOISE_5) >>> 0;
  mangled ^= mangled >>> 17;
  return mangled >>> 0;
}

export function randomUint32(
  seed: number,
  stream: number,
  entityId: number,
  tick: number,
  eventOrdinal: number,
): number {
  const position =
    (Math.imul(stream >>> 0, STREAM_PRIME) ^
      Math.imul(entityId >>> 0, ENTITY_PRIME) ^
      Math.imul(tick >>> 0, TICK_PRIME) ^
      Math.imul(eventOrdinal >>> 0, EVENT_PRIME)) >>>
    0;
  return squirrelNoise5(position, seed);
}

export function randomUnit(
  seed: number,
  stream: number,
  entityId: number,
  tick: number,
  eventOrdinal: number,
): number {
  return randomUint32(seed, stream, entityId, tick, eventOrdinal) / 4294967296;
}
