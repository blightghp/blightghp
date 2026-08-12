import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readText = (filename) => readFile(path.join(root, filename), "utf8");
const readJson = async (filename) => JSON.parse(await readText(filename));
const promotion = await readJson("artifacts/promotion-0.8.json");
const packageManifest = await readJson("package.json");
const tauriManifest = await readJson("src-tauri/tauri.conf.json");
const cargoManifest = await readText("Cargo.toml");
const protocol = await readText("src/protocol.ts");
const simulation = await readText("crates/brain-engine/src/simulation.rs");
const commitPattern = /^[0-9a-f]{40}$/;

const cargoVersion = cargoManifest.match(
  /\[workspace\.package\][\s\S]*?\bversion\s*=\s*"([^"]+)"/,
)?.[1];
const protocolVersion = Number(
  protocol.match(/SIMULATION_PROTOCOL_VERSION\s*=\s*(\d+)\s+as const/)?.[1],
);
const simulationSchema = Number(
  simulation.match(/SIMULATION_SCHEMA_VERSION:\s*u32\s*=\s*(\d+)/)?.[1],
);

if (
  promotion.schemaVersion !== 1 ||
  promotion.productVersion !== "0.8.0" ||
  packageManifest.version !== promotion.productVersion ||
  tauriManifest.version !== promotion.productVersion ||
  cargoVersion !== promotion.productVersion ||
  promotion.protocolVersion !== 6 ||
  protocolVersion !== promotion.protocolVersion ||
  simulationSchema !== promotion.protocolVersion ||
  promotion.snapshotBuffers !== 34 ||
  promotion.hashDomains !== 4 ||
  !commitPattern.test(promotion.candidateCommit ?? "") ||
  promotion.gates?.some(({ status }) => status !== "passed") ||
  promotion.gates?.length !== 4 ||
  promotion.testMatrix?.some(({ status }) => status !== "passed") ||
  promotion.openHighFindings?.length !== 0 ||
  promotion.acceptedNonHighFindings?.some(
    ({ id, owner, scheduledPhase, rationale }) =>
      !id || !owner || !/^R09-[A-F]$/.test(scheduledPhase) || !rationale,
  )
) {
  throw new Error("artefato de promoção 0.8 está incompleto ou diverge dos contratos");
}

for (const evidence of promotion.evidence) {
  await readFile(path.join(root, evidence));
}

const shallow =
  execFileSync("git", ["rev-parse", "--is-shallow-repository"], {
    cwd: root,
    encoding: "utf8",
  }).trim() === "true";
if (!shallow) {
  try {
    execFileSync(
      "git",
      ["merge-base", "--is-ancestor", promotion.candidateCommit, "HEAD"],
      { cwd: root, stdio: "ignore" },
    );
  } catch {
    throw new Error(
      `candidata de promoção não pertence ao histórico: ${promotion.candidateCommit}`,
    );
  }
}

for (const verifier of ["verify_runtime_audit.js", "verify_hardware_audit.js"]) {
  execFileSync(process.execPath, [path.join(root, "scripts", verifier)], {
    cwd: root,
    stdio: "inherit",
  });
}

console.log(
  `promoção ${promotion.productVersion} verificada: P1–P4 passaram; ` +
    `${promotion.openHighFindings.length} achados altos abertos; ` +
    `${promotion.acceptedNonHighFindings.length} limitações encaminhadas à 0.9`,
);
