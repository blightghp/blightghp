import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactPath = process.env.BRAIN_PROCEDURAL_SURFACE_ARTIFACT
  ? path.resolve(process.env.BRAIN_PROCEDURAL_SURFACE_ARTIFACT)
  : path.join(root, "artifacts", "procedural-surface", "procedural-surface.json");
const report = JSON.parse(await readFile(artifactPath, "utf8"));
const hashPattern = /^[0-9a-f]{16}$/;

if (report.schemaVersion !== 1 || report.surface?.schemaVersion !== 1) {
  throw new Error("procedural surface artifact must use schema 1");
}
const rendererName = report.environment?.hardware?.webglRenderer;
if (
  report.source?.requestedGraphicsBackend !== "hardware" ||
  typeof rendererName !== "string" ||
  /swiftshader|llvmpipe|software raster/i.test(rendererName)
) {
  throw new Error("procedural surface artifact is not backed by a declared physical GPU");
}
const surface = report.surface;
const procedural = surface.procedural;
if (
  surface.fallbackUsed || surface.zeroPerFrameCpu !== true || !procedural?.contractReady ||
  procedural.algorithmVersion !== "r10-d-simplex-ridge-v1" ||
  procedural.buildMilliseconds > 120 || procedural.buildCeilingMilliseconds !== 120 ||
  procedural.totalTriangles?.high > 52_000 || procedural.totalTriangles?.low > 14_000 ||
  !hashPattern.test(procedural.surfaceGeometryHash ?? "") ||
  !Array.isArray(procedural.regions) || procedural.regions.length !== 8 ||
  procedural.regions.some((region) =>
    !hashPattern.test(region.hash ?? "") || region.bakedAttributes?.join(",") !==
      "aoFactor,curvature,thickness"
  )
) {
  throw new Error(`procedural surface contract is incomplete: ${JSON.stringify(surface)}`);
}
if (
  report.lodEvidence?.baseline?.activeLod !== "low" ||
  report.lodEvidence?.enhanced?.activeLod !== "high" ||
  report.lodEvidence?.semanticGeometryChanges !== 0
) {
  throw new Error("procedural surface LOD evidence is incomplete");
}
if (
  !report.performance?.baselineContractReady || !report.performance?.enhancedContractReady ||
  report.performance.baselineOverview?.sampleCount < 12 ||
  report.performance.enhancedOverview?.sampleCount < 12
) {
  throw new Error("procedural surface performance evidence is incomplete");
}
if (
  !report.cutProbe?.probe?.available ||
  report.cutProbe.probe.unit !== "normalized field activity"
) {
  throw new Error("procedural surface cut-probe evidence is incomplete");
}
if (
  report.catalog?.catalog?.version !== "1.2.0" ||
  report.catalog.catalog.sources !== 7 || !report.catalog.catalog.contractReady
) {
  throw new Error("procedural surface catalog evidence is incomplete");
}
if (
  !report.hashInvariance?.scientificInvariant || !report.hashInvariance?.surfaceInvariant ||
  report.replaySurface?.procedural?.surfaceGeometryHash !== procedural.surfaceGeometryHash
) {
  throw new Error("procedural surface hash invariance is incomplete");
}
if (report.browserErrors?.length) {
  throw new Error(`procedural surface browser errors: ${report.browserErrors.join(" | ")}`);
}
if (
  !Array.isArray(report.captures) || report.captures.length !== 12 ||
  report.captures.some((capture) => {
    const coverage = report.captureCoverage?.[capture];
    return !coverage || coverage.visiblePixels < 8 || coverage.sampledPixels < 1;
  })
) {
  throw new Error("procedural surface artifact contains an empty or unaudited capture");
}

console.log(
  `superfície procedural verificada: ${procedural.surfaceGeometryHash}, ` +
    `${procedural.totalTriangles.high}/${procedural.totalTriangles.low} triângulos, ` +
    `${report.captures.length} capturas`,
);
