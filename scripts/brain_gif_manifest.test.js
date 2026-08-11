import { describe, expect, it } from "vitest";
import {
  createBrainGifManifest,
  verifyLegacyHashPreservation,
  verifyBrainGifManifest,
} from "./brain_gif_manifest.js";

const sourceCommit = "1234567890abcdef1234567890abcdef12345678";
const diagnostics = {
  runtime: "rust-wasm",
  schemaVersion: 6,
  stateHash: "0123456789abcdef",
  corticothalamicHash: "1123456789abcdef",
  cellPatchHash: "2123456789abcdef",
  chemicalHash: "3123456789abcdef",
  degraded: false,
};

describe("brain GIF provenance manifest", () => {
  it("binds GIF bytes, source commit and all independent engine hashes", () => {
    const gifBytes = Buffer.from("GIF89a-test");
    const manifest = createBrainGifManifest({
      sourceCommit,
      gifBytes,
      diagnostics,
      capture: { frameCount: 60 },
    });
    expect(verifyBrainGifManifest(manifest, gifBytes, sourceCommit)).toBe(true);
    expect(manifest.engine).toMatchObject({
      runtime: "rust-wasm",
      abiSchemaVersion: 6,
      stateHash: diagnostics.stateHash,
      corticothalamicHash: diagnostics.corticothalamicHash,
      cellPatchHash: diagnostics.cellPatchHash,
      chemicalHash: diagnostics.chemicalHash,
    });
  });

  it("rejects stale bytes, stale commits and degraded runtimes", () => {
    const gifBytes = Buffer.from("GIF89a-test");
    const manifest = createBrainGifManifest({
      sourceCommit,
      gifBytes,
      diagnostics,
      capture: {},
    });
    expect(() => verifyBrainGifManifest(manifest, Buffer.from("changed"), sourceCommit))
      .toThrow(/checksum/);
    expect(() => verifyBrainGifManifest(manifest, gifBytes, "f".repeat(40)))
      .toThrow(/source commit/);
    expect(() => createBrainGifManifest({
      sourceCommit,
      gifBytes,
      diagnostics: { ...diagnostics, runtime: "diagnostic-fallback" },
      capture: {},
    })).toThrow(/Rust\/Wasm/);
    expect(() => createBrainGifManifest({
      sourceCommit,
      gifBytes,
      diagnostics: { ...diagnostics, degraded: true },
      capture: {},
    })).toThrow(/Rust\/Wasm/);
  });

  it("rejects any ABI v6 mutation of the three legacy hashes", () => {
    const legacy = {
      stateHash: diagnostics.stateHash,
      corticothalamicHash: diagnostics.corticothalamicHash,
      cellPatchHash: diagnostics.cellPatchHash,
    };
    expect(verifyLegacyHashPreservation(diagnostics, legacy)).toBe(true);
    expect(() => verifyLegacyHashPreservation(
      { ...diagnostics, cellPatchHash: "ffffffffffffffff" },
      legacy,
    )).toThrow(/legacy cellPatchHash/);
  });
});
