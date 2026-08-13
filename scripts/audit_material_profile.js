import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import puppeteer from "puppeteer";
import { PNG } from "pngjs";
import packageManifest from "../package.json" with { type: "json" };

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = process.env.BRAIN_MATERIAL_AUDIT_DIR
  ? path.resolve(process.env.BRAIN_MATERIAL_AUDIT_DIR)
  : path.join(root, "artifacts", "material-audit");
const hashFields = [
  "stateHash",
  "corticothalamicHash",
  "cellPatchHash",
  "chemicalHash",
  "cellSpikeEventHash",
];
const captures = [];

function assertHashes(label, baseline, candidate) {
  const changed = hashFields.filter((field) => baseline[field] !== candidate[field]);
  if (changed.length > 0) {
    throw new Error(`${label} alterou hashes científicos: ${changed.join(", ")}`);
  }
}

async function changedPixelRatio(firstFilename, secondFilename) {
  const first = PNG.sync.read(await readFile(path.join(outputDirectory, firstFilename)));
  const second = PNG.sync.read(await readFile(path.join(outputDirectory, secondFilename)));
  if (first.width !== second.width || first.height !== second.height) return 1;
  let changed = 0;
  for (let index = 0; index < first.data.length; index += 4) {
    const difference = Math.abs(first.data[index] - second.data[index]) +
      Math.abs(first.data[index + 1] - second.data[index + 1]) +
      Math.abs(first.data[index + 2] - second.data[index + 2]);
    if (difference >= 3) changed += 1;
  }
  return changed / (first.width * first.height);
}

await mkdir(outputDirectory, { recursive: true });
const server = await createServer({
  root,
  logLevel: "warn",
  server: { host: "127.0.0.1", port: 4182, strictPort: true },
});

