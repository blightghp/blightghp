import crypto from "node:crypto";

const COMMIT_PATTERN = /^[0-9a-f]{40}$/i;
const HASH_PATTERN = /^[0-9a-f]{16}$/i;

export function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export function createBrainGifManifest({ sourceCommit, gifBytes, diagnostics, capture }) {
  if (!COMMIT_PATTERN.test(sourceCommit ?? "")) {
    throw new Error("sourceCommit must contain the 40-character source commit");
  }
  if (
    diagnostics?.runtime !== "rust-wasm" ||
    diagnostics.schemaVersion !== 5 ||
    diagnostics.degraded !== false
  ) {
    throw new Error("GIF capture must use the Rust/Wasm ABI v5 runtime");
  }
  for (const key of ["stateHash", "corticothalamicHash", "cellPatchHash"]) {
    if (!HASH_PATTERN.test(diagnostics[key] ?? "")) {
      throw new Error(`GIF capture is missing a valid ${key}`);
    }
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
    manifest.engine.abiSchemaVersion !== 5 ||
    manifest.engine.degraded !== false
  ) {
    throw new Error("GIF manifest does not identify the Rust/Wasm ABI v5 runtime");
  }
  for (const key of ["stateHash", "corticothalamicHash", "cellPatchHash"]) {
    if (!HASH_PATTERN.test(manifest.engine[key] ?? "")) {
      throw new Error(`GIF manifest contains an invalid ${key}`);
    }
  }
  return true;
}
