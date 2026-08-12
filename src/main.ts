import * as THREE from "three";
import { invoke } from "@tauri-apps/api/core";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { BrainData, BrainRegion, generateBrainData } from "./brain";
import { FixedStepClock } from "./clock";
import {
  amperesToPicoamperes,
  auditVisualProvenance,
  auditVisualBindings,
  BrainRenderLayers,
  CellRenderLayer,
  decodeStateColor,
  encodeStateColor,
  LaminarRenderLayer,
  mean,
  parseLaminarLod,
  parseSimulationView,
  parseVisualColorMode,
  receptorCurrentTotals,
  auditRenderedStatePixels,
  SelectiveBloomPipeline,
  SynapseRenderLayer,
  VISUAL_COLORS,
  ACTIVITY_TRACE_STOPS,
  voltsToMillivolts,
} from "./render";
import type { SimulationView, VisualColorMode } from "./render";
import { directNeuralStimulus } from "./direct-stimulus";
import { BayesianObservationExperiment } from "./experiment";
import type { BayesianExperimentView } from "./experiment";
import {
  parseSnapshotCadence,
  RuntimeProfiler,
  shouldRequestSnapshot,
} from "./performance-profile";
import type { RuntimeEnvironment, RuntimeProfile } from "./performance-profile";
import {
  CELL_SPIKE_EVENT_BYTES,
  MAX_CELL_SPIKE_EVENTS_PER_SNAPSHOT,
  SIMULATION_STEP_SECONDS,
} from "./protocol";
import type {
  EngineCommand,
  EngineEvent,
  NeuralSnapshot,
  ScheduledEngineInput,
  SimulationTick,
} from "./protocol";
import { BrainSettings, getInitialBrainSettings } from "./schema";
import { snapshotBufferEntries } from "./snapshot-layout";

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
        cellPatchHash?: string;
        chemicalHash?: string;
        cellSpikeEventHash?: string;
        degraded: boolean;
        detail?: string;
      };
      abiEvidence: () => {
        schemaVersion: number;
        buffers: Array<{ name: string; byteLength: number }>;
        hashes: Record<string, string | undefined>;
        cellSpikeEvents: {
          schemaVersion: number;
          count: number;
          bytes: number;
          bytesPerEvent: number;
          maximumEvents: number;
          startTick: number;
          endTick: number;
        };
      };
      snapshotBufferLayout: (snapshot: NeuralSnapshot) => Array<{
        name: string;
        byteLength: number;
      }>;
      profile: () => RuntimeProfile;
      setColorMode: (mode: VisualColorMode) => void;
      visualAudit: () => {
        colorMode: VisualColorMode;
        provenance: ReturnType<typeof auditVisualProvenance>;
        bindings: ReturnType<typeof auditVisualBindings>;
        invertibility: { samples: number; tolerance: number; maximumError: number };
        redundancy: Record<SimulationView, string>;
      };
      renderedStateAudit: () => ReturnType<typeof auditRenderedStatePixels>;
      createAuditWorker: () => Worker;
      createAuditTopology: () => BrainData;
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
const taskExperiment = new BayesianObservationExperiment(0.35);
const simulationClock = new FixedStepClock({
  stepSeconds: SIMULATION_STEP_SECONDS,
  maxInteractiveDeltaSeconds: 0.1,
});
const runtimeProfiler = new RuntimeProfiler();

