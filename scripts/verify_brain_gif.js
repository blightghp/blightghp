import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyBrainGifManifest } from "./brain_gif_manifest.js";

const directory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(directory, "..");
const outputDirectory = process.env.BRAIN_GIF_OUTPUT_DIR
  ? path.resolve(process.env.BRAIN_GIF_OUTPUT_DIR)
  : path.join(projectRoot, "assets");
const gifPath = path.join(outputDirectory, "brain.gif");
const manifestPath = path.join(outputDirectory, "brain-gif.json");
const gifBytes = fs.readFileSync(gifPath);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const expectedSourceCommit = process.env.GITHUB_SHA ?? manifest.sourceCommit;
verifyBrainGifManifest(manifest, gifBytes, expectedSourceCommit);
console.log(
  `GIF sincronizado: ${manifest.gifSha256.slice(0, 12)} · ` +
    `motor ${manifest.engine.runtime}/ABI ${manifest.engine.abiSchemaVersion} · ` +
    `origem ${manifest.sourceCommit.slice(0, 12)} · ` +
    `${Object.keys(manifest.capture.framesByView).length} vistas`,
);
