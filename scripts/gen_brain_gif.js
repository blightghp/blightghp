import { createServer } from "vite";
import puppeteer from "puppeteer";
import GIFEncoder from "gif-encoder-2";
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import {
  BRAIN_GIF_FRAME_COUNT,
  BRAIN_GIF_VIEW_FRAMES,
  brainGifViewAtFrame,
  createBrainGifManifest,
} from "./brain_gif_manifest.js";

const directory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(directory, "..");
const outputDirectory = process.env.BRAIN_GIF_OUTPUT_DIR
  ? path.resolve(process.env.BRAIN_GIF_OUTPUT_DIR)
  : path.join(projectRoot, "assets");
const outputPath = path.join(outputDirectory, "brain.gif");
const manifestPath = path.join(outputDirectory, "brain-gif.json");
const width = 760;
const height = 430;
const frameCount = BRAIN_GIF_FRAME_COUNT;
const frameDelay = 120;
const loopDuration = (frameCount * frameDelay) / 1000;
const transparentKey = 0x000000;

function keyOutBackground(png) {
  for (let offset = 0; offset < png.data.length; offset += 4) {
    const red = png.data[offset];
    const green = png.data[offset + 1];
    const blue = png.data[offset + 2];
    if (Math.max(red, green, blue) <= 68) {
      png.data[offset] = 0;
      png.data[offset + 1] = 0;
      png.data[offset + 2] = 0;
      png.data[offset + 3] = 0;
    }
  }
  return png.data;
}

async function generateGif() {
  fs.mkdirSync(outputDirectory, { recursive: true });
  const server = await createServer({
    root: projectRoot,
    logLevel: "warn",
    server: { host: "127.0.0.1", port: 4178 },
  });
  await server.listen();

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--use-angle=swiftshader"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.goto("http://127.0.0.1:4178/", { waitUntil: "networkidle0" });
    await page.waitForFunction(() => Boolean(window.__BRAIN_ENGINE__));
    await page.evaluate(() => window.__BRAIN_ENGINE__.setCaptureMode(true));
    await page.evaluate(() => {
      window.__BRAIN_ENGINE__.setMaterialProfile("realistic-illustrative");
      window.__BRAIN_ENGINE__.setPresentationEffects({
        opacity: 0.82,
        xray: false,
        isolateMatter: false,
      });
    });

    const encoder = new GIFEncoder(width, height, "neuquant", true, frameCount);
    encoder.start();
    encoder.setRepeat(0);
    encoder.setDelay(frameDelay);
    encoder.setQuality(8);
    encoder.setTransparent(transparentKey);

    for (let frame = 0; frame < frameCount; frame += 1) {
      const ratio = frame / frameCount;
      const view = brainGifViewAtFrame(frame);
      await page.evaluate(
        async ({ time, rotation, view }) => {
          window.__BRAIN_ENGINE__.setView(view);
          window.__BRAIN_ENGINE__.setClipping(
            view === "overview"
              ? {
                  enabled: true,
                  orientation: "coronal",
                  slab: false,
                  position: 0.06,
                }
              : { enabled: false, slab: false },
          );
          await window.__BRAIN_ENGINE__.capture(time, rotation);
        },
        {
          time: ratio * loopDuration,
          rotation: -0.62 + ratio * Math.PI * 2,
          view,
        },
      );
      const screenshot = await page.screenshot({ type: "png", omitBackground: false });
      encoder.addFrame(keyOutBackground(PNG.sync.read(screenshot)));
      if ((frame + 1) % 12 === 0) {
        console.log(`captured ${frame + 1}/${frameCount} frames · ${view}`);
      }
    }

    encoder.finish();
    const gif = encoder.out.getData();
    const diagnostics = await page.evaluate(() => window.__BRAIN_ENGINE__.diagnostics());
    const sourceCommit = process.env.GITHUB_SHA ?? execFileSync(
      "git",
      ["rev-parse", "HEAD"],
      { cwd: projectRoot, encoding: "utf8" },
    ).trim();
    const manifest = createBrainGifManifest({
      sourceCommit,
      gifBytes: gif,
      diagnostics,
      capture: {
        width,
        height,
        frameCount,
        frameDelayMilliseconds: frameDelay,
        loopDurationSeconds: loopDuration,
        framesByView: { ...BRAIN_GIF_VIEW_FRAMES },
        presentation: {
          materialProfile: "realistic-illustrative",
          clipping: {
            view: "overview",
            orientation: "coronal",
            slab: false,
            frames: BRAIN_GIF_VIEW_FRAMES.overview,
          },
          externalAtlasAssets: 0,
        },
      },
    });
    fs.writeFileSync(outputPath, gif);
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`saved ${outputPath} (${(gif.length / 1024 / 1024).toFixed(2)} MiB)`);
    console.log(`stamped provenance ${manifest.sourceCommit.slice(0, 12)} · ${manifest.gifSha256.slice(0, 12)}`);
  } finally {
    await browser.close();
    await server.close();
  }
}

generateGif().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
