// SquirrelNoise5 by Squirrel Eiserloh. The arithmetic intentionally mirrors
// JavaScript's Math.imul and unsigned right shifts in src/random.ts.

const STREAM_PRIME: u32 = 0x9e37_79b1;
const ENTITY_PRIME: u32 = 0x85eb_ca77;
const TICK_PRIME: u32 = 0xc2b2_ae3d;
const EVENT_PRIME: u32 = 0x27d4_eb2f;

const BIT_NOISE_1: u32 = 0xd2a8_0a3f;
const BIT_NOISE_2: u32 = 0xa884_f197;
const BIT_NOISE_3: u32 = 0x6c73_6f4b;
const BIT_NOISE_4: u32 = 0xb79f_3abb;
const BIT_NOISE_5: u32 = 0x1b56_c4f5;

/// Produces an addressable random integer without mutable generator state.
///
/// The five-part address makes results independent from call order. `tick`
/// deliberately uses its low 32 bits to preserve the established TypeScript
/// contract, where `>>> 0` performs the same reduction.
#[must_use]
pub fn random_u32(seed: u32, stream: u32, entity_id: u32, tick: u64, event_ordinal: u32) -> u32 {
    let position = stream.wrapping_mul(STREAM_PRIME)
        ^ entity_id.wrapping_mul(ENTITY_PRIME)
        ^ low_u32(tick).wrapping_mul(TICK_PRIME)
        ^ event_ordinal.wrapping_mul(EVENT_PRIME);
    squirrel_noise_5(position, seed)
}

/// Maps [`random_u32`] exactly to the half-open unit interval.
#[must_use]
pub fn random_unit(seed: u32, stream: u32, entity_id: u32, tick: u64, event_ordinal: u32) -> f64 {
    f64::from(random_u32(seed, stream, entity_id, tick, event_ordinal)) / 4_294_967_296.0
}

fn low_u32(value: u64) -> u32 {
    let bytes = value.to_le_bytes();
    u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]])
}

fn squirrel_noise_5(position: u32, seed: u32) -> u32 {
    let mut mangled = position.wrapping_mul(BIT_NOISE_1);
    mangled = mangled.wrapping_add(seed);
    mangled ^= mangled >> 9;
    mangled = mangled.wrapping_add(BIT_NOISE_2);
    mangled ^= mangled >> 11;
    mangled = mangled.wrapping_mul(BIT_NOISE_3);
    mangled ^= mangled >> 13;
    mangled = mangled.wrapping_add(BIT_NOISE_4);
    mangled ^= mangled >> 15;
    mangled = mangled.wrapping_mul(BIT_NOISE_5);
    mangled ^= mangled >> 17;
    mangled
}
