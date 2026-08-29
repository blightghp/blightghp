import * as THREE from "three";
import { invoke } from "@tauri-apps/api/core";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  ANATOMY_IDS,
  AnatomyExplorerController,
  auditAnatomicalCatalog,
  searchAnatomy as searchAnatomicalCatalog,
} from "./anatomy";
import type {
  AnatomicalCatalogEntry,
  AnatomySelectionOrigin,
} from "./anatomy";
import { BrainData, BrainRegion, generateBrainData } from "./brain";
import { FixedStepClock } from "./clock";
import {
  amperesToPicoamperes,
  auditAnatomicalScene,
  auditVisualMaterialReadiness,
  auditVisualProvenance,
  auditVisualBindings,
  BrainRenderLayers,
  CellRenderLayer,
  ClippingSystem,
  decodeStateColor,
  ElectricalBoardLayer,
  electricalBoardObservables,
  electricalBoardTopologyObservables,
  encodeStateColor,
  LaminarRenderLayer,
  mean,
  NEURON_CELL_COUNT,
  NeuronRenderLayer,
  neuronCellObservables,
  parseElectricalBoardDetail,
  parseCellId,
  parseCutOrientation,
  parseLaminarLod,
  parseRenderProfile,
  parseSimulationView,
  parseVisualColorMode,
  pickAnatomicalEntry,
  PresentationBudgetMonitor,
  PresentationResourceCache,
  receptorCurrentTotals,
  RenderProfileGovernor,
  ToneMappingController,
  failClosedForWebGlShaderCompilation,
  auditRenderedStatePixels,
  SelectiveBloomPipeline,
  PresentationMaterialEffects,
  REALISTIC_ILLUSTRATIVE_MANIFEST,
  RealisticIllustrativeMaterialManager,
  sampleMacroscopicCutProbe,
  SynapseRenderLayer,
  VISUAL_COLORS,
  ACTIVITY_TRACE_STOPS,
  ambientOcclusionDecision,
  freezeStaticPresentationMatrices,
  voltsToMillivolts,
} from "./render";
import type {
  CutOrientation,
  CutPlaneState,
  MaterialProfileAudit,
  PresentationBudgetAudit,
  RenderProfile,
  SimulationView,
  ToneMappingMode,
  VisualColorMode,
  VisualMaterialProfile,
} from "./render";
import type { ElectricalBoardTopologyObservables } from "./render";
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
import {
  VASCULAR_REALISTIC_ILLUSTRATIVE_MANIFEST,
  VascularTopologyModule,
  vascularTopologyDetailsFor,
} from "./vascular";
import {
  DEFAULT_USAGE_MODE,
  isUsageModeControlVisible,
  parseUsageMode,
  USAGE_MODE_DEFINITIONS,
} from "./usage-mode";
import type { UsageMode } from "./usage-mode";
import {
  assertCommandPaletteCommands,
  filterCommandPaletteCommands,
  moveCommandPaletteSelection,
} from "./command-palette";
import type { CommandPaletteCommand } from "./command-palette";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
    __BRAIN_ENGINE__?: {
      capture: (time: number, rotation: number) => Promise<void>;
      setCaptureMode: (enabled: boolean) => Promise<void>;
      setCameraRotation: (rotation: number) => void;
      resetCameraForCut: () => void;
      setSelectedCell: (cellId: number) => void;
      setAnatomySelection: (entryId: string) => string;
      searchAnatomy: (query: string) => readonly AnatomicalCatalogEntry[];
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
      setMaterialProfile: (profile: VisualMaterialProfile) => VisualMaterialProfile;
      setRenderProfile: (profile: RenderProfile) => RenderProfile;
      setToneMapping: (mode: ToneMappingMode, exposure?: number) => ToneMappingMode;
      toneMappingAudit: () => ReturnType<ToneMappingController["audit"]>;
      resetPresentationBudgetSamples: () => void;
      setClipping: (state: Partial<CutPlaneState>) => CutPlaneState;
      setPresentationEffects: (state: {
        opacity?: number;
        xray?: boolean;
        isolateMatter?: boolean;
        isolateVascular?: boolean;
      }) => void;
      setVascularSkeleton: (enabled: boolean) => boolean;
      setHighContrast: (enabled: boolean) => VisualMaterialProfile;
      visualAudit: () => {
        colorMode: VisualColorMode;
        provenance: ReturnType<typeof auditVisualProvenance>;
        bindings: ReturnType<typeof auditVisualBindings>;
        invertibility: { samples: number; tolerance: number; maximumError: number };
        redundancy: Record<SimulationView, string>;
      };
      materialProfileAudit: () => ReturnType<typeof materialProfileAuditReport>;
      anatomyCatalogAudit: () => ReturnType<typeof anatomyCatalogAuditReport>;
      vascularAudit: () => ReturnType<VascularTopologyModule["audit"]>;
      surfaceAudit: () => ReturnType<BrainRenderLayers["surfaceAudit"]>;
      presentationAudit: () => {
        material: MaterialProfileAudit;
        surface: ReturnType<BrainRenderLayers["surfaceAudit"]>;
        clipping: ReturnType<ClippingSystem["audit"]>;
        effects: ReturnType<PresentationMaterialEffects["audit"]>;
        effectsCache: ReturnType<PresentationMaterialEffects["cacheAudit"]>;
        clippingCache: ReturnType<ClippingSystem["cacheAudit"]>;
        bloom: ReturnType<SelectiveBloomPipeline["audit"]>;
        budget: PresentationBudgetAudit;
        frozenStaticMatrices: number;
        probe: ReturnType<typeof sampleMacroscopicCutProbe>;
        renderer: {
          drawCalls: number;
          triangles: number;
          geometries: number;
          textures: number;
        };
        toneMapping: ReturnType<ToneMappingController["audit"]>;
      };
      renderedStateAudit: () => ReturnType<typeof auditRenderedStatePixels>;
      electricalBoardAudit: () => {
        detail: ReturnType<ElectricalBoardLayer["audit"]>["detail"];
        cost: ReturnType<ElectricalBoardLayer["audit"]>["cost"];
        topology: ElectricalBoardTopologyObservables;
      };
      neuronAudit: () => ReturnType<NeuronRenderLayer["audit"]>;
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

interface ApplicationCommand extends CommandPaletteCommand {
  readonly execute: () => string;
}

const state: BrainSettings = getInitialBrainSettings();
const taskExperiment = new BayesianObservationExperiment(0.35);
const simulationClock = new FixedStepClock({
  stepSeconds: SIMULATION_STEP_SECONDS,
  maxInteractiveDeltaSeconds: 0.1,
});
const runtimeProfiler = new RuntimeProfiler();
const renderProfileGovernor = new RenderProfileGovernor();
const presentationBudgetMonitor = new PresentationBudgetMonitor();
const presentationResourceCache = new PresentationResourceCache();

let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let controls: OrbitControls;
let renderPipeline: SelectiveBloomPipeline;
let toneMappingController: ToneMappingController;
let clippingSystem: ClippingSystem;
let materialProfileManager: RealisticIllustrativeMaterialManager;
let presentationEffects: PresentationMaterialEffects;
let anatomyExplorer: AnatomyExplorerController | undefined;
let layers: BrainRenderLayers;
let laminarLayer: LaminarRenderLayer;
let cellLayer: CellRenderLayer;
let electricalBoardLayer: ElectricalBoardLayer;
let neuronLayer: NeuronRenderLayer;
let synapseLayer: SynapseRenderLayer;
let vascularModule: VascularTopologyModule;
let brainData: BrainData;
let electricalTopology: ElectricalBoardTopologyObservables;
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
let usageMode: UsageMode = parseUsageMode(
  new URLSearchParams(window.location.search).get("usageMode"),
) ?? DEFAULT_USAGE_MODE;
let commandPaletteOpen = false;
let commandPaletteReturnFocus: HTMLElement | undefined;
let commandPaletteCommands: readonly ApplicationCommand[] = [];
let commandPaletteResults: readonly ApplicationCommand[] = [];
let commandPaletteSelectedIndex = -1;
let selectedCellId = 0;
let selectionReturnFocus: HTMLElement | undefined;
let engineReady: Extract<EngineEvent, { type: "ready" }> | undefined;
let visualColorMode = parseVisualColorMode(
  new URLSearchParams(window.location.search).get("colorMode"),
);
const initialToneMappingRequest = new URLSearchParams(window.location.search).get("toneMapping") ??
  "agx";
let lastCutProbe: ReturnType<typeof sampleMacroscopicCutProbe> = {
  available: false,
  field: "field.waveActivity",
  unit: "normalized field activity",
  interpolation: "linear between adjacent published snapshots",
  sampling: "mean on the cut-face band",
  sampleCount: 0,
  reason: "clipping is not initialized",
};
let applicationDisposed = false;
let webGlShaderCompilationFailed = false;
let webGlAmbientOcclusionSafe = true;
let sceneGraphRevision = 0;
let frozenStaticMatrixCount = 0;
let materialEnvironmentTextureBytes = 0;

const pendingResponses: Array<(event: EngineEvent) => void> = [];
const activitySamples = Array.from({ length: 96 }, () => 0);
const cellRaycaster = new THREE.Raycaster();
const pointerCoordinates = new THREE.Vector2();
const CUT_CAP_OBJECTS: Readonly<Record<SimulationView, readonly string[]>> = {
  overview: ["leftHemi-shell", "rightHemi-shell", "cerebellum-shell", "stem-shell"],
  laminar: ["thalamic-relay", "thalamic-reticular-nucleus"],
  cell: ["adex-somata", "field-boundary"],
  neuron: ["resolved-neuron-soma"],
  electricity: ["electrical-board-surface"],
  synapse: ["presynaptic-bouton", "postsynaptic-membrane"],
};
const CUT_MILLIMETERS_PER_PROCEDURAL_UNIT = 40;

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

function signedPicoamperes(amperes: number): string {
  const value = amperesToPicoamperes(amperes);
  return `${value > 0 ? "+" : ""}${value.toFixed(1)} pA`;
}

function updateNeuronMetrics(snapshot: NeuralSnapshot): void {
  const observable = neuronCellObservables(snapshot, selectedCellId);
  const soma = `${voltsToMillivolts(observable.somaVolts).toFixed(1)} mV`;
  const proximal = `${voltsToMillivolts(observable.dendriteProximalVolts).toFixed(1)} mV`;
  const distal = `${voltsToMillivolts(observable.dendriteDistalVolts).toFixed(1)} mV`;
  element("#neuron-soma").textContent = soma;
  element("#neuron-proximal").textContent = proximal;
  element("#neuron-distal").textContent = distal;
  element("#neuron-soma-table").textContent = soma;
  element("#neuron-proximal-table").textContent = proximal;
  element("#neuron-distal-table").textContent = distal;
  element("#neuron-attenuation").textContent =
    `${voltsToMillivolts(
      observable.dendriteProximalVolts - observable.dendriteDistalVolts,
    ).toFixed(1)} mV`;
  element("#neuron-adaptation").textContent = signedPicoamperes(
    observable.adaptationAmperes,
  );
  element("#neuron-kind").textContent = observable.kind === "excitatory"
    ? "E · excitatória"
    : "I · inibitória";
  element("#neuron-ampa").textContent = signedPicoamperes(observable.ampaAmperes);
  element("#neuron-nmda").textContent = signedPicoamperes(observable.nmdaAmperes);
  element("#neuron-gabaa").textContent = signedPicoamperes(observable.gabaaAmperes);
  element("#neuron-gabab").textContent = signedPicoamperes(observable.gababAmperes);
  element("#neuron-events").textContent = observable.stampedEventOffsetsSeconds.length === 1
    ? "1 evento"
    : `${observable.stampedEventOffsetsSeconds.length} eventos`;
  element("#neuron-event-window").textContent =
    observable.stampedEventOffsetsSeconds.length === 0
      ? "—"
      : observable.stampedEventOffsetsSeconds
        .slice(-3)
        .map((offset) => `${(offset * 1_000).toFixed(2)} ms`)
        .join(" · ");
  element("#neuron-geometry-hash").textContent = neuronLayer.selection().geometryHash;
}

function updateMetrics(snapshot: NeuralSnapshot, delta: number, alpha: number): void {
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
  element("#cell-proximal").textContent =
    `${voltsToMillivolts(mean(snapshot.cellPatch.dendriteProximalVolts)).toFixed(1)} mV`;
  element("#cell-distal").textContent =
    `${voltsToMillivolts(mean(snapshot.cellPatch.dendriteDistalVolts)).toFixed(1)} mV`;
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
  const electrical = electricalBoardObservables(snapshot);
  element("#board-voltage").textContent =
    `${voltsToMillivolts(electrical.meanMembraneVolts).toFixed(1)} mV`;
  element("#board-net-current").textContent = signedPicoamperes(
    electrical.netCurrentAmperes,
  );
  element("#board-conductance").textContent =
    `${(electrical.effectiveConductanceSiemens * 1e9).toFixed(3)} nS`;
  element("#board-excitation").textContent = signedPicoamperes(
    electrical.excitatoryCurrentAmperes,
  );
  element("#board-inhibition").textContent = signedPicoamperes(
    electrical.inhibitoryCurrentAmperes,
  );
  element("#board-proximal").textContent =
    `${voltsToMillivolts(electrical.meanProximalVolts).toFixed(1)} mV`;
  element("#board-distal").textContent =
    `${voltsToMillivolts(electrical.meanDistalVolts).toFixed(1)} mV`;
  element("#board-attenuation").textContent =
    `${voltsToMillivolts(electrical.meanProximalDistalDeltaVolts).toFixed(1)} mV`;
  element("#board-shunt").textContent =
    `${electrical.shuntingCells} / ${snapshot.cellPatch.membraneVolts.length} células`;
  element("#board-events").textContent = electrical.eventCount === 0
    ? "0 eventos"
    : `${electrical.eventCount} · ${(
        (electrical.firstEventOffsetSeconds ?? 0) * 1_000
      ).toFixed(2)}–${(
        (electrical.lastEventOffsetSeconds ?? 0) * 1_000
      ).toFixed(2)} ms`;
  element("#board-delay").textContent =
    `${(electricalTopology.meanDelaySeconds * 1_000).toFixed(2)} ms`;
  element("#board-gain").textContent = electricalTopology.meanAbsoluteGain.toFixed(3);
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
  updateNeuronMetrics(snapshot);

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
  updatePresentationCostUi();
  updateRenderProfileUi();
  updateCutProbe(snapshot, alpha);
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
      neuron:
        "soma E/I muda de forma; soma/proximal/distal têm luminância e rótulos textuais independentes",
      electricity: "setas preservam sentido; nós E/I usam círculo/quadrado e shunt usa anel",
      synapse: "vesículas, transmissores, receptores e recaptura têm formas e posições distintas",
    },
  };
}

