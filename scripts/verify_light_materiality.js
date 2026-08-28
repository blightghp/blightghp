import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactPath = process.env.BRAIN_LIGHT_MATERIALITY_ARTIFACT
  ? path.resolve(process.env.BRAIN_LIGHT_MATERIALITY_ARTIFACT)
  : path.join(root, "artifacts", "light-materiality", "light-materiality.json");
const report = JSON.parse(await readFile(artifactPath, "utf8"));
const expectedMatrix = [
  "frontal",
  "lateral-esquerda",
  "lateral-direita",
  "superior",
  "obliqua",
  "coronal-corte",
];
const expectedViews = ["cell", "electricity", "laminar", "neuron", "overview", "synapse"];
const evidenceOnlyPaths = [
  "artifacts/light-materiality/",
  "assets/brain.gif",
  "assets/brain-gif.json",
  "README.md",
  "docs/audits/0.10/AUDIT_0.10_R10_E.md",
  "docs/reviews/VISUAL_REVIEW_R10_E.md",
  "docs/planning/NEXT_STAGE_R10_E.md",
  "docs/planning/ROADMAP.md",
];

if (report.schemaVersion !== 1 || report.kind !== "r10-e-light-materiality") {
  throw new Error("R10-E light-materiality artifact must use schema 1");
}
if (!/^[0-9a-f]{40}$/u.test(report.source?.commit ?? "")) {
  throw new Error("R10-E light-materiality artifact has no immutable source commit");
}
try {
  execFileSync("git", ["merge-base", "--is-ancestor", report.source.commit, "HEAD"], {
    cwd: root,
    stdio: "ignore",
  });
} catch {
  throw new Error("R10-E light-materiality evidence source is not an ancestor of HEAD");
}
const changedAfterEvidence = execFileSync(
  "git",
  ["diff", "--name-only", `${report.source.commit}..HEAD`],
  { cwd: root, encoding: "utf8" },
).split(/\r?\n/u).filter(Boolean);
const staleChanges = changedAfterEvidence.filter(
  (file) => !evidenceOnlyPaths.some((allowed) => file === allowed || file.startsWith(allowed)),
);
if (staleChanges.length > 0) {
  throw new Error(
    `R10-E light-materiality evidence is stale after source changes: ${staleChanges.join(", ")}`,
  );
}
const renderer = report.environment?.hardware?.webglRenderer;
if (
  report.source?.requestedGraphicsBackend !== "hardware" ||
  typeof renderer !== "string" ||
  /swiftshader|llvmpipe|software raster/i.test(renderer)
) {
  throw new Error("R10-E light-materiality artifact is not backed by a physical GPU");
}
const material = report.material;
if (
  material?.activeProfile !== "realistic-illustrative" ||
  material.physicalMaterialObjects !== 37 ||
  material.transmissionObjects !== 0 ||
  material.estimatedTransmissionPasses !== 0 ||
  material.bakedSurfaceShaderObjects !== 4 ||
  material.regionalBaseColorObjects !== 4 ||
  material.vascularMaterialObjects !== 12 ||
  material.semanticGeometryChanges !== 0 ||
  material.lightCount !== 4 ||
  material.environmentMapActive !== true ||
  material.proceduralNormalMapTextures !== 3
) {
  throw new Error(`R10-E material contract is incomplete: ${JSON.stringify(material)}`);
}
if (report.toneMapping?.requestedMode !== "agx" || report.toneMapping?.effectiveMode !== "agx") {
  throw new Error("R10-E audit did not retain AgX outside the safety fallback");
}
if (
  report.performance?.samplesPerProfile < 24 ||
  report.performance?.baselineOverview?.sampleCount < 24 ||
  report.performance?.enhancedOverview?.sampleCount < 24 ||
  report.performance?.cinemaOverview?.sampleCount < 24
) {
  throw new Error("R10-E physical performance sample is incomplete");
}
const ambientOcclusion = report.ambientOcclusion;
if (
  ambientOcclusion?.baseline?.enabled !== false ||
  ambientOcclusion.baseline.reason !== "baseline-profile" ||
  ambientOcclusion?.enhanced?.enabled !== true ||
  ambientOcclusion.enhanced.scale !== 0.5 ||
  ambientOcclusion.enhanced.width < 1 ||
  ambientOcclusion.enhanced.height < 1 ||
  ambientOcclusion?.cinema?.enabled !== true ||
  ambientOcclusion.cinema.scale !== 0.5 ||
  ambientOcclusion.cinema.width < 1 ||
  ambientOcclusion.cinema.height < 1 ||
  ambientOcclusion?.final?.enabled !== true ||
  ambientOcclusion.final.scale !== 0.5
) {
  throw new Error("R10-E GTAO policy evidence is incomplete");
}
if (
  !Array.isArray(report.matrix) ||
  report.matrix.map((entry) => entry.name).join(",") !== expectedMatrix.join(",") ||
  report.matrix.at(-1)?.clipping?.cutFaceShaderCaps !== 1 ||
  report.matrix.at(-1)?.probe?.available !== true ||
  report.matrix.at(-1)?.ambientOcclusion?.enabled !== false ||
  report.matrix.at(-1)?.ambientOcclusion?.reason !== "clipping-active"
) {
  throw new Error("R10-E visual matrix is incomplete");
}
if (
  !Array.isArray(report.sixViews) ||
  report.sixViews.map((entry) => entry.view).sort().join(",") !== expectedViews.join(",") ||
  report.sixViews.some((entry) =>
    entry.view === "overview"
      ? entry.ambientOcclusion?.enabled !== true
      : entry.ambientOcclusion?.enabled !== false ||
        entry.ambientOcclusion?.reason !== "non-overview-view"
  )
) {
  throw new Error("R10-E six-view coverage is incomplete");
}
const accessibility = report.accessibility;
if (
  accessibility?.monochrome?.audit?.colorMode !== "monochrome" ||
  accessibility?.mobile?.viewport?.width !== 390 ||
  accessibility?.mobile?.viewport?.height !== 844 ||
  accessibility?.reducedMotion?.audit?.rotationSpeed !== "0" ||
  accessibility?.reducedMotion?.audit?.activeProfile !== "realistic-illustrative" ||
  accessibility?.highContrastFallback?.active !== "schematic" ||
  accessibility?.highContrastFallback?.fallback?.toneMapping?.effectiveMode !== "aces" ||
  accessibility?.highContrastFallback?.fallback?.bloom?.ambientOcclusion?.enabled !== false ||
  accessibility?.highContrastFallback?.fallback?.bloom?.ambientOcclusion?.reason !==
    "high-contrast" ||
  accessibility?.highContrastFallback?.restored?.effectiveMode !== "agx"
) {
  throw new Error("R10-E accessibility/fallback evidence is incomplete");
}
if (
  !report.hashInvariance?.invariant ||
  !Array.isArray(report.hashInvariance.fields) ||
  report.hashInvariance.fields.length !== 5 ||
  report.captureCoverage?.["matrix-frontal.png"]?.warmPixels <=
    report.captureCoverage?.["matrix-frontal.png"]?.coolPixels ||
  !Array.isArray(report.captures) ||
  report.captures.length !== 16 ||
  report.captures.some((capture) => {
    const coverage = report.captureCoverage?.[capture];
    return !coverage || coverage.visiblePixels < 8 || coverage.sampledPixels < 1;
  }) ||
  report.browserErrors?.length
) {
  throw new Error("R10-E visual or scientific evidence is incomplete");
}

console.log(
  `R10-E luz/materialidade verificada: ${report.captures.length} capturas, ` +
    `${material.regionalBaseColorObjects} shells quentes, ${renderer}`,
);
