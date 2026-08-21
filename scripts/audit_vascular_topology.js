import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import { createServer } from "vite";
import packageManifest from "../package.json" with { type: "json" };

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = process.env.BRAIN_VASCULAR_AUDIT_DIR
  ? path.resolve(process.env.BRAIN_VASCULAR_AUDIT_DIR)
  : path.join(root, "artifacts", "vascular-audit");
const hashFields = [
  "stateHash",
  "corticothalamicHash",
  "cellPatchHash",
  "chemicalHash",
  "cellSpikeEventHash",
];
const expectedViews = ["cell", "electricity", "laminar", "neuron", "overview", "synapse"];
const captures = [];

function assertHashes(label, baseline, candidate) {
  const changed = hashFields.filter((field) => baseline[field] !== candidate[field]);
  if (changed.length > 0) {
    throw new Error(`${label} alterou hashes científicos: ${changed.join(", ")}`);
  }
}

function assertVascularAudit(audit) {
  if (
    !audit.contractReady || !audit.topology.contractReady ||
    audit.topology.segments !== 42 ||
    audit.topology.classes.arterial !== 21 ||
    audit.topology.classes.capillary !== 2 ||
    audit.topology.classes.venous !== 19 ||
    audit.topology.anastomosisSegments !== 4 ||
    audit.topology.sinks !== 2 ||
    audit.totalDrawCalls > audit.maximumTotalDrawCalls ||
    audit.geometryBuilds !== audit.totalDrawCalls ||
    Object.values(audit.views).some((view) =>
      !view.contractReady || view.drawCalls > view.maximumDrawCalls ||
      view.stateObjects !== 0 || view.animatedObjects !== 0 ||
      view.topologyObjects !== view.renderableObjects
    )
  ) {
    throw new Error(`contrato vascular incompleto: ${JSON.stringify(audit)}`);
  }
}

