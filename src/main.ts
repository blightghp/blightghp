import * as THREE from "three";
import { invoke } from "@tauri-apps/api/core";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { BrainData, BrainRegion, generateBrainData } from "./brain";
import { FixedStepClock } from "./clock";
import { BayesianBelief, BayesianUpdate } from "./inference";
import {
  LaminarRenderLayer,
  parseLaminarLod,
  parseSimulationView,
} from "./laminar-layer";
import type { SimulationView } from "./laminar-layer";
import {
  parseSnapshotCadence,
  RuntimeProfiler,
  shouldRequestSnapshot,
} from "./performance-profile";
import type { RuntimeProfile } from "./performance-profile";
import { SIMULATION_STEP_SECONDS } from "./protocol";
import type {
  EngineCommand,
  EngineEvent,
  NeuralSnapshot,
  ScheduledEngineInput,
  SimulationTick,
} from "./protocol";
import { BrainRenderLayers } from "./render-layers";
import { BrainSettings, getInitialBrainSettings } from "./schema";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
    __BRAIN_ENGINE__?: {
      capture: (time: number, rotation: number) => Promise<void>;
      setCaptureMode: (enabled: boolean) => Promise<void>;
      setView: (view: SimulationView) => void;
      schedule: (inputs: ScheduledEngineInput[]) => Promise<number>;
      diagnostics: () => {
        runtime: string;
        schemaVersion: number;
        stateHash?: string;
        corticothalamicHash?: string;
        degraded: boolean;
        detail?: string;
      };
      profile: () => RuntimeProfile;
    };
  }
}

interface RuntimeInfo {
  engine: string;
  renderer: string;
  schema: string;
  brainEngineSchema: number;
}

const state: BrainSettings = getInitialBrainSettings();
const belief = new BayesianBelief(0.35);
const simulationClock = new FixedStepClock({
  stepSeconds: SIMULATION_STEP_SECONDS,
  maxInteractiveDeltaSeconds: 0.1,
});
const runtimeProfiler = new RuntimeProfiler();

let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let controls: OrbitControls;
let composer: EffectComposer;
let bloomPass: UnrealBloomPass;
let layers: BrainRenderLayers;
let laminarLayer: LaminarRenderLayer;
let brainData: BrainData;
let worker: Worker;
let latestSnapshot: NeuralSnapshot | undefined;
let previousSnapshot: NeuralSnapshot | undefined;
let lastSnapshotReceivedTimestamp = performance.now();
let engineBusy = false;
let currentInference: BayesianUpdate;
let captureMode = false;
let captureTime = 0;
let metricAccumulator = 0;
let currentFocusRegion: BrainRegion | "all" = "all";
let activeView: SimulationView = "overview";
let engineReady: Extract<EngineEvent, { type: "ready" }> | undefined;

const pendingResponses: Array<(event: EngineEvent) => void> = [];
const activitySamples = Array.from({ length: 96 }, () => 0);

function element<T extends HTMLElement>(selector: string): T {
  const match = document.querySelector<T>(selector);
  if (!match) throw new Error(`Elemento obrigatório ausente: ${selector}`);
  return match;
}

