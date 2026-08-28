import { createServer } from "vite";
import puppeteer from "puppeteer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditWorkerLifecycle } from "./worker_lifecycle_audit.js";

const EXPECTED_R09F_MATERIALS = 25;
const EXPECTED_R10B_VASCULAR_MATERIALS = 12;

const server = await createServer({
  root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  logLevel: "warn",
  server: { host: "127.0.0.1", port: 4179 },
});

let browser;
try {
  await server.listen();
  browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--use-angle=swiftshader"],
  });
  const page = await browser.newPage();
  const faults = [];
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.text().startsWith("Failed to load resource:")
    ) {
      faults.push(message.text());
    }
  });
  page.on("pageerror", (error) => faults.push(error.message));
  await page.goto("http://127.0.0.1:4179/", { waitUntil: "networkidle0" });
  await page.waitForFunction(
    () => {
      const diagnostics = window.__BRAIN_ENGINE__?.diagnostics();
      return diagnostics?.runtime === "rust-wasm" && Boolean(diagnostics.stateHash);
    },
    { timeout: 30_000 },
  );
  const diagnostics = await page.evaluate(() => window.__BRAIN_ENGINE__.diagnostics());
  const abi = await page.evaluate(() => window.__BRAIN_ENGINE__.abiEvidence());
  const materialProfiles = await page.evaluate(
    () => window.__BRAIN_ENGINE__.materialProfileAudit(),
  );
  if (
    diagnostics.runtime !== "rust-wasm" ||
    diagnostics.schemaVersion !== 8 ||
    diagnostics.degraded ||
    !/^[0-9a-f]{16}$/.test(diagnostics.stateHash) ||
    !/^[0-9a-f]{16}$/.test(diagnostics.corticothalamicHash) ||
    !/^[0-9a-f]{16}$/.test(diagnostics.cellPatchHash) ||
    !/^[0-9a-f]{16}$/.test(diagnostics.chemicalHash) ||
    !/^[0-9a-f]{16}$/.test(diagnostics.cellSpikeEventHash)
  ) {
    throw new Error(`diagnóstico inesperado: ${JSON.stringify(diagnostics)}`);
  }
  if (
    abi.schemaVersion !== 8 ||
    abi.buffers.length !== 37 ||
    new Set(abi.buffers.map(({ name }) => name)).size !== 37 ||
    abi.cellSpikeEvents.bytesPerEvent !== 12 ||
    abi.cellSpikeEvents.maximumEvents !== 4_096 ||
    abi.cellSpikeEvents.count > abi.cellSpikeEvents.maximumEvents ||
    abi.cellSpikeEvents.bytes !== abi.cellSpikeEvents.count * 12 ||
    Object.values(abi.hashes).some((hash) => !/^[0-9a-f]{16}$/.test(hash))
  ) {
    throw new Error(`layout ABI inesperado: ${JSON.stringify(abi)}`);
  }
  const expectedViews = [
    "overview",
    "laminar",
    "cell",
    "neuron",
    "electricity",
    "synapse",
  ];
  if (
    JSON.stringify(Object.keys(materialProfiles)) !== JSON.stringify(expectedViews) ||
    Object.values(materialProfiles).some((report) =>
      report.activeProfile !== "realistic-illustrative" ||
      report.totalRenderableObjects <= 0 ||
      report.matterObjects + report.emissionObjects !== report.totalRenderableObjects ||
      report.undeclaredObjects !== 0 ||
      report.missingStateBindings !== 0 ||
      !report.contractReady
    )
  ) {
    throw new Error(
      `prontidão de materialidade inesperada: ${JSON.stringify(materialProfiles)}`,
    );
  }
  const r09f = await page.evaluate(() => {
    const before = window.__BRAIN_ENGINE__.diagnostics();
    window.__BRAIN_ENGINE__.setView("overview");
    const activeProfile = window.__BRAIN_ENGINE__.setMaterialProfile(
      "realistic-illustrative",
    );
    window.__BRAIN_ENGINE__.setClipping({
      enabled: true,
      orientation: "coronal",
      slab: false,
      position: 0.08,
    });
    window.__BRAIN_ENGINE__.setPresentationEffects({
      opacity: 0.72,
      xray: true,
      isolateMatter: true,
    });
    const active = window.__BRAIN_ENGINE__.presentationAudit();
    const after = window.__BRAIN_ENGINE__.diagnostics();
    const highContrastProfile = window.__BRAIN_ENGINE__.setHighContrast(true);
    const fallback = window.__BRAIN_ENGINE__.presentationAudit();
    window.__BRAIN_ENGINE__.setHighContrast(false);
    window.__BRAIN_ENGINE__.setMaterialProfile("schematic");
    window.__BRAIN_ENGINE__.setClipping({ enabled: false, slab: false });
    window.__BRAIN_ENGINE__.setPresentationEffects({
      opacity: 1,
      xray: false,
      isolateMatter: false,
    });
    return {
      before,
      after,
      activeProfile,
      highContrastProfile,
      active,
      fallback,
      probeUnit: document.querySelector("#cut-probe-unit")?.textContent,
    };
  });
  const hashFields = [
    "stateHash",
    "corticothalamicHash",
    "cellPatchHash",
    "chemicalHash",
    "cellSpikeEventHash",
  ];
  if (
    r09f.activeProfile !== "realistic-illustrative" ||
    r09f.highContrastProfile !== "schematic" ||
    r09f.active.material.physicalMaterialObjects !==
      EXPECTED_R09F_MATERIALS + EXPECTED_R10B_VASCULAR_MATERIALS ||
    r09f.active.material.transmissionObjects !== 0 ||
    r09f.active.material.estimatedTransmissionPasses !== 0 ||
    r09f.active.material.bakedSurfaceShaderObjects !== 4 ||
    r09f.active.material.semanticGeometryChanges !== 0 ||
    r09f.active.clipping.planeCount !== 1 ||
    r09f.active.clipping.capSources !== 4 ||
    r09f.active.clipping.estimatedAdditionalDrawCalls >
      r09f.active.clipping.maximumAdditionalDrawCalls ||
    !r09f.active.probe.available ||
    r09f.active.probe.unit !== "normalized field activity" ||
    r09f.fallback.material.fallbackReason !== "high-contrast-requires-schematic" ||
    hashFields.some((field) => r09f.before[field] !== r09f.after[field])
  ) {
    throw new Error(`gate R09-F inesperado: ${JSON.stringify(r09f)}`);
  }
  if (faults.length > 0) {
    throw new Error(`erros no navegador: ${faults.join(" | ")}`);
  }
  const replay = await page.evaluate(async () => {
    await window.__BRAIN_ENGINE__.setCaptureMode(true);
    const accepted = await window.__BRAIN_ENGINE__.schedule([
      { tick: 121, sequence: 10, kind: "stimulus", intensity: 0.8, confidence: 0.7 },
      { tick: 121, sequence: 11, kind: "plasticity", learningRate: 0.002 },
    ]);
    await window.__BRAIN_ENGINE__.capture(1 / 60, 0);
    const after = window.__BRAIN_ENGINE__.diagnostics();
    await window.__BRAIN_ENGINE__.setCaptureMode(false);
    return { accepted, after };
  });
  if (
    replay.accepted !== 2 ||
    replay.after.stateHash === diagnostics.stateHash ||
    replay.after.chemicalHash === diagnostics.chemicalHash
  ) {
    throw new Error(`fila de replay não avançou no navegador: ${JSON.stringify(replay)}`);
  }
  await page.click("#tab-laminar");
  await page.waitForFunction(
    () =>
      document.querySelector("#tab-laminar")?.getAttribute("aria-selected") ===
        "true" &&
      !document.querySelector("#laminar-panel")?.hidden,
  );
  const laminar = await page.evaluate(() => ({
    relay: Number(document.querySelector("#relay-activity")?.textContent),
    trn: Number(document.querySelector("#trn-activity")?.textContent),
    rebound: Number(document.querySelector("#rebound-activity")?.textContent),
    overviewHidden: document.querySelector("#overview-panel")?.hidden,
    activeTab: document.activeElement?.id,
  }));
  if (
    !laminar.overviewHidden ||
    ![laminar.relay, laminar.trn, laminar.rebound].every(Number.isFinite)
  ) {
    throw new Error(`aba laminar inválida: ${JSON.stringify(laminar)}`);
  }
  await page.click("#tab-cell");
  await page.waitForFunction(
    () => document.querySelector("#tab-cell")?.getAttribute("aria-selected") === "true",
  );
  const cell = await page.evaluate(() => ({
    membrane: document.querySelector("#cell-membrane")?.textContent,
    rate: document.querySelector("#cell-rate")?.textContent,
    hidden: document.querySelector("#cell-panel")?.hidden,
  }));
  if (cell.hidden || !cell.membrane?.endsWith("mV") || !cell.rate?.endsWith("Hz")) {
    throw new Error(`aba celular inválida: ${JSON.stringify(cell)}`);
  }
  await page.click("#cell-select-3");
  await page.waitForFunction(
    () => document.querySelector("#tab-neuron")?.getAttribute("aria-selected") === "true",
  );
  const neuron = await page.evaluate(() => ({
    soma: document.querySelector("#neuron-soma")?.textContent,
    proximal: document.querySelector("#neuron-proximal")?.textContent,
    distal: document.querySelector("#neuron-distal")?.textContent,
    adaptation: document.querySelector("#neuron-adaptation")?.textContent,
    hidden: document.querySelector("#neuron-panel")?.hidden,
    audit: window.__BRAIN_ENGINE__.neuronAudit(),
  }));
  if (
    neuron.hidden ||
    !neuron.soma?.endsWith("mV") ||
    !neuron.proximal?.endsWith("mV") ||
    !neuron.distal?.endsWith("mV") ||
    !neuron.adaptation?.endsWith("pA") ||
    neuron.audit.selectedCellId !== 3 ||
    !/^[0-9a-f]{16}$/.test(neuron.audit.geometryHash)
  ) {
    throw new Error(`aba Neurônio inválida: ${JSON.stringify(neuron)}`);
  }
  await page.click("#tab-electricity");
  const electricity = await page.evaluate(() => ({
    ampa: document.querySelector("#ampa-current")?.textContent,
    gabab: document.querySelector("#gabab-current")?.textContent,
    hidden: document.querySelector("#electricity-panel")?.hidden,
  }));
  if (
    electricity.hidden ||
    !electricity.ampa?.endsWith("pA") ||
    !electricity.gabab?.endsWith("pA")
  ) {
    throw new Error(`aba elétrica inválida: ${JSON.stringify(electricity)}`);
  }
  await page.click("#tab-synapse");
  await page.waitForFunction(
    () => document.querySelector("#tab-synapse")?.getAttribute("aria-selected") === "true",
  );
  const synapse = await page.evaluate(() => ({
    glutamate: document.querySelector("#synapse-glutamate")?.textContent,
    gaba: document.querySelector("#synapse-gaba")?.textContent,
    occupancy: document.querySelector("#synapse-ampa-occupancy")?.textContent,
    hidden: document.querySelector("#synapse-panel")?.hidden,
  }));
  if (
    synapse.hidden ||
    !synapse.glutamate?.endsWith("mol/m³") ||
    !synapse.gaba?.endsWith("mol/m³") ||
    !synapse.occupancy?.endsWith("%")
  ) {
    throw new Error(`aba sináptica inválida: ${JSON.stringify(synapse)}`);
  }
  const lifecycle = await auditWorkerLifecycle(page);
  console.log(
    `Worker Wasm verificado no navegador: schema ${diagnostics.schemaVersion}, ` +
      `${abi.buffers.length} buffers, cinco hashes, reset/dispose/reinit e seis abas operantes ` +
      `(replay ${lifecycle.hashes.chemical}; materialidade ${Object.keys(materialProfiles).length}/6)`,
      `R09-F ${r09f.active.material.physicalMaterialObjects} materiais/${r09f.active.clipping.estimatedAdditionalDrawCalls} draws de corte`,
  );
} finally {
  await browser?.close();
  await server.close();
}
