import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import puppeteer from "puppeteer";
import { contrastRatio, parseCssColor } from "./audit_utils.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = process.env.BRAIN_AUDIT_DIR
  ? path.resolve(process.env.BRAIN_AUDIT_DIR)
  : path.join(os.tmpdir(), "brain-pro-visual-audit");
await mkdir(outputDirectory, { recursive: true });

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
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--use-angle=swiftshader"],
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
  await page.keyboard.press("Home");
  const keyboard = await page.evaluate(() => ({
    focused: document.activeElement?.id,
    selected: document.querySelector("#tab-overview")?.getAttribute("aria-selected"),
    laminarHidden: document.querySelector("#laminar-panel")?.hidden,
  }));
  if (keyboard.focused !== "tab-overview" || keyboard.selected !== "true" || !keyboard.laminarHidden) {
    throw new Error(`navegação por teclado inválida: ${JSON.stringify(keyboard)}`);
  }

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

  const profile = await page.evaluate(() => window.__BRAIN_ENGINE__.profile());
  if (
    profile.snapshotCadenceTicks !== 2 ||
    profile.sampleCount < 5 ||
    profile.workerLatencyMs.p95 <= 0 ||
    profile.frameCpuMs.p95 <= 0 ||
    profile.gpu.drawCalls <= 0 ||
    profile.memory.snapshotBytes <= 0 ||
    profile.memory.geometries <= 0
  ) {
    throw new Error(`perfil incompleto: ${JSON.stringify(profile)}`);
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
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    viewports: ["1440x960", "390x844"],
    captures: ["overview-desktop.png", "laminar-desktop.png", "overview-mobile.png"],
    keyboard,
    contrast,
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
