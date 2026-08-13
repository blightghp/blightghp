import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import puppeteer from "puppeteer";
import packageManifest from "../package.json" with { type: "json" };

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = process.env.BRAIN_ANATOMY_AUDIT_DIR
  ? path.resolve(process.env.BRAIN_ANATOMY_AUDIT_DIR)
  : path.join(root, "artifacts", "anatomy-audit");
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

function assertSceneCoverage(audit) {
  const views = Object.keys(audit.views).sort();
  if (JSON.stringify(views) !== JSON.stringify(expectedViews)) {
    throw new Error(`vistas do catálogo divergentes: ${JSON.stringify(views)}`);
  }
  for (const [view, report] of Object.entries(audit.views)) {
    if (
      !report.contractReady ||
      report.totalRenderableObjects === 0 ||
      report.boundObjects === 0 ||
      report.missingDeclarations.length > 0 ||
      report.unknownEntryIds.length > 0 ||
      report.missingEvidence.length > 0
    ) {
      throw new Error(`cobertura anatômica inválida em ${view}: ${JSON.stringify(report)}`);
    }
  }
}

await mkdir(outputDirectory, { recursive: true });
const server = await createServer({
  root,
  logLevel: "warn",
  server: { host: "127.0.0.1", port: 4183, strictPort: true },
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
  await page.goto("http://127.0.0.1:4183/?snapshotCadence=2&rotation=0", {
    waitUntil: "networkidle0",
  });
  await page.waitForFunction(
    () => window.__BRAIN_ENGINE__?.diagnostics().runtime === "rust-wasm",
    { timeout: 30_000 },
  );
  await page.evaluate(async () => {
    window.__BRAIN_ENGINE__.setView("overview");
    await window.__BRAIN_ENGINE__.setCaptureMode(true);
    document.body.dataset.capture = "false";
  });

  await page.evaluate(async (views) => {
    for (const view of views) {
      window.__BRAIN_ENGINE__.setView(view);
      await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    }
    window.__BRAIN_ENGINE__.setView("overview");
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, expectedViews);

  const baseline = await page.evaluate(() => window.__BRAIN_ENGINE__.diagnostics());
  const baselineRenderer = await page.evaluate(
    () => window.__BRAIN_ENGINE__.presentationAudit().renderer,
  );
  const initialAudit = await page.evaluate(() => window.__BRAIN_ENGINE__.anatomyCatalogAudit());
  if (
    initialAudit.catalog.schemaVersion !== 1 ||
    initialAudit.catalog.catalogId !== "brain-pro-anatomy" ||
    initialAudit.catalog.entries < 28 ||
    initialAudit.catalog.roots !== 1 ||
    initialAudit.catalog.externalAssets !== 0 ||
    initialAudit.catalog.issues.length > 0 ||
    !initialAudit.catalog.contractReady
  ) {
    throw new Error(`catálogo embutido incompleto: ${JSON.stringify(initialAudit.catalog)}`);
  }
  assertSceneCoverage(initialAudit);

  const searchEvidence = await page.evaluate(() => ({
    talamo: window.__BRAIN_ENGINE__.searchAnatomy("talamo").map((entry) => entry.id),
    ranvier: window.__BRAIN_ENGINE__.searchAnatomy("NÓ DE RANVIER").map((entry) => entry.id),
    cellBody: window.__BRAIN_ENGINE__.searchAnatomy("cell body").map((entry) => entry.id),
  }));
  if (
    searchEvidence.talamo[0] !== "brain-pro:anatomy/thalamus" ||
    searchEvidence.ranvier[0] !== "brain-pro:anatomy/ranvier-node" ||
    searchEvidence.cellBody[0] !== "brain-pro:anatomy/soma"
  ) {
    throw new Error(`busca semântica divergente: ${JSON.stringify(searchEvidence)}`);
  }

  const selectionSteps = [
    ["01-overview-left-hemisphere", "brain-pro:anatomy/cerebral-hemisphere-left", "overview"],
    ["02-laminar-thalamus", "brain-pro:anatomy/thalamus", "laminar"],
    ["03-neuron-axon", "brain-pro:anatomy/axon", "neuron"],
    ["04-synapse-receptors", "brain-pro:anatomy/receptor-site", "synapse"],
  ];
  const selections = [];
  for (const [name, entryId, expectedView] of selectionSteps) {
    const evidence = await page.evaluate((id) => {
      const selectedId = window.__BRAIN_ENGINE__.setAnatomySelection(id);
      return {
        selectedId,
        diagnostics: window.__BRAIN_ENGINE__.diagnostics(),
        audit: window.__BRAIN_ENGINE__.anatomyCatalogAudit(),
      };
    }, entryId);
    assertHashes(name, baseline, evidence.diagnostics);
    if (
      evidence.selectedId !== entryId ||
      evidence.audit.explorer?.selectedId !== entryId ||
      evidence.audit.explorer?.activeView !== expectedView
    ) {
      throw new Error(`seleção não convergiu em ${name}: ${JSON.stringify(evidence.audit.explorer)}`);
    }
    const filename = `${name}.png`;
    await page.screenshot({ path: path.join(outputDirectory, filename) });
    captures.push(filename);
    selections.push({ name, entryId, expectedView, capture: filename, audit: evidence.audit.explorer });
  }

  await page.evaluate(() => window.__BRAIN_ENGINE__.setView("overview"));
  await page.evaluate(() => {
    const input = document.querySelector("#anatomy-search");
    if (!(input instanceof HTMLInputElement)) throw new Error("busca anatômica ausente");
    input.value = "talamo";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForFunction(
    () => document.querySelectorAll("#anatomy-results [role='treeitem']").length === 1,
  );
  const uiSearch = await page.evaluate(() => ({
    count: document.querySelectorAll("#anatomy-results [role='treeitem']").length,
    label: document.querySelector("#anatomy-results [role='treeitem']")?.textContent,
    activeDescendant: document.querySelector("#anatomy-results [role='treeitem']")
      ?.getAttribute("data-anatomy-id"),
  }));
  await page.evaluate(() => {
    const result = document.querySelector("#anatomy-results [role='treeitem']");
    if (!(result instanceof HTMLButtonElement)) throw new Error("resultado anatômico ausente");
    result.click();
  });
  const uiSelection = await page.evaluate(() => ({
    selectedId: document.querySelector("#anatomy-selected-id")?.textContent,
    selectedTab: document.querySelector("[role='tab'][aria-selected='true']")?.getAttribute("data-view"),
    liveRegion: document.querySelector("#anatomy-selection-status")?.textContent,
  }));
  if (
    uiSearch.count !== 1 ||
    uiSearch.activeDescendant !== "brain-pro:anatomy/thalamus" ||
    uiSelection.selectedId !== "brain-pro:anatomy/thalamus" ||
    uiSelection.selectedTab !== "laminar" ||
    !uiSelection.liveRegion?.includes("Tálamo didático")
  ) {
    throw new Error(`UI do catálogo não convergiu: ${JSON.stringify({ uiSearch, uiSelection })}`);
  }
  assertHashes(
    "busca e árvore DOM",
    baseline,
    await page.evaluate(() => window.__BRAIN_ENGINE__.diagnostics()),
  );

  await page.evaluate(() => window.__BRAIN_ENGINE__.setView("overview"));
  const finalRenderer = await page.evaluate(
    () => window.__BRAIN_ENGINE__.presentationAudit().renderer,
  );
  const sceneGraphCost = {
    baseline: baselineRenderer,
    final: finalRenderer,
    delta: {
      drawCalls: finalRenderer.drawCalls - baselineRenderer.drawCalls,
      triangles: finalRenderer.triangles - baselineRenderer.triangles,
      geometries: finalRenderer.geometries - baselineRenderer.geometries,
      textures: finalRenderer.textures - baselineRenderer.textures,
    },
  };
  if (Object.values(sceneGraphCost.delta).some((value) => value !== 0)) {
    throw new Error(`catálogo alterou custo do scene graph: ${JSON.stringify(sceneGraphCost)}`);
  }

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.evaluate(() => window.__BRAIN_ENGINE__.setAnatomySelection("brain-pro:anatomy/encephalon"));
  const mobileLayout = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    searchVisible: Boolean(document.querySelector("#anatomy-search")?.getClientRects().length),
    resultTreeVisible: Boolean(document.querySelector("#anatomy-results")?.getClientRects().length),
  }));
  if (
    mobileLayout.documentWidth > mobileLayout.viewportWidth ||
    !mobileLayout.searchVisible ||
    !mobileLayout.resultTreeVisible
  ) {
    throw new Error(`layout móvel do catálogo inválido: ${JSON.stringify(mobileLayout)}`);
  }
  const mobileFilename = "05-mobile-catalog.png";
  await page.screenshot({ path: path.join(outputDirectory, mobileFilename) });
  captures.push(mobileFilename);

  const finalDiagnostics = await page.evaluate(() => window.__BRAIN_ENGINE__.diagnostics());
  const finalAudit = await page.evaluate(() => window.__BRAIN_ENGINE__.anatomyCatalogAudit());
  const runtime = await page.evaluate(() => window.__BRAIN_ENGINE__.profile());
  assertHashes("auditoria anatômica completa", baseline, finalDiagnostics);
  assertSceneCoverage(finalAudit);
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
      command: "npm run audit:anatomy",
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
    catalog: finalAudit.catalog,
    views: finalAudit.views,
    searchEvidence,
    uiSearch,
    uiSelection,
    selections,
    mobileLayout,
    sceneGraphCost,
    captures,
    browserErrors,
  };
  await writeFile(
    path.join(outputDirectory, "anatomy-audit.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  console.log(
    `auditoria R10-A concluída: ${report.catalog.entries} entradas, ` +
      `${captures.length} capturas, ${outputDirectory}`,
  );
} finally {
  await browser?.close();
  await server.close();
}