function materialProfileAuditReport() {
  const reportFor = (view: SimulationView, root: THREE.Object3D) => ({
    ...auditVisualMaterialReadiness(root),
    manifest: materialManifestForView(view),
    material: materialProfileManager.audit(view),
  });
  return {
    overview: reportFor("overview", layers.group),
    laminar: reportFor("laminar", laminarLayer.group),
    cell: reportFor("cell", cellLayer.group),
    neuron: reportFor("neuron", neuronLayer.group),
    electricity: reportFor("electricity", electricalBoardLayer.group),
    synapse: reportFor("synapse", synapseLayer.group),
  };
}

function materialManifestForView(view: SimulationView) {
  return [
    ...REALISTIC_ILLUSTRATIVE_MANIFEST[view],
    ...VASCULAR_REALISTIC_ILLUSTRATIVE_MANIFEST[view],
  ];
}

function anatomyCatalogAuditReport() {
  return {
    catalog: auditAnatomicalCatalog(),
    explorer: anatomyExplorer?.audit(),
    views: {
      overview: auditAnatomicalScene(layers.group),
      laminar: auditAnatomicalScene(laminarLayer.group),
      cell: auditAnatomicalScene(cellLayer.group),
      neuron: auditAnatomicalScene(neuronLayer.group),
      electricity: auditAnatomicalScene(electricalBoardLayer.group),
      synapse: auditAnatomicalScene(synapseLayer.group),
    },
  };
}

function updateMaterialProfileUi(profile: VisualMaterialProfile): void {
  const select = document.querySelector<HTMLSelectElement>("#material-profile");
  if (select) select.value = profile;
  document.body.dataset.materialProfile = profile;
  const status = document.querySelector<HTMLElement>("#material-profile-status");
  if (status) {
    status.textContent = profile === "realistic-illustrative" ? "Realista" : "Esquemática";
  }
}

function updateRenderProfileUi(): void {
  const governor = renderProfileGovernor.audit();
  document.body.dataset.renderProfile = governor.profile;
  const select = document.querySelector<HTMLSelectElement>("#render-profile");
  if (select) select.value = governor.profile;
  const status = document.querySelector<HTMLElement>("#render-profile-status");
  if (status) {
    status.textContent = governor.reason
      ? `BASELINE · LIMITE EXCEDIDO`
      : governor.profile.toUpperCase();
  }
  const recovery = document.querySelector<HTMLButtonElement>("#recover-render-profile");
  if (recovery) {
    recovery.disabled = governor.profile === "enhanced" || !governor.recoveryAvailable;
    recovery.textContent = governor.recoveryAvailable
      ? "RECUPERAR ENHANCED"
      : `RECUPERAÇÃO · ${governor.recoveryFrames}/90`;
  }
}

function applyRenderProfile(profile: RenderProfile, resetSamples = true): void {
  const maximumPixelRatio = profile === "baseline" ? 1 : 2;
  const pixelRatio = Math.min(window.devicePixelRatio, maximumPixelRatio);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderPipeline.setPixelRatio(pixelRatio);
  renderPipeline.setSize(window.innerWidth, window.innerHeight);
  layers?.setSurfaceLod(profile === "baseline" ? "low" : "high");
  presentationResourceCache.invalidate();
  if (resetSamples) presentationBudgetMonitor.reset();
  synchronizeAmbientOcclusion();
  updateRenderProfileUi();
}