function drawActivityTrace(): void {
  const canvas = element<HTMLCanvasElement>("#activity-trace");
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  const ratio = Math.min(window.devicePixelRatio, 2);
  const pixelWidth = Math.round(width * ratio);
  const pixelHeight = Math.round(height * ratio);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const context = canvas.getContext("2d")!;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  const peak = Math.max(1, ...activitySamples);
  const gradient = context.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, "rgba(29,126,235,.25)");
  gradient.addColorStop(1, "rgba(100,220,255,.95)");
  context.strokeStyle = gradient;
  context.lineWidth = 1.25;
  context.beginPath();
  activitySamples.forEach((sample, index) => {
    const x = (index / (activitySamples.length - 1)) * width;
    const y = height - 2 - (sample / peak) * (height - 5);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.stroke();
}

function updateMetrics(snapshot: NeuralSnapshot, delta: number): void {
  metricAccumulator += delta;
  if (metricAccumulator < 0.12) return;
  metricAccumulator = 0;
  activitySamples.shift();
  activitySamples.push(snapshot.firingRate);
  element("#activity-rate").textContent = snapshot.firingRate.toFixed(1);
  const stateLabel = snapshot.firingRate > 8
    ? "INTENSO"
    : snapshot.firingRate > 1
      ? "PROPAGANDO"
      : "LATENTE";
  element("#network-state").textContent = stateLabel;
  element("#mean-weight").textContent = snapshot.meanWeight.toFixed(3);
  element("#relay-activity").textContent =
    snapshot.corticothalamic.relay.toFixed(3);
  element("#trn-activity").textContent =
    snapshot.corticothalamic.trn.toFixed(3);
  element("#rebound-activity").textContent =
    snapshot.corticothalamic.rebound.toFixed(3);

  const spikeElement = document.querySelector("#spike-count");
  if (spikeElement) spikeElement.textContent = `${snapshot.spikes} spk`;

  const potentialElement = document.querySelector("#mean-potential");
  if (potentialElement && snapshot.potentials.length > 0) {
    const avgPot = snapshot.potentials.reduce((sum, val) => sum + val, 0) / snapshot.potentials.length;
    potentialElement.textContent = `${avgPot.toFixed(3)} u.a.`;
  }

  const fpsElement = document.querySelector("#fps-val");
  if (fpsElement && delta > 0) {
    fpsElement.textContent = `${Math.round(1 / delta)} FPS`;
  }

  const profile = runtimeProfiler.report(state.snapshotCadence);
  const latencyElement = document.querySelector("#worker-latency");
  if (latencyElement) latencyElement.textContent = `${profile.workerLatencyMs.p95.toFixed(1)} ms`;
  const drawElement = document.querySelector("#gpu-draw-calls");
  if (drawElement) drawElement.textContent = String(profile.gpu.drawCalls);
  const memoryElement = document.querySelector("#snapshot-memory");
  if (memoryElement) memoryElement.textContent = `${(profile.memory.snapshotBytes / 1024).toFixed(1)} KiB`;

  drawActivityTrace();
}

function sendCommand(command: EngineCommand): Promise<EngineEvent> {
  return new Promise((resolve) => {
    pendingResponses.push(resolve);
    worker.postMessage(command);
  });
}

function requestAdvance(targetTick: SimulationTick): void {
  const publishedTick = latestSnapshot?.tick ?? 0;
  if (engineBusy || !shouldRequestSnapshot(publishedTick, targetTick, state.snapshotCadence)) return;
  engineBusy = true;
  const requestTimestamp = performance.now();
  sendCommand({
    type: "advance",
    targetTick,
    stimulus: { intensity: state.stimulusIntensity, confidence: currentInference.posterior },
    learningRate: state.learningRate,
  }).then((event) => {
    runtimeProfiler.recordWorkerLatency(performance.now() - requestTimestamp);
    engineBusy = false;
    if (event.type === "snapshot") {
      previousSnapshot = latestSnapshot;
      latestSnapshot = event.snapshot;
      lastSnapshotReceivedTimestamp = performance.now();
      runtimeProfiler.recordSnapshot(event.snapshot);
    } else if (event.type === "fault") {
      console.error(`falha do motor (${event.code}): ${event.message}`);
    }
  });
}

function renderFrame(
  snapshot: NeuralSnapshot,
  time: number,
  forcedRotation?: number,
  frameDelta = 0,
  nowTimestamp = performance.now(),
): void {
  const frameStarted = performance.now();
  const rotation = forcedRotation ?? 0.34 + time * state.rotationSpeed * 0.115;
  layers.group.rotation.y = rotation;
  layers.group.rotation.x = 0.035 + Math.sin(time * 0.17) * 0.035;
  layers.group.rotation.z = -0.025 + Math.cos(time * 0.13) * 0.018;
  laminarLayer.group.rotation.y = rotation;
  laminarLayer.group.rotation.x = state.rotationSpeed === 0
    ? -0.06
    : -0.06 + Math.sin(time * 0.12) * 0.025;

  const alpha = Math.min(
    1,
    Math.max(0, (nowTimestamp - lastSnapshotReceivedTimestamp) / (SIMULATION_STEP_SECONDS * 1000)),
  );
  if (activeView === "overview") {
    layers.updateVisibility(state, currentFocusRegion);
    layers.updateInterpolated(snapshot, previousSnapshot, alpha, state.pulseCount);
  } else {
    laminarLayer.update(snapshot, previousSnapshot, alpha);
  }

  if (frameDelta > 0) updateMetrics(snapshot, frameDelta);
  controls.update();
  renderer.info.reset();
  composer.render();
  const memory = (performance as Performance & {
    memory?: { usedJSHeapSize: number };
  }).memory;
  runtimeProfiler.recordFrame(
    performance.now() - frameStarted,
    {
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
    },
    memory?.usedJSHeapSize,
  );
}

function animate(timestamp: number): void {
  requestAnimationFrame(animate);
  if (captureMode) return;
  const frame = simulationClock.observe(timestamp, state.pulseSpeed);
  requestAdvance(frame.targetTick);
  if (latestSnapshot) {
    renderFrame(latestSnapshot, frame.renderTimeSeconds, undefined, frame.frameDeltaSeconds, timestamp);
  }
}

type NumericSetting =
  | "rotationSpeed"
  | "pulseSpeed"
  | "pulseCount"
  | "learningRate"
  | "bloomStrength"
  | "bloomRadius";

function bindRange(
  id: string,
  displayId: string,
  key: NumericSetting,
  format: (value: number) => string,
  onUpdate?: () => void,
): void {
  const input = element<HTMLInputElement>(`#${id}`);
  const display = element<HTMLSpanElement>(`#${displayId}`);
  input.value = String(state[key]);
  display.textContent = format(state[key]);
  input.addEventListener("input", () => {
    state[key] = Number(input.value);
    display.textContent = format(state[key]);
    onUpdate?.();
  });
}

function formatCount(value: number): string {
  if (value < 1000) return String(value);
  return `${(value / 1000).toFixed(1)}K`;
}

function showInference(update: BayesianUpdate): void {
  element("#prior-val").textContent = update.prior.toFixed(2);
  element("#posterior-val").textContent = update.posterior.toFixed(2);
  element("#stimulus-val").textContent = `${Math.round(update.observation * 100)}%`;
}

function setActiveView(view: SimulationView): void {
  activeView = view;
  layers.group.visible = view === "overview";
  laminarLayer.group.visible = view === "laminar";
  element("#overview-panel").hidden = view !== "overview";
  element("#laminar-panel").hidden = view !== "laminar";
  element("#bayesian-hud").hidden = view !== "overview";
  for (const button of document.querySelectorAll<HTMLButtonElement>("[role='tab']")) {
    const selected = button.dataset.view === view;
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
  }
  if (latestSnapshot) {
    renderFrame(latestSnapshot, simulationClock.renderTimeSeconds);
  }
}

function setupInterface(): void {
  element("#node-count").textContent = formatCount(brainData.nodes.length);
  element("#synapse-count").textContent = formatCount(brainData.synapses.length);

  const tabButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>("[role='tab']"),
  );
  for (const button of tabButtons) {
    button.addEventListener("click", () => {
      const view = parseSimulationView(button.dataset.view);
      if (view) setActiveView(view);
    });
    button.addEventListener("keydown", (event) => {
      const currentIndex = tabButtons.indexOf(button);
      let nextIndex: number | undefined;
      if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabButtons.length;
      if (event.key === "ArrowLeft") {
        nextIndex = (currentIndex - 1 + tabButtons.length) % tabButtons.length;
      }
      if (event.key === "Home") nextIndex = 0;
      if (event.key === "End") nextIndex = tabButtons.length - 1;
      if (nextIndex === undefined) return;
      event.preventDefault();
      const nextButton = tabButtons[nextIndex];
      const view = parseSimulationView(nextButton.dataset.view);
      if (!view) return;
      setActiveView(view);
      nextButton.focus();
    });
  }
  element<HTMLSelectElement>("#laminar-lod").addEventListener("change", (event) => {
    const select = event.currentTarget as HTMLSelectElement;
    const lod = parseLaminarLod(select.value);
    if (!lod) {
      select.value = "medium";
      laminarLayer.setLod("medium");
      return;
    }
    laminarLayer.setLod(lod);
  });
  const cadenceSelect = element<HTMLSelectElement>("#snapshot-cadence");
  cadenceSelect.value = String(state.snapshotCadence);
  cadenceSelect.addEventListener("change", () => {
    const cadence = parseSnapshotCadence(cadenceSelect.value);
    if (!cadence) {
      cadenceSelect.value = String(state.snapshotCadence);
      return;
    }
    state.snapshotCadence = cadence;
  });

  bindRange("rotation-speed", "rot-speed-val", "rotationSpeed", (value) => `${value.toFixed(1)}×`);
  bindRange("pulse-speed", "pulse-speed-val", "pulseSpeed", (value) => `${value.toFixed(1)}×`);
  bindRange("pulse-count", "pulse-count-val", "pulseCount", String);
  bindRange("learning-rate", "learning-rate-val", "learningRate", (value) => value.toFixed(3));
  bindRange("bloom-strength", "bloom-strength-val", "bloomStrength", (value) => value.toFixed(1), () => {
    bloomPass.strength = state.bloomStrength;
  });
  bindRange("bloom-radius", "bloom-radius-val", "bloomRadius", (value) => value.toFixed(2), () => {
    bloomPass.radius = state.bloomRadius;
  });

  const focusSelect = document.querySelector<HTMLSelectElement>("#circuit-focus");
  if (focusSelect) {
    focusSelect.addEventListener("change", () => {
      currentFocusRegion = focusSelect.value as BrainRegion | "all";
      layers.updateVisibility(state, currentFocusRegion);
    });
  }

  type VisibilityKey = "showLeftHemi" | "showRightHemi" | "showCerebellum" | "showStem";
  const toggles: Array<[string, VisibilityKey]> = [
    ["toggle-left-hemi", "showLeftHemi"],
    ["toggle-right-hemi", "showRightHemi"],
    ["toggle-cerebellum", "showCerebellum"],
    ["toggle-stem", "showStem"],
  ];
  for (const [id, key] of toggles) {
    const input = element<HTMLInputElement>(`#${id}`);
    input.checked = Boolean(state[key]);
    input.addEventListener("change", () => {
      state[key] = input.checked;
      layers.updateVisibility(state, currentFocusRegion);
    });
  }

  let intensityLevel = Math.round(state.stimulusIntensity * 10);
  const registerObservation = (): void => {
    state.stimulusIntensity = intensityLevel / 10;
    currentInference = belief.observe(state.stimulusIntensity);
    showInference(currentInference);
  };
  element("#btn-intensity-up").addEventListener("click", () => {
    intensityLevel = Math.min(10, intensityLevel + 1);
    registerObservation();
  });
  element("#btn-intensity-down").addEventListener("click", () => {
    intensityLevel = Math.max(0, intensityLevel - 1);
    registerObservation();
  });
  registerObservation();
}

