import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import GIFEncoder from 'gif-encoder-2';
import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// A cena usa AdditiveBlending (exige fundo preto de verdade pra não estourar as cores),
// então em vez de depender do canal alpha do WebGL/headless Chrome (instável em ambientes
// headless com renderização por software), a gente captura em preto sólido e recorta por
// luminância: qualquer pixel bem próximo do preto vira transparente no GIF. O resultado se
// adapta a qualquer fundo (claro ou escuro) em vez de ficar preso numa cor fixa.
const LUMA_THRESHOLD = 70;
const TRANSPARENT_KEY = 0x000000;

function keyOutBlack(png) {
  const { data } = png;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (Math.max(r, g, b) <= LUMA_THRESHOLD) {
      // Zera RGB também: mantém o "vazio" byte-idêntico entre frames, o que deixa o
      // otimizador de delta do encoder comprimir bem mais o fundo estático.
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 0;
    }
  }
  return data;
}

async function generateGif() {
  console.log("Starting Vite server...");
  const server = await createServer({
    server: { port: 5173 },
    root: path.resolve(__dirname, '..'),
  });
  await server.listen();

  console.log("Launching Puppeteer...");
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  const width = 640;
  const height = 400;
  await page.setViewport({ width, height, deviceScaleFactor: 1 });

  console.log("Navigating to app...");
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });

  await page.evaluate(() => {
    document.getElementById('ui-panel').style.display = 'none';
    document.getElementById('bayesian-hud').style.display = 'none';
    document.body.style.background = '#000000';

    // Maximiza a intensidade bayesiana (densidade de pulsos + bloom)
    for (let i = 0; i < 5; i++) {
      const btn = document.getElementById('btn-intensity-up');
      if (btn) btn.click();
    }

    // Congela a rotação macro: só os relâmpagos sinápticos se movem
    const rotSlider = document.getElementById('rotation-speed');
    if (rotSlider) {
      rotSlider.value = '0';
      rotSlider.dispatchEvent(new Event('input'));
    }

    // Bloom mais contido: mantém o brilho concentrado perto da rede em vez de um halo
    // largo (que atrapalharia o recorte por luminância abaixo)
    const setSlider = (id, val) => {
      const el = document.getElementById(id);
      if (el) { el.value = String(val); el.dispatchEvent(new Event('input')); }
    };
    setSlider('bloom-radius', 0.35);
    setSlider('bloom-strength', 1.8);

    // Período de pulso redondo (1.6s) pra fechar o loop do GIF sem costura visível
    const pulseSlider = document.getElementById('pulse-speed');
    if (pulseSlider) {
      pulseSlider.value = String(0.625 / 0.35); // pSpeed = value * 0.35 -> 0.625 rad/s -> período de 1.6s
      pulseSlider.dispatchEvent(new Event('input'));
    }
  });

  // Tempo pro Bloom assentar e as mudanças de UI se propagarem
  await new Promise(r => setTimeout(r, 1500));

  console.log("Recording frames...");
  const frameCount = 40; // 1.6s @ 25fps == 1 período completo de pulso -> loop contínuo
  const encoder = new GIFEncoder(width, height, 'neuquant', false, frameCount);
  encoder.start();
  encoder.setRepeat(0);   // loop infinito
  encoder.setDelay(40);   // 25fps
  encoder.setQuality(10);
  encoder.setPaletteSize(6); // 128 cores bastam pro azul/âmbar/branco sobre preto
  encoder.setTransparent(TRANSPARENT_KEY);

  for (let i = 0; i < frameCount; i++) {
    const screenshot = await page.screenshot({ type: 'png' });
    const png = PNG.sync.read(screenshot);
    const rgba = keyOutBlack(png);
    encoder.addFrame(rgba);

    if (i % 10 === 0) console.log(`Captured frame ${i}/${frameCount}`);
  }

  encoder.finish();
  const buffer = encoder.out.getData();

  const outPath = path.resolve(__dirname, '../assets/brain.gif');
  fs.writeFileSync(outPath, buffer);

  console.log(`Saved GIF to ${outPath} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);

  await browser.close();
  await server.close();
  process.exit(0);
}

generateGif().catch(console.error);