function requestRenderProfile(profile: RenderProfile): RenderProfile {
  const parsed = parseRenderProfile(profile);
  if (!parsed) throw new Error("perfil de renderização desconhecido");
  const audit = renderProfileGovernor.request(parsed, captureMode);
  applyRenderProfile(audit.profile);
  if (latestSnapshot) renderFrame(latestSnapshot, simulationClock.renderTimeSeconds);
  return audit.profile;
}

function presentationBudgetAuditReport(): PresentationBudgetAudit {
  return presentationBudgetMonitor.audit(
    renderProfileGovernor.profile(),
    renderProfileGovernor.audit(),
  );
}

function updatePresentationCostUi(): void {
  const target = document.querySelector<HTMLElement>("#gpu-presentation-delta");
  if (!target || !clippingSystem || !materialProfileManager) return;
  const clipping = clippingSystem.audit();
  const material = materialProfileManager.audit(activeView);
  target.textContent = `+${clipping.estimatedAdditionalDrawCalls} corte · ` +
    `+${material.estimatedAdditionalObjectDraws} dupla face · ` +
    `${material.bakedSurfaceShaderObjects} superfície assada · ` +
    (material.estimatedTransmissionPasses > 0
      ? `+${material.estimatedTransmissionPasses} refração`
      : "sem refração");
}

function renderRootForView(view: SimulationView): THREE.Group {
  if (view === "overview") return layers.group;
  if (view === "laminar") return laminarLayer.group;
  if (view === "cell") return cellLayer.group;
  if (view === "neuron") return neuronLayer.group;
  if (view === "electricity") return electricalBoardLayer.group;
  return synapseLayer.group;
}

function setMaterialProfile(profile: VisualMaterialProfile): VisualMaterialProfile {
  const active = materialProfileManager.setProfile(profile);
  materialEnvironmentTextureBytes = materialProfileManager.audit()
    .estimatedEnvironmentTextureBytes;
  presentationResourceCache.invalidate();
  clippingSystem.refresh();
  synchronizeAmbientOcclusion();
  updateMaterialProfileUi(active);
  updatePresentationCostUi();
  if (latestSnapshot) renderFrame(latestSnapshot, simulationClock.renderTimeSeconds);
  return active;
}

function setToneMapping(mode: ToneMappingMode, exposure?: number): ToneMappingMode {
  const active = toneMappingController.setRequested(mode, exposure);
  if (latestSnapshot) renderFrame(latestSnapshot, simulationClock.renderTimeSeconds);
  return active;
}

function updateToneMappingSafetyFallback(): void {
  if (webGlShaderCompilationFailed) {
    toneMappingController?.setSafetyFallback("webgl-shader-compilation-failure");
    return;
  }
  const highContrast = document.body.dataset.highContrast === "true";
  toneMappingController?.setSafetyFallback(highContrast ? "high-contrast" : undefined);
}

function synchronizeAmbientOcclusion(): void {
  if (!renderPipeline || !materialProfileManager || !clippingSystem) return;
  renderPipeline.setAmbientOcclusion(ambientOcclusionDecision({
    renderProfile: renderProfileGovernor.profile(),
    activeView,
    materialProfile: materialProfileManager.profile(),
    clippingEnabled: clippingSystem.getState().enabled,
    highContrast: document.body.dataset.highContrast === "true",
    webglSafe: webGlAmbientOcclusionSafe && !webGlShaderCompilationFailed,
  }));
}

function updateCutProbe(snapshot: NeuralSnapshot, alpha: number): void {
  layers.group.updateWorldMatrix(true, false);
  const worldPlane = clippingSystem.primaryPlane();
  const localPlane = worldPlane?.applyMatrix4(
    layers.group.matrixWorld.clone().invert(),
  );
  lastCutProbe = sampleMacroscopicCutProbe(
    activeView,
    brainData,
    snapshot.field?.waveActivity,
    previousSnapshot?.field?.waveActivity,
    alpha,
    localPlane,
  );
  const value = document.querySelector<HTMLElement>("#cut-probe-value");
  const unit = document.querySelector<HTMLElement>("#cut-probe-unit");
  const sampling = document.querySelector<HTMLElement>("#cut-probe-sampling");
  if (value) {
    value.textContent = lastCutProbe.available && lastCutProbe.value !== undefined
      ? `${lastCutProbe.value.toFixed(4)} · n=${lastCutProbe.sampleCount}`
      : lastCutProbe.reason ?? "indisponível";
  }
  if (unit) unit.textContent = lastCutProbe.unit;
  if (sampling) sampling.textContent = lastCutProbe.sampling;
}

function resetCameraForCut(): void {
  const state = clippingSystem.getState();
  camera.up.set(0, 1, 0);
  if (state.orientation === "sagittal") camera.position.set(4.82, 0.08, 0.01);
  else if (state.orientation === "axial") {
    camera.position.set(0.01, 4.82, 0.01);
    camera.up.set(0, 0, -1);
  } else if (state.orientation === "oblique") camera.position.set(3.45, 2.6, 3.45);
  else camera.position.set(0.18, 0.08, 4.82);
  controls.target.set(0, -0.05, 0);
  camera.lookAt(controls.target);
  controls.update();
}

function updatePresentationUi(state: CutPlaneState): void {
  const panel = document.querySelector<HTMLElement>("#presentation-panel");
  if (panel) {
    panel.dataset.oblique = String(state.orientation === "oblique");
    panel.dataset.slab = String(state.slab);
  }
  const orientation = document.querySelector<HTMLSelectElement>("#cut-orientation");
  if (orientation) orientation.value = state.enabled ? state.orientation : "none";
  const slab = document.querySelector<HTMLInputElement>("#cut-slab");
  if (slab) slab.checked = state.slab;
  const position = document.querySelector<HTMLInputElement>("#cut-position");
  const thickness = document.querySelector<HTMLInputElement>("#cut-thickness");
  const azimuth = document.querySelector<HTMLInputElement>("#cut-azimuth");
  const elevation = document.querySelector<HTMLInputElement>("#cut-elevation");
  if (position) position.value = String(state.position);
  if (thickness) thickness.value = String(state.slabThickness);
  if (azimuth) azimuth.value = String(state.obliqueAzimuthDegrees);
  if (elevation) elevation.value = String(state.obliqueElevationDegrees);
  if (position) {
    position.setAttribute("aria-valuenow", String(state.position));
    position.setAttribute(
      "aria-valuetext",
      `${(state.position * CUT_MILLIMETERS_PER_PROCEDURAL_UNIT).toFixed(1)} milímetros orientativos`,
    );
  }
  if (thickness) {
    thickness.disabled = !state.slab;
    thickness.setAttribute("aria-valuenow", String(state.slabThickness));
    thickness.setAttribute(
      "aria-valuetext",
      `${(state.slabThickness * CUT_MILLIMETERS_PER_PROCEDURAL_UNIT).toFixed(1)} milímetros orientativos`,
    );
  }
  if (azimuth) {
    azimuth.disabled = state.orientation !== "oblique";
    azimuth.setAttribute("aria-valuenow", String(state.obliqueAzimuthDegrees));
  }
  if (elevation) {
    elevation.disabled = state.orientation !== "oblique";
    elevation.setAttribute("aria-valuenow", String(state.obliqueElevationDegrees));
  }
  const positionValue = document.querySelector<HTMLOutputElement>("#cut-position-val");
  const thicknessValue = document.querySelector<HTMLOutputElement>("#cut-thickness-val");
  const azimuthValue = document.querySelector<HTMLOutputElement>("#cut-azimuth-val");
  const elevationValue = document.querySelector<HTMLOutputElement>("#cut-elevation-val");
  if (positionValue) {
    positionValue.textContent =
      `${(state.position * CUT_MILLIMETERS_PER_PROCEDURAL_UNIT).toFixed(1)} mm`;
  }
  if (thicknessValue) {
    thicknessValue.textContent =
      `${(state.slabThickness * CUT_MILLIMETERS_PER_PROCEDURAL_UNIT).toFixed(1)} mm`;
  }
  if (azimuthValue) azimuthValue.textContent = `${state.obliqueAzimuthDegrees.toFixed(0)}°`;
  if (elevationValue) elevationValue.textContent = `${state.obliqueElevationDegrees.toFixed(0)}°`;
  updatePresentationCostUi();
}