let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let controls: OrbitControls;
let renderPipeline: SelectiveBloomPipeline;
let layers: BrainRenderLayers;
let laminarLayer: LaminarRenderLayer;
let cellLayer: CellRenderLayer;
let synapseLayer: SynapseRenderLayer;
let brainData: BrainData;
let worker: Worker;
let latestSnapshot: NeuralSnapshot | undefined;
let previousSnapshot: NeuralSnapshot | undefined;
let lastSnapshotReceivedTimestamp = performance.now();
let engineBusy = false;
let currentInference: BayesianExperimentView;
let captureMode = false;
let captureTime = 0;
let metricAccumulator = 0;
let currentFocusRegion: BrainRegion | "all" = "all";
let activeView: SimulationView = "overview";
let engineReady: Extract<EngineEvent, { type: "ready" }> | undefined;
let visualColorMode = parseVisualColorMode(
  new URLSearchParams(window.location.search).get("colorMode"),
);

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
  for (const [offset, color] of ACTIVITY_TRACE_STOPS) {
    gradient.addColorStop(offset, color);
  }
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
  element("#cell-membrane").textContent =
    `${voltsToMillivolts(mean(snapshot.cellPatch.membraneVolts)).toFixed(1)} mV`;
  element("#cell-dendrite").textContent =
    `${voltsToMillivolts(mean(snapshot.cellPatch.dendriteVolts)).toFixed(1)} mV`;
  element("#cell-rate").textContent = `${snapshot.cellPatch.firingRateHz.toFixed(1)} Hz`;
  element("#cell-ei-ratio").textContent = snapshot.cellPatch.excitatoryInhibitoryRatio.toFixed(2);
  element("#adaptation-current").textContent =
    `${amperesToPicoamperes(mean(snapshot.cellPatch.adaptationAmperes)).toFixed(1)} pA`;
  element("#first-spike").textContent = snapshot.cellPatch.firstSpikeSeconds === undefined
    ? "—"
    : `${(snapshot.cellPatch.firstSpikeSeconds * 1_000).toFixed(1)} ms`;
  const currents = receptorCurrentTotals(snapshot);
  for (const [receptor, amperes] of Object.entries(currents)) {
    const picoamperes = amperesToPicoamperes(amperes);
    element(`#${receptor}-current`).textContent =
      `${picoamperes > 0 ? "+" : ""}${picoamperes.toFixed(1)} pA`;
    const meter = element<HTMLMeterElement>(`#${receptor}-meter`);
    meter.value = Math.max(meter.min, Math.min(meter.max, picoamperes));
    meter.dataset.direction = picoamperes > 0.5
      ? "inward"
      : picoamperes < -0.5
        ? "outward"
        : "reversal";
  }
  element("#synapse-glutamate").textContent =
    `${(snapshot.chemical.cleftConcentrationMolesPerCubicMeter[0] ?? 0).toFixed(2)} mol/m³`;
  element("#synapse-gaba").textContent =
    `${(snapshot.chemical.cleftConcentrationMolesPerCubicMeter[1] ?? 0).toFixed(2)} mol/m³`;
  const clearedMoles = (snapshot.chemical.clearedMoles[0] ?? 0) +
    (snapshot.chemical.clearedMoles[1] ?? 0);
  element("#synapse-cleared").textContent = `${(clearedMoles * 1e18).toFixed(2)} amol`;
  element("#vesicle-glutamate").textContent =
    `${Math.round((snapshot.chemical.vesicleAvailableFraction[0] ?? 0) * 100)}%`;
  element("#vesicle-gaba").textContent =
    `${Math.round((snapshot.chemical.vesicleAvailableFraction[1] ?? 0) * 100)}%`;
  for (const [index, receptor] of ["ampa", "nmda", "gabaa", "gabab"].entries()) {
    element(`#synapse-${receptor}-occupancy`).textContent =
      `${((snapshot.chemical.receptorOccupancyFraction[index] ?? 0) * 100).toFixed(1)}%`;
  }

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

  const profile = runtimeProfiler.report(state.snapshotCadence, runtimeEnvironment());
  const latencyElement = document.querySelector("#worker-latency");
  if (latencyElement) latencyElement.textContent = `${profile.workerLatencyMs.p95.toFixed(1)} ms`;
  const drawElement = document.querySelector("#gpu-draw-calls");
  if (drawElement) drawElement.textContent = String(profile.gpu.drawCalls);
  const memoryElement = document.querySelector("#snapshot-memory");
  if (memoryElement) memoryElement.textContent = `${(profile.memory.snapshotBytes / 1024).toFixed(1)} KiB`;

  drawActivityTrace();
}

function runtimeEnvironment(): RuntimeEnvironment {
  const context = renderer.getContext();
  const debugInfo = context.getExtension("WEBGL_debug_renderer_info") as {
    UNMASKED_VENDOR_WEBGL: number;
    UNMASKED_RENDERER_WEBGL: number;
  } | null;
  const navigatorWithHardware = navigator as Navigator & {
    deviceMemory?: number;
    userAgentData?: { platform?: string };
  };
  return {
    browser: {
      userAgent: navigator.userAgent,
      platform: navigatorWithHardware.userAgentData?.platform ?? navigator.platform ?? "unknown",
    },
    hardware: {
      logicalCores: navigator.hardwareConcurrency ?? 0,
      deviceMemoryGiB: navigatorWithHardware.deviceMemory,
      webglVendor: debugInfo
        ? String(context.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL))
        : String(context.getParameter(context.VENDOR)),
      webglRenderer: debugInfo
        ? String(context.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL))
        : String(context.getParameter(context.RENDERER)),
    },
    simulation: {
      runtime: latestSnapshot?.diagnostics.runtime ?? engineReady?.runtime ?? "uninitialized",
      preset: "interactive-default",
      units: brainData.nodes.length,
      synapses: brainData.synapses.length,
      fieldVertices: brainData.corticalField.nodeIndices.length,
      stepSeconds: SIMULATION_STEP_SECONDS,
    },
  };
}

function setVisualColorMode(mode: VisualColorMode): void {
  visualColorMode = parseVisualColorMode(mode);
  document.body.dataset.colorMode = visualColorMode;
  const toggle = document.querySelector<HTMLInputElement>("#color-mode-monochrome");
  if (toggle) toggle.checked = visualColorMode === "monochrome";
}

