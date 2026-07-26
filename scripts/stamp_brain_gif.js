import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const readmePath = path.resolve(directory, "..", "README.md");

export function stampBrainGifReference(source, sha) {
  if (!sha || !/^[0-9a-f]{40}$/i.test(sha)) {
    throw new Error("GITHUB_SHA must contain the 40-character source commit.");
  }

  const referencePattern = /assets\/brain\.gif\?v=[^"]+/;
  if (!referencePattern.test(source)) {
    throw new Error("README brain GIF reference was not found.");
  }
  return source.replace(
    referencePattern,
    `assets/brain.gif?v=${sha.slice(0, 12)}`,
  );
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const source = fs.readFileSync(readmePath, "utf8");
  const stamped = stampBrainGifReference(source, process.env.GITHUB_SHA);
  fs.writeFileSync(readmePath, stamped);
}
