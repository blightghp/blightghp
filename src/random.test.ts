import { describe, expect, it } from "vitest";
import { randomUint32, randomUnit } from "./random";

describe("randomUint32", () => {
  it("matches fixed vectors for known addresses", () => {
    expect(randomUint32(0, 0, 0, 0, 0)).toBe(377036288);
    expect(randomUint32(1, 0, 0, 0, 0)).toBe(603375697);
    expect(randomUint32(0, 1, 0, 0, 0)).toBe(3902836857);
    expect(randomUint32(0, 0, 1, 0, 0)).toBe(3592054408);
    expect(randomUint32(0, 0, 0, 1, 0)).toBe(3532664066);
    expect(randomUint32(0, 0, 0, 0, 1)).toBe(4228700435);
    expect(randomUint32(12345, 2, 17, 900, 3)).toBe(155471040);
    expect(randomUint32(0x5a17be11, 0, 0, 0, 0)).toBe(168948365);
    expect(randomUint32(0x5a17be11, 1, 0, 0, 0)).toBe(148037297);
  });

  it("depends only on the address, not on prior calls", () => {
    const first = randomUint32(9, 9, 9, 9, 9);
    randomUint32(1, 2, 3, 4, 5);
    randomUint32(6, 7, 8, 9, 10);
    const second = randomUint32(9, 9, 9, 9, 9);
    expect(second).toBe(first);
  });

  it("separates streams for the same entity, tick and ordinal", () => {
    const threshold = randomUint32(42, 0, 5, 0, 0);
    const refractory = randomUint32(42, 1, 5, 0, 0);
    expect(threshold).not.toBe(refractory);
  });

  it("changes output when a single address component changes", () => {
    const base = randomUint32(777, 5, 3, 1000, 0);
    expect(randomUint32(777, 5, 3, 1001, 0)).not.toBe(base);
    expect(randomUint32(777, 5, 4, 1000, 0)).not.toBe(base);
    expect(randomUint32(777, 5, 3, 1000, 1)).not.toBe(base);
  });
});

describe("randomUnit", () => {
  it("stays within [0, 1)", () => {
    for (let entityId = 0; entityId < 500; entityId += 1) {
      const value = randomUnit(31, 4, entityId, 12, 0);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("matches the fixed vector derived from randomUint32", () => {
    expect(randomUnit(12345, 2, 17, 900, 3)).toBeCloseTo(0.03619842231273651, 12);
  });

  it("averages close to one half across independent addresses", () => {
    let sum = 0;
    const samples = 200000;
    for (let entityId = 0; entityId < samples; entityId += 1) {
      sum += randomUnit(777, 5, entityId, 0, 0);
    }
    expect(sum / samples).toBeCloseTo(0.4991507924647233, 12);
  });
});