function setCutPlaneState(update: Partial<CutPlaneState>): CutPlaneState {
  const state = clippingSystem.setState(update);
  sceneGraphRevision += 1;
  renderPipeline.invalidateSceneGraph();
  synchronizeAmbientOcclusion();
  updatePresentationUi(state);
  if (latestSnapshot) {
    const alpha = Math.min(
      1,
      Math.max(
        0,
        (performance.now() - lastSnapshotReceivedTimestamp) /
          (SIMULATION_STEP_SECONDS * 1000),
      ),
    );
    updateCutProbe(latestSnapshot, alpha);
  }
  if (latestSnapshot) renderFrame(latestSnapshot, simulationClock.renderTimeSeconds);
  return state;
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
  electricalBoardLayer.group.rotation.set(0, 0, 0);
  neuronLayer.group.rotation.y = rotation * 0.12;
  neuronLayer.group.rotation.x = -0.04;
  synapseLayer.group.rotation.y = rotation * 0.34;
  synapseLayer.group.rotation.x = -0.08;

  const alpha = Math.min(
    1,
    Math.max(0, (nowTimestamp - lastSnapshotReceivedTimestamp) / (SIMULATION_STEP_SECONDS * 1000)),
  );
  if (activeView === "overview") {
    layers.setDetail(state.pulseCount);
    layers.update({ current: snapshot, previous: previousSnapshot, alpha });
  } else if (activeView === "laminar") {
    laminarLayer.update({ current: snapshot, previous: previousSnapshot, alpha });
  } else if (activeView === "electricity") {
    electricalBoardLayer.update({ current: snapshot, previous: previousSnapshot, alpha });
  } else if (activeView === "neuron") {
    neuronLayer.update({ current: snapshot, previous: previousSnapshot, alpha });
  } else if (activeView === "synapse") {
    synapseLayer.update({ current: snapshot, previous: previousSnapshot, alpha });
  } else {
    cellLayer.update({ current: snapshot, previous: previousSnapshot, alpha });
  }

  materialProfileManager.sync();
  scene.updateMatrixWorld(true);
  clippingSystem.update();
  if (frameDelta > 0) updateMetrics(snapshot, frameDelta, alpha);
  controls.update();
  renderer.info.reset();
  presentationEffects.beforeRender(renderRootForView(activeView), sceneGraphRevision);
  try {
    renderPipeline.render({
      bloomEnabled: renderProfileGovernor.profile() !== "baseline",
      sceneRevision: sceneGraphRevision,
    });
  } finally {
    presentationEffects.afterRender();
  }
  const memory = (performance as Performance & {
    memory?: { usedJSHeapSize: number };
  }).memory;
  const frameMilliseconds = performance.now() - frameStarted;
  runtimeProfiler.recordFrame(
    frameMilliseconds,
    {
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
    },
    memory?.usedJSHeapSize,
  );
  const resources = presentationResourceCache.measure(activeView);
  const pipeline = renderPipeline.audit();
  const sample = {
    view: activeView,
    frameMilliseconds,
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    geometryBytes: resources.geometryBytes,
    textureBytes:
      resources.textureBytes +
      materialEnvironmentTextureBytes +
      pipeline.estimatedOwnedTextureBytes,
  };
  presentationBudgetMonitor.record(sample);
  const previousRenderProfile = renderProfileGovernor.profile();
  const governor = renderProfileGovernor.observe(sample);
  if (governor.profile !== previousRenderProfile) applyRenderProfile(governor.profile);
}

