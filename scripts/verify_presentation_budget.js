import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactPath = process.env.BRAIN_PRESENTATION_BUDGET_ARTIFACT
  ? path.resolve(process.env.BRAIN_PRESENTATION_BUDGET_ARTIFACT)
  : path.join(root, "artifacts", "presentation-budget", "presentation-budget.json");
const report = JSON.parse(await readFile(artifactPath, "utf8"));
const views = ["overview", "laminar", "cell", "neuron", "electricity", "synapse"];
const metrics = ["drawCalls", "triangles", "textureBytes", "geometryBytes"];

if (report.schemaVersion !== 1 || report.profile !== "baseline") {
  throw new Error("presentation budget artifact must use schema 1 and baseline profile");
}
const rendererName = report.environment?.hardware?.webglRenderer;
if (
  report.source?.requestedGraphicsBackend !== "hardware" ||
  typeof rendererName !== "string" ||
  /swiftshader|llvmpipe|software raster/i.test(rendererName)
) {
  throw new Error("presentation budget artifact is not backed by a declared physical GPU");
}
if (!report.hashInvariance?.invariant || !report.cinemaIsolation?.rejectedOutsideCapture) {
  throw new Error("presentation budget artifact lacks hash or cinema isolation evidence");
}
if (report.browserErrors?.length) {
  throw new Error(`presentation budget browser errors: ${report.browserErrors.join(" | ")}`);
}
for (const view of views) {
  const measured = report.measurement?.views?.[view];
  const reference = report.reference?.views?.[view];
  if (!measured || !reference || measured.sampleCount < 12) {
    throw new Error(`presentation budget view is incomplete: ${view}`);
  }
  if (!measured.withinBudget) {
    throw new Error(`versioned presentation ceiling exceeded: ${view}`);
  }
  for (const metric of metrics) {
    const measuredName = `measured${metric[0].toUpperCase()}${metric.slice(1)}`;
    const tolerance = report.reference.tolerance[metric];
    if (
      !Number.isFinite(measured[measuredName]) ||
      !Number.isFinite(reference[metric]) ||
      !Number.isFinite(tolerance) ||
      measured[measuredName] > reference[metric] * (1 + tolerance)
    ) {
      throw new Error(
        `presentation budget regression in ${view}.${metric}: ` +
          `${measured[measuredName]} > ${reference[metric]} (+${tolerance * 100}%)`,
      );
    }
  }
  const frameTolerance = report.reference.tolerance.frameMillisecondsP95;
  if (
    measured.measuredFrameMillisecondsP95 >
      reference.frameMillisecondsP95 * (1 + frameTolerance)
  ) {
    throw new Error(
      `presentation frame regression in ${view}: ` +
        `${measured.measuredFrameMillisecondsP95} > ${reference.frameMillisecondsP95} ` +
        `(+${frameTolerance * 100}%)`,
    );
  }
}

console.log(
  `orçamento de apresentação verificado: schema ${report.schemaVersion}, ` +
    `${views.length} vistas, hashes invariantes`,
);
