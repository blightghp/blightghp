import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import puppeteer from "puppeteer";
import { PNG } from "pngjs";
import { contrastRatio, parseCssColor } from "./audit_utils.js";
import { auditWorkerLifecycle } from "./worker_lifecycle_audit.js";
import packageManifest from "../package.json" with { type: "json" };

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = process.env.BRAIN_AUDIT_DIR
  ? path.resolve(process.env.BRAIN_AUDIT_DIR)
  : path.join(os.tmpdir(), "brain-pro-visual-audit");
await mkdir(outputDirectory, { recursive: true });
const requestedGraphicsBackend = process.env.BRAIN_GRAPHICS_BACKEND === "hardware"
  ? "hardware"
  : "swiftshader";

async function saturatedPixelRatio(filename) {
  const png = PNG.sync.read(await readFile(path.join(outputDirectory, filename)));
  let saturated = 0;
  for (let index = 0; index < png.data.length; index += 4) {
    if (
      png.data[index] >= 250 &&
      png.data[index + 1] >= 250 &&
      png.data[index + 2] >= 250
    ) {
      saturated += 1;
    }
  }
  return saturated / (png.width * png.height);
}

const server = await createServer({
  root,
  logLevel: "warn",
  server: { host: "127.0.0.1", port: 4181 },
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
          "--use-angle=d3d11",
          "--disable-software-rasterizer",
        ]
      : ["--no-sandbox", "--disable-setuid-sandbox", "--use-angle=swiftshader"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 960, deviceScaleFactor: 1 });
  await page.goto("http://127.0.0.1:4181/?snapshotCadence=2&rotation=0", {
    waitUntil: "networkidle0",
  });
  await page.waitForFunction(
    () => window.__BRAIN_ENGINE__?.diagnostics().runtime === "rust-wasm",
    { timeout: 30_000 },
  );
  await new Promise((resolve) => setTimeout(resolve, 1_500));

  await page.screenshot({ path: path.join(outputDirectory, "overview-desktop.png") });
  await page.focus("#tab-overview");
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(
    () => document.activeElement?.id === "tab-laminar" &&
      document.querySelector("#tab-laminar")?.getAttribute("aria-selected") === "true",
  );
  await page.screenshot({ path: path.join(outputDirectory, "laminar-desktop.png") });
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(
    () => document.activeElement?.id === "tab-cell" &&
      document.querySelector("#tab-cell")?.getAttribute("aria-selected") === "true",
  );
  await page.screenshot({ path: path.join(outputDirectory, "cell-desktop.png") });
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(
    () => document.activeElement?.id === "tab-electricity" &&
      document.querySelector("#tab-electricity")?.getAttribute("aria-selected") === "true",
  );
  await page.screenshot({ path: path.join(outputDirectory, "electricity-desktop.png") });
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(
    () => document.activeElement?.id === "tab-synapse" &&
      document.querySelector("#tab-synapse")?.getAttribute("aria-selected") === "true",
  );
  await page.screenshot({ path: path.join(outputDirectory, "synapse-desktop.png") });
  await page.keyboard.press("Home");
  const keyboard = await page.evaluate(() => ({
    focused: document.activeElement?.id,
    selected: document.querySelector("#tab-overview")?.getAttribute("aria-selected"),
    laminarHidden: document.querySelector("#laminar-panel")?.hidden,
  }));
  if (keyboard.focused !== "tab-overview" || keyboard.selected !== "true" || !keyboard.laminarHidden) {
    throw new Error(`navegação por teclado inválida: ${JSON.stringify(keyboard)}`);
  }

  const visualGate = await page.evaluate(() => window.__BRAIN_ENGINE__.visualAudit());
  const renderedStateGate = await page.evaluate(() => window.__BRAIN_ENGINE__.renderedStateAudit());
  const electricalBoardGate = await page.evaluate(() => window.__BRAIN_ENGINE__.electricalBoardAudit());
  if (
    visualGate.provenance.total <= 0 ||
    visualGate.provenance.undeclared !== 0 ||
    visualGate.bindings.totalStateObjects !== visualGate.bindings.declaredBindings ||
    visualGate.bindings.missingBindings.length !== 0 ||
    visualGate.bindings.missingRedundancy.length !== 0 ||
    visualGate.invertibility.samples < 20 ||
    visualGate.invertibility.maximumError > visualGate.invertibility.tolerance ||
    Object.values(visualGate.redundancy).some((encoding) => !encoding)
  ) {
    throw new Error(`gates de apresentação incompletos: ${JSON.stringify(visualGate)}`);
  }
  if (renderedStateGate.maximumError > renderedStateGate.tolerance) {
    throw new Error(`pixel→estado excedeu a tolerância: ${JSON.stringify(renderedStateGate)}`);
  }
  if (
    electricalBoardGate.detail !== "cellular" ||
    electricalBoardGate.cost.totalDrawCalls !== 10 ||
    electricalBoardGate.cost.stateValuesPerSnapshot !== 96 ||
    electricalBoardGate.topology.synapseCount <= 0 ||
    electricalBoardGate.topology.meanDelaySeconds <= 0 ||
    electricalBoardGate.topology.meanAbsoluteGain <= 0
  ) {
    throw new Error(`orçamento/origem da Prancha Elétrica inválidos: ${JSON.stringify(electricalBoardGate)}`);
  }

  const colorCaptures = [
    "overview-desktop.png",
    "laminar-desktop.png",
    "cell-desktop.png",
    "electricity-desktop.png",
    "synapse-desktop.png",
  ];
  const saturation = Object.fromEntries(
    await Promise.all(
      colorCaptures.map(async (filename) => [filename, await saturatedPixelRatio(filename)]),
    ),
  );
  const saturatedCaptures = Object.entries(saturation).filter(([, ratio]) => ratio > 0.025);
  if (saturatedCaptures.length > 0) {
    throw new Error(`teto de bloom excedido: ${JSON.stringify(saturatedCaptures)}`);
  }

  await page.evaluate(() => window.__BRAIN_ENGINE__.setColorMode("monochrome"));
  const monochrome = {};
  for (const view of ["overview", "laminar", "cell", "electricity", "synapse"]) {
    await page.evaluate((nextView) => window.__BRAIN_ENGINE__.setView(nextView), view);
    await new Promise((resolve) => setTimeout(resolve, 80));
    const filename = `${view}-monochrome.png`;
    await page.screenshot({ path: path.join(outputDirectory, filename) });
    monochrome[view] = filename;
  }
  await page.evaluate(() => window.__BRAIN_ENGINE__.setView("overview"));
  const monochromeGate = await page.evaluate(() => ({
    report: window.__BRAIN_ENGINE__.visualAudit(),
    canvasFilter: getComputedStyle(document.querySelector("#canvas-container canvas")).filter,
  }));
  if (
    monochromeGate.report.colorMode !== "monochrome" ||
    !monochromeGate.canvasFilter.includes("grayscale")
  ) {
    throw new Error(`modo sem cor inoperante: ${JSON.stringify(monochromeGate)}`);
  }

  await page.evaluate(() => window.__BRAIN_ENGINE__.setView("synapse"));
  const views = await page.evaluate(() => ({
    tabCount: document.querySelectorAll(".view-tabs button[role='tab']").length,
    synapse: {
      selected: document.querySelector("#tab-synapse")?.getAttribute("aria-selected") === "true",
      glutamate: document.querySelector("#synapse-glutamate")?.textContent,
      gaba: document.querySelector("#synapse-gaba")?.textContent,
      occupancy: document.querySelector("#synapse-ampa-occupancy")?.textContent,
    },
  }));
  if (
    views.tabCount !== 5 ||
    !views.synapse.selected ||
    !views.synapse.glutamate?.endsWith("mol/m³") ||
    !views.synapse.gaba?.endsWith("mol/m³") ||
    !views.synapse.occupancy?.endsWith("%")
  ) {
    throw new Error(`evidência da aba Sinapse incompleta: ${JSON.stringify(views)}`);
  }
  await page.evaluate(() => window.__BRAIN_ENGINE__.setView("electricity"));
  await page.evaluate(() => window.__BRAIN_ENGINE__.setCaptureMode(true));
  const hashesBeforeElectricalControls = await page.evaluate(
    () => window.__BRAIN_ENGINE__.diagnostics(),
  );
  await page.evaluate(() => window.__BRAIN_ENGINE__.capture(0, 1.23));
  await page.select("#electrical-detail", "events");
  await page.select("#electrical-detail", "summary");
  await page.select("#electrical-detail", "cellular");
  const hashesAfterElectricalControls = await page.evaluate(
    () => window.__BRAIN_ENGINE__.diagnostics(),
  );
  const hashFields = [
    "stateHash",
    "corticothalamicHash",
    "cellPatchHash",
    "chemicalHash",
    "cellSpikeEventHash",
  ];
  if (hashFields.some((field) => hashesBeforeElectricalControls[field] !== hashesAfterElectricalControls[field])) {
    throw new Error(
      `controles de apresentação alteraram hashes: ${JSON.stringify({ hashesBeforeElectricalControls, hashesAfterElectricalControls })}`,
    );
  }
  const electricalView = await page.evaluate(() => ({
    selected: document.querySelector("#tab-electricity")?.getAttribute("aria-selected") === "true",
    voltage: document.querySelector("#board-voltage")?.textContent,
    current: document.querySelector("#board-net-current")?.textContent,
    conductance: document.querySelector("#board-conductance")?.textContent,
    delay: document.querySelector("#board-delay")?.textContent,
    tableRows: document.querySelectorAll(".electrical-table tbody tr").length,
  }));
  if (
    !electricalView.selected ||
    !electricalView.voltage?.endsWith("mV") ||
    !electricalView.current?.endsWith("pA") ||
    !electricalView.conductance?.endsWith("nS") ||
    !electricalView.delay?.endsWith("ms") ||
    electricalView.tableRows < 8
  ) {
    throw new Error(`equivalente textual da Prancha Elétrica incompleto: ${JSON.stringify(electricalView)}`);
  }
  await page.evaluate(() => window.__BRAIN_ENGINE__.setCaptureMode(false));
  await page.evaluate(() => window.__BRAIN_ENGINE__.setView("overview"));

  const colors = await page.evaluate(() => {
    const selectors = [
      ".brand",
      ".lede",
      ".control-group label",
      ".view-tabs button[aria-selected='true']",
      ".bayesian-stats strong",
    ];
    return selectors.map((selector) => ({
      selector,
      color: getComputedStyle(document.querySelector(selector)).color,
    }));
  });
  // The lightest glass-panel stop is a conservative background for text.
  const background = parseCssColor("rgb(9, 20, 37)");
  const contrast = colors.map(({ selector, color }) => ({
    selector,
    ratio: contrastRatio(parseCssColor(color), background),
  }));
  const failures = contrast.filter(({ ratio }) => ratio < 4.5);
  if (failures.length > 0) {
    throw new Error(`contraste abaixo de 4.5:1: ${JSON.stringify(failures)}`);
  }

  const runtimeEvidence = await page.evaluate(() => ({
    profile: window.__BRAIN_ENGINE__.profile(),
    abi: window.__BRAIN_ENGINE__.abiEvidence(),
  }));
  const { profile, abi } = runtimeEvidence;
  const lifecycle = await auditWorkerLifecycle(page);
  if (
    profile.snapshotCadenceTicks !== 2 ||
    profile.sampleCount < 5 ||
    profile.workerLatencyMs.p95 <= 0 ||
    profile.frameCpuMs.p95 <= 0 ||
    profile.gpu.drawCalls <= 0 ||
    profile.memory.snapshotBytes <= 0 ||
    profile.memory.geometries <= 0 ||
    profile.environment.browser.userAgent === "unknown" ||
    profile.environment.hardware.logicalCores <= 0 ||
    !profile.environment.hardware.webglRenderer ||
    profile.environment.simulation.runtime !== "rust-wasm" ||
    profile.environment.simulation.preset !== "interactive-default" ||
    profile.environment.simulation.units <= 0 ||
    profile.environment.simulation.synapses <= 0 ||
    profile.environment.simulation.fieldVertices <= 0 ||
    profile.environment.simulation.stepSeconds <= 0
  ) {
    throw new Error(`perfil incompleto: ${JSON.stringify(profile)}`);
  }
  const softwareRenderer = /swiftshader|llvmpipe|software/i.test(
    profile.environment.hardware.webglRenderer,
  );
  if (requestedGraphicsBackend === "hardware" && softwareRenderer) {
    throw new Error(
      `GPU física solicitada, mas renderer de software foi selecionado: ` +
      profile.environment.hardware.webglRenderer,
    );
  }

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.screenshot({ path: path.join(outputDirectory, "overview-mobile.png") });
  const layout = await page.evaluate(() => ({
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    panelRight: document.querySelector("#overview-panel")?.getBoundingClientRect().right,
    panelTop: document.querySelector("#overview-panel")?.getBoundingClientRect().top,
    tabsBottom: document.querySelector(".view-tabs")?.getBoundingClientRect().bottom,
    viewportWidth: document.documentElement.clientWidth,
  }));
  if (
    layout.horizontalOverflow ||
    layout.panelRight > layout.viewportWidth ||
    layout.panelTop < layout.tabsBottom + 8
  ) {
    throw new Error(`layout móvel fora da viewport: ${JSON.stringify(layout)}`);
  }

  const report = {
    schemaVersion: 2,
    capturedAt: new Date().toISOString(),
    source: {
      commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
      productVersion: packageManifest.version,
      command: "npm run audit:runtime",
      requestedGraphicsBackend,
    },
    viewports: ["1440x960", "390x844"],
    captures: [
      "overview-desktop.png",
      "laminar-desktop.png",
      "cell-desktop.png",
      "electricity-desktop.png",
      "synapse-desktop.png",
      "overview-mobile.png",
      ...Object.values(monochrome),
    ],
    keyboard,
    views,
    contrast,
    saturation,
    visualGate,
    electricalBoardGate,
    electricalView,
    electricalHashInvariance: {
      fields: hashFields,
      before: hashesBeforeElectricalControls,
      after: hashesAfterElectricalControls,
    },
    renderedStateGate,
    monochromeGate,
    abi: {
      ...abi,
      bufferCount: abi.buffers.length,
      snapshotBytes: abi.buffers.reduce((total, buffer) => total + buffer.byteLength, 0),
      lifecycle,
    },
    auditHost: {
      cpu: os.cpus()[0]?.model ?? "unknown",
      logicalCores: os.cpus().length,
      memoryBytes: os.totalmem(),
      platform: os.platform(),
      release: os.release(),
      architecture: os.arch(),
    },
    profile,
  };
  await writeFile(
    path.join(outputDirectory, "runtime-audit.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  console.log(
    `auditoria visual concluída: ${profile.sampleCount} amostras, ` +
      `latência p95 ${profile.workerLatencyMs.p95.toFixed(2)} ms, ${outputDirectory}`,
  );
} finally {
  await browser?.close();
  await server.close();
}
