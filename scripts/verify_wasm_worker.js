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
    diagnostics.schemaVersion !== 4 ||
    diagnostics.degraded ||
    !/^[0-9a-f]{16}$/.test(diagnostics.stateHash) ||
    !/^[0-9a-f]{16}$/.test(diagnostics.corticothalamicHash)
  ) {
    throw new Error(`diagnóstico inesperado: ${JSON.stringify(diagnostics)}`);
  }
  if (faults.length > 0) {
    throw new Error(`erros no navegador: ${faults.join(" | ")}`);
  }
  console.log(
    `Worker Wasm verificado no navegador: schema ${diagnostics.schemaVersion}, ` +
      `hash ${diagnostics.stateHash}`,
  );
} finally {
  await browser?.close();
  await server.close();
}