function animate(timestamp: number): void {
  if (applicationDisposed) return;
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
  input.setAttribute("role", "slider");
  const accessibleName = document.querySelector<HTMLElement>(`label[for="${id}"] span`)
    ?.textContent;
  input.setAttribute("aria-label", accessibleName ?? id);
  input.setAttribute("aria-valuenow", String(state[key]));
  input.setAttribute("aria-valuetext", format(state[key]));
  input.addEventListener("input", () => {
    state[key] = Number(input.value);
    display.textContent = format(state[key]);
    input.setAttribute("aria-valuenow", String(state[key]));
    input.setAttribute("aria-valuetext", format(state[key]));
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

function selectCell(cellId: number): void {
  const parsed = parseCellId(cellId);
  if (parsed === undefined) throw new Error("célula fora do patch de 12 células");
  selectedCellId = parsed;
  cellLayer.setSelectedCell(parsed);
  neuronLayer.setSelectedCell(parsed);
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-cell-id]")) {
    const selected = Number(button.dataset.cellId) === parsed;
    button.setAttribute("aria-pressed", String(selected));
  }
  const humanIndex = String(parsed + 1).padStart(2, "0");
  element("#tab-neuron").textContent = `NEURÔNIO · ${humanIndex}`;
  element("#neuron-title-index").textContent = humanIndex;
  element("#cell-selection-status").textContent =
    `Célula ${humanIndex} selecionada. Pressione Enter para ampliar.`;
  if (latestSnapshot) {
    updateNeuronMetrics(latestSnapshot);
    renderFrame(latestSnapshot, simulationClock.renderTimeSeconds);
  }
}

function overviewRegionForAnatomy(entryId: string): BrainRegion | "all" | undefined {
  if (entryId === ANATOMY_IDS.leftHemisphere) return "leftHemi";
  if (entryId === ANATOMY_IDS.rightHemisphere) return "rightHemi";
  if (entryId === ANATOMY_IDS.cerebellum) return "cerebellum";
  if (entryId === ANATOMY_IDS.brainstem) return "stem";
  if (
    entryId === ANATOMY_IDS.encephalon ||
    entryId === ANATOMY_IDS.cerebrum ||
    entryId === ANATOMY_IDS.neocortex
  ) return "all";
  return undefined;
}

function applyAnatomySelection(
  entry: AnatomicalCatalogEntry,
  _origin: AnatomySelectionOrigin,
): void {
  if (!entry.views.includes(activeView)) setActiveView(entry.views[0]);
  const overviewRegion = overviewRegionForAnatomy(entry.id);
  if (overviewRegion !== undefined) {
    currentFocusRegion = overviewRegion;
    const focus = document.querySelector<HTMLSelectElement>("#circuit-focus");
    if (focus) focus.value = overviewRegion;
    layers.updateVisibility(state, currentFocusRegion);
  }
  const vascular = vascularTopologyDetailsFor(entry.id);
  const topology = document.querySelector<HTMLElement>("#vascular-selection-details");
  if (topology) {
    topology.hidden = !vascular;
    if (vascular) {
      element("#vascular-selected-class").textContent = vascular.class;
      element("#vascular-selected-order").textContent = String(vascular.branchOrder);
      element("#vascular-selected-side").textContent = vascular.side;
      element("#vascular-selected-upstream").textContent =
        vascular.upstreamIds.join(", ") || "origem do domínio";
      element("#vascular-selected-downstream").textContent =
        vascular.downstreamIds.join(", ") || "sumidouro do domínio";
      element("#vascular-selected-views").textContent = vascular.views.join(", ");
    }
  }
  if (latestSnapshot) renderFrame(latestSnapshot, simulationClock.renderTimeSeconds);
}

function enterNeuron(cellId: number, returnFocus?: HTMLElement): void {
  selectionReturnFocus = returnFocus;
  selectCell(cellId);
  setActiveView("neuron");
  requestAnimationFrame(() => element<HTMLButtonElement>("#neuron-back").focus());
}

function leaveNeuron(): void {
  if (activeView !== "neuron") return;
  setActiveView("cell");
  const target = selectionReturnFocus ??
    document.querySelector<HTMLElement>(`[data-cell-id="${selectedCellId}"]`) ??
    element<HTMLElement>("#tab-cell");
  selectionReturnFocus = undefined;
  requestAnimationFrame(() => target.focus());
}

function setActiveView(view: SimulationView): void {
  activeView = view;
  layers.setVisible(view === "overview");
  laminarLayer.setVisible(view === "laminar");
  cellLayer.setVisible(view === "cell");
  neuronLayer.setVisible(view === "neuron");
  electricalBoardLayer.setVisible(view === "electricity");
  synapseLayer.setVisible(view === "synapse");
  clippingSystem.setActiveLayer(view);
  synchronizeAmbientOcclusion();
  element("#overview-panel").hidden = view !== "overview";
  element("#laminar-panel").hidden = view !== "laminar";
  element("#cell-panel").hidden = view !== "cell";
  element("#neuron-panel").hidden = view !== "neuron";
  element("#electricity-panel").hidden = view !== "electricity";
  element("#synapse-panel").hidden = view !== "synapse";
  element("#bayesian-hud").hidden = view !== "overview";
  for (const button of document.querySelectorAll<HTMLButtonElement>("[role='tab']")) {
    const selected = button.dataset.view === view;
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
  }
  anatomyExplorer?.setActiveView(view);
  if (latestSnapshot) {
    renderFrame(latestSnapshot, simulationClock.renderTimeSeconds);
  }
}

function setUsageMode(requested: UsageMode | string): UsageMode {
  const nextMode = parseUsageMode(requested) ?? usageMode;
  const focused = document.activeElement;
  usageMode = nextMode;
  document.body.dataset.usageMode = nextMode;

  const selector = element<HTMLSelectElement>("#usage-mode");
  selector.value = nextMode;
  element("#usage-mode-status").textContent = USAGE_MODE_DEFINITIONS[nextMode].summary;

  for (const control of document.querySelectorAll<HTMLElement>("[data-usage-mode-minimum]")) {
    const minimumMode = parseUsageMode(control.dataset.usageModeMinimum);
    control.hidden = minimumMode === undefined ||
      !isUsageModeControlVisible(nextMode, minimumMode);
  }

  if (
    focused instanceof HTMLElement &&
    focused.closest("[data-usage-mode-minimum][hidden]")
  ) {
    selector.focus();
  }

  return nextMode;
}

function setupUsageModeInterface(): void {
  const selector = element<HTMLSelectElement>("#usage-mode");
  selector.addEventListener("change", () => {
    const requested = parseUsageMode(selector.value);
    if (!requested) {
      selector.value = usageMode;
      return;
    }
    setUsageMode(requested);
  });
  setUsageMode(usageMode);
}

const COMMAND_VIEW_LABELS: Readonly<Record<SimulationView, string>> = {
  overview: "Visão geral",
  laminar: "Lâminas",
  cell: "Célula",
  neuron: "Neurônio",
  electricity: "Eletricidade",
  synapse: "Sinapse",
};

function revealExplorerPanel(selector: string): void {
  const panel = element<HTMLDetailsElement>(selector);
  panel.open = true;
}

function executePaletteView(view: SimulationView): string {
  setActiveView(view);
  element<HTMLButtonElement>(`#tab-${view}`).focus();
  return `Vista alterada para ${COMMAND_VIEW_LABELS[view]}.`;
}

function executePaletteCut(orientation: CutOrientation): string {
  revealExplorerPanel("#presentation-effects-panel");
  setCutPlaneState({ enabled: true, orientation });
  element<HTMLSelectElement>("#cut-orientation").focus();
  return `Corte ${orientation} ativado.`;
}

function createCommandPaletteCommands(): readonly ApplicationCommand[] {
  const viewCommands: ApplicationCommand[] = (
    Object.entries(COMMAND_VIEW_LABELS) as Array<[SimulationView, string]>
  ).map(([view, label]) => ({
    id: `view-${view}`,
    label: `Abrir ${label}`,
    category: "Vistas",
    keywords: [view, label, "navegação"],
    minimumMode: "guided",
    execute: () => executePaletteView(view),
  }));

  return [
    ...viewCommands,
    {
      id: "mode-guided",
      label: "Usar modo Guiado",
      category: "Modos",
      keywords: ["essencial", "inicial", "modo"],
      minimumMode: "guided",
      execute: () => {
        setUsageMode("guided");
        element<HTMLSelectElement>("#usage-mode").focus();
        return "Modo Guiado ativado.";
      },
    },
    {
      id: "mode-explorer",
      label: "Usar modo Explorador",
      category: "Modos",
      keywords: ["busca", "corte", "comparação", "modo"],
      minimumMode: "guided",
      execute: () => {
        setUsageMode("explorer");
        element<HTMLSelectElement>("#usage-mode").focus();
        return "Modo Explorador ativado.";
      },
    },
    {
      id: "mode-laboratory",
      label: "Usar modo Laboratório",
      category: "Modos",
      keywords: ["avançado", "parâmetros", "envelope", "modo"],
      minimumMode: "guided",
      execute: () => {
        setUsageMode("laboratory");
        element<HTMLSelectElement>("#usage-mode").focus();
        return "Modo Laboratório ativado.";
      },
    },
    {
      id: "render-profile-baseline",
      label: "Usar perfil gráfico Baseline",
      category: "Perfis",
      keywords: ["render", "econômico", "qualidade"],
      minimumMode: "guided",
      execute: () => {
        const active = requestRenderProfile("baseline");
        element<HTMLSelectElement>("#render-profile").focus();
        return `Perfil gráfico ${active} ativado.`;
      },
    },
    {
      id: "render-profile-enhanced",
      label: "Usar perfil gráfico Enhanced",
      category: "Perfis",
      keywords: ["render", "interativo", "qualidade"],
      minimumMode: "guided",
      execute: () => {
        const active = requestRenderProfile("enhanced");
        element<HTMLSelectElement>("#render-profile").focus();
        return `Perfil gráfico ${active} ativado.`;
      },
    },
    {
      id: "anatomy-search",
      label: "Buscar estrutura anatômica",
      category: "Anatomia",
      keywords: ["catálogo", "cérebro", "breadcrumb", "busca"],
      minimumMode: "explorer",
      execute: () => {
        revealExplorerPanel("#anatomy-explorer");
        element<HTMLInputElement>("#anatomy-search").focus();
        return "Busca anatômica pronta para consulta.";
      },
    },
    {
      id: "material-profile-schematic",
      label: "Usar materialidade Esquemática",
      category: "Perfis",
      keywords: ["material", "fallback", "apresentação"],
      minimumMode: "explorer",
      execute: () => {
        revealExplorerPanel("#presentation-effects-panel");
        const active = setMaterialProfile("schematic");
        element<HTMLSelectElement>("#material-profile").focus();
        return `Materialidade ${active === "schematic" ? "Esquemática" : "Realista"} ativada.`;
      },
    },
    {
      id: "material-profile-realistic",
      label: "Usar materialidade Realista-ilustrativa",
      category: "Perfis",
      keywords: ["material", "realista", "ilustrativa", "apresentação"],
      minimumMode: "explorer",
      execute: () => {
        revealExplorerPanel("#presentation-effects-panel");
        const active = setMaterialProfile("realistic-illustrative");
        element<HTMLSelectElement>("#material-profile").focus();
        return `Materialidade ${active === "realistic-illustrative" ? "Realista-ilustrativa" : "Esquemática"} ativada.`;
      },
    },
    {
      id: "cut-disable",
      label: "Desativar corte",
      category: "Corte",
      keywords: ["plano", "clipping", "seção"],
      minimumMode: "explorer",
      execute: () => {
        revealExplorerPanel("#presentation-effects-panel");
        setCutPlaneState({ enabled: false });
        element<HTMLSelectElement>("#cut-orientation").focus();
        return "Corte desativado.";
      },
    },
    ...(["coronal", "sagittal", "axial", "oblique"] as const).map((orientation) => ({
      id: `cut-${orientation}`,
      label: `Ativar corte ${orientation}`,
      category: "Corte",
      keywords: ["plano", "clipping", "seção", orientation],
      minimumMode: "explorer" as const,
      execute: () => executePaletteCut(orientation),
    })),
    {
      id: "camera-reset-cut",
      label: "Restaurar câmera do corte",
      category: "Câmera",
      keywords: ["enquadramento", "reset", "corte"],
      minimumMode: "explorer",
      execute: () => {
        revealExplorerPanel("#presentation-effects-panel");
        resetCameraForCut();
        element<HTMLButtonElement>("#reset-cut-camera").focus();
        return "Câmera do corte restaurada.";
      },
    },
  ];
}

function commandPaletteDialog(): HTMLDialogElement {
  return element<HTMLDialogElement>("#command-palette");
}

function announceCommandPalette(message: string): void {
  element("#command-palette-announcement").textContent = message;
}

function renderCommandPaletteResults(): void {
  const input = element<HTMLInputElement>("#command-palette-input");
  const results = element<HTMLUListElement>("#command-palette-results");
  const status = element("#command-palette-status");
  commandPaletteResults = filterCommandPaletteCommands(
    commandPaletteCommands,
    input.value,
    usageMode,
  );
  if (commandPaletteResults.length === 0) {
    commandPaletteSelectedIndex = -1;
  } else if (commandPaletteSelectedIndex < 0 ||
    commandPaletteSelectedIndex >= commandPaletteResults.length) {
    commandPaletteSelectedIndex = 0;
  }

  results.replaceChildren();
  if (commandPaletteResults.length === 0) {
    const empty = document.createElement("li");
    empty.className = "command-palette-empty";
    empty.textContent = "Nenhum comando disponível para esta busca e modo.";
    results.appendChild(empty);
    input.removeAttribute("aria-activedescendant");
    status.textContent = "Nenhum comando disponível.";
    return;
  }

  for (const [index, command] of commandPaletteResults.entries()) {
    const option = document.createElement("li");
    option.id = `command-palette-option-${command.id}`;
    option.dataset.commandId = command.id;
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", String(index === commandPaletteSelectedIndex));
    const label = document.createElement("span");
    label.textContent = command.label;
    const category = document.createElement("span");
    category.className = "command-palette-category";
    category.textContent = command.category;
    option.append(label, category);
    results.appendChild(option);
  }

  const selected = commandPaletteResults[commandPaletteSelectedIndex];
  input.setAttribute("aria-activedescendant", `command-palette-option-${selected.id}`);
  status.textContent = commandPaletteResults.length === 1
    ? "1 comando disponível."
    : `${commandPaletteResults.length} comandos disponíveis.`;
}

function closeCommandPalette(restoreFocus = true): void {
  if (!commandPaletteOpen) return;
  const dialog = commandPaletteDialog();
  const input = element<HTMLInputElement>("#command-palette-input");
  commandPaletteOpen = false;
  input.setAttribute("aria-expanded", "false");
  input.removeAttribute("aria-activedescendant");
  commandPaletteResults = [];
  commandPaletteSelectedIndex = -1;
  if (dialog.open) dialog.close();

  const returnFocus = commandPaletteReturnFocus;
  commandPaletteReturnFocus = undefined;
  if (!restoreFocus) return;
  if (returnFocus && document.contains(returnFocus) && !returnFocus.closest("[hidden]")) {
    returnFocus.focus();
  } else {
    element<HTMLButtonElement>("#open-command-palette").focus();
  }
}

function openCommandPalette(): void {
  if (captureMode || commandPaletteOpen) return;
  const dialog = commandPaletteDialog();
  const input = element<HTMLInputElement>("#command-palette-input");
  commandPaletteReturnFocus = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : undefined;
  commandPaletteOpen = true;
  commandPaletteSelectedIndex = 0;
  input.value = "";
  dialog.showModal();
  input.setAttribute("aria-expanded", "true");
  renderCommandPaletteResults();
  input.focus();
  announceCommandPalette("Paleta de comandos aberta.");
}

function executeCommandPaletteSelection(): void {
  const command = commandPaletteResults[commandPaletteSelectedIndex];
  if (!command) return;
  if (!isUsageModeControlVisible(usageMode, command.minimumMode)) {
    commandPaletteSelectedIndex = 0;
    renderCommandPaletteResults();
    announceCommandPalette("Comando indisponível no modo de uso atual.");
    return;
  }

  closeCommandPalette(false);
  try {
    announceCommandPalette(`Comando executado: ${command.execute()}`);
  } catch (error) {
    element<HTMLButtonElement>("#open-command-palette").focus();
    announceCommandPalette(
      `Não foi possível executar o comando: ${error instanceof Error ? error.message : "erro seguro"}.`,
    );
  }
}

function setupCommandPaletteInterface(): void {
  commandPaletteCommands = createCommandPaletteCommands();
  assertCommandPaletteCommands(commandPaletteCommands);

  const dialog = commandPaletteDialog();
  const input = element<HTMLInputElement>("#command-palette-input");
  const close = element<HTMLButtonElement>("#command-palette-close");
  const results = element<HTMLUListElement>("#command-palette-results");
  element<HTMLButtonElement>("#open-command-palette").addEventListener("click", openCommandPalette);
  close.addEventListener("click", () => closeCommandPalette());
  input.addEventListener("input", () => {
    commandPaletteSelectedIndex = 0;
    renderCommandPaletteResults();
  });
  results.addEventListener("click", (event) => {
    const option = (event.target as HTMLElement).closest<HTMLElement>("[data-command-id]");
    if (!option) return;
    const index = commandPaletteResults.findIndex((command) => command.id === option.dataset.commandId);
    if (index < 0) return;
    commandPaletteSelectedIndex = index;
    executeCommandPaletteSelection();
  });
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeCommandPalette();
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeCommandPalette();
  });
  document.addEventListener("keydown", (event) => {
    const keyboardShortcut = (event.ctrlKey || event.metaKey) && !event.altKey &&
      event.code === "KeyK";
    if (keyboardShortcut) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (commandPaletteOpen) closeCommandPalette();
      else openCommandPalette();
      return;
    }
    if (!commandPaletteOpen) return;

    const closeButton = element<HTMLButtonElement>("#command-palette-close");
    if (event.key === "Escape") {
      closeCommandPalette();
    } else if (event.key === "ArrowDown") {
      commandPaletteSelectedIndex = moveCommandPaletteSelection(
        commandPaletteSelectedIndex,
        1,
        commandPaletteResults.length,
      );
      renderCommandPaletteResults();
    } else if (event.key === "ArrowUp") {
      commandPaletteSelectedIndex = moveCommandPaletteSelection(
        commandPaletteSelectedIndex,
        -1,
        commandPaletteResults.length,
      );
      renderCommandPaletteResults();
    } else if (event.key === "Home") {
      commandPaletteSelectedIndex = commandPaletteResults.length > 0 ? 0 : -1;
      renderCommandPaletteResults();
    } else if (event.key === "End") {
      commandPaletteSelectedIndex = commandPaletteResults.length - 1;
      renderCommandPaletteResults();
    } else if (event.key === "Enter" && document.activeElement !== closeButton) {
      executeCommandPaletteSelection();
    } else if (
      (event.key === "Enter" || event.key === " ") && document.activeElement === closeButton
    ) {
      closeCommandPalette();
    } else if (event.key === "Tab") {
      const current = document.activeElement;
      if (event.shiftKey || current === closeButton) input.focus();
      else closeButton.focus();
    } else {
      event.stopImmediatePropagation();
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
}

function setupInterface(): void {
  element("#node-count").textContent = formatCount(brainData.nodes.length);
  element("#synapse-count").textContent = formatCount(brainData.synapses.length);
  setupUsageModeInterface();
  setupCommandPaletteInterface();

  anatomyExplorer = new AnatomyExplorerController({
    search: element<HTMLInputElement>("#anatomy-search"),
    resultCount: element("#anatomy-result-count"),
    results: element<HTMLUListElement>("#anatomy-results"),
    breadcrumb: element("#anatomy-breadcrumb"),
    title: element("#anatomy-selected-title"),
    stableId: element("#anatomy-selected-id"),
    laterality: element("#anatomy-selected-laterality"),
    evidence: element("#anatomy-selected-evidence"),
    source: element("#anatomy-selected-source"),
    license: element("#anatomy-selected-license"),
    transform: element("#anatomy-selected-transform"),
    limitation: element("#anatomy-selected-limitation"),
    status: element("#anatomy-selection-status"),
    reset: element<HTMLButtonElement>("#anatomy-reset"),
  }, applyAnatomySelection);
  anatomyExplorer.setActiveView(activeView);

  const cellSelector = element<HTMLDivElement>("#cell-selector");
  for (let cellId = 0; cellId < NEURON_CELL_COUNT; cellId += 1) {
    const button = document.createElement("button");
    const humanIndex = String(cellId + 1).padStart(2, "0");
    button.type = "button";
    button.id = `cell-select-${cellId}`;
    button.dataset.cellId = String(cellId);
    button.textContent = humanIndex;
    button.setAttribute("aria-label", `Selecionar célula ${humanIndex}`);
    button.setAttribute("aria-pressed", String(cellId === selectedCellId));
    button.addEventListener("focus", () => selectCell(cellId));
    button.addEventListener("click", () => enterNeuron(cellId, button));
    button.addEventListener("keydown", (event) => {
      if (event.key !== "Tab") return;
      const nextCellId = cellId + (event.shiftKey ? -1 : 1);
      if (nextCellId < 0 || nextCellId >= NEURON_CELL_COUNT) return;
      event.preventDefault();
      element<HTMLButtonElement>(`#cell-select-${nextCellId}`).focus();
    });
    cellSelector.appendChild(button);
  }
  element<HTMLButtonElement>("#neuron-back").addEventListener("click", leaveNeuron);
  document.addEventListener("keydown", (event) => {
    if (commandPaletteOpen || event.key !== "Escape" || activeView !== "neuron") return;
    event.preventDefault();
    leaveNeuron();
  });

  let pointerStart: { x: number; y: number } | undefined;
  renderer.domElement.addEventListener("pointerdown", (event) => {
    if (event.button === 0) {
      pointerStart = { x: event.clientX, y: event.clientY };
    }
  });
  renderer.domElement.addEventListener("pointerup", (event) => {
    if (!pointerStart || event.button !== 0) return;
    const moved = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
    pointerStart = undefined;
    if (moved > 5) return;
    const bounds = renderer.domElement.getBoundingClientRect();
    pointerCoordinates.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    cellRaycaster.setFromCamera(pointerCoordinates, camera);
    if (activeView === "cell") {
      const cellId = cellLayer.pickCell(cellRaycaster);
      if (cellId !== undefined) {
        enterNeuron(cellId, element("#tab-cell"));
        return;
      }
    }
    const entry = vascularModule.pick(activeView, cellRaycaster) ??
      pickAnatomicalEntry(renderRootForView(activeView), cellRaycaster);
    if (entry) anatomyExplorer?.select(entry.id, "scene");
  });

  const tabButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>("[role='tab']"),
  );
  for (const button of tabButtons) {
    button.addEventListener("click", () => {
      const view = parseSimulationView(button.dataset.view);
      if (!view) return;
      if (view === "neuron") selectionReturnFocus = button;
      setActiveView(view);
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
      if (view === "neuron") selectionReturnFocus = nextButton;
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
  const electricalDetail = element<HTMLSelectElement>("#electrical-detail");
  electricalDetail.addEventListener("change", () => {
    const detail = parseElectricalBoardDetail(electricalDetail.value);
    if (!detail) {
      electricalDetail.value = "cellular";
      electricalBoardLayer.setBoardDetail("cellular");
      return;
    }
    electricalBoardLayer.setBoardDetail(detail);
    if (latestSnapshot && activeView === "electricity") {
      renderFrame(latestSnapshot, simulationClock.renderTimeSeconds);
    }
  });
  const monochromeToggle = element<HTMLInputElement>("#color-mode-monochrome");
  monochromeToggle.checked = visualColorMode === "monochrome";
  monochromeToggle.addEventListener("change", () => {
    setVisualColorMode(monochromeToggle.checked ? "monochrome" : "color");
  });

  const materialSelect = element<HTMLSelectElement>("#material-profile");
  materialSelect.value = materialProfileManager.profile();
  updateMaterialProfileUi(materialProfileManager.profile());
  materialSelect.addEventListener("change", () => {
    const requested: VisualMaterialProfile = materialSelect.value === "realistic-illustrative"
      ? "realistic-illustrative"
      : "schematic";
    setMaterialProfile(requested);
  });

  const renderProfileSelect = element<HTMLSelectElement>("#render-profile");
  renderProfileSelect.value = renderProfileGovernor.profile();
  renderProfileSelect.addEventListener("change", () => {
    const requested = parseRenderProfile(renderProfileSelect.value);
    if (!requested) {
      updateRenderProfileUi();
      return;
    }
    try {
      requestRenderProfile(requested);
    } catch (error) {
      updateRenderProfileUi();
      const status = element<HTMLElement>("#render-profile-status");
      status.textContent = error instanceof Error ? error.message : "perfil indisponível";
    }
  });
  element<HTMLButtonElement>("#recover-render-profile").addEventListener("click", () => {
    try {
      requestRenderProfile("enhanced");
    } catch (error) {
      const status = element<HTMLElement>("#render-profile-status");
      status.textContent = error instanceof Error ? error.message : "recuperação indisponível";
    }
  });
  updateRenderProfileUi();

  const orientationSelect = element<HTMLSelectElement>("#cut-orientation");
  orientationSelect.addEventListener("change", () => {
    const orientation = parseCutOrientation(orientationSelect.value);
    if (!orientation) {
      setCutPlaneState({ enabled: false });
      return;
    }
    setCutPlaneState({ enabled: true, orientation });
  });
  const slabToggle = element<HTMLInputElement>("#cut-slab");
  slabToggle.addEventListener("change", () => setCutPlaneState({ slab: slabToggle.checked }));
  const bindCutRange = (
    id: string,
    update: (value: number) => Partial<CutPlaneState>,
  ): void => {
    const input = element<HTMLInputElement>(`#${id}`);
    input.addEventListener("input", () => setCutPlaneState(update(Number(input.value))));
  };
  bindCutRange("cut-position", (position) => ({ position }));
  bindCutRange("cut-thickness", (slabThickness) => ({ slabThickness }));
  bindCutRange("cut-azimuth", (obliqueAzimuthDegrees) => ({ obliqueAzimuthDegrees }));
  bindCutRange("cut-elevation", (obliqueElevationDegrees) => ({ obliqueElevationDegrees }));

  const xrayToggle = element<HTMLInputElement>("#presentation-xray");
  const isolationToggle = element<HTMLInputElement>("#presentation-isolate");
  const vascularToggle = element<HTMLInputElement>("#vascular-skeleton-mode");
  const opacityInput = element<HTMLInputElement>("#presentation-opacity");
  const opacityOutput = element<HTMLOutputElement>("#presentation-opacity-val");
  const applyEffects = (): void => {
    const opacity = Number(opacityInput.value);
    presentationEffects.setState({
      opacity,
      xray: xrayToggle.checked,
      isolateMatter: isolationToggle.checked,
      isolateVascular: vascularToggle.checked,
    });
    vascularModule.setSkeletonMode(vascularToggle.checked);
    document.body.dataset.vascularSkeleton = String(vascularToggle.checked);
    opacityOutput.textContent = `${Math.round(opacity * 100)}%`;
    opacityInput.setAttribute("aria-valuenow", String(opacity));
    opacityInput.setAttribute("aria-valuetext", `${Math.round(opacity * 100)} por cento`);
    if (latestSnapshot) renderFrame(latestSnapshot, simulationClock.renderTimeSeconds);
  };
  xrayToggle.addEventListener("change", applyEffects);
  isolationToggle.addEventListener("change", applyEffects);
  vascularToggle.addEventListener("change", applyEffects);
  opacityInput.addEventListener("input", applyEffects);

  const highContrastToggle = element<HTMLInputElement>("#high-contrast-mode");
  const prefersHighContrast = window.matchMedia?.("(prefers-contrast: more)").matches ?? false;
  highContrastToggle.checked = prefersHighContrast;
  document.body.dataset.highContrast = String(prefersHighContrast);
  updateToneMappingSafetyFallback();
  materialProfileManager.setEnvironment({ highContrast: prefersHighContrast });
  materialEnvironmentTextureBytes = materialProfileManager.audit()
    .estimatedEnvironmentTextureBytes;
  presentationResourceCache.invalidate();
  updateMaterialProfileUi(materialProfileManager.profile());
  highContrastToggle.addEventListener("change", () => {
    document.body.dataset.highContrast = String(highContrastToggle.checked);
    updateToneMappingSafetyFallback();
    materialProfileManager.setEnvironment({ highContrast: highContrastToggle.checked });
    materialEnvironmentTextureBytes = materialProfileManager.audit()
      .estimatedEnvironmentTextureBytes;
    presentationResourceCache.invalidate();
    clippingSystem.refresh();
    updateMaterialProfileUi(materialProfileManager.profile());
    if (latestSnapshot) renderFrame(latestSnapshot, simulationClock.renderTimeSeconds);
  });
  element<HTMLButtonElement>("#reset-cut-camera").addEventListener("click", resetCameraForCut);
  updatePresentationUi(clippingSystem.getState());

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    if (commandPaletteOpen || target instanceof HTMLInputElement || target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement) return;
    if (!isUsageModeControlVisible(usageMode, "explorer")) return;
    const order = ["coronal", "sagittal", "axial", "oblique"] as const;
    if (event.code === "KeyC") {
      const state = clippingSystem.getState();
      const index = order.indexOf(state.orientation);
      setCutPlaneState({ enabled: true, orientation: order[(index + 1) % order.length] });
    } else if (event.code === "BracketLeft" || event.code === "BracketRight") {
      const state = clippingSystem.getState();
      const direction = event.code === "BracketLeft" ? -1 : 1;
      setCutPlaneState({ enabled: true, position: state.position + direction * 0.04 });
    } else if (event.code === "KeyX") {
      xrayToggle.checked = !xrayToggle.checked;
      applyEffects();
    } else if (event.code === "KeyI") {
      isolationToggle.checked = !isolationToggle.checked;
      applyEffects();
    } else if (event.code === "KeyV") {
      vascularToggle.checked = !vascularToggle.checked;
      applyEffects();
    } else if (event.code === "KeyR") {
      resetCameraForCut();
    } else {
      return;
    }
    event.preventDefault();
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
  selectCell(selectedCellId);
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

function onWebGlContextLost(event: Event): void {
  event.preventDefault();
  webGlAmbientOcclusionSafe = false;
  toneMappingController?.setSafetyFallback("webgl-context-lost");
  materialProfileManager?.failAtomic("webgl-context-lost");
  clippingSystem?.disable();
  synchronizeAmbientOcclusion();
  updateMaterialProfileUi("schematic");
}

function onWebGlContextRestored(): void {
  webGlAmbientOcclusionSafe = !webGlShaderCompilationFailed;
  updateToneMappingSafetyFallback();
  materialProfileManager?.setEnvironment({ contextAvailable: true });
  clippingSystem?.refresh();
  synchronizeAmbientOcclusion();
}

function onWebGlShaderError(): void {
  webGlShaderCompilationFailed = true;
  webGlAmbientOcclusionSafe = false;
  console.error("falha de compilação WebGL; perfil realista revertido atomicamente");
  failClosedForWebGlShaderCompilation({
    toneMapping: toneMappingController,
    materialProfile: materialProfileManager,
    clipping: clippingSystem,
  });
  synchronizeAmbientOcclusion();
  if (clippingSystem) updatePresentationUi(clippingSystem.getState());
  if (materialProfileManager) updateMaterialProfileUi(materialProfileManager.profile());
}

function disposeApplication(): void {
  if (applicationDisposed) return;
  applicationDisposed = true;
  worker?.terminate();
  anatomyExplorer?.dispose();
  anatomyExplorer = undefined;
  clippingSystem?.dispose();
  materialProfileManager?.dispose();
  vascularModule?.dispose();
  renderPipeline?.dispose();
  controls?.dispose();
  layers?.dispose();
  laminarLayer?.dispose();
  cellLayer?.dispose();
  neuronLayer?.dispose();
  electricalBoardLayer?.dispose();
  synapseLayer?.dispose();
  renderer?.domElement.removeEventListener("webglcontextlost", onWebGlContextLost);
  renderer?.domElement.removeEventListener("webglcontextrestored", onWebGlContextRestored);
  if (renderer) renderer.debug.onShaderError = null;
  renderer?.dispose();
}

async function init(): Promise<void> {
  setVisualColorMode(visualColorMode);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0.18, 0.08, 4.82);

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    stencil: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(VISUAL_COLORS.transparentBlack, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.info.autoReset = false;
  toneMappingController = new ToneMappingController(renderer, "agx");
  toneMappingController.setRequested(initialToneMappingRequest);
  renderer.debug.onShaderError = onWebGlShaderError;
  element("#canvas-container").appendChild(renderer.domElement);
  renderer.domElement.addEventListener("webglcontextlost", onWebGlContextLost, false);
  renderer.domElement.addEventListener("webglcontextrestored", onWebGlContextRestored, false);

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
  electricalTopology = electricalBoardTopologyObservables(brainData);
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
  neuronLayer = new NeuronRenderLayer(brainData.seed);
  neuronLayer.setVisible(false);
  neuronLayer.mount(renderContext, renderTopology);
  electricalBoardLayer = new ElectricalBoardLayer();
  electricalBoardLayer.setVisible(false);
  electricalBoardLayer.mount(renderContext, renderTopology);
  synapseLayer = new SynapseRenderLayer();
  synapseLayer.setVisible(false);
  synapseLayer.mount(renderContext, renderTopology);

  vascularModule = new VascularTopologyModule();
  vascularModule.attach("overview", layers.group);
  vascularModule.attach("laminar", laminarLayer.group);
  vascularModule.attach("cell", cellLayer.group);
  vascularModule.attach("neuron", neuronLayer.group);
  vascularModule.attach("electricity", electricalBoardLayer.group);
  vascularModule.attach("synapse", synapseLayer.group);

  materialProfileManager = new RealisticIllustrativeMaterialManager(scene, { renderer });
  if (webGlShaderCompilationFailed) {
    materialProfileManager.failAtomic("webgl-shader-compilation-failure");
  }
  materialProfileManager.registerLayer(
    "overview",
    layers.group,
    materialManifestForView("overview"),
  );
  materialProfileManager.registerLayer(
    "laminar",
    laminarLayer.group,
    materialManifestForView("laminar"),
  );
  materialProfileManager.registerLayer(
    "cell",
    cellLayer.group,
    materialManifestForView("cell"),
  );
  materialProfileManager.registerLayer(
    "neuron",
    neuronLayer.group,
    materialManifestForView("neuron"),
  );
  materialProfileManager.registerLayer(
    "electricity",
    electricalBoardLayer.group,
    materialManifestForView("electricity"),
  );
  materialProfileManager.registerLayer(
    "synapse",
    synapseLayer.group,
    materialManifestForView("synapse"),
  );
  materialProfileManager.setProfile("realistic-illustrative");
  materialEnvironmentTextureBytes = materialProfileManager.audit()
    .estimatedEnvironmentTextureBytes;
  presentationEffects = new PresentationMaterialEffects();
  clippingSystem = new ClippingSystem(renderer, scene);
  for (const view of [
    "overview",
    "laminar",
    "cell",
    "neuron",
    "electricity",
    "synapse",
  ] as const) {
    clippingSystem.registerLayer({
      id: view,
      root: renderRootForView(view),
      optIn: true,
      capObjectNames: CUT_CAP_OBJECTS[view],
    });
    const root = renderRootForView(view);
    presentationResourceCache.register(view, root);
    frozenStaticMatrixCount += freezeStaticPresentationMatrices(root);
  }
  clippingSystem.setActiveLayer(activeView);
  sceneGraphRevision += 1;
  renderPipeline.invalidateSceneGraph();
  applyRenderProfile(renderProfileGovernor.profile(), false);

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
    setAnatomySelection(entryId) {
      if (!anatomyExplorer) throw new Error("catálogo anatômico indisponível");
      return anatomyExplorer.select(entryId, "api").id;
    },
    searchAnatomy(query) {
      return searchAnatomicalCatalog(query);
    },
    async setCaptureMode(enabled) {
      if (enabled) closeCommandPalette(false);
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
        const previousRenderProfile = renderProfileGovernor.profile();
        const governor = renderProfileGovernor.leaveCaptureMode();
        if (governor.profile !== previousRenderProfile) applyRenderProfile(governor.profile);
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
    setCameraRotation(rotation) {
      if (!Number.isFinite(rotation)) throw new Error("rotação de câmera inválida");
      if (latestSnapshot) {
        renderFrame(latestSnapshot, simulationClock.renderTimeSeconds, rotation);
      }
    },
    resetCameraForCut() {
      resetCameraForCut();
      if (latestSnapshot) renderFrame(latestSnapshot, simulationClock.renderTimeSeconds);
    },
    setSelectedCell(cellId) {
      selectCell(cellId);
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
    setMaterialProfile(profile) {
      return setMaterialProfile(
        profile === "realistic-illustrative" ? "realistic-illustrative" : "schematic",
      );
    },
    setRenderProfile(profile) {
      return requestRenderProfile(profile);
    },
    setToneMapping(mode, exposure) {
      return setToneMapping(mode, exposure);
    },
    toneMappingAudit() {
      return toneMappingController.audit();
    },
    resetPresentationBudgetSamples() {
      presentationBudgetMonitor.reset();
    },
    setClipping(update) {
      return setCutPlaneState(update);
    },
    setPresentationEffects(update) {
      presentationEffects.setState(update);
      const effects = presentationEffects.audit();
      element<HTMLInputElement>("#presentation-xray").checked = effects.xray;
      element<HTMLInputElement>("#presentation-isolate").checked = effects.isolateMatter;
      element<HTMLInputElement>("#vascular-skeleton-mode").checked = effects.isolateVascular;
      vascularModule.setSkeletonMode(effects.isolateVascular);
      document.body.dataset.vascularSkeleton = String(effects.isolateVascular);
      element<HTMLInputElement>("#presentation-opacity").value = String(effects.opacity);
      element<HTMLOutputElement>("#presentation-opacity-val").textContent =
        `${Math.round(effects.opacity * 100)}%`;
      element<HTMLInputElement>("#presentation-opacity").setAttribute(
        "aria-valuenow",
        String(effects.opacity),
      );
      element<HTMLInputElement>("#presentation-opacity").setAttribute(
        "aria-valuetext",
        `${Math.round(effects.opacity * 100)} por cento`,
      );
      if (latestSnapshot) renderFrame(latestSnapshot, simulationClock.renderTimeSeconds);
    },
    setVascularSkeleton(enabled) {
      presentationEffects.setState({ isolateVascular: enabled });
      vascularModule.setSkeletonMode(enabled);
      element<HTMLInputElement>("#vascular-skeleton-mode").checked = enabled;
      document.body.dataset.vascularSkeleton = String(enabled);
      if (latestSnapshot) renderFrame(latestSnapshot, simulationClock.renderTimeSeconds);
      return enabled;
    },
    setHighContrast(enabled) {
      document.body.dataset.highContrast = String(enabled);
      element<HTMLInputElement>("#high-contrast-mode").checked = enabled;
      updateToneMappingSafetyFallback();
      materialProfileManager.setEnvironment({ highContrast: enabled });
      materialEnvironmentTextureBytes = materialProfileManager.audit()
        .estimatedEnvironmentTextureBytes;
      presentationResourceCache.invalidate();
      clippingSystem.refresh();
      synchronizeAmbientOcclusion();
      const profile = materialProfileManager.profile();
      updateMaterialProfileUi(profile);
      if (latestSnapshot) renderFrame(latestSnapshot, simulationClock.renderTimeSeconds);
      return profile;
    },
    visualAudit() {
      return visualAuditReport();
    },
    materialProfileAudit() {
      return materialProfileAuditReport();
    },
    anatomyCatalogAudit() {
      return anatomyCatalogAuditReport();
    },
    vascularAudit() {
      return vascularModule.audit();
    },
    surfaceAudit() {
      return layers.surfaceAudit();
    },
    presentationAudit() {
      return {
        material: materialProfileManager.audit(),
        surface: layers.surfaceAudit(),
        clipping: clippingSystem.audit(),
        effects: presentationEffects.audit(),
        effectsCache: presentationEffects.cacheAudit(),
        clippingCache: clippingSystem.cacheAudit(),
        bloom: renderPipeline.audit(),
        budget: presentationBudgetAuditReport(),
        frozenStaticMatrices: frozenStaticMatrixCount,
        probe: lastCutProbe,
        renderer: {
          drawCalls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles,
          geometries: renderer.info.memory.geometries,
          textures: renderer.info.memory.textures,
        },
        toneMapping: toneMappingController.audit(),
      };
    },
    renderedStateAudit() {
      return auditRenderedStatePixels(renderer);
    },
    electricalBoardAudit() {
      return { ...electricalBoardLayer.audit(), topology: electricalTopology };
    },
    neuronAudit() {
      return neuronLayer.audit();
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
  window.addEventListener("beforeunload", disposeApplication, { once: true });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !captureMode) simulationClock.rebase(performance.now());
  });
  const startTimestamp = performance.now();
  simulationClock.reset(0, startTimestamp);
  animate(startTimestamp);
}

window.addEventListener("DOMContentLoaded", init);
