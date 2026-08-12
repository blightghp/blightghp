import crypto from "node:crypto";

const COMMIT_PATTERN = /^[0-9a-f]{40}$/i;
const HASH_PATTERN = /^[0-9a-f]{16}$/i;
const MINIMUM_PROFILE_ABI_SCHEMA_VERSION = 6;

export function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export function createBrainGifManifest({ sourceCommit, gifBytes, diagnostics, capture }) {
  if (!COMMIT_PATTERN.test(sourceCommit ?? "")) {
    throw new Error("sourceCommit must contain the 40-character source commit");
  }
  if (
    diagnostics?.runtime !== "rust-wasm" ||
    !Number.isSafeInteger(diagnostics.schemaVersion) ||
    diagnostics.schemaVersion < MINIMUM_PROFILE_ABI_SCHEMA_VERSION ||
    diagnostics.degraded !== false
  ) {
    throw new Error("GIF capture must use a supported Rust/Wasm ABI runtime");
  }
  for (const key of ["stateHash", "corticothalamicHash", "cellPatchHash", "chemicalHash"]) {
    if (!HASH_PATTERN.test(diagnostics[key] ?? "")) {
      throw new Error(`GIF capture is missing a valid ${key}`);
    }
  }
  if (
    diagnostics.schemaVersion >= 7 &&
    !HASH_PATTERN.test(diagnostics.cellSpikeEventHash ?? "")
  ) {
    throw new Error("GIF capture is missing a valid cellSpikeEventHash");
  }
  if (!gifBytes?.length) throw new Error("GIF bytes must not be empty");

  return {
    schemaVersion: 1,
    sourceCommit: sourceCommit.toLowerCase(),
    gifSha256: sha256(gifBytes),
    engine: {
      runtime: diagnostics.runtime,
      abiSchemaVersion: diagnostics.schemaVersion,
      stateHash: diagnostics.stateHash,
      corticothalamicHash: diagnostics.corticothalamicHash,
      cellPatchHash: diagnostics.cellPatchHash,
      chemicalHash: diagnostics.chemicalHash,
      ...(diagnostics.schemaVersion >= 7
        ? { cellSpikeEventHash: diagnostics.cellSpikeEventHash }
        : {}),
      degraded: diagnostics.degraded,
    },
    capture,
  };
}

export function verifyBrainGifManifest(manifest, gifBytes, expectedSourceCommit) {
  if (manifest?.schemaVersion !== 1) throw new Error("unknown GIF manifest schema");
  if (!COMMIT_PATTERN.test(expectedSourceCommit ?? "")) {
    throw new Error("expected source commit must contain 40 characters");
  }
  if (manifest.sourceCommit !== expectedSourceCommit.toLowerCase()) {
    throw new Error("GIF manifest does not match the source commit");
  }
  if (manifest.gifSha256 !== sha256(gifBytes)) {
    throw new Error("GIF bytes do not match the manifest checksum");
  }
  if (
    manifest.engine?.runtime !== "rust-wasm" ||
    !Number.isSafeInteger(manifest.engine.abiSchemaVersion) ||
    manifest.engine.abiSchemaVersion < MINIMUM_PROFILE_ABI_SCHEMA_VERSION ||
    manifest.engine.degraded !== false
  ) {
    throw new Error("GIF manifest does not identify a supported Rust/Wasm ABI runtime");
  }
  for (const key of ["stateHash", "corticothalamicHash", "cellPatchHash", "chemicalHash"]) {
    if (!HASH_PATTERN.test(manifest.engine[key] ?? "")) {
      throw new Error(`GIF manifest contains an invalid ${key}`);
    }
  }
  if (
    manifest.engine.abiSchemaVersion >= 7 &&
    !HASH_PATTERN.test(manifest.engine.cellSpikeEventHash ?? "")
  ) {
    throw new Error("GIF manifest contains an invalid cellSpikeEventHash");
  }
  return true;
}

export function verifyLegacyHashPreservation(engine, expected) {
  for (const key of ["stateHash", "corticothalamicHash", "cellPatchHash"]) {
    if (!HASH_PATTERN.test(expected?.[key] ?? "")) {
      throw new Error(`legacy fixture contains an invalid ${key}`);
    }
    if (engine?.[key] !== expected[key]) {
      throw new Error(`the frozen scenario changed the legacy ${key}`);
    }
  }
  return true;
}
