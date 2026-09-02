import { createServer } from "vite";
import puppeteer from "puppeteer";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HASH_FIELDS = [
  "stateHash",
  "corticothalamicHash",
  "cellPatchHash",
  "chemicalHash",
  "cellSpikeEventHash",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertSameScientificHashes(before, after, stage) {
  const changed = HASH_FIELDS.filter((field) => before[field] !== after[field]);
  if (changed.length > 0) {
    throw new Error(`${stage} alterou hashes científicos: ${changed.join(", ")}`);
  }
}

async function accessibilityNodes(page) {
  const client = await page.createCDPSession();
  try {
    const { nodes } = await client.send("Accessibility.getFullAXTree");
    return nodes
      .filter((node) => !node.ignored)
      .map((node) => ({ role: node.role?.value, name: node.name?.value }));
  } finally {
    await client.detach();
  }
}

function hasAccessibleNode(nodes, role, name) {
  return nodes.some((node) => node.role === role &&
    (typeof name === "string" ? node.name === name : name.test(node.name ?? "")));
}

const server = await createServer({
  root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  logLevel: "warn",
  server: { host: "127.0.0.1", port: 4185 },
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
    if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) {
      faults.push(message.text());
    }
  });
  page.on("pageerror", (error) => faults.push(error.message));
  await page.setViewport({
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await page.goto("http://127.0.0.1:4185/", { waitUntil: "networkidle0" });
  await page.waitForFunction(
    () => {
      const diagnostics = window.__BRAIN_ENGINE__?.diagnostics();
      return diagnostics?.runtime === "rust-wasm" && Boolean(diagnostics.stateHash);
    },
    { timeout: 30_000 },
  );

  await page.select("#usage-mode", "explorer");
  const mobileGeometry = await page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement)) throw new Error(`controle ausente: ${selector}`);
      const bounds = element.getBoundingClientRect();
      return { width: bounds.width, height: bounds.height, top: bounds.top, bottom: bounds.bottom };
    };
    const targetSelectors = [
      "#usage-mode",
      "#open-command-palette",
      "#mobile-sheet-view",
      "#mobile-sheet-presentation",
      "[data-scale-step=\"encephalon\"]",
      "[role=\"tab\"][data-view=\"overview\"]",
    ];
    const targets = Object.fromEntries(targetSelectors.map((selector) => [selector, rect(selector)]));
    const sheet = rect("#mobile-sheet-switch");
    const trail = rect("#scale-trail");
    return {
      targets,
      sheet,
      trail,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      viewPanelVisible: getComputedStyle(document.querySelector("#overview-panel")).display !== "none",
      presentationVisible: getComputedStyle(document.querySelector("#presentation-panel")).display !== "none",
    };
  });
  assert(mobileGeometry.documentWidth <= mobileGeometry.viewportWidth, `overflow móvel: ${JSON.stringify(mobileGeometry)}`);
  assert(mobileGeometry.viewPanelVisible && !mobileGeometry.presentationVisible, `sheet inicial inválido: ${JSON.stringify(mobileGeometry)}`);
  assert(
    Object.values(mobileGeometry.targets).every((target) => target.width >= 44 && target.height >= 44),
    `alvo de toque abaixo de 44 CSS px: ${JSON.stringify(mobileGeometry.targets)}`,
  );
  assert(
    mobileGeometry.trail.bottom < mobileGeometry.sheet.top && mobileGeometry.sheet.bottom <= 844,
    `trilha e alternância móvel se sobrepõem: ${JSON.stringify(mobileGeometry)}`,
  );

  await page.tap("#mobile-sheet-presentation");
  await page.waitForFunction(
    () => document.body.dataset.mobileSheet === "presentation" &&
      getComputedStyle(document.querySelector("#presentation-panel")).display !== "none" &&
      getComputedStyle(document.querySelector("#overview-panel")).display === "none",
    { timeout: 5_000 },
  );
  const switchSemantics = await page.evaluate(() => ({
    controls: document.querySelector("#mobile-sheet-switch")?.getAttribute("aria-label"),
    viewPressed: document.querySelector("#mobile-sheet-view")?.getAttribute("aria-pressed"),
    presentationPressed: document.querySelector("#mobile-sheet-presentation")?.getAttribute("aria-pressed"),
    viewControls: document.querySelector("#mobile-sheet-view")?.getAttribute("aria-controls"),
    statusRole: document.querySelector("#mobile-sheet-status")?.getAttribute("role"),
    statusLive: document.querySelector("#mobile-sheet-status")?.getAttribute("aria-live"),
    status: document.querySelector("#mobile-sheet-status")?.textContent,
    panelLabel: document.querySelector("#presentation-panel")?.getAttribute("aria-labelledby"),
  }));
  assert(
    switchSemantics.controls === "Painéis móveis" &&
      switchSemantics.viewPressed === "false" &&
      switchSemantics.presentationPressed === "true" &&
      switchSemantics.viewControls === "overview-panel" &&
      switchSemantics.statusRole === "status" &&
      switchSemantics.statusLive === "polite" &&
      switchSemantics.status === "Painel móvel: contexto e navegação ativos." &&
      switchSemantics.panelLabel === "presentation-title",
    `semântica do sheet móvel inválida: ${JSON.stringify(switchSemantics)}`,
  );
  const sheetNodes = await accessibilityNodes(page);
  assert(
      hasAccessibleNode(sheetNodes, "button", "LEITURA DA VISTA") &&
      hasAccessibleNode(sheetNodes, "button", "CONTEXTO & NAVEGAÇÃO") &&
      hasAccessibleNode(sheetNodes, "navigation", "Painéis móveis") &&
      hasAccessibleNode(sheetNodes, "StaticText", "Painel móvel: contexto e navegação ativos."),
    "árvore de acessibilidade do sheet não expõe os controles ou o anúncio esperado",
  );

  await page.tap("#presentation-navigation > summary");
  await page.waitForFunction(
    () => document.querySelector("#presentation-navigation")?.open === true,
    { timeout: 5_000 },
  );
  const navigationSummary = await page.evaluate(() => {
    const summary = document.querySelector("#presentation-navigation > summary");
    if (!(summary instanceof HTMLElement)) return undefined;
    const bounds = summary.getBoundingClientRect();
    return { height: bounds.height, text: summary.textContent?.trim() };
  });
  assert(
    navigationSummary?.height >= 44 && navigationSummary.text?.includes("NAVEGAÇÃO DE APRESENTAÇÃO"),
    `sumário de navegação sem alvo de toque: ${JSON.stringify(navigationSummary)}`,
  );

  await page.tap('[data-saved-viewpoint="lateral"]');
  await page.waitForFunction(
    () => window.__BRAIN_ENGINE__.presentationNavigationAudit().selectedViewpoint === "lateral" &&
      !window.__BRAIN_ENGINE__.presentationNavigationAudit().transition,
    { timeout: 5_000 },
  );
  const savedViewpointTouch = await page.evaluate(() => ({
    lateralPressed: document.querySelector('[data-saved-viewpoint="lateral"]')?.getAttribute("aria-pressed"),
    cube: document.querySelector("#orientation-cube")?.getAttribute("data-orientation"),
  }));
  assert(
    savedViewpointTouch.lateralPressed === "true" && savedViewpointTouch.cube === "lateral",
    `toque no ponto de vista salvo inválido: ${JSON.stringify(savedViewpointTouch)}`,
  );
  await page.tap('[data-scale-step="synapse"]');
  await page.waitForFunction(
    () => document.querySelector("#tab-synapse")?.getAttribute("aria-selected") === "true" &&
      window.__BRAIN_ENGINE__.presentationNavigationAudit().activeScale === "synapse" &&
      !window.__BRAIN_ENGINE__.presentationNavigationAudit().transition,
    { timeout: 5_000 },
  );
  const reducedMotionTouch = await page.evaluate(() => ({
    activeScale: document.querySelector('[data-scale-step="synapse"]')?.getAttribute("aria-current"),
    skipHidden: document.querySelector("#skip-scale-transition")?.hidden,
    status: document.querySelector("#presentation-navigation-status")?.textContent,
  }));
  assert(
    reducedMotionTouch.activeScale === "step" && reducedMotionTouch.skipHidden === true &&
      reducedMotionTouch.status?.includes("Sinapse"),
    `toque com movimento reduzido inválido: ${JSON.stringify(reducedMotionTouch)}`,
  );

  await page.focus('[data-scale-step="synapse"]');
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () => document.querySelector("#tab-overview")?.getAttribute("aria-selected") === "true" &&
      document.activeElement?.getAttribute("data-scale-step") === "synapse" &&
      !window.__BRAIN_ENGINE__.presentationNavigationAudit().transition,
    { timeout: 5_000 },
  );

  await page.tap("#anatomy-search");
  await page.keyboard.type("hemisferio esquerdo");
  const anatomyTarget = "[data-anatomy-id=\"brain-pro:anatomy/cerebral-hemisphere-left\"]";
  await page.waitForSelector(anatomyTarget, { visible: true, timeout: 5_000 });
  await page.tap(anatomyTarget);
  await page.waitForFunction(
    () => document.querySelector("#anatomy-selected-id")?.textContent ===
      "brain-pro:anatomy/cerebral-hemisphere-left",
    { timeout: 5_000 },
  );
  await page.waitForFunction(
    () => {
      const button = document.querySelector("#frame-selection");
      return button instanceof HTMLButtonElement && !button.disabled;
    },
    { timeout: 5_000 },
  );
  await page.tap("#frame-selection");
  await page.waitForFunction(
    () => window.__BRAIN_ENGINE__.presentationNavigationAudit().framingSelection === true &&
      !window.__BRAIN_ENGINE__.presentationNavigationAudit().transition,
    { timeout: 5_000 },
  );
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () => !window.__BRAIN_ENGINE__.presentationNavigationAudit().framingSelection &&
      document.activeElement?.id === "frame-selection",
    { timeout: 5_000 },
  );
  const selectionSemantics = await page.evaluate(() => ({
    selectedId: document.querySelector("#anatomy-selected-id")?.textContent,
    badge: {
      name: document.querySelector("#selection-provenance-name")?.textContent,
      visualClass: document.querySelector("#selection-provenance-class")?.textContent,
      evidence: document.querySelector("#selection-provenance-evidence")?.textContent,
    },
    selectionStatus: document.querySelector("#anatomy-selection-status")?.getAttribute("role"),
    navigationStatus: document.querySelector("#presentation-navigation-status")?.getAttribute("role"),
  }));
  assert(
    selectionSemantics.selectedId === "brain-pro:anatomy/cerebral-hemisphere-left" &&
      selectionSemantics.badge.name === "Hemisfério cerebral esquerdo" &&
      selectionSemantics.badge.visualClass === "STATE" &&
      selectionSemantics.badge.evidence === "PROCEDURAL" &&
      selectionSemantics.selectionStatus === "status" && selectionSemantics.navigationStatus === "status",
    `equivalente textual da seleção inválido: ${JSON.stringify(selectionSemantics)}`,
  );

  await page.tap("#mobile-sheet-view");
  await page.waitForFunction(
    () => document.body.dataset.mobileSheet === "view" &&
      getComputedStyle(document.querySelector("#overview-panel")).display !== "none" &&
      getComputedStyle(document.querySelector("#presentation-panel")).display === "none",
    { timeout: 5_000 },
  );
  await page.tap("#open-command-palette");
  await page.waitForFunction(
    () => document.querySelector("#command-palette")?.open === true &&
      document.activeElement?.id === "command-palette-input",
    { timeout: 5_000 },
  );
  const paletteSemantics = await page.evaluate(() => ({
    dialogRole: document.querySelector("#command-palette")?.getAttribute("role"),
    modal: document.querySelector("#command-palette")?.getAttribute("aria-modal"),
    inputRole: document.querySelector("#command-palette-input")?.getAttribute("role"),
    inputControls: document.querySelector("#command-palette-input")?.getAttribute("aria-controls"),
    inputExpanded: document.querySelector("#command-palette-input")?.getAttribute("aria-expanded"),
  }));
  const paletteNodes = await accessibilityNodes(page);
  assert(
    paletteSemantics.dialogRole === "dialog" && paletteSemantics.modal === "true" &&
      paletteSemantics.inputRole === "combobox" &&
      paletteSemantics.inputControls === "command-palette-results" &&
      paletteSemantics.inputExpanded === "true" &&
      hasAccessibleNode(paletteNodes, "dialog", "Comandos") &&
      hasAccessibleNode(paletteNodes, "combobox", "Filtrar comandos"),
    `semântica da paleta móvel inválida: ${JSON.stringify({ paletteSemantics, paletteNodes })}`,
  );
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () => !document.querySelector("#command-palette")?.open &&
      document.activeElement?.id === "open-command-palette",
    { timeout: 5_000 },
  );

  const finalGeometry = await page.evaluate(() => {
    const panel = document.querySelector("#overview-panel");
    const sheet = document.querySelector("#mobile-sheet-switch");
    if (!(panel instanceof HTMLElement) || !(sheet instanceof HTMLElement)) return undefined;
    const panelBounds = panel.getBoundingClientRect();
    const sheetBounds = sheet.getBoundingClientRect();
    return {
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      panelWithinViewport: panelBounds.left >= 0 && panelBounds.right <= window.innerWidth &&
        panelBounds.top >= sheetBounds.bottom && panelBounds.bottom <= window.innerHeight,
      viewPressed: document.querySelector("#mobile-sheet-view")?.getAttribute("aria-pressed"),
      presentationPressed: document.querySelector("#mobile-sheet-presentation")?.getAttribute("aria-pressed"),
      sheetStatus: document.querySelector("#mobile-sheet-status")?.textContent,
    };
  });
  assert(
    finalGeometry?.documentWidth <= finalGeometry?.viewportWidth && finalGeometry?.panelWithinViewport &&
      finalGeometry.viewPressed === "true" && finalGeometry.presentationPressed === "false" &&
      finalGeometry.sheetStatus === "Painel móvel: leitura da vista ativa.",
    `fluxo móvel final inválido: ${JSON.stringify(finalGeometry)}`,
  );
  const frozenPresentation = await page.evaluate(async () => {
    const click = (selector) => {
      const control = document.querySelector(selector);
      if (!(control instanceof HTMLButtonElement)) throw new Error(`controle ausente: ${selector}`);
      control.click();
    };
    await window.__BRAIN_ENGINE__.setCaptureMode(true);
    try {
      const before = window.__BRAIN_ENGINE__.diagnostics();
      click("#mobile-sheet-presentation");
      click("#mobile-sheet-view");
      window.__BRAIN_ENGINE__.setView("overview");
      window.__BRAIN_ENGINE__.setAnatomySelection("brain-pro:anatomy/cerebral-hemisphere-left");
      click("#frame-selection");
      click("#restore-selection-camera");
      click('[data-saved-viewpoint="lateral"]');
      click('[data-scale-step="synapse"]');
      return {
        before,
        after: window.__BRAIN_ENGINE__.diagnostics(),
        navigation: window.__BRAIN_ENGINE__.presentationNavigationAudit(),
      };
    } finally {
      await window.__BRAIN_ENGINE__.setCaptureMode(false);
    }
  });
  assert(
    frozenPresentation.navigation.activeScale === "synapse" &&
      !frozenPresentation.navigation.transition,
    `fluxo congelado de apresentação inválido: ${JSON.stringify(frozenPresentation.navigation)}`,
  );
  assertSameScientificHashes(
    frozenPresentation.before,
    frozenPresentation.after,
    "fluxo R10-F por toque e leitor de tela com motor congelado",
  );
  if (faults.length > 0) throw new Error(`falhas durante fluxo R10-F: ${faults.join(" | ")}`);

  console.log(
    "R10-F acessível verificado: bottom sheet alternável, alvos de toque de 44 px, " +
      "semântica/leitor de tela, paleta, seleção, câmera, escala e movimento reduzido em 390×844; " +
      "cinco hashes invariantes.",
  );
} finally {
  await browser?.close();
  await server.close();
}
