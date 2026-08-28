import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import puppeteer from "puppeteer";
import packageManifest from "../package.json" with { type: "json" };

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = process.env.BRAIN_LIGHT_MATERIALITY_DIR
  ? path.resolve(process.env.BRAIN_LIGHT_MATERIALITY_DIR)
  : path.join(root, "artifacts", "light-materiality");
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

function assertHashes(label, baseline, candidate) {
  const changed = hashFields.filter((field) => baseline[field] !== candidate[field]);
  if (changed.length > 0) {
    throw new Error(`${label} alterou hashes científicos: ${changed.join(", ")}`);
  }
}

async function nextFrame(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())));
}

async function captureRenderedCanvas(page, outputPath, rotation) {
  const capture = await page.evaluate((captureRotation) => {
    window.__BRAIN_ENGINE__.setCameraRotation(captureRotation);
    const canvas = document.querySelector("#canvas-container canvas");
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error("light-materiality canvas is unavailable");
    }
    const probe = document.createElement("canvas");
    probe.width = 96;
    probe.height = 64;
    const context = probe.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("light-materiality coverage probe is unavailable");
    context.drawImage(canvas, 0, 0, probe.width, probe.height);
    const pixels = context.getImageData(0, 0, probe.width, probe.height).data;
    let visiblePixels = 0;
    let warmPixels = 0;
    let coolPixels = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const [red, green, blue, alpha] = pixels.subarray(index, index + 4);
      if (alpha <= 8 || red + green + blue <= 12) continue;
      visiblePixels += 1;
      if (red > blue + 12 && red >= green - 8) warmPixels += 1;
      if (blue > red + 12 && blue >= green - 8) coolPixels += 1;
    }
    return {
      dataUrl: canvas.toDataURL("image/png"),
      width: canvas.width,
      height: canvas.height,
      visiblePixels,
      sampledPixels: probe.width * probe.height,
      warmPixels,
      coolPixels,
    };
  }, rotation);
  if (capture.visiblePixels < 8 || !capture.dataUrl.startsWith("data:image/png;base64,")) {
    throw new Error(`light-materiality capture is visually empty: ${outputPath}`);
  }
  await writeFile(outputPath, Buffer.from(capture.dataUrl.split(",", 2)[1], "base64"));
  return {
    width: capture.width,
    height: capture.height,
    visiblePixels: capture.visiblePixels,
    sampledPixels: capture.sampledPixels,
    warmPixels: capture.warmPixels,
    coolPixels: capture.coolPixels,
  };
}

async function capture(page, captures, coverage, filename, rotation) {
  coverage[filename] = await captureRenderedCanvas(page, path.join(outputDirectory, filename), rotation);
  captures.push(filename);
}

async function selectCutCamera(page, state) {
  await page.evaluate((nextState) => window.__BRAIN_ENGINE__.setClipping(nextState), state);
  await page.evaluate(() => window.__BRAIN_ENGINE__.resetCameraForCut());
  await nextFrame(page);
}

