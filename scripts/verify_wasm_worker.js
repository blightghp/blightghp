import { createServer } from "vite";
import puppeteer from "puppeteer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditWorkerLifecycle } from "./worker_lifecycle_audit.js";

const EXPECTED_R09F_MATERIALS = 25;
const EXPECTED_R10B_VASCULAR_MATERIALS = 12;
const PRESENTATION_HASH_FIELDS = [
  "stateHash",
  "corticothalamicHash",
  "cellPatchHash",
  "chemicalHash",
  "cellSpikeEventHash",
];

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
  const usageModes = await page.evaluate(() => {
    const selector = document.querySelector("#usage-mode");
    const learningRate = document.querySelector("#learning-rate");
    if (!(selector instanceof HTMLSelectElement) || !(learningRate instanceof HTMLInputElement)) {
      throw new Error("controles de modo de uso indisponíveis");
    }
    const groups = (minimum) =>
      Array.from(document.querySelectorAll(`[data-usage-mode-minimum="${minimum}"]`));
    const groupVisibility = (minimum) => groups(minimum).map((element) => !element.hidden);
    const changeMode = (value) => {
      selector.value = value;
      selector.dispatchEvent(new Event("change", { bubbles: true }));
      return {
        mode: selector.value,
        explorer: groupVisibility("explorer"),
        laboratory: groupVisibility("laboratory"),
      };
    };
    const hashFields = [
      "stateHash",
      "corticothalamicHash",
      "cellPatchHash",
      "chemicalHash",
      "cellSpikeEventHash",
    ];
    const before = window.__BRAIN_ENGINE__.diagnostics();
    const guided = {
      mode: selector.value,
      label: selector.labels?.[0]?.textContent?.trim(),
      status: document.querySelector("#usage-mode-status")?.textContent,
      explorer: groupVisibility("explorer"),
      laboratory: groupVisibility("laboratory"),
      learningRate: learningRate.value,
    };
    const explorer = changeMode("explorer");
    const laboratory = changeMode("laboratory");
    learningRate.focus();
    const restored = changeMode("guided");
    const after = window.__BRAIN_ENGINE__.diagnostics();
    return {
      before,
      after,
      hashFields,
      guided,
      explorer,
      laboratory,
      restored,
      restoredFocus: document.activeElement?.id,
      restoredLearningRate: learningRate.value,
    };
  });
  if (
    usageModes.guided.mode !== "guided" ||
    usageModes.guided.label !== "MODO" ||
    !usageModes.guided.status?.startsWith("Modo guiado:") ||
    usageModes.guided.explorer.length === 0 ||
    usageModes.guided.laboratory.length === 0 ||
    usageModes.guided.explorer.some(Boolean) ||
    usageModes.guided.laboratory.some(Boolean) ||
    usageModes.explorer.mode !== "explorer" ||
    usageModes.explorer.explorer.some((visible) => !visible) ||
    usageModes.explorer.laboratory.some(Boolean) ||
    usageModes.laboratory.mode !== "laboratory" ||
    usageModes.laboratory.explorer.some((visible) => !visible) ||
    usageModes.laboratory.laboratory.some((visible) => !visible) ||
    usageModes.restored.mode !== "guided" ||
    usageModes.restoredFocus !== "usage-mode" ||
    usageModes.restoredLearningRate !== usageModes.guided.learningRate ||
    usageModes.hashFields.some((field) => usageModes.before[field] !== usageModes.after[field])
  ) {
    throw new Error(`modo de uso inválido: ${JSON.stringify(usageModes)}`);
  }
  await page.focus("#usage-mode");
  await page.keyboard.press("ArrowDown");
  await page.waitForFunction(
    () => document.querySelector("#usage-mode")?.value === "explorer",
    { timeout: 5_000 },
  );
  await page.select("#usage-mode", "guided");
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  const mobileUsageMode = await page.evaluate(() => {
    const selector = document.querySelector("#usage-mode");
    if (!(selector instanceof HTMLSelectElement)) return undefined;
    const bounds = selector.getBoundingClientRect();
    return {
      visible: getComputedStyle(selector).display !== "none",
      withinViewport: bounds.left >= 0 && bounds.right <= window.innerWidth,
    };
  });
  if (!mobileUsageMode?.visible || !mobileUsageMode.withinViewport) {
    throw new Error(`seletor de modo não cabe no móvel: ${JSON.stringify(mobileUsageMode)}`);
  }
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const paletteCommands = await page.evaluate(() => {
    const trigger = document.querySelector("#open-command-palette");
    const dialog = document.querySelector("#command-palette");
    const input = document.querySelector("#command-palette-input");
    const selector = document.querySelector("#usage-mode");
    const cut = document.querySelector("#cut-orientation");
    if (
      !(trigger instanceof HTMLButtonElement) ||
      !(dialog instanceof HTMLDialogElement) ||
      !(input instanceof HTMLInputElement) ||
      !(selector instanceof HTMLSelectElement) ||
      !(cut instanceof HTMLSelectElement)
    ) {
      throw new Error("paleta de comandos indisponível");
    }
    const hashFields = [
      "stateHash",
      "corticothalamicHash",
      "cellPatchHash",
      "chemicalHash",
      "cellSpikeEventHash",
    ];
    const press = (key, options = {}) => input.dispatchEvent(new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
      ...options,
    }));
    const choose = (query, id) => {
      trigger.click();
      if (!dialog.open) throw new Error("paleta não abriu");
      input.value = query;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      const options = [...document.querySelectorAll("#command-palette-results [role='option']")];
      if (options.length !== 1 || options[0].getAttribute("data-command-id") !== id) {
        throw new Error(`resultado inesperado para ${query}: ${options.map((option) => option.getAttribute("data-command-id")).join(",")}`);
      }
      press("Enter");
      if (dialog.open) throw new Error(`comando não fechou a paleta: ${id}`);
      return document.activeElement?.id;
    };
    const before = window.__BRAIN_ENGINE__.diagnostics();
    trigger.click();
    const guidedCommands = [...document.querySelectorAll("#command-palette-results [role='option']")]
      .map((option) => option.getAttribute("data-command-id"));
    press("Escape");
    const viewFocus = choose("abrir laminas", "view-laminar");
    const explorerFocus = choose("usar modo explorador", "mode-explorer");
    const anatomyFocus = choose("buscar estrutura anatomica", "anatomy-search");
    const cutFocus = choose("ativar corte coronal", "cut-coronal");
    const cameraFocus = choose("restaurar camera", "camera-reset-cut");
    const baselineFocus = choose("perfil grafico baseline", "render-profile-baseline");
    const enhancedFocus = choose("perfil grafico enhanced", "render-profile-enhanced");
    choose("desativar corte", "cut-disable");
    const guidedFocus = choose("usar modo guiado", "mode-guided");
    const after = window.__BRAIN_ENGINE__.diagnostics();
    return {
      before,
      after,
      hashFields,
      guidedCommands,
      viewFocus,
      explorerFocus,
      anatomyFocus,
      cutFocus,
      cameraFocus,
      baselineFocus,
      enhancedFocus,
      guidedFocus,
      mode: selector.value,
      cut: cut.value,
      activeTab: document.querySelector("[role='tab'][aria-selected='true']")?.id,
      announcement: document.querySelector("#command-palette-announcement")?.textContent,
    };
  });
  if (
    paletteCommands.guidedCommands.includes("anatomy-search") ||
    paletteCommands.guidedCommands.some((id) => id?.startsWith("cut-")) ||
    paletteCommands.viewFocus !== "tab-laminar" ||
    paletteCommands.explorerFocus !== "usage-mode" ||
    paletteCommands.anatomyFocus !== "anatomy-search" ||
    paletteCommands.cutFocus !== "cut-orientation" ||
    paletteCommands.cameraFocus !== "reset-cut-camera" ||
    paletteCommands.baselineFocus !== "render-profile" ||
    paletteCommands.enhancedFocus !== "render-profile" ||
    paletteCommands.guidedFocus !== "usage-mode" ||
    paletteCommands.mode !== "guided" ||
    paletteCommands.cut !== "none" ||
    paletteCommands.activeTab !== "tab-laminar" ||
    !paletteCommands.announcement?.startsWith("Comando executado: Modo Guiado") ||
    paletteCommands.hashFields.some((field) =>
      paletteCommands.before[field] !== paletteCommands.after[field],
    )
  ) {
    throw new Error(`paleta de comandos inválida: ${JSON.stringify(paletteCommands)}`);
  }
  await page.focus("#open-command-palette");
  await page.keyboard.down("Control");
  await page.keyboard.press("KeyK");
  await page.keyboard.up("Control");
  await page.waitForFunction(
    () => document.querySelector("#command-palette")?.open === true &&
      document.activeElement?.id === "command-palette-input",
    { timeout: 5_000 },
  );
  const paletteAccessibility = await page.evaluate(() => ({
    role: document.querySelector("#command-palette")?.getAttribute("role"),
    modal: document.querySelector("#command-palette")?.getAttribute("aria-modal"),
    expanded: document.querySelector("#command-palette-input")?.getAttribute("aria-expanded"),
    controls: document.querySelector("#command-palette-input")?.getAttribute("aria-controls"),
    initialActive: document.querySelector("#command-palette-input")?.getAttribute("aria-activedescendant"),
  }));
  await page.keyboard.press("ArrowDown");
  const movedPaletteOption = await page.evaluate(
    () => document.querySelector("#command-palette-input")?.getAttribute("aria-activedescendant"),
  );
  await page.keyboard.press("End");
  const lastPaletteOption = await page.evaluate(
    () => document.querySelector("#command-palette-input")?.getAttribute("aria-activedescendant"),
  );
  await page.keyboard.press("Home");
  const firstPaletteOption = await page.evaluate(
    () => document.querySelector("#command-palette-input")?.getAttribute("aria-activedescendant"),
  );
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  const mobilePalette = await page.evaluate(() => {
    const card = document.querySelector(".command-palette-card");
    if (!(card instanceof HTMLElement)) return undefined;
    const bounds = card.getBoundingClientRect();
    return {
      visible: getComputedStyle(card).display !== "none",
      withinViewport: bounds.left >= 0 && bounds.right <= window.innerWidth,
    };
  });
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await page.keyboard.type("resultado ausente");
  await page.waitForFunction(
    () => document.querySelectorAll("#command-palette-results [role='option']").length === 0,
    { timeout: 5_000 },
  );
  await page.keyboard.press("Enter");
  const emptyPalette = await page.evaluate(() => ({
    open: document.querySelector("#command-palette")?.open,
    status: document.querySelector("#command-palette-status")?.textContent,
  }));
  await page.keyboard.down("Control");
  await page.keyboard.press("KeyA");
  await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  await page.keyboard.type("laminas");
  await page.waitForFunction(
    () => document.querySelectorAll("#command-palette-results [role='option']").length === 1,
    { timeout: 5_000 },
  );
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    () => !document.querySelector("#command-palette")?.open &&
      document.querySelector("#tab-laminar")?.getAttribute("aria-selected") === "true",
    { timeout: 5_000 },
  );
  if (
    paletteAccessibility.role !== "dialog" ||
    paletteAccessibility.modal !== "true" ||
    paletteAccessibility.expanded !== "true" ||
    paletteAccessibility.controls !== "command-palette-results" ||
    !paletteAccessibility.initialActive ||
    !movedPaletteOption || movedPaletteOption === paletteAccessibility.initialActive ||
    !lastPaletteOption || lastPaletteOption === firstPaletteOption ||
    firstPaletteOption !== paletteAccessibility.initialActive ||
    emptyPalette.open !== true || emptyPalette.status !== "Nenhum comando disponível." ||
    !mobilePalette?.visible || !mobilePalette.withinViewport
  ) {
    throw new Error(`acessibilidade da paleta inválida: ${JSON.stringify({ paletteAccessibility, movedPaletteOption, lastPaletteOption, firstPaletteOption, emptyPalette, mobilePalette })}`);
  }
  const metaPaletteOpen = await page.evaluate(() => {
    const trigger = document.querySelector("#open-command-palette");
    if (!(trigger instanceof HTMLElement)) return false;
    trigger.dispatchEvent(new KeyboardEvent("keydown", {
      key: "k",
      code: "KeyK",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    }));
    return document.querySelector("#command-palette")?.open === true;
  });
  if (!metaPaletteOpen) throw new Error("atalho Cmd+K não abriu a paleta");
  await page.evaluate(() => document.querySelector("#command-palette-close")?.click());
  await page.evaluate(() => window.__BRAIN_ENGINE__.setView("neuron"));
  await page.focus("#open-command-palette");
  await page.keyboard.down("Control");
  await page.keyboard.press("KeyK");
  await page.keyboard.up("Control");
  await page.waitForFunction(() => document.querySelector("#command-palette")?.open === true);
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () => !document.querySelector("#command-palette")?.open &&
      document.querySelector("#tab-neuron")?.getAttribute("aria-selected") === "true" &&
      document.activeElement?.id === "open-command-palette",
    { timeout: 5_000 },
  );
  await page.evaluate(() => window.__BRAIN_ENGINE__.setView("overview"));
  await page.select("#usage-mode", "explorer");
  await page.evaluate(() => window.__BRAIN_ENGINE__.setView("laminar"));
  await page.evaluate(() => {
    const input = document.querySelector("#anatomy-search");
    if (!(input instanceof HTMLInputElement)) throw new Error("busca anatômica ausente");
    input.value = "L4";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForFunction(
    () => document.querySelectorAll("#anatomy-results [role='treeitem']").length === 1,
    { timeout: 5_000 },
  );
  await page.focus("#anatomy-results [data-anatomy-id='brain-pro:anatomy/cortical-layer-4']");
  await page.waitForFunction(
    () => document.querySelector("#anatomy-focus-id")?.textContent ===
      "brain-pro:anatomy/cortical-layer-4",
    { timeout: 5_000 },
  );
  const keyboardAnatomyPreview = await page.evaluate(() => ({
    calloutVisible: !document.querySelector("#anatomy-focus-callout")?.hidden,
    name: document.querySelector("#anatomy-focus-name")?.textContent,
    id: document.querySelector("#anatomy-focus-id")?.textContent,
    provenance: document.querySelector("#anatomy-focus-provenance")?.textContent,
    evidence: document.querySelector("#anatomy-focus-evidence")?.textContent,
    status: document.querySelector("#anatomy-focus-status")?.textContent,
    selectedId: document.querySelector("#anatomy-selected-id")?.textContent,
    highlight: window.__BRAIN_ENGINE__.presentationAudit().selectionHighlight,
  }));
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    () => document.querySelector("#anatomy-selected-id")?.textContent ===
      "brain-pro:anatomy/cortical-layer-4",
    { timeout: 5_000 },
  );
  const confirmedKeyboardSelection = await page.evaluate(() => ({
    provenance: document.querySelector("#anatomy-selected-provenance")?.textContent,
    selected: document.querySelector("#anatomy-selected-id")?.textContent,
    badge: {
      name: document.querySelector("#selection-provenance-name")?.textContent,
      visualClass: document.querySelector("#selection-provenance-class")?.textContent,
      evidence: document.querySelector("#selection-provenance-evidence")?.textContent,
    },
  }));

  await page.evaluate(() => window.__BRAIN_ENGINE__.setView("synapse"));
  await page.evaluate(() => {
    const input = document.querySelector("#anatomy-search");
    if (!(input instanceof HTMLInputElement)) throw new Error("busca anatômica ausente");
    input.value = "pericito";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForFunction(
    () => document.querySelectorAll("#anatomy-results [role='treeitem']").length === 1,
    { timeout: 5_000 },
  );
  const selectedBeforePointerPreview = await page.evaluate(() => ({
    id: document.querySelector("#anatomy-selected-id")?.textContent,
    badge: {
      name: document.querySelector("#selection-provenance-name")?.textContent,
      visualClass: document.querySelector("#selection-provenance-class")?.textContent,
      evidence: document.querySelector("#selection-provenance-evidence")?.textContent,
    },
  }));
  await page.hover("#anatomy-results [data-anatomy-id='brain-pro:anatomy/pericyte']");
  await page.waitForFunction(
    () => document.querySelector("#anatomy-focus-id")?.textContent ===
      "brain-pro:anatomy/pericyte",
    { timeout: 5_000 },
  );
  const pointerAnatomyPreview = await page.evaluate(() => ({
    id: document.querySelector("#anatomy-focus-id")?.textContent,
    provenance: document.querySelector("#anatomy-focus-provenance")?.textContent,
    evidence: document.querySelector("#anatomy-focus-evidence")?.textContent,
    selectedId: document.querySelector("#anatomy-selected-id")?.textContent,
    selectionBadge: {
      name: document.querySelector("#selection-provenance-name")?.textContent,
      visualClass: document.querySelector("#selection-provenance-class")?.textContent,
      evidence: document.querySelector("#selection-provenance-evidence")?.textContent,
    },
    highlight: window.__BRAIN_ENGINE__.presentationAudit().selectionHighlight,
  }));
  await page.evaluate(() => window.__BRAIN_ENGINE__.setAnatomySelection("brain-pro:anatomy/pericyte"));
  await page.waitForFunction(
    () => document.querySelector("#anatomy-selected-id")?.textContent ===
      "brain-pro:anatomy/pericyte",
    { timeout: 5_000 },
  );
  const highContrastCallout = await page.evaluate(() => {
    window.__BRAIN_ENGINE__.setHighContrast(true);
    const callout = document.querySelector("#anatomy-focus-callout");
    const computed = callout ? getComputedStyle(callout) : undefined;
    const result = {
      background: computed?.backgroundColor,
      color: computed?.color,
      calloutId: document.querySelector("#anatomy-focus-id")?.textContent,
      calloutProvenance: document.querySelector("#anatomy-focus-provenance")?.textContent,
      selectedProvenance: document.querySelector("#anatomy-selected-provenance")?.textContent,
      badgeClass: document.querySelector("#selection-provenance-class")?.textContent,
      badgeEvidence: document.querySelector("#selection-provenance-evidence")?.textContent,
    };
    window.__BRAIN_ENGINE__.setHighContrast(false);
    return result;
  });
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  const mobileAnatomyCallout = await page.evaluate(() => {
    const callout = document.querySelector("#anatomy-focus-callout");
    if (!(callout instanceof HTMLElement)) return undefined;
    const bounds = callout.getBoundingClientRect();
    return {
      hidden: callout.hidden,
      withinViewport: bounds.left >= 0 && bounds.right <= window.innerWidth &&
        bounds.top >= 0 && bounds.bottom <= window.innerHeight,
    };
  });
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const ui033HashInvariant = await page.evaluate(() => {
    const before = window.__BRAIN_ENGINE__.diagnostics();
    window.__BRAIN_ENGINE__.setView("synapse");
    window.__BRAIN_ENGINE__.setAnatomySelection("brain-pro:anatomy/pericyte");
    window.__BRAIN_ENGINE__.setHighContrast(true);
    window.__BRAIN_ENGINE__.setHighContrast(false);
    return { before, after: window.__BRAIN_ENGINE__.diagnostics() };
  });
  if (
    !keyboardAnatomyPreview.calloutVisible ||
    keyboardAnatomyPreview.id !== "brain-pro:anatomy/cortical-layer-4" ||
    keyboardAnatomyPreview.provenance !== "STATE" ||
    keyboardAnatomyPreview.evidence !== "DIDACTIC" ||
    keyboardAnatomyPreview.selectedId === "brain-pro:anatomy/cortical-layer-4" ||
    !keyboardAnatomyPreview.status?.includes("cortical-layer-4") ||
    keyboardAnatomyPreview.highlight.status !== "ready" ||
    keyboardAnatomyPreview.highlight.materialAllocations !== 0 ||
    confirmedKeyboardSelection.selected !== "brain-pro:anatomy/cortical-layer-4" ||
    confirmedKeyboardSelection.provenance !== "STATE" ||
    confirmedKeyboardSelection.badge.name !== "Camada cortical L4" ||
    confirmedKeyboardSelection.badge.visualClass !== "STATE" ||
    confirmedKeyboardSelection.badge.evidence !== "DIDACTIC" ||
    pointerAnatomyPreview.id !== "brain-pro:anatomy/pericyte" ||
    pointerAnatomyPreview.provenance !== "TOPOLOGY" ||
    pointerAnatomyPreview.evidence !== "ILLUSTRATIVE" ||
    pointerAnatomyPreview.selectedId !== selectedBeforePointerPreview.id ||
    pointerAnatomyPreview.selectionBadge.name !== selectedBeforePointerPreview.badge.name ||
    pointerAnatomyPreview.selectionBadge.visualClass !==
      selectedBeforePointerPreview.badge.visualClass ||
    pointerAnatomyPreview.selectionBadge.evidence !== selectedBeforePointerPreview.badge.evidence ||
    pointerAnatomyPreview.highlight.status !== "ready" ||
    pointerAnatomyPreview.highlight.highlightedMaterials < 1 ||
    pointerAnatomyPreview.highlight.materialAllocations !== 0 ||
    highContrastCallout.background !== "rgb(0, 0, 0)" ||
    highContrastCallout.color !== "rgb(255, 255, 255)" ||
    highContrastCallout.calloutId !== "brain-pro:anatomy/pericyte" ||
    highContrastCallout.calloutProvenance !== "TOPOLOGY" ||
    highContrastCallout.selectedProvenance !== "TOPOLOGY" ||
    highContrastCallout.badgeClass !== "TOPOLOGY" ||
    highContrastCallout.badgeEvidence !== "ILLUSTRATIVE" ||
    (!mobileAnatomyCallout?.hidden && !mobileAnatomyCallout.withinViewport) ||
    PRESENTATION_HASH_FIELDS.some(
      (field) => ui033HashInvariant.before[field] !== ui033HashInvariant.after[field],
    )
  ) {
    throw new Error(`UI-033 inválida: ${JSON.stringify({ keyboardAnatomyPreview, confirmedKeyboardSelection, selectedBeforePointerPreview, pointerAnatomyPreview, highContrastCallout, mobileAnatomyCallout, ui033HashInvariant })}`);
  }
  await page.select("#usage-mode", "guided");
  await page.evaluate(() => window.__BRAIN_ENGINE__.setView("overview"));
  const ui034Views = [
    ["overview", "VISÃO GERAL"],
    ["laminar", "LÂMINAS"],
    ["cell", "CÉLULA"],
    ["neuron", "NEURÔNIO"],
    ["electricity", "ELETRICIDADE"],
    ["synapse", "SINAPSE"],
  ];
  const ui034Contexts = await page.evaluate(async (views) => {
    const contexts = {};
    for (const [view, label] of views) {
      window.__BRAIN_ENGINE__.setView(view);
      await new Promise((resolve) => requestAnimationFrame(() => resolve()));
      contexts[view] = {
        expectedLabel: label,
        open: document.querySelector("#view-context-panel")?.open,
        label: document.querySelector("#view-context-view")?.textContent,
        model: document.querySelector("#view-context-model")?.textContent,
        unit: document.querySelector("#view-context-unit")?.textContent,
        hypothesis: document.querySelector("#view-context-hypothesis")?.textContent,
        limitation: document.querySelector("#view-context-limitation")?.textContent,
      };
    }
    window.__BRAIN_ENGINE__.setAnatomySelection("brain-pro:anatomy/pericyte");
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    return {
      contexts,
      selection: {
        hidden: document.querySelector("#view-context-selection")?.hidden,
        label: document.querySelector("#view-context-selection-name")?.textContent,
        id: document.querySelector("#view-context-selection-id")?.textContent,
        hypothesis: document.querySelector("#view-context-selection-hypothesis")?.textContent,
        limitation: document.querySelector("#view-context-selection-limitation")?.textContent,
        status: document.querySelector("#view-context-status")?.textContent,
      },
    };
  }, ui034Views);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  const mobileViewContext = await page.evaluate(() => {
    const panel = document.querySelector("#view-context-panel");
    if (!(panel instanceof HTMLElement)) return undefined;
    const bounds = panel.getBoundingClientRect();
    return {
      visible: getComputedStyle(panel).display !== "none",
      withinViewport: bounds.left >= 0 && bounds.right <= window.innerWidth &&
        bounds.top >= 0 && bounds.bottom <= window.innerHeight,
      documentWidth: document.documentElement.scrollWidth,
    };
  });
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const ui034PresentationInvariant = await page.evaluate(() => {
    const before = window.__BRAIN_ENGINE__.diagnostics();
    for (const view of ["overview", "laminar", "cell", "neuron", "electricity", "synapse"]) {
      window.__BRAIN_ENGINE__.setView(view);
    }
    window.__BRAIN_ENGINE__.setAnatomySelection("brain-pro:anatomy/pericyte");
    window.__BRAIN_ENGINE__.setHighContrast(true);
    const modelColor = getComputedStyle(document.querySelector("#view-context-model")).color;
    window.__BRAIN_ENGINE__.setHighContrast(false);
    return { before, after: window.__BRAIN_ENGINE__.diagnostics(), modelColor };
  });
  const incompleteViewContext = Object.values(ui034Contexts.contexts).find((context) =>
    !context.open || context.label !== context.expectedLabel ||
    [context.model, context.unit, context.hypothesis, context.limitation]
      .some((value) => !value?.trim())
  );
  if (
    incompleteViewContext ||
    ui034Contexts.selection.hidden ||
    ui034Contexts.selection.label !== "Pericito ilustrativo" ||
    ui034Contexts.selection.id !== "brain-pro:anatomy/pericyte" ||
    !ui034Contexts.selection.hypothesis?.includes("pericito") ||
    !ui034Contexts.selection.limitation?.includes("Não há fluxo") ||
    !ui034Contexts.selection.status?.includes("Foco Pericito ilustrativo") ||
    !mobileViewContext?.visible || !mobileViewContext.withinViewport ||
    mobileViewContext.documentWidth > 390 ||
    ui034PresentationInvariant.modelColor !== "rgb(255, 255, 255)" ||
    PRESENTATION_HASH_FIELDS.some(
      (field) => ui034PresentationInvariant.before[field] !== ui034PresentationInvariant.after[field],
    )
  ) {
    throw new Error(`UI-034 inválida: ${JSON.stringify({ ui034Contexts, mobileViewContext, ui034PresentationInvariant })}`);
  }
  await page.evaluate(() => {
    window.__BRAIN_ENGINE__.setAnatomySelection("brain-pro:anatomy/cortical-layer-4");
    const context = document.querySelector("#view-context-panel");
    if (context instanceof HTMLDetailsElement) context.open = false;
  });
  await page.waitForFunction(
    () => document.querySelector("#selection-provenance-class")?.textContent === "STATE",
    { timeout: 5_000 },
  );
  const guidedProvenanceBadge = await page.evaluate(() => {
    const badge = document.querySelector("#selection-provenance-badge");
    const explorer = document.querySelector("#anatomy-explorer");
    const context = document.querySelector("#view-context-panel");
    return {
      visible: badge instanceof HTMLElement && !badge.hidden &&
        getComputedStyle(badge).display !== "none",
      name: document.querySelector("#selection-provenance-name")?.textContent,
      visualClass: document.querySelector("#selection-provenance-class")?.textContent,
      evidence: document.querySelector("#selection-provenance-evidence")?.textContent,
      explorerHidden: explorer instanceof HTMLElement && explorer.hidden,
      contextClosed: context instanceof HTMLDetailsElement && !context.open,
    };
  });
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  const mobileProvenanceBadge = await page.evaluate(() => {
    const panel = document.querySelector("#presentation-panel");
    const badge = document.querySelector("#selection-provenance-badge");
    if (!(panel instanceof HTMLElement) || !(badge instanceof HTMLElement)) return undefined;
    panel.scrollTop = panel.scrollHeight;
    const panelBounds = panel.getBoundingClientRect();
    const badgeBounds = badge.getBoundingClientRect();
    return {
      visible: !badge.hidden && getComputedStyle(badge).display !== "none",
      withinViewport: badgeBounds.left >= 0 && badgeBounds.right <= window.innerWidth &&
        badgeBounds.top >= 0 && badgeBounds.bottom <= window.innerHeight,
      withinPanel: badgeBounds.left >= panelBounds.left && badgeBounds.right <= panelBounds.right &&
        badgeBounds.top >= panelBounds.top && badgeBounds.bottom <= panelBounds.bottom,
      documentWidth: document.documentElement.scrollWidth,
    };
  });
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const ui037PresentationInvariant = await page.evaluate(() => {
    const before = window.__BRAIN_ENGINE__.diagnostics();
    window.__BRAIN_ENGINE__.setView("synapse");
    window.__BRAIN_ENGINE__.setAnatomySelection("brain-pro:anatomy/pericyte");
    window.__BRAIN_ENGINE__.setHighContrast(true);
    const badgeColor = getComputedStyle(document.querySelector("#selection-provenance-class")).color;
    const badgeClass = document.querySelector("#selection-provenance-class")?.textContent;
    const badgeEvidence = document.querySelector("#selection-provenance-evidence")?.textContent;
    window.__BRAIN_ENGINE__.setHighContrast(false);
    return { before, after: window.__BRAIN_ENGINE__.diagnostics(), badgeColor, badgeClass, badgeEvidence };
  });
  if (
    !guidedProvenanceBadge.visible ||
    guidedProvenanceBadge.name !== "Camada cortical L4" ||
    guidedProvenanceBadge.visualClass !== "STATE" ||
    guidedProvenanceBadge.evidence !== "DIDACTIC" ||
    !guidedProvenanceBadge.explorerHidden || !guidedProvenanceBadge.contextClosed ||
    !mobileProvenanceBadge?.visible || !mobileProvenanceBadge.withinViewport ||
    !mobileProvenanceBadge.withinPanel || mobileProvenanceBadge.documentWidth > 390 ||
    ui037PresentationInvariant.badgeColor !== "rgb(255, 255, 255)" ||
    ui037PresentationInvariant.badgeClass !== "TOPOLOGY" ||
    ui037PresentationInvariant.badgeEvidence !== "ILLUSTRATIVE" ||
    PRESENTATION_HASH_FIELDS.some(
      (field) => ui037PresentationInvariant.before[field] !== ui037PresentationInvariant.after[field],
    )
  ) {
    throw new Error(`UI-037 inválida: ${JSON.stringify({ guidedProvenanceBadge, mobileProvenanceBadge, ui037PresentationInvariant })}`);
  }
  await page.evaluate(() => window.__BRAIN_ENGINE__.setView("overview"));
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
    r09f.active.material.regionalBaseColorObjects !== 4 ||
    r09f.active.material.vascularMaterialObjects !== EXPECTED_R10B_VASCULAR_MATERIALS ||
    r09f.active.material.semanticGeometryChanges !== 0 ||
    r09f.active.clipping.planeCount !== 1 ||
    r09f.active.clipping.capSources !== 4 ||
    r09f.active.clipping.cutFaceShaderCaps !== 1 ||
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
