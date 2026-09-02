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

function assertSameScientificHashes(before, after, stage) {
  const changed = HASH_FIELDS.filter((field) => before[field] !== after[field]);
  if (changed.length > 0) {
    throw new Error(`${stage} alterou hashes científicos: ${changed.join(", ")}`);
  }
}

const server = await createServer({
  root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  logLevel: "warn",
  server: { host: "127.0.0.1", port: 4184 },
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
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await page.goto("http://127.0.0.1:4184/", { waitUntil: "networkidle0" });
  await page.waitForFunction(
    () => {
      const diagnostics = window.__BRAIN_ENGINE__?.diagnostics();
      return diagnostics?.runtime === "rust-wasm" && Boolean(diagnostics.stateHash);
    },
    { timeout: 30_000 },
  );

  await page.select("#usage-mode", "explorer");
  await page.evaluate(() => {
    const panel = document.querySelector("#presentation-navigation");
    if (!(panel instanceof HTMLDetailsElement)) throw new Error("painel de navegação ausente");
    panel.open = true;
  });
  const contract = await page.evaluate(() => {
    const audit = window.__BRAIN_ENGINE__.presentationNavigationAudit();
    const scaleButtons = [...document.querySelectorAll("[data-scale-step]")];
    const cube = document.querySelector("#orientation-cube");
    return {
      audit,
      scaleButtons: scaleButtons.map((button) => button.getAttribute("data-scale-step")),
      cubeNamespace: cube?.namespaceURI,
      cameraPanelVisible: !document.querySelector("#presentation-navigation")?.hidden,
    };
  });
  if (
    contract.audit.schemaVersion !== 1 ||
    contract.audit.savedViewpoints.join(",") !== "frontal,lateral,superior,oblique" ||
    contract.audit.scaleTrail.join(",") !== "encephalon,region,column,patch,neuron,synapse" ||
    contract.scaleButtons.join(",") !== contract.audit.scaleTrail.join(",") ||
    contract.cubeNamespace !== "http://www.w3.org/2000/svg" ||
    !contract.cameraPanelVisible
  ) {
    throw new Error(`contrato de navegação inválido: ${JSON.stringify(contract)}`);
  }

  const scaleTransition = await page.evaluate(() => {
    const scaleButton = document.querySelector('[data-scale-step="column"]');
    const skipButton = document.querySelector("#skip-scale-transition");
    if (!(scaleButton instanceof HTMLButtonElement) || !(skipButton instanceof HTMLButtonElement)) {
      throw new Error("controles de transição ausentes");
    }
    scaleButton.click();
    const beforeSkip = {
      audit: window.__BRAIN_ENGINE__.presentationNavigationAudit(),
      skipVisible: !skipButton.hidden,
      current: scaleButton.getAttribute("aria-current"),
    };
    skipButton.click();
    return {
      ...beforeSkip,
      transitionAfterSkip: window.__BRAIN_ENGINE__.presentationNavigationAudit().transition,
    };
  });
  if (
    scaleTransition.audit.activeScale !== "column" ||
    scaleTransition.audit.transition !== "scale" ||
    !scaleTransition.skipVisible ||
    scaleTransition.current !== "step" ||
    scaleTransition.transitionAfterSkip !== undefined
  ) {
    throw new Error(`transição de escala não iniciou: ${JSON.stringify(scaleTransition)}`);
  }
  await page.waitForFunction(
    () => document.querySelector("#tab-laminar")?.getAttribute("aria-selected") === "true",
    { timeout: 5_000 },
  );
  await page.waitForFunction(
    () => !window.__BRAIN_ENGINE__.presentationNavigationAudit().transition,
    { timeout: 5_000 },
  );
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () => document.querySelector("#tab-overview")?.getAttribute("aria-selected") === "true" &&
      !window.__BRAIN_ENGINE__.presentationNavigationAudit().transition,
    { timeout: 5_000 },
  );
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("data-scale-step") === "column",
    { timeout: 5_000 },
  );

  await page.evaluate(() => {
    window.__BRAIN_ENGINE__.setView("overview");
    window.__BRAIN_ENGINE__.setAnatomySelection("brain-pro:anatomy/cerebral-hemisphere-left");
  });
  await page.waitForFunction(
    () => {
      const button = document.querySelector("#frame-selection");
      return button instanceof HTMLButtonElement && !button.disabled;
    },
    { timeout: 5_000 },
  );
  const framing = await page.evaluate(() => {
    const button = document.querySelector("#frame-selection");
    if (!(button instanceof HTMLButtonElement)) throw new Error("ação de enquadramento ausente");
    button.click();
    return {
      audit: window.__BRAIN_ENGINE__.presentationNavigationAudit(),
      status: document.querySelector("#presentation-navigation-status")?.textContent,
    };
  });
  if (!framing.audit.framingSelection) {
    throw new Error(`enquadramento de seleção não iniciou: ${JSON.stringify(framing)}`);
  }
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () => !window.__BRAIN_ENGINE__.presentationNavigationAudit().framingSelection &&
      !window.__BRAIN_ENGINE__.presentationNavigationAudit().transition &&
      document.activeElement?.id === "frame-selection",
    { timeout: 5_000 },
  );

  await page.click('[data-saved-viewpoint="superior"]');
  await page.waitForFunction(
    () => !window.__BRAIN_ENGINE__.presentationNavigationAudit().transition,
    { timeout: 5_000 },
  );
  const viewpoint = await page.evaluate(() => ({
    audit: window.__BRAIN_ENGINE__.presentationNavigationAudit(),
    cube: document.querySelector("#orientation-cube")?.getAttribute("data-orientation"),
    pressed: document.querySelector('[data-saved-viewpoint="superior"]')?.getAttribute("aria-pressed"),
  }));
  if (viewpoint.audit.selectedViewpoint !== "superior" || viewpoint.cube !== "superior" || viewpoint.pressed !== "true") {
    throw new Error(`ponto de vista salvo inválido: ${JSON.stringify(viewpoint)}`);
  }

  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await page.click('[data-scale-step="patch"]');
  await page.waitForFunction(
    () => document.querySelector("#tab-cell")?.getAttribute("aria-selected") === "true",
    { timeout: 5_000 },
  );
  const reducedMotion = await page.evaluate(() => ({
    transition: window.__BRAIN_ENGINE__.presentationNavigationAudit().transition,
    skipVisible: !document.querySelector("#skip-scale-transition")?.hidden,
  }));
  if (reducedMotion.transition || reducedMotion.skipVisible) {
    throw new Error(`movimento reduzido não aplicou corte instantâneo: ${JSON.stringify(reducedMotion)}`);
  }
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () => document.querySelector("#tab-overview")?.getAttribute("aria-selected") === "true" &&
      document.activeElement?.getAttribute("data-scale-step") === "patch",
    { timeout: 5_000 },
  );
  await page.emulateMediaFeatures([]);

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  const mobile = await page.evaluate(() => {
    const trail = document.querySelector("#scale-trail");
    if (!(trail instanceof HTMLElement)) return undefined;
    const bounds = trail.getBoundingClientRect();
    return {
      visible: getComputedStyle(trail).display !== "none",
      withinViewport: bounds.left >= 0 && bounds.right <= window.innerWidth &&
        bounds.top >= 0 && bounds.bottom <= window.innerHeight,
    };
  });
  if (!mobile?.visible || !mobile.withinViewport) {
    throw new Error(`trilha de escala não cabe em 390×844: ${JSON.stringify(mobile)}`);
  }

  const frozenNavigation = await page.evaluate(async () => {
    await window.__BRAIN_ENGINE__.setCaptureMode(true);
    const before = window.__BRAIN_ENGINE__.diagnostics();
    const click = (selector) => {
      const button = document.querySelector(selector);
      if (!(button instanceof HTMLButtonElement)) throw new Error(`controle ausente: ${selector}`);
      button.click();
    };
    click('[data-scale-step="column"]');
    window.__BRAIN_ENGINE__.setView("overview");
    window.__BRAIN_ENGINE__.setAnatomySelection("brain-pro:anatomy/cerebral-hemisphere-left");
    click("#frame-selection");
    const framingBeforeReturn = window.__BRAIN_ENGINE__.presentationNavigationAudit().framingSelection;
    click("#restore-selection-camera");
    click('[data-saved-viewpoint="lateral"]');
    click('[data-scale-step="synapse"]');
    const after = window.__BRAIN_ENGINE__.diagnostics();
    const audit = window.__BRAIN_ENGINE__.presentationNavigationAudit();
    await window.__BRAIN_ENGINE__.setCaptureMode(false);
    return { before, after, framingBeforeReturn, audit };
  });
  if (!frozenNavigation.framingBeforeReturn || frozenNavigation.audit.activeScale !== "synapse") {
    throw new Error(`fluxo congelado de navegação inválido: ${JSON.stringify(frozenNavigation)}`);
  }
  assertSameScientificHashes(
    frozenNavigation.before,
    frozenNavigation.after,
    "navegação de apresentação com motor congelado",
  );
  if (faults.length > 0) throw new Error(`falhas durante navegação: ${faults.join(" | ")}`);

  console.log(
    "Navegação de apresentação verificada: contrato v1, seleção/Escape, quatro vistas salvas, " +
      "escada reversível, pulo e corte instantâneo com movimento reduzido; cinco hashes invariantes.",
  );
} finally {
  await browser?.close();
  await server.close();
}