async function sampleProfile(page, profile) {
  await page.evaluate((nextProfile) => {
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

async function readyPage(browser, options = {}) {
  const page = await browser.newPage();
  const width = options.width ?? 1440;
  const height = options.height ?? 960;
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  if (options.reducedMotion) {
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  }
  await page.goto(`http://127.0.0.1:4186/?snapshotCadence=2`, { waitUntil: "networkidle0" });
  await page.waitForFunction(
    () => window.__BRAIN_ENGINE__?.diagnostics().runtime === "rust-wasm",
    { timeout: 30_000 },
  );
  return page;
}

await mkdir(outputDirectory, { recursive: true });
const server = await createServer({
  root,
  logLevel: "warn",
  server: { host: "127.0.0.1", port: 4186, strictPort: true },
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
  const page = await readyPage(browser);
  const browserErrors = [];
  page.on("console", (message) => {
    const text = message.text();
    if (message.type() === "error" && !text.startsWith("Failed to load resource:")) {
      browserErrors.push(text);
    }
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.evaluate(async () => {
    await window.__BRAIN_ENGINE__.setCaptureMode(true);
    window.__BRAIN_ENGINE__.setView("overview");
    window.__BRAIN_ENGINE__.setColorMode("color");
    window.__BRAIN_ENGINE__.setHighContrast(false);
    window.__BRAIN_ENGINE__.setRenderProfile("baseline");
    window.__BRAIN_ENGINE__.setMaterialProfile("schematic");
    window.__BRAIN_ENGINE__.setClipping({ enabled: false, slab: false });
    window.__BRAIN_ENGINE__.setPresentationEffects({
      opacity: 1,
      xray: false,
      isolateMatter: false,
      isolateVascular: false,
    });
  });

  const baseline = await page.evaluate(() => window.__BRAIN_ENGINE__.diagnostics());
  const captures = [];
  const captureCoverage = {};
  await capture(page, captures, captureCoverage, "overview-schematic-reference.png", 0.31);
  const activeProfile = await page.evaluate(
    () => window.__BRAIN_ENGINE__.setMaterialProfile("realistic-illustrative"),
  );
  if (activeProfile !== "realistic-illustrative") {
    throw new Error(`perfil R10-E não ativou: ${activeProfile}`);
  }
  const baselinePresentation = await sampleProfile(page, "baseline");
  const cinemaPresentation = await sampleProfile(page, "cinema");

  const matrix = [];
  await page.evaluate(() => window.__BRAIN_ENGINE__.setView("overview"));
  await page.evaluate(() => window.__BRAIN_ENGINE__.setClipping({ enabled: false, slab: false }));
  for (const [name, rotation] of [
    ["frontal", 0.0],
    ["lateral-esquerda", Math.PI * 0.5],
    ["lateral-direita", Math.PI * 1.5],
  ]) {
    const filename = `matrix-${name}.png`;
    await capture(page, captures, captureCoverage, filename, rotation);
    matrix.push({ name, capture: filename, rotation, clipping: { enabled: false } });
  }
  await selectCutCamera(page, { enabled: true, orientation: "axial", slab: false });
  await page.evaluate(() => window.__BRAIN_ENGINE__.setClipping({ enabled: false, slab: false }));
  const superior = "matrix-superior.png";
  await capture(page, captures, captureCoverage, superior, 0.31);
  matrix.push({ name: "superior", capture: superior, rotation: 0.31, clipping: { enabled: false } });
  await selectCutCamera(page, {
    enabled: true,
    orientation: "oblique",
    slab: false,
    obliqueAzimuthDegrees: 45,
    obliqueElevationDegrees: 28,
  });
  await page.evaluate(() => window.__BRAIN_ENGINE__.setClipping({ enabled: false, slab: false }));
  const oblique = "matrix-obliqua.png";
  await capture(page, captures, captureCoverage, oblique, 0.31);
  matrix.push({ name: "obliqua", capture: oblique, rotation: 0.31, clipping: { enabled: false } });
  await selectCutCamera(page, { enabled: true, orientation: "coronal", slab: false, position: 0.06 });
  const coronal = "matrix-coronal-corte.png";
  await capture(page, captures, captureCoverage, coronal, 0.31);
  const coronalPresentation = await page.evaluate(() => window.__BRAIN_ENGINE__.presentationAudit());
  matrix.push({
    name: "coronal-corte",
    capture: coronal,
    rotation: 0.31,
    clipping: coronalPresentation.clipping,
    probe: coronalPresentation.probe,
  });
  await page.evaluate(() => window.__BRAIN_ENGINE__.setClipping({ enabled: false, slab: false }));

  const sixViews = [];
  for (const view of views) {
    await page.evaluate((nextView) => window.__BRAIN_ENGINE__.setView(nextView), view);
    const filename = `view-${view}.png`;
    await capture(page, captures, captureCoverage, filename, 0.31);
    sixViews.push({
      view,
      capture: filename,
      renderer: await page.evaluate(() => window.__BRAIN_ENGINE__.presentationAudit().renderer),
    });
  }
  await page.evaluate(() => {
    window.__BRAIN_ENGINE__.setView("overview");
    window.__BRAIN_ENGINE__.setColorMode("monochrome");
  });
  const monochrome = "accessibility-overview-monochrome.png";
  await capture(page, captures, captureCoverage, monochrome, 0.31);
  const monochromeAudit = await page.evaluate(() => window.__BRAIN_ENGINE__.visualAudit());
  await page.evaluate(() => window.__BRAIN_ENGINE__.setColorMode("color"));

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  const mobile = "accessibility-overview-mobile.png";
  await capture(page, captures, captureCoverage, mobile, 0.31);
  await page.setViewport({ width: 1440, height: 960, deviceScaleFactor: 1 });

  const reducedMotionPage = await readyPage(browser, { reducedMotion: true });
  const reducedMotionErrors = [];
  reducedMotionPage.on("console", (message) => {
    const text = message.text();
    if (message.type() === "error" && !text.startsWith("Failed to load resource:")) {
      reducedMotionErrors.push(text);
    }
  });
  await reducedMotionPage.evaluate(async () => {
    await window.__BRAIN_ENGINE__.setCaptureMode(true);
    window.__BRAIN_ENGINE__.setView("overview");
    window.__BRAIN_ENGINE__.setColorMode("color");
    window.__BRAIN_ENGINE__.setMaterialProfile("realistic-illustrative");
  });
  const reducedMotion = "accessibility-overview-reduced-motion.png";
  await capture(reducedMotionPage, captures, captureCoverage, reducedMotion, 0.31);
  const reducedMotionAudit = await reducedMotionPage.evaluate(() => ({
    rotationSpeed: document.querySelector("#rotation-speed")?.value,
    activeProfile: window.__BRAIN_ENGINE__.presentationAudit().material.activeProfile,
  }));
  await reducedMotionPage.close();

  const highContrastFallback = await page.evaluate(() => {
    const before = window.__BRAIN_ENGINE__.toneMappingAudit();
    const active = window.__BRAIN_ENGINE__.setHighContrast(true);
    const fallback = window.__BRAIN_ENGINE__.presentationAudit();
    window.__BRAIN_ENGINE__.setHighContrast(false);
    const restored = window.__BRAIN_ENGINE__.toneMappingAudit();
    return { before, active, fallback, restored };
  });
  const finalPresentation = await page.evaluate(() => window.__BRAIN_ENGINE__.presentationAudit());
  const finalDiagnostics = await page.evaluate(() => window.__BRAIN_ENGINE__.diagnostics());
  const runtime = await page.evaluate(() => window.__BRAIN_ENGINE__.profile());
  const rendererName = runtime.environment.hardware.webglRenderer;
  let validationError;
  try {
    assertHashes("matriz R10-E", baseline, finalDiagnostics);
    if (
      requestedGraphicsBackend === "hardware" &&
      /swiftshader|llvmpipe|software raster/i.test(rendererName)
    ) {
      throw new Error(`GPU física solicitada, mas renderer de software informado: ${rendererName}`);
    }
    const frontalCoverage = captureCoverage["matrix-frontal.png"];
    if (frontalCoverage.warmPixels <= frontalCoverage.coolPixels) {
      throw new Error("a vista frontal R10-E ainda é dominada por pixels frios");
    }
    if (
      finalPresentation.material.physicalMaterialObjects !== 37 ||
      finalPresentation.material.transmissionObjects !== 0 ||
      finalPresentation.material.bakedSurfaceShaderObjects !== 4 ||
      finalPresentation.material.regionalBaseColorObjects !== 4 ||
      finalPresentation.material.vascularMaterialObjects !== 12 ||
      finalPresentation.material.semanticGeometryChanges !== 0 ||
      !finalPresentation.material.environmentMapActive ||
      finalPresentation.material.proceduralNormalMapTextures !== 3 ||
      finalPresentation.toneMapping.effectiveMode !== "agx" ||
      !matrix.at(-1).probe.available ||
      matrix.at(-1).clipping.cutFaceShaderCaps !== 1 ||
      highContrastFallback.active !== "schematic" ||
      highContrastFallback.fallback.toneMapping.effectiveMode !== "aces" ||
      highContrastFallback.restored.effectiveMode !== "agx" ||
      monochromeAudit.colorMode !== "monochrome" ||
      reducedMotionAudit.rotationSpeed !== "0" ||
      reducedMotionAudit.activeProfile !== "realistic-illustrative" ||
      reducedMotionErrors.length > 0 ||
      browserErrors.length > 0
    ) {
      throw new Error("contrato de luz/materialidade R10-E incompleto");
    }
  } catch (error) {
    validationError = error instanceof Error ? error.message : String(error);
  }

  const report = {
    schemaVersion: 1,
    kind: "r10-e-light-materiality",
    capturedAt: new Date().toISOString(),
    source: {
      commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
      productVersion: packageManifest.version,
      command: "npm run audit:light-materiality",
      requestedGraphicsBackend,
    },
    environment: {
      browser: runtime.environment.browser,
      hardware: runtime.environment.hardware,
      host: {
        cpu: os.cpus()[0]?.model ?? "unknown",
        logicalCores: os.cpus().length,
        memoryBytes: os.totalmem(),
        platform: os.platform(),
        release: os.release(),
        architecture: os.arch(),
      },
    },
    material: finalPresentation.material,
    toneMapping: finalPresentation.toneMapping,
    performance: {
      samplesPerProfile: 24,
      baselineOverview: baselinePresentation.budget.views.overview,
      cinemaOverview: cinemaPresentation.budget.views.overview,
    },
    matrix,
    sixViews,
    accessibility: {
      monochrome: { capture: monochrome, audit: monochromeAudit },
      mobile: { capture: mobile, viewport: { width: 390, height: 844 } },
      reducedMotion: { capture: reducedMotion, audit: reducedMotionAudit },
      highContrastFallback,
    },
    hashInvariance: {
      fields: hashFields,
      baseline,
      final: finalDiagnostics,
      invariant: true,
    },
    captures,
    captureCoverage,
    browserErrors,
    ...(validationError ? { validationError } : {}),
  };
  const artifact = path.join(outputDirectory, "light-materiality.json");
  await writeFile(artifact, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (validationError) throw new Error(validationError);
  console.log(`auditoria R10-E concluída: ${captures.length} capturas, ${artifact}`);
} finally {
  await browser?.close();
  await server.close();
}
