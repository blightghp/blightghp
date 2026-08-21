import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import puppeteer from "puppeteer";
import packageManifest from "../package.json" with { type: "json" };

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = process.env.BRAIN_PROCEDURAL_SURFACE_DIR
  ? path.resolve(process.env.BRAIN_PROCEDURAL_SURFACE_DIR)
  : path.join(root, "artifacts", "procedural-surface");
const requestedGraphicsBackend = process.env.BRAIN_GRAPHICS_BACKEND === "swiftshader"
  ? "swiftshader"
  : "hardware";
const views = ["overview", "laminar", "cell", "neuron", "electricity", "synapse"];
const hashFields = [
  "stateHash",
  "corticothalamicHash",
  "cellPatchHash",
  "chemicalHash",
  "cellSpikeEventHash",
];

async function captureRenderedCanvas(page, outputPath, rotation) {
  const capture = await page.evaluate((captureRotation) => {
    window.__BRAIN_ENGINE__.setCameraRotation(captureRotation);
    const canvas = document.querySelector("#canvas-container canvas");
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error("surface canvas is unavailable");
    const probe = document.createElement("canvas");
    probe.width = 96;
    probe.height = 64;
    const context = probe.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("surface coverage probe is unavailable");
    context.drawImage(canvas, 0, 0, probe.width, probe.height);
    const pixels = context.getImageData(0, 0, probe.width, probe.height).data;
    let visiblePixels = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] > 8 && pixels[index] + pixels[index + 1] + pixels[index + 2] > 12) {
        visiblePixels += 1;
      }
    }
    return {
      dataUrl: canvas.toDataURL("image/png"),
      width: canvas.width,
      height: canvas.height,
      visiblePixels,
      sampledPixels: probe.width * probe.height,
    };
  }, rotation);
  if (capture.visiblePixels < 8 || !capture.dataUrl.startsWith("data:image/png;base64,")) {
    throw new Error(`surface capture is visually empty: ${outputPath}`);
  }
  await writeFile(outputPath, Buffer.from(capture.dataUrl.split(",", 2)[1], "base64"));
  return {
    width: capture.width,
    height: capture.height,
    visiblePixels: capture.visiblePixels,
    sampledPixels: capture.sampledPixels,
  };
}

async function sampleProfile(page, profile) {
  await page.evaluate((nextProfile) => {
    window.__BRAIN_ENGINE__.setView("overview");
    window.__BRAIN_ENGINE__.setRenderProfile(nextProfile);
    window.__BRAIN_ENGINE__.resetPresentationBudgetSamples();
  }, profile);
  for (let frame = 0; frame < 24; frame += 1) {
    await page.evaluate(
      (rotation) => window.__BRAIN_ENGINE__.setCameraRotation(rotation),
      0.31 + frame * 0.002,
    );
  }
  return page.evaluate(() => window.__BRAIN_ENGINE__.presentationAudit());
}

await mkdir(outputDirectory, { recursive: true });
const server = await createServer({
  root,
  logLevel: "warn",
  server: { host: "127.0.0.1", port: 4185, strictPort: true },
});