function visualAuditReport() {
  const bases = [
    new THREE.Color(VISUAL_COLORS.network),
    new THREE.Color(VISUAL_COLORS.excitatory),
    new THREE.Color(VISUAL_COLORS.inhibitory),
    new THREE.Color(VISUAL_COLORS.regionLeftHemi),
    new THREE.Color(VISUAL_COLORS.glutamate),
  ];
  const states = [0, 0.125, 0.5, 0.875, 1];
  let maximumError = 0;
  for (const base of bases) {
    for (const stateValue of states) {
      const recovered = decodeStateColor(encodeStateColor(base, stateValue), base);
      maximumError = Math.max(maximumError, Math.abs(recovered - stateValue));
    }
  }
  return {
    colorMode: visualColorMode,
    provenance: auditVisualProvenance(scene),
    bindings: auditVisualBindings(scene),
    invertibility: { samples: bases.length * states.length, tolerance: 1e-6, maximumError },
    redundancy: {
      overview: "pulsos E/I usam diâmetros distintos e legenda textual",
      laminar: "excitação é cilindro; inibição e TRN são toros",
      cell: "somata E/I usam razões de aspecto opostas",
      electricity: "entrada, saída e shunt ocupam planos de anel distintos",
      synapse: "vesículas, transmissores, receptores e recaptura têm formas e posições distintas",
    },
  };
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
    stimulus: directNeuralStimulus(state.stimulusIntensity),
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
  cellLayer.group.rotation.y = rotation * 0.42;
  cellLayer.group.rotation.x = -0.04 + Math.sin(time * 0.11) * 0.02;
  synapseLayer.group.rotation.y = rotation * 0.34;
  synapseLayer.group.rotation.x = -0.08;

  const alpha = Math.min(
    1,
    Math.max(0, (nowTimestamp - lastSnapshotReceivedTimestamp) / (SIMULATION_STEP_SECONDS * 1000)),
  );
  if (activeView === "overview") {
    layers.updateVisibility(state, currentFocusRegion);
    layers.setDetail(state.pulseCount);
    layers.update({ current: snapshot, previous: previousSnapshot, alpha });
  } else if (activeView === "laminar") {
    laminarLayer.update({ current: snapshot, previous: previousSnapshot, alpha });
  } else if (activeView === "synapse") {
    synapseLayer.update({ current: snapshot, previous: previousSnapshot, alpha });
  } else {
    cellLayer.update({ current: snapshot, previous: previousSnapshot, alpha });
  }

  if (frameDelta > 0) updateMetrics(snapshot, frameDelta);
  controls.update();
  renderer.info.reset();
  renderPipeline.render();
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

function showInference(update: BayesianExperimentView): void {
  element("#prior-val").textContent = update.prior.toFixed(2);
  element("#posterior-val").textContent = update.posterior.toFixed(2);
  element("#stimulus-val").textContent = `${Math.round(update.observation * 100)}%`;
}

function setActiveView(view: SimulationView): void {
  activeView = view;
  layers.setVisible(view === "overview");
  laminarLayer.setVisible(view === "laminar");
  cellLayer.setVisible(view === "cell" || view === "electricity");
  synapseLayer.setVisible(view === "synapse");
  if (view === "cell" || view === "electricity") cellLayer.setMode(view);
  element("#overview-panel").hidden = view !== "overview";
  element("#laminar-panel").hidden = view !== "laminar";
  element("#cell-panel").hidden = view !== "cell";
  element("#electricity-panel").hidden = view !== "electricity";
  element("#synapse-panel").hidden = view !== "synapse";
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
  const monochromeToggle = element<HTMLInputElement>("#color-mode-monochrome");
  monochromeToggle.checked = visualColorMode === "monochrome";
  monochromeToggle.addEventListener("change", () => {
    setVisualColorMode(monochromeToggle.checked ? "monochrome" : "color");
  });

  bindRange("rotation-speed", "rot-speed-val", "rotationSpeed", (value) => `${value.toFixed(1)}×`);
  bindRange("pulse-speed", "pulse-speed-val", "pulseSpeed", (value) => `${value.toFixed(1)}×`);
  bindRange("pulse-count", "pulse-count-val", "pulseCount", String);
  bindRange("learning-rate", "learning-rate-val", "learningRate", (value) => value.toFixed(3));
  bindRange("bloom-strength", "bloom-strength-val", "bloomStrength", (value) => value.toFixed(1), () => {
    renderPipeline.bloomPass.strength = state.bloomStrength;
  });
  bindRange("bloom-radius", "bloom-radius-val", "bloomRadius", (value) => value.toFixed(2), () => {
    renderPipeline.bloomPass.radius = state.bloomRadius;
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
    currentInference = taskExperiment.observe(state.stimulusIntensity);
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
  renderPipeline.setSize(window.innerWidth, window.innerHeight);
  drawActivityTrace();
}

async function init(): Promise<void> {
  setVisualColorMode(visualColorMode);
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
  renderer.setClearColor(VISUAL_COLORS.transparentBlack, 0);
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

  renderPipeline = new SelectiveBloomPipeline(
    renderer,
    scene,
    camera,
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    state.bloomStrength,
    state.bloomRadius,
  );

  brainData = generateBrainData();
  const renderContext = { scene, camera, renderer };
  const renderTopology = { brain: brainData };
  layers = new BrainRenderLayers(brainData);
  layers.mount(renderContext, renderTopology);
  laminarLayer = new LaminarRenderLayer();
  laminarLayer.setVisible(false);
  laminarLayer.mount(renderContext, renderTopology);
  cellLayer = new CellRenderLayer();
  cellLayer.setVisible(false);
  cellLayer.mount(renderContext, renderTopology);
  synapseLayer = new SynapseRenderLayer();
  synapseLayer.setVisible(false);
  synapseLayer.mount(renderContext, renderTopology);

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
          stimulus: directNeuralStimulus(state.stimulusIntensity),
          learningRate: state.learningRate,
        });
        if (event.type === "snapshot") {
          previousSnapshot = undefined;
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
        stimulus: directNeuralStimulus(state.stimulusIntensity),
        learningRate: state.learningRate,
      });
      if (event.type === "snapshot") {
        previousSnapshot = latestSnapshot;
        latestSnapshot = event.snapshot;
      }
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
        cellPatchHash: latestSnapshot?.diagnostics.cellPatchHash,
        chemicalHash: latestSnapshot?.diagnostics.chemicalHash,
        cellSpikeEventHash: latestSnapshot?.diagnostics.cellSpikeEventHash,
        degraded:
          latestSnapshot?.diagnostics.degraded ??
          engineReady?.degraded ??
          true,
        detail:
          latestSnapshot?.diagnostics.detail ??
          engineReady?.detail,
      };
    },
    abiEvidence() {
      if (!latestSnapshot) throw new Error("snapshot indisponível para auditoria da ABI");
      return {
        schemaVersion: latestSnapshot.schemaVersion,
        buffers: snapshotBufferEntries(latestSnapshot).map(({ name, view }) => ({
          name,
          byteLength: view.byteLength,
        })),
        hashes: {
          network: latestSnapshot.diagnostics.stateHash,
          corticothalamic: latestSnapshot.diagnostics.corticothalamicHash,
          cell: latestSnapshot.diagnostics.cellPatchHash,
          chemical: latestSnapshot.diagnostics.chemicalHash,
          cellSpikes: latestSnapshot.diagnostics.cellSpikeEventHash,
        },
        cellSpikeEvents: {
          schemaVersion: latestSnapshot.cellSpikeEvents.schemaVersion,
          count: latestSnapshot.cellSpikeEvents.cellIds.length,
          bytes:
            latestSnapshot.cellSpikeEvents.cellIds.byteLength +
            latestSnapshot.cellSpikeEvents.timeOffsetsSeconds.byteLength,
          bytesPerEvent: CELL_SPIKE_EVENT_BYTES,
          maximumEvents: MAX_CELL_SPIKE_EVENTS_PER_SNAPSHOT,
          startTick: latestSnapshot.cellSpikeEvents.startTick,
          endTick: latestSnapshot.cellSpikeEvents.endTick,
        },
      };
    },
    snapshotBufferLayout(snapshot) {
      return snapshotBufferEntries(snapshot).map(({ name, view }) => ({
        name,
        byteLength: view.byteLength,
      }));
    },
    async schedule(inputs) {
      const event = await sendCommand({ type: "schedule", inputs });
      if (event.type !== "scheduled") {
        throw new Error(event.type === "fault" ? event.message : "entrada não confirmada");
      }
      return event.accepted;
    },
    profile() {
      return runtimeProfiler.report(state.snapshotCadence, runtimeEnvironment());
    },
    setColorMode(mode) {
      setVisualColorMode(mode);
      if (latestSnapshot) renderFrame(latestSnapshot, simulationClock.renderTimeSeconds);
    },
    visualAudit() {
      return visualAuditReport();
    },
    renderedStateAudit() {
      return auditRenderedStatePixels(renderer);
    },
    createAuditWorker() {
      return new Worker(new URL("./simulation.worker.ts", import.meta.url), { type: "module" });
    },
    createAuditTopology() {
      return generateBrainData({
        seed: 0x51a7c0de,
        surfaceNodesPerHemisphere: 48,
        innerNodesPerHemisphere: 8,
      });
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