function assertSceneCoverage(audit) {
  if (
    audit.catalog.version !== "1.2.0" || audit.catalog.entries !== 76 ||
    audit.catalog.sources !== 7 || audit.catalog.transforms !== 6 ||
    audit.catalog.evidenceLevels.CALIBRATED !== 0 || !audit.catalog.contractReady ||
    Object.keys(audit.views).sort().join(",") !== expectedViews.join(",") ||
    Object.values(audit.views).some((view) => !view.contractReady)
  ) {
    throw new Error(`cobertura anatômica divergente: ${JSON.stringify(audit)}`);
  }
}

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
    args: [
      "--disable-dev-shm-usage",
      "--disable-gpu-sandbox",
      "--enable-unsafe-swiftshader",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--no-sandbox",
    ],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 960, deviceScaleFactor: 1 });
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(String(error)));
  page.on("console", (message) => {
    const text = message.text();
    if (message.type() === "error" && !text.startsWith("Failed to load resource:")) {
      browserErrors.push(text);
    }
  });
  await page.goto("http://127.0.0.1:4184/", { waitUntil: "networkidle0" });
  await page.waitForFunction(
    () => window.__BRAIN_ENGINE__?.diagnostics().runtime === "rust-wasm",
    { timeout: 30_000 },
  );
  await page.evaluate(async () => {
    await window.__BRAIN_ENGINE__.setCaptureMode(true);
    document.body.dataset.capture = "false";
  });
  const baseline = await page.evaluate(() => window.__BRAIN_ENGINE__.diagnostics());
  const initial = await page.evaluate(() => ({
    vascular: window.__BRAIN_ENGINE__.vascularAudit(),
    anatomy: window.__BRAIN_ENGINE__.anatomyCatalogAudit(),
    material: window.__BRAIN_ENGINE__.materialProfileAudit(),
  }));
  assertVascularAudit(initial.vascular);
  assertSceneCoverage(initial.anatomy);
  const vascularManifestEntries = Object.values(initial.material)
    .flatMap((view) => view.manifest)
    .filter((entry) => entry.id.startsWith("r10-b:"));
  const completeManifest = Object.values(initial.material).flatMap((view) => view.manifest);
  if (vascularManifestEntries.length !== 12 || completeManifest.length !== 37) {
    throw new Error(`manifesto PBR vascular divergente: ${JSON.stringify({
      vascular: vascularManifestEntries.length,
      total: completeManifest.length,
    })}`);
  }

  const searchEvidence = await page.evaluate(() => ({
    middle: window.__BRAIN_ENGINE__.searchAnatomy("arteria cerebral media").map((entry) => entry.id),
    sagittal: window.__BRAIN_ENGINE__.searchAnatomy("seio sagital").map((entry) => entry.id),
    pericyte: window.__BRAIN_ENGINE__.searchAnatomy("pericito").map((entry) => entry.id),
  }));
  if (
    searchEvidence.middle.length !== 2 ||
    searchEvidence.sagittal[0] !== "brain-pro:anatomy/superior-sagittal-sinus" ||
    searchEvidence.pericyte[0] !== "brain-pro:anatomy/pericyte"
  ) {
    throw new Error(`busca vascular divergente: ${JSON.stringify(searchEvidence)}`);
  }

  const selectionSteps = [
    ["01-overview-arterial.png", "brain-pro:anatomy/middle-cerebral-artery-left", "overview"],
    ["02-overview-venous.png", "brain-pro:anatomy/superior-sagittal-sinus", "overview"],
    ["03-laminar-penetrating.png", "brain-pro:anatomy/penetrating-arteriole", "laminar"],
    ["04-synapse-nvu.png", "brain-pro:anatomy/pericyte", "synapse"],
  ];
  const selections = [];
  for (const [filename, entryId, view] of selectionSteps) {
    const evidence = await page.evaluate(async ({ id, expectedView }) => {
      const selectedId = window.__BRAIN_ENGINE__.setAnatomySelection(id);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return {
        selectedId,
        explorer: window.__BRAIN_ENGINE__.anatomyCatalogAudit().explorer,
        diagnostics: window.__BRAIN_ENGINE__.diagnostics(),
        detailsVisible: !document.querySelector("#vascular-selection-details")?.hidden,
        expectedView,
      };
    }, { id: entryId, expectedView: view });
    assertHashes(filename, baseline, evidence.diagnostics);
    if (
      evidence.selectedId !== entryId || evidence.explorer?.selectedId !== entryId ||
      evidence.explorer?.activeView !== view || !evidence.detailsVisible
    ) {
      throw new Error(`seleção vascular divergente: ${JSON.stringify(evidence)}`);
    }
    await page.screenshot({ path: path.join(outputDirectory, filename) });
    captures.push(filename);
    selections.push({ entryId, view, explorer: evidence.explorer });
  }

  const skeleton = await page.evaluate(async () => {
    window.__BRAIN_ENGINE__.setView("overview");
    window.__BRAIN_ENGINE__.setVascularSkeleton(true);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return {
      diagnostics: window.__BRAIN_ENGINE__.diagnostics(),
      effects: window.__BRAIN_ENGINE__.presentationAudit().effects,
      audit: window.__BRAIN_ENGINE__.vascularAudit(),
      checkbox: document.querySelector("#vascular-skeleton-mode")?.checked,
      bodyState: document.body.dataset.vascularSkeleton,
    };
  });
  assertHashes("modo esqueleto vascular", baseline, skeleton.diagnostics);
  assertVascularAudit(skeleton.audit);
  if (
    !skeleton.effects.isolateVascular || !skeleton.checkbox ||
    skeleton.bodyState !== "true" || !skeleton.audit.skeletonMode
  ) {
    throw new Error(`isolamento vascular divergente: ${JSON.stringify(skeleton)}`);
  }
  const skeletonFilename = "05-skeleton-mode.png";
  await page.screenshot({ path: path.join(outputDirectory, skeletonFilename) });
  captures.push(skeletonFilename);

  await page.evaluate(async () => {
    window.__BRAIN_ENGINE__.setColorMode("monochrome");
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    window.__BRAIN_ENGINE__.setColorMode("color");
  });
  assertHashes("monocromia vascular", baseline, await page.evaluate(
    () => window.__BRAIN_ENGINE__.diagnostics(),
  ));

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.evaluate(async () => {
    window.__BRAIN_ENGINE__.setAnatomySelection("brain-pro:anatomy/pericyte");
    document.querySelector("#vascular-explorer")?.setAttribute("open", "");
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  const mobileLayout = await page.evaluate(() => {
    const panel = document.querySelector("#presentation-panel")?.getBoundingClientRect();
    const vascular = document.querySelector("#vascular-explorer")?.getBoundingClientRect();
    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      panelVisible: Boolean(panel && panel.width > 0 && panel.right <= window.innerWidth + 1),
      vascularVisible: Boolean(vascular && vascular.width > 0 && vascular.right <= window.innerWidth + 1),
    };
  });
  if (
    mobileLayout.documentWidth > mobileLayout.viewportWidth + 1 ||
    !mobileLayout.panelVisible || !mobileLayout.vascularVisible
  ) {
    throw new Error(`layout móvel vascular inválido: ${JSON.stringify(mobileLayout)}`);
  }
  const mobileFilename = "06-mobile.png";
  await page.screenshot({ path: path.join(outputDirectory, mobileFilename) });
  captures.push(mobileFilename);

  const finalDiagnostics = await page.evaluate(() => window.__BRAIN_ENGINE__.diagnostics());
  const finalVascular = await page.evaluate(() => window.__BRAIN_ENGINE__.vascularAudit());
  const runtime = await page.evaluate(() => window.__BRAIN_ENGINE__.profile());
  assertHashes("auditoria vascular completa", baseline, finalDiagnostics);
  assertVascularAudit(finalVascular);
  if (browserErrors.length > 0) {
    throw new Error(`erros no Chromium/SwiftShader: ${JSON.stringify(browserErrors)}`);
  }
  const report = {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    source: {
      commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
      worktreeDirty: execFileSync("git", ["status", "--porcelain"], {
        cwd: root,
        encoding: "utf8",
      }).trim().length > 0,
      productVersion: packageManifest.version,
      command: "npm run audit:vascular",
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
    hashInvariance: { fields: hashFields, baseline, final: finalDiagnostics, invariant: true },
    catalog: initial.anatomy.catalog,
    sceneCoverage: initial.anatomy.views,
    materialManifest: { total: completeManifest.length, vascular: vascularManifestEntries.length },
    vascular: finalVascular,
    searchEvidence,
    selections,
    skeleton,
    mobileLayout,
    captures,
    browserErrors,
  };
  await writeFile(
    path.join(outputDirectory, "vascular-audit.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  console.log(
    `auditoria R10-B concluída: ${finalVascular.topology.segments} segmentos, ` +
      `${captures.length} capturas, ${outputDirectory}`,
  );
} finally {
  await browser?.close();
  await server.close();
}