async function resolveRuntime(): Promise<void> {
  const status = element("#runtime-status");
  if (engineReady?.runtime === "rust-wasm") {
    status.textContent = `RUST/WASM · WORKER · ABI V${engineReady.schemaVersion}`;
    return;
  }
  if (engineReady?.degraded) {
    status.textContent = "FALLBACK DIAGNÓSTICO · WASM INDISPONÍVEL";
    return;
  }
  if (!window.__TAURI_INTERNALS__) {
    status.textContent = "RUST/WASM · WORKER · WEBGL";
    return;
  }
  try {
    const info = await invoke<RuntimeInfo>("neural_runtime_info");
    status.textContent =
      `${info.engine} v${info.brainEngineSchema} · ${info.renderer} · ${info.schema}`.toUpperCase();
  } catch {
    status.textContent = "TAURI · RUST · THREE.JS";
  }
}

function onResize(): void {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  drawActivityTrace();
}

async function init(): Promise<void> {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0.18, 0.08, 4.82);

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.info.autoReset = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  element("#canvas-container").appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.045;
  controls.enablePan = false;
  controls.minDistance = 2.8;
  controls.maxDistance = 7;
  controls.target.set(0, -0.05, 0);

  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    state.bloomStrength,
    state.bloomRadius,
    0.12,
  );
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(bloomPass);

  brainData = generateBrainData();
  layers = new BrainRenderLayers(brainData);
  scene.add(layers.group);
  laminarLayer = new LaminarRenderLayer();
  laminarLayer.group.visible = false;
  scene.add(laminarLayer.group);

  worker = new Worker(new URL("./simulation.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (event: MessageEvent<EngineEvent>) => {
    pendingResponses.shift()?.(event.data);
  };
  const readyEvent = await sendCommand({
    type: "initialize",
    topology: brainData,
    fixedStep: SIMULATION_STEP_SECONDS,
    seed: brainData.seed,
  });
  if (readyEvent.type !== "ready") {
    throw new Error(
      readyEvent.type === "fault"
        ? readyEvent.message
        : "O Worker não confirmou a inicialização do motor.",
    );
  }
  engineReady = readyEvent;

  setupInterface();
  layers.updateVisibility(state, currentFocusRegion);
  resolveRuntime();

  window.__BRAIN_ENGINE__ = {
    setView(view) {
      const parsed = parseSimulationView(view);
      if (!parsed) throw new Error("vista desconhecida");
      setActiveView(parsed);
    },
    async setCaptureMode(enabled) {
      captureMode = enabled;
      document.body.dataset.capture = String(enabled);
      if (enabled) {
        await sendCommand({ type: "reset" });
        simulationClock.synchronize(0);
        captureTime = 0;
        const warmup = simulationClock.advanceTicks(120);
        const event = await sendCommand({
          type: "advance",
          targetTick: warmup.targetTick,
          stimulus: { intensity: state.stimulusIntensity, confidence: currentInference.posterior },
          learningRate: state.learningRate,
        });
        if (event.type === "snapshot") {
          latestSnapshot = event.snapshot;
          renderFrame(latestSnapshot, 0);
        }
      } else {
        simulationClock.rebase(performance.now());
      }
    },
    async capture(time, rotation) {
      const delta = Math.max(0, time - captureTime);
      const frame = simulationClock.advanceExact(delta, state.pulseSpeed);
      const event = await sendCommand({
        type: "advance",
        targetTick: frame.targetTick,
        stimulus: { intensity: state.stimulusIntensity, confidence: currentInference.posterior },
        learningRate: state.learningRate,
      });
      if (event.type === "snapshot") latestSnapshot = event.snapshot;
      captureTime = time;
      if (latestSnapshot) renderFrame(latestSnapshot, time, rotation);
    },
    diagnostics() {
      return {
        runtime:
          latestSnapshot?.diagnostics.runtime ??
          engineReady?.runtime ??
          "uninitialized",
        schemaVersion:
          latestSnapshot?.schemaVersion ??
          engineReady?.schemaVersion ??
          0,
        stateHash: latestSnapshot?.diagnostics.stateHash,
        corticothalamicHash:
          latestSnapshot?.diagnostics.corticothalamicHash,
        degraded:
          latestSnapshot?.diagnostics.degraded ??
          engineReady?.degraded ??
          true,
        detail:
          latestSnapshot?.diagnostics.detail ??
          engineReady?.detail,
      };
    },
    async schedule(inputs) {
      const event = await sendCommand({ type: "schedule", inputs });
      if (event.type !== "scheduled") {
        throw new Error(event.type === "fault" ? event.message : "entrada não confirmada");
      }
      return event.accepted;
    },
    profile() {
      return runtimeProfiler.report(state.snapshotCadence);
    },
  };

  window.addEventListener("resize", onResize);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !captureMode) simulationClock.rebase(performance.now());
  });
  const startTimestamp = performance.now();
  simulationClock.reset(0, startTimestamp);
  animate(startTimestamp);
}

window.addEventListener("DOMContentLoaded", init);
