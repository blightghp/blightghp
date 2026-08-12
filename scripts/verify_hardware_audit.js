import { execFileSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertWorkerLifecycleEvidence } from "./worker_lifecycle_audit.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const directory = path.join(root, "artifacts", "hardware-audit");
const report = JSON.parse(await readFile(path.join(directory, "runtime-audit.json"), "utf8"));
const renderer = report.profile?.environment?.hardware?.webglRenderer ?? "";
const captures = [
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
  report.source?.requestedGraphicsBackend !== "hardware" ||
  /swiftshader|llvmpipe|software/i.test(renderer) ||
  report.profile?.sampleCount < 120 ||
  report.profile?.workerLatencyMs?.p95 <= 0 ||
  report.profile?.frameCpuMs?.p95 <= 0 ||
  report.profile?.gpu?.drawCalls <= 0 ||
  report.profile?.gpu?.triangles <= 0 ||
  report.profile?.memory?.snapshotBytes <= 0 ||
  report.renderedStateGate?.maximumError > report.renderedStateGate?.tolerance ||
  report.visualGate?.bindings?.declaredBindings !==
    report.visualGate?.bindings?.totalStateObjects ||
  report.visualGate?.bindings?.missingBindings?.length !== 0 ||
  report.visualGate?.bindings?.missingRedundancy?.length !== 0 ||
  report.visualGate?.provenance?.undeclared !== 0 ||
  report.views?.tabCount !== 5 ||
  report.abi?.bufferCount !== 34
) {
  throw new Error("baseline versionado não comprova integralmente R08-P3");
}

assertWorkerLifecycleEvidence(report.abi.lifecycle);

for (const filename of captures) {
  if (!report.captures.includes(filename)) throw new Error(`captura ausente: ${filename}`);
  const metadata = await stat(path.join(directory, filename));
  if (!metadata.isFile() || metadata.size === 0) throw new Error(`captura vazia: ${filename}`);
}

const shallow = execFileSync("git", ["rev-parse", "--is-shallow-repository"], {
  cwd: root,
  encoding: "utf8",
}).trim() === "true";
if (!shallow) {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", report.source.commit, "HEAD"], {
      cwd: root,
      stdio: "ignore",
    });
  } catch {
    throw new Error(`commit de origem do baseline não pertence ao histórico: ${report.source.commit}`);
  }
}

console.log(
  `baseline GPU verificado: ${renderer}; pixel erro ${report.renderedStateGate.maximumError}; ` +
    `${report.visualGate.bindings.declaredBindings} bindings; ${captures.length} capturas`,
);