let browser;
try {
  await server.listen();
  browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.BRAIN_BROWSER_EXECUTABLE || undefined,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--use-angle=swiftshader"],
  });
  const page = await browser.newPage();
  const browserErrors = [];
  page.on("console", (message) => {
    const text = message.text();
    if (message.type() === "error" && !text.startsWith("Failed to load resource:")) {
      browserErrors.push(text);
    }
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.setViewport({ width: 1440, height: 960, deviceScaleFactor: 1 });
  await page.goto("http://127.0.0.1:4182/?snapshotCadence=2&rotation=0", {
    waitUntil: "networkidle0",
  });
  await page.waitForFunction(
    () => window.__BRAIN_ENGINE__?.diagnostics().runtime === "rust-wasm",
    { timeout: 30_000 },
  );
  await page.evaluate(async () => {
    window.__BRAIN_ENGINE__.setView("overview");
    await window.__BRAIN_ENGINE__.setCaptureMode(true);
    window.__BRAIN_ENGINE__.setColorMode("color");
    window.__BRAIN_ENGINE__.setHighContrast(false);
    window.__BRAIN_ENGINE__.setMaterialProfile("schematic");
    window.__BRAIN_ENGINE__.setClipping({ enabled: false, slab: false });
    window.__BRAIN_ENGINE__.setPresentationEffects({
      xray: false,
      isolateMatter: false,
      opacity: 1,
    });
  });

  const baseline = await page.evaluate(() => window.__BRAIN_ENGINE__.diagnostics());
  const steps = [];
  const captureStep = async (name, mutate) => {
    await mutate();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())));
    const evidence = await page.evaluate(() => ({
      diagnostics: window.__BRAIN_ENGINE__.diagnostics(),
      presentation: window.__BRAIN_ENGINE__.presentationAudit(),
      manifest: window.__BRAIN_ENGINE__.materialProfileAudit(),
    }));
    assertHashes(name, baseline, evidence.diagnostics);
    const filename = `${name}.png`;
    await page.screenshot({ path: path.join(outputDirectory, filename) });
    captures.push(filename);
    steps.push({ name, capture: filename, ...evidence });
  };

  await captureStep("01-schematic", async () => undefined);
  await captureStep("02-realistic-illustrative", async () => {
    const active = await page.evaluate(
      () => window.__BRAIN_ENGINE__.setMaterialProfile("realistic-illustrative"),
    );
    if (active !== "realistic-illustrative") {
      throw new Error(`perfil realista não ativou: ${active}`);
    }
  });
  await captureStep("03-realistic-coronal-clipping", async () => {
    await page.evaluate(() => window.__BRAIN_ENGINE__.setClipping({
      enabled: true,
      orientation: "coronal",
      slab: false,
      position: 0.08,
    }));
  });
  await captureStep("04-realistic-coronal-xray", async () => {
    await page.evaluate(() => window.__BRAIN_ENGINE__.setPresentationEffects({ xray: true }));
  });
  await captureStep("05-realistic-coronal-opacity-50", async () => {
    await page.evaluate(() => window.__BRAIN_ENGINE__.setPresentationEffects({
      xray: false,
      opacity: 0.5,
    }));
  });
  await captureStep("06-realistic-coronal-monochrome", async () => {
    await page.evaluate(() => window.__BRAIN_ENGINE__.setColorMode("monochrome"));
  });

  const schematicRealisticChangedPixelRatio = await changedPixelRatio(
    "01-schematic.png",
    "02-realistic-illustrative.png",
  );
  if (schematicRealisticChangedPixelRatio < 0.002) {
    throw new Error(
      `troca de perfil não produziu diferença visual suficiente: ` +
        schematicRealisticChangedPixelRatio,
    );
  }

  const finalPresentation = steps.at(-1).presentation;
  const finalManifest = steps.at(-1).manifest;
  const manifestViews = Object.keys(finalManifest).sort();
  const expectedViews = ["cell", "electricity", "laminar", "neuron", "overview", "synapse"];
  const eligibleObjects = Object.values(finalManifest).reduce(
    (total, view) => total + view.boundedPbrObjects,
    0,
  );
  const declaredManifestObjects = Object.values(finalManifest).reduce(
    (total, view) => total + view.manifest.length,
    0,
  );
  if (
    JSON.stringify(manifestViews) !== JSON.stringify(expectedViews) ||
    Object.values(finalManifest).some((view) => !view.contractReady) ||
    eligibleObjects !== 25 ||
    declaredManifestObjects !== 25 ||
    Object.values(finalManifest).some((view) =>
      view.manifest.some((entry) => !entry.id || !entry.objectName || !entry.surface)
    ) ||
    finalPresentation.material.physicalMaterialObjects !== 25 ||
    finalPresentation.material.semanticGeometryChanges !== 0 ||
    !finalPresentation.material.environmentMapActive ||
    finalPresentation.material.proceduralNormalMapTextures !== 3
  ) {
    throw new Error(`manifesto material incompleto: ${JSON.stringify({
      manifestViews,
      eligibleObjects,
      declaredManifestObjects,
      material: finalPresentation.material,
    })}`);
  }
  if (
    finalPresentation.clipping.estimatedAdditionalDrawCalls >
      finalPresentation.clipping.maximumAdditionalDrawCalls
  ) {
    throw new Error(`orçamento de clipping excedido: ${JSON.stringify(finalPresentation.clipping)}`);
  }
  if (browserErrors.length > 0) {
    throw new Error(`erros no Chromium/SwiftShader: ${JSON.stringify(browserErrors)}`);
  }

  const perViewGpu = {};
  await page.evaluate(() => {
    window.__BRAIN_ENGINE__.setColorMode("color");
    window.__BRAIN_ENGINE__.setPresentationEffects({ opacity: 1, xray: false });
    window.__BRAIN_ENGINE__.setClipping({ enabled: false });
  });
  for (const view of expectedViews) {
    await page.evaluate((nextView) => window.__BRAIN_ENGINE__.setView(nextView), view);
    await page.evaluate(() => window.__BRAIN_ENGINE__.setMaterialProfile("schematic"));
    const schematic = await page.evaluate(() => window.__BRAIN_ENGINE__.presentationAudit().renderer);
    const schematicFilename = `view-${view}-schematic.png`;
    await page.screenshot({ path: path.join(outputDirectory, schematicFilename) });
    captures.push(schematicFilename);
    await page.evaluate(() => window.__BRAIN_ENGINE__.setMaterialProfile("realistic-illustrative"));
    const realistic = await page.evaluate(() => window.__BRAIN_ENGINE__.presentationAudit().renderer);
    const realisticFilename = `view-${view}-realistic.png`;
    await page.screenshot({ path: path.join(outputDirectory, realisticFilename) });
    captures.push(realisticFilename);
    perViewGpu[view] = {
      schematic,
      realistic,
      delta: {
        drawCalls: realistic.drawCalls - schematic.drawCalls,
        triangles: realistic.triangles - schematic.triangles,
        geometries: realistic.geometries - schematic.geometries,
        textures: realistic.textures - schematic.textures,
      },
    };
  }
  const runtime = await page.evaluate(() => window.__BRAIN_ENGINE__.profile());
  const finalDiagnostics = await page.evaluate(() => window.__BRAIN_ENGINE__.diagnostics());
  assertHashes("auditoria por vista", baseline, finalDiagnostics);

  const report = {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    source: {
      commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
      productVersion: packageManifest.version,
      command: "npm run audit:material",
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
    hashInvariance: {
      fields: hashFields,
      baseline,
      final: finalDiagnostics,
      invariant: true,
    },
    captures,
    steps,
    manifest: finalManifest,
    material: finalPresentation.material,
    clipping: finalPresentation.clipping,
    perViewGpu,
    shaderOrPageErrors: browserErrors,
    schematicRealisticChangedPixelRatio,
  };
  await writeFile(
    path.join(outputDirectory, "material-audit.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  console.log(
    `auditoria R09-F concluída: ${captures.length} capturas, ` +
      `${eligibleObjects} objetos elegíveis, ${outputDirectory}`,
  );
} finally {
  await browser?.close();
  await server.close();
}
