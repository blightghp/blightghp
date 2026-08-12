import { readFile, stat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertWorkerLifecycleEvidence } from "./worker_lifecycle_audit.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const auditDirectory = process.env.BRAIN_AUDIT_DIR
  ? path.resolve(process.env.BRAIN_AUDIT_DIR)
  : path.join(root, "artifacts", "visual-audit");
const report = JSON.parse(
  await readFile(path.join(auditDirectory, "runtime-audit.json"), "utf8"),
);
const hashPattern = /^[0-9a-f]{16}$/;
const commitPattern = /^[0-9a-f]{40}$/;
const requiredCaptures = [
  "overview-desktop.png",
  "laminar-desktop.png",
  "cell-desktop.png",
  "electricity-desktop.png",
  "synapse-desktop.png",
  "overview-mobile.png",
  "overview-monochrome.png",
  "laminar-monochrome.png",
  "cell-monochrome.png",
  "electricity-monochrome.png",
  "synapse-monochrome.png",
];

if (
  report.schemaVersion !== 2 ||
  report.source?.productVersion !== "0.8.0" ||
  !commitPattern.test(report.source?.commit ?? "") ||
  report.source?.command !== "npm run audit:runtime" ||
  !["swiftshader", "hardware"].includes(report.source?.requestedGraphicsBackend) ||
  report.abi?.schemaVersion !== 6 ||
  report.abi?.bufferCount !== 34 ||
  report.abi?.buffers?.length !== 34 ||
  new Set(report.abi?.buffers?.map(({ name }) => name)).size !== 34 ||
  report.abi?.snapshotBytes !==
    report.abi?.buffers?.reduce((total, buffer) => total + buffer.byteLength, 0) ||
  report.abi?.snapshotBytes !== report.profile?.memory?.snapshotBytes ||
  !Object.values(report.abi?.hashes ?? {}).every((hash) => hashPattern.test(hash)) ||
  Object.keys(report.abi?.hashes ?? {}).length !== 4 ||
  report.views?.tabCount !== 5 ||
  report.views?.synapse?.selected !== true ||
  !report.views?.synapse?.glutamate?.endsWith("mol/m³") ||
  !report.views?.synapse?.gaba?.endsWith("mol/m³") ||
  !report.views?.synapse?.occupancy?.endsWith("%") ||
  report.profile?.environment?.simulation?.runtime !== "rust-wasm"
  || report.renderedStateGate?.samples?.length !== 5
  || report.renderedStateGate?.maximumError > report.renderedStateGate?.tolerance
  || report.visualGate?.bindings?.totalStateObjects !==
    report.visualGate?.bindings?.declaredBindings
  || report.visualGate?.bindings?.missingBindings?.length !== 0
  || report.visualGate?.bindings?.missingRedundancy?.length !== 0
) {
  throw new Error("artefato runtime-audit.json não comprova integralmente a ABI v6");
}

const shallowRepository = execFileSync("git", ["rev-parse", "--is-shallow-repository"], {
  cwd: root,
  encoding: "utf8",
}).trim() === "true";
const sourceIsAncestor = (() => {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", report.source.commit, "HEAD"], {
      cwd: root,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
})();
if (!shallowRepository && !sourceIsAncestor) {
  throw new Error(`commit de origem da auditoria não pertence ao histórico atual: ${report.source.commit}`);
}

assertWorkerLifecycleEvidence(report.abi.lifecycle, {
  schemaVersion: 6,
  bufferCount: 34,
  hashCount: 4,
});

for (const filename of requiredCaptures) {
  if (!report.captures.includes(filename)) {
    throw new Error(`captura obrigatória ausente do relatório: ${filename}`);
  }
  const metadata = await stat(path.join(auditDirectory, filename));
  if (!metadata.isFile() || metadata.size === 0) {
    throw new Error(`captura obrigatória vazia: ${filename}`);
  }
}

console.log(
  `auditoria ABI v6 verificada: ${report.abi.bufferCount} buffers, ` +
    `quatro hashes, lifecycle completo e ${requiredCaptures.length} capturas`,
);
