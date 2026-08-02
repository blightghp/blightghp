import { createServer } from "vite";
import puppeteer from "puppeteer";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  if (
    diagnostics.runtime !== "rust-wasm" ||
    diagnostics.schemaVersion !== 5 ||
    diagnostics.degraded ||
    !/^[0-9a-f]{16}$/.test(diagnostics.stateHash) ||
    !/^[0-9a-f]{16}$/.test(diagnostics.corticothalamicHash) ||
    !/^[0-9a-f]{16}$/.test(diagnostics.cellPatchHash)
  ) {
    throw new Error(`diagnóstico inesperado: ${JSON.stringify(diagnostics)}`);
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
  if (replay.accepted !== 2 || replay.after.stateHash === diagnostics.stateHash) {
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
  console.log(
    `Worker Wasm verificado no navegador: schema ${diagnostics.schemaVersion}, ` +
      `hash ${diagnostics.stateHash}, quatro abas operantes`,
  );
} finally {
  await browser?.close();
  await server.close();
}