let browser;
try {
  await server.listen();
  browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.BRAIN_BROWSER_EXECUTABLE || undefined,
    args: requestedGraphicsBackend === "hardware"
      ? [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--enable-gpu",
          "--disable-software-rasterizer",
          ...(process.platform === "win32" ? ["--use-angle=d3d11"] : []),
        ]
      : ["--no-sandbox", "--disable-setuid-sandbox", "--use-angle=swiftshader"],
  });
  const page = await browser.newPage();
  const browserErrors = [];
  page.on("console", (message) => {
    const messageText = message.text();
    if (message.type() === "error" && !messageText.startsWith("Failed to load resource:")) {
      browserErrors.push(messageText);
    }
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.setViewport({ width: 1440, height: 960, deviceScaleFactor: 1 });
  await page.goto("http://127.0.0.1:4185/?snapshotCadence=2&rotation=0", {
    waitUntil: "networkidle0",
  });
  await page.waitForFunction(
    () => window.__BRAIN_ENGINE__?.diagnostics().runtime === "rust-wasm",
    { timeout: 30_000 },
  );
  await page.evaluate(async () => {
    await window.__BRAIN_ENGINE__.setCaptureMode(true);
    window.__BRAIN_ENGINE__.setColorMode("color");
    window.__BRAIN_ENGINE__.setHighContrast(false);
    window.__BRAIN_ENGINE__.setMaterialProfile("realistic-illustrative");
    window.__BRAIN_ENGINE__.setClipping({ enabled: false, slab: false });
    window.__BRAIN_ENGINE__.setPresentationEffects({
      opacity: 1,
      xray: false,
      isolateMatter: false,
      isolateVascular: false,
    });
  });

  const hashBaseline = await page.evaluate(() => window.__BRAIN_ENGINE__.diagnostics());
  const initialSurface = await page.evaluate(() => window.__BRAIN_ENGINE__.surfaceAudit());
  const catalog = await page.evaluate(() => window.__BRAIN_ENGINE__.anatomyCatalogAudit());
  const baselinePresentation = await sampleProfile(page, "baseline");
  const captures = [];
  const captureCoverage = {};
  const baselineCapture = "surface-low-baseline.png";
  captureCoverage[baselineCapture] = await captureRenderedCanvas(
    page,
    path.join(outputDirectory, baselineCapture),
    0.31,
  );
  captures.push(baselineCapture);

  const enhancedPresentation = await sampleProfile(page, "cinema");
  const reviewAngles = [
    ["surface-high-anterior.png", 0.0],
    ["surface-high-lateral-left.png", Math.PI * 0.5],
    ["surface-high-posterior.png", Math.PI],
    ["surface-high-lateral-right.png", Math.PI * 1.5],
  ];
  for (const [filename, rotation] of reviewAngles) {
    captureCoverage[filename] = await captureRenderedCanvas(
      page,
      path.join(outputDirectory, filename),
      rotation,
    );
    captures.push(filename);
  }
  for (const view of views) {
    await page.evaluate((activeView) => window.__BRAIN_ENGINE__.setView(activeView), view);
    const filename = `surface-review-${view}.png`;
    captureCoverage[filename] = await captureRenderedCanvas(
      page,
      path.join(outputDirectory, filename),
      0.31,
    );
    captures.push(filename);
  }

  await page.evaluate(() => {
    window.__BRAIN_ENGINE__.setView("overview");
    window.__BRAIN_ENGINE__.setClipping({
      enabled: true,
      orientation: "coronal",
      slab: false,
      position: 0.06,
    });
  });
  const cutPresentation = await page.evaluate(() => window.__BRAIN_ENGINE__.presentationAudit());
  const cutCapture = "surface-high-coronal-cut.png";
  captureCoverage[cutCapture] = await captureRenderedCanvas(
    page,
    path.join(outputDirectory, cutCapture),
    0.31,
  );
  captures.push(cutCapture);

  const hashFinal = await page.evaluate(() => window.__BRAIN_ENGINE__.diagnostics());
  const finalSurface = await page.evaluate(() => window.__BRAIN_ENGINE__.surfaceAudit());
  const finalMaterial = await page.evaluate(
    () => window.__BRAIN_ENGINE__.presentationAudit().material,
  );
  const runtimeProfile = await page.evaluate(() => window.__BRAIN_ENGINE__.profile());
  const rendererName = runtimeProfile.environment.hardware.webglRenderer;
  if (
    requestedGraphicsBackend === "hardware" &&
    /swiftshader|llvmpipe|software raster/i.test(rendererName)
  ) {
    throw new Error(`physical GPU requested but software renderer was reported: ${rendererName}`);
  }

  const replayPage = await browser.newPage();
  await replayPage.setViewport({ width: 960, height: 640, deviceScaleFactor: 1 });
  await replayPage.goto("http://127.0.0.1:4185/?snapshotCadence=2&rotation=0", {
    waitUntil: "networkidle0",
  });
  await replayPage.waitForFunction(
    () => window.__BRAIN_ENGINE__?.diagnostics().runtime === "rust-wasm",
    { timeout: 30_000 },
  );
  const replaySurface = await replayPage.evaluate(() => window.__BRAIN_ENGINE__.surfaceAudit());
  await replayPage.close();

  const hashInvariant = hashFields.every((field) => hashBaseline[field] === hashFinal[field]);
  const surfaceHashInvariant =
    initialSurface.procedural?.surfaceGeometryHash === finalSurface.procedural?.surfaceGeometryHash &&
    initialSurface.procedural?.surfaceGeometryHash === replaySurface.procedural?.surfaceGeometryHash;
  const report = {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    source: {
      commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
      productVersion: packageManifest.version,
      command: "npm run audit:procedural-surface",
      requestedGraphicsBackend,
    },
    environment: {
      browser: runtimeProfile.environment.browser,
      hardware: runtimeProfile.environment.hardware,
      host: {
        cpu: os.cpus()[0]?.model ?? "unknown",
        logicalCores: os.cpus().length,
        memoryBytes: os.totalmem(),
        platform: os.platform(),
        release: os.release(),
        architecture: os.arch(),
      },
    },
    surface: initialSurface,
    replaySurface,
    lodEvidence: {
      baseline: baselinePresentation.surface,
      enhanced: enhancedPresentation.surface,
      semanticGeometryChanges: finalMaterial.semanticGeometryChanges,
    },
    performance: {
      sampleCountPerProfile: 24,
      baselineOverview: baselinePresentation.budget.views.overview,
      enhancedOverview: enhancedPresentation.budget.views.overview,
      baselineContractReady: baselinePresentation.budget.views.overview.withinBudget,
      enhancedContractReady: enhancedPresentation.budget.views.overview.withinBudget,
    },
    cutProbe: {
      clipping: cutPresentation.clipping,
      probe: cutPresentation.probe,
    },
    catalog,
    hashInvariance: {
      fields: hashFields,
      baseline: hashBaseline,
      final: hashFinal,
      scientificInvariant: hashInvariant,
      surfaceInvariant: surfaceHashInvariant,
    },
    captures,
    captureCoverage,
    browserErrors,
  };
  const artifact = path.join(outputDirectory, "procedural-surface.json");
  await writeFile(artifact, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (
    initialSurface.fallbackUsed || !initialSurface.procedural?.contractReady ||
    initialSurface.procedural.buildMilliseconds > initialSurface.procedural.buildCeilingMilliseconds
  ) {
    throw new Error(`procedural surface contract failed: ${JSON.stringify(initialSurface)}`);
  }
  if (!baselinePresentation.budget.views.overview.withinBudget ||
      !enhancedPresentation.budget.views.overview.withinBudget) {
    throw new Error("procedural surface exceeded the R10-C presentation budget");
  }
  if (!cutPresentation.probe.available || cutPresentation.probe.unit !== "normalized field activity") {
    throw new Error(`coronal cut probe is incomplete: ${JSON.stringify(cutPresentation.probe)}`);
  }
  if (!hashInvariant || !surfaceHashInvariant) throw new Error("surface interactions changed hashes");
  if (finalMaterial.semanticGeometryChanges !== 0) {
    throw new Error("surface LOD changed semantic geometry identity");
  }
  if (catalog.catalog.version !== "1.2.0" || catalog.catalog.sources !== 7) {
    throw new Error(`R10-D catalog is not synchronized: ${JSON.stringify(catalog.catalog)}`);
  }
  if (browserErrors.length > 0) throw new Error(browserErrors.join(" | "));
  console.log(
    `auditoria R10-D concluída: ${initialSurface.procedural.surfaceGeometryHash}, ${captures.length} capturas, ${artifact}`,
  );
} finally {
  await browser?.close();
  await server.close();
}
