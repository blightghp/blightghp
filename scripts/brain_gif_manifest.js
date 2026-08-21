import crypto from "node:crypto";

const COMMIT_PATTERN = /^[0-9a-f]{40}$/i;
const HASH_PATTERN = /^[0-9a-f]{16}$/i;
const MINIMUM_PROFILE_ABI_SCHEMA_VERSION = 6;

export const BRAIN_GIF_MANIFEST_SCHEMA_VERSION = 3;
export const BRAIN_GIF_VIEW_FRAMES = Object.freeze({
  overview: 15,
  laminar: 9,
  cell: 9,
  neuron: 9,
  electricity: 9,
  synapse: 9,
});
export const BRAIN_GIF_VIEWS = Object.freeze(Object.keys(BRAIN_GIF_VIEW_FRAMES));
export const BRAIN_GIF_FRAME_COUNT = Object.values(BRAIN_GIF_VIEW_FRAMES)
  .reduce((total, frames) => total + frames, 0);

export function brainGifViewAtFrame(frame) {
  if (!Number.isSafeInteger(frame) || frame < 0 || frame >= BRAIN_GIF_FRAME_COUNT) {
    throw new Error("GIF frame is outside the canonical capture schedule");
  }
  let boundary = 0;
  for (const view of BRAIN_GIF_VIEWS) {
    boundary += BRAIN_GIF_VIEW_FRAMES[view];
    if (frame < boundary) return view;
  }
  throw new Error("GIF capture schedule is incomplete");
}

function validateCapture(capture) {
  if (capture?.frameCount !== BRAIN_GIF_FRAME_COUNT) {
    throw new Error(`GIF capture must contain ${BRAIN_GIF_FRAME_COUNT} frames`);
  }
  const framesByView = capture.framesByView;
  if (!framesByView || typeof framesByView !== "object") {
    throw new Error("GIF capture must declare framesByView");
  }
  const capturedViews = Object.keys(framesByView);
  if (
    capturedViews.length !== BRAIN_GIF_VIEWS.length ||
    capturedViews.some((view) => !BRAIN_GIF_VIEWS.includes(view))
  ) {
    throw new Error("GIF capture must cover exactly the six current views");
  }
  for (const view of BRAIN_GIF_VIEWS) {
    if (framesByView[view] !== BRAIN_GIF_VIEW_FRAMES[view]) {
      throw new Error(`GIF capture uses an invalid frame allocation for ${view}`);
    }
  }
  const presentation = capture.presentation;
  if (
    presentation?.materialProfile !== "realistic-illustrative" ||
    (presentation?.renderProfile !== undefined && presentation.renderProfile !== "cinema") ||
    presentation?.clipping?.view !== "overview" ||
    presentation?.clipping?.orientation !== "coronal" ||
    presentation?.clipping?.slab !== false ||
    presentation?.clipping?.frames !== BRAIN_GIF_VIEW_FRAMES.overview ||
    presentation?.externalAtlasAssets !== 0 ||
    (presentation?.surfaceGeometryHash !== undefined &&
      !HASH_PATTERN.test(presentation.surfaceGeometryHash))
  ) {
    throw new Error("GIF capture must declare the canonical R10-D presentation profile");
  }
}

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
  validateCapture(capture);

  return {
    schemaVersion: BRAIN_GIF_MANIFEST_SCHEMA_VERSION,
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
  if (manifest?.schemaVersion !== BRAIN_GIF_MANIFEST_SCHEMA_VERSION) {
    throw new Error("unknown GIF manifest schema");
  }
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
  validateCapture(manifest.capture);
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
