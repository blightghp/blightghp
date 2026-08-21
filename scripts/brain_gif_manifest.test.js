import { describe, expect, it } from "vitest";
import {
  BRAIN_GIF_FRAME_COUNT,
  BRAIN_GIF_VIEW_FRAMES,
  brainGifViewAtFrame,
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
const capture = {
  frameCount: BRAIN_GIF_FRAME_COUNT,
  framesByView: { ...BRAIN_GIF_VIEW_FRAMES },
  presentation: {
    renderProfile: "cinema",
    materialProfile: "realistic-illustrative",
    clipping: {
      view: "overview",
      orientation: "coronal",
      slab: false,
      frames: BRAIN_GIF_VIEW_FRAMES.overview,
    },
    externalAtlasAssets: 0,
    surfaceGeometryHash: "5123456789abcdef",
  },
};

describe("brain GIF provenance manifest", () => {
  it("binds GIF bytes, source commit and all independent engine hashes", () => {
    const gifBytes = Buffer.from("GIF89a-test");
    const manifest = createBrainGifManifest({
      sourceCommit,
      gifBytes,
      diagnostics,
      capture,
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
    expect(manifest.schemaVersion).toBe(3);
    expect(manifest.capture.presentation).toEqual(capture.presentation);
    const nextAbi = createBrainGifManifest({
      sourceCommit,
      gifBytes,
      diagnostics: {
        ...diagnostics,
        schemaVersion: 7,
        cellSpikeEventHash: "4123456789abcdef",
      },
      capture,
    });
    expect(verifyBrainGifManifest(nextAbi, gifBytes, sourceCommit)).toBe(true);
    expect(nextAbi.engine.abiSchemaVersion).toBe(7);
    expect(nextAbi.engine.cellSpikeEventHash).toBe("4123456789abcdef");
  });

  it("rejects stale bytes, stale commits and degraded runtimes", () => {
    const gifBytes = Buffer.from("GIF89a-test");
    const manifest = createBrainGifManifest({
      sourceCommit,
      gifBytes,
      diagnostics,
      capture,
    });
    expect(() => verifyBrainGifManifest(manifest, Buffer.from("changed"), sourceCommit))
      .toThrow(/checksum/);
    expect(() => verifyBrainGifManifest(manifest, gifBytes, "f".repeat(40)))
      .toThrow(/source commit/);
    expect(() => createBrainGifManifest({
      sourceCommit,
      gifBytes,
      diagnostics: { ...diagnostics, runtime: "diagnostic-fallback" },
      capture,
    })).toThrow(/Rust\/Wasm/);
    expect(() => createBrainGifManifest({
      sourceCommit,
      gifBytes,
      diagnostics: { ...diagnostics, degraded: true },
      capture,
    })).toThrow(/Rust\/Wasm/);
  });

  it("covers all six current views, including the neuron view", () => {
    expect(BRAIN_GIF_FRAME_COUNT).toBe(60);
    expect(Object.keys(BRAIN_GIF_VIEW_FRAMES)).toEqual([
      "overview",
      "laminar",
      "cell",
      "neuron",
      "electricity",
      "synapse",
    ]);
    expect(Array.from({ length: BRAIN_GIF_FRAME_COUNT }, (_, frame) => brainGifViewAtFrame(frame)))
      .toEqual(Object.entries(BRAIN_GIF_VIEW_FRAMES).flatMap(
        ([view, frames]) => Array.from({ length: frames }, () => view),
      ));
  });

  it("rejects manifests that omit or misallocate a view", () => {
    const gifBytes = Buffer.from("GIF89a-test");
    const withoutNeuron = { ...BRAIN_GIF_VIEW_FRAMES };
    delete withoutNeuron.neuron;
    withoutNeuron.overview += BRAIN_GIF_VIEW_FRAMES.neuron;
    expect(() => createBrainGifManifest({
      sourceCommit,
      gifBytes,
      diagnostics,
      capture: { frameCount: BRAIN_GIF_FRAME_COUNT, framesByView: withoutNeuron },
    })).toThrow(/six current views/);
  });

  it("rejects a GIF without the canonical R10-D render, material, surface and cut declaration", () => {
    expect(() => createBrainGifManifest({
      sourceCommit,
      gifBytes: Buffer.from("GIF89a-test"),
      diagnostics,
      capture: {
        ...capture,
        presentation: { ...capture.presentation, externalAtlasAssets: 1 },
      },
    })).toThrow(/R10-D presentation profile/);
    expect(() => createBrainGifManifest({
      sourceCommit,
      gifBytes: Buffer.from("GIF89a-test"),
      diagnostics,
      capture: {
        ...capture,
        presentation: { ...capture.presentation, renderProfile: "enhanced" },
      },
    })).toThrow(/R10-D presentation profile/);
    expect(() => createBrainGifManifest({
      sourceCommit,
      gifBytes: Buffer.from("GIF89a-test"),
      diagnostics,
      capture: {
        ...capture,
        presentation: { ...capture.presentation, surfaceGeometryHash: "not-a-hash" },
      },
    })).toThrow(/R10-D presentation profile/);
  });

  it("compares legacy hashes only inside the same frozen input scenario", () => {
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
