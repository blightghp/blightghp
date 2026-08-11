import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  verifyBrainGifManifest,
  verifyLegacyHashPreservation,
} from "./brain_gif_manifest.js";

const directory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(directory, "..");
const gifPath = path.join(projectRoot, "assets", "brain.gif");
const manifestPath = path.join(projectRoot, "assets", "brain-gif.json");
const legacyFixturePath = path.join(
  projectRoot,
  "fixtures",
  "replay",
  "abi-v5-hash-preservation-v1.json",
);

const gifBytes = fs.readFileSync(gifPath);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const legacyFixture = JSON.parse(fs.readFileSync(legacyFixturePath, "utf8"));
const expectedSourceCommit = process.env.GITHUB_SHA ?? manifest.sourceCommit;
verifyBrainGifManifest(manifest, gifBytes, expectedSourceCommit);
verifyLegacyHashPreservation(manifest.engine, legacyFixture.legacyHashes);
console.log(
  `GIF sincronizado: ${manifest.gifSha256.slice(0, 12)} · ` +
    `motor ${manifest.engine.runtime}/ABI ${manifest.engine.abiSchemaVersion} · ` +
    `origem ${manifest.sourceCommit.slice(0, 12)}`,
);
