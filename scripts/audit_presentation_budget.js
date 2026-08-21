import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import puppeteer from "puppeteer";
import packageManifest from "../package.json" with { type: "json" };

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = process.env.BRAIN_PRESENTATION_BUDGET_DIR
  ? path.resolve(process.env.BRAIN_PRESENTATION_BUDGET_DIR)
  : path.join(root, "artifacts", "presentation-budget");
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
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error("presentation canvas is unavailable");
    }
    const probe = document.createElement("canvas");
    probe.width = 96;
    probe.height = 64;
    const context = probe.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("presentation capture probe is unavailable");
    context.drawImage(canvas, 0, 0, probe.width, probe.height);
    const pixels = context.getImageData(0, 0, probe.width, probe.height).data;
    let visiblePixels = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (
        pixels[index + 3] > 8 &&
        pixels[index] + pixels[index + 1] + pixels[index + 2] > 12
      ) {
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
    throw new Error(`presentation capture is visually empty: ${outputPath}`);
  }
  await writeFile(outputPath, Buffer.from(capture.dataUrl.split(",", 2)[1], "base64"));
  return {
    width: capture.width,
    height: capture.height,
    visiblePixels: capture.visiblePixels,
    sampledPixels: capture.sampledPixels,
  };
}

// R10-B reference = R09-F measured per-view renderer cost plus the exact static
// vascular marginal audited in artifacts/vascular-audit/vascular-audit.json.
const r10bReference = {
  overview: { drawCalls: 51, triangles: 150_578, frameMillisecondsP95: 3_990.5 },
  laminar: { drawCalls: 94, triangles: 13_166, frameMillisecondsP95: 3_990.5 },
  cell: { drawCalls: 24, triangles: 9_178, frameMillisecondsP95: 3_990.5 },
  neuron: { drawCalls: 33, triangles: 4_962, frameMillisecondsP95: 3_990.5 },
  electricity: { drawCalls: 34, triangles: 2_386, frameMillisecondsP95: 3_990.5 },
  synapse: { drawCalls: 40, triangles: 33_542, frameMillisecondsP95: 3_990.5 },
};

await mkdir(outputDirectory, { recursive: true });
const server = await createServer({
  root,
  logLevel: "warn",
  server: { host: "127.0.0.1", port: 4184, strictPort: true },
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
  await page.goto("http://127.0.0.1:4184/?snapshotCadence=2&rotation=0", {
    waitUntil: "networkidle0",
  });
  await page.waitForFunction(
    () => window.__BRAIN_ENGINE__?.diagnostics().runtime === "rust-wasm",
    { timeout: 30_000 },
  );

  const cinemaIsolation = await page.evaluate(() => {
    try {
      window.__BRAIN_ENGINE__.setRenderProfile("cinema");
      return { rejectedOutsideCapture: false };
    } catch (error) {
      return {
        rejectedOutsideCapture: true,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  });
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
  const measurementViews = {};
  const captures = [];
  const captureCoverage = {};
  for (const view of views) {
    await page.evaluate((activeView) => {
      window.__BRAIN_ENGINE__.setView(activeView);
      window.__BRAIN_ENGINE__.setRenderProfile("baseline");
      window.__BRAIN_ENGINE__.resetPresentationBudgetSamples();
    }, view);
    for (let frame = 0; frame < 24; frame += 1) {
      await page.evaluate(
        (rotation) => window.__BRAIN_ENGINE__.setCameraRotation(rotation),
        0.34 + frame * 0.002,
      );
    }
    const presentation = await page.evaluate(() => window.__BRAIN_ENGINE__.presentationAudit());
    measurementViews[view] = presentation.budget.views[view];
    const filename = `baseline-${view}.png`;
    captureCoverage[filename] = await captureRenderedCanvas(
      page,
      path.join(outputDirectory, filename),
      0.34,
    );
    captures.push(filename);
  }

  // Cinema currently shares the enhanced interactive path; R10-G owns future
  // supersampling. It is used here only to freeze the visual review captures.
  await page.evaluate(() => window.__BRAIN_ENGINE__.setRenderProfile("cinema"));
  for (const view of views) {
    await page.evaluate(async (activeView) => {
      window.__BRAIN_ENGINE__.setView(activeView);
      window.__BRAIN_ENGINE__.setCameraRotation(0.34);
    }, view);
    const filename = `visual-${view}-enhanced.png`;
    captureCoverage[filename] = await captureRenderedCanvas(
      page,
      path.join(outputDirectory, filename),
      0.34,
    );
    captures.push(filename);
  }
  const finalPresentation = await page.evaluate(() => window.__BRAIN_ENGINE__.presentationAudit());
  const hashFinal = await page.evaluate(() => window.__BRAIN_ENGINE__.diagnostics());
  const hashInvariant = hashFields.every((field) => hashBaseline[field] === hashFinal[field]);
  const runtimeProfile = await page.evaluate(() => window.__BRAIN_ENGINE__.profile());
  const rendererName = runtimeProfile.environment.hardware.webglRenderer;
  if (
    requestedGraphicsBackend === "hardware" &&
    /swiftshader|llvmpipe|software raster/i.test(rendererName)
  ) {
    throw new Error(`physical GPU requested but software renderer was reported: ${rendererName}`);
  }
  const referenceViews = Object.fromEntries(views.map((view) => [
    view,
    {
      ...r10bReference[view],
      // Complaints do not add resources. These measured R10-C resident values
      // close the previously missing byte baseline for future gates.
      textureBytes: measurementViews[view].measuredTextureBytes,
      geometryBytes: measurementViews[view].measuredGeometryBytes,
    },
  ]));
  const report = {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    profile: "baseline",
    source: {
      commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
      productVersion: packageManifest.version,
      command: "npm run audit:presentation-budget",
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
    reference: {
      source: [
        "artifacts/material-audit/material-audit.json#perViewGpu",
        "artifacts/vascular-audit/vascular-audit.json#vascular.views",
        "docs/audits/0.10/AUDIT_0.10_R10_B.md#comandos-e-evidência",
      ],
      method: "R09-F measured per-view cost + exact R10-B vascular marginal",
      tolerance: {
        drawCalls: 0,
        triangles: 0,
        textureBytes: 0,
        geometryBytes: 0,
        frameMillisecondsP95: 0.1,
      },
      views: referenceViews,
    },
    measurement: {
      sampleCountPerView: 24,
      views: measurementViews,
      contractReady: views.every((view) => measurementViews[view].withinBudget),
    },
    governor: finalPresentation.budget.governor,
    caches: {
      effects: finalPresentation.effectsCache,
      clipping: finalPresentation.clippingCache,
      bloom: finalPresentation.bloom,
      frozenStaticMatrices: finalPresentation.frozenStaticMatrices,
    },
    cinemaIsolation,
    hashInvariance: {
      fields: hashFields,
      baseline: hashBaseline,
      final: hashFinal,
      invariant: hashInvariant,
    },
    captures,
    captureCoverage,
    browserErrors,
  };
  const artifact = path.join(outputDirectory, "presentation-budget.json");
  await writeFile(artifact, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (!report.measurement.contractReady) {
    throw new Error("measured baseline exceeds its versioned presentation ceiling");
  }
  if (!hashInvariant) throw new Error("render profile interactions changed scientific hashes");
  if (browserErrors.length > 0) throw new Error(browserErrors.join(" | "));
  console.log(
    `auditoria R10-C concluída: ${views.length} vistas × 24 amostras, ${artifact}`,
  );
} finally {
  await browser?.close();
  await server.close();
}
