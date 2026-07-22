import * as THREE from "three";
import { invoke } from "@tauri-apps/api/core";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ConvexGeometry } from "three/examples/jsm/geometries/ConvexGeometry.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { BrainData, BrainRegion, generateBrainData } from "./brain";
import { FixedStepClock } from "./clock";
import { BayesianBelief, BayesianUpdate } from "./inference";
import { SIMULATION_STEP_SECONDS } from "./protocol";
import type { SimulationTick } from "./protocol";
import { BrainSettings, getInitialBrainSettings } from "./schema";
import { NeuralSimulation } from "./simulation";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
    __BRAIN_ENGINE__?: {
      capture: (time: number, rotation: number) => void;
      setCaptureMode: (enabled: boolean) => void;
    };
  }
}

interface RuntimeInfo {
  engine: string;
  renderer: string;
  schema: string;
}

interface PointVisual {
  nodeIndices: number[];
  geometry: THREE.BufferGeometry;
  baseColor: THREE.Color;
}

interface ConnectionRecord {
  from: number;
  to: number;
  edgeIndex: number;
}

interface ConnectionVisual {
  records: ConnectionRecord[];
  regions: BrainRegion[];
  lines: THREE.LineSegments;
  geometry: THREE.BufferGeometry;
  baseColor: THREE.Color;
}

interface ShellVisual {
  region: BrainRegion;
  material: THREE.ShaderMaterial;
}

const TRAIL_LENGTH = 3;
const MAX_VISIBLE_SIGNALS = 300;
const state: BrainSettings = getInitialBrainSettings();
const belief = new BayesianBelief(0.35);
const simulationClock = new FixedStepClock({
  stepSeconds: SIMULATION_STEP_SECONDS,
  maxInteractiveDeltaSeconds: 0.1,
});
const palette = {
  network: new THREE.Color(0x147df5),
  featured: new THREE.Color(0x2ed9ff),
  pulseCore: new THREE.Color(0xf4fbff),
  pulseTrail: new THREE.Color(0x36bfff),
  inhibitory: new THREE.Color(0xc779ff),
  hot: new THREE.Color(0xeafcff),
};
const regionColors: Record<BrainRegion, THREE.Color> = {
  leftHemi: new THREE.Color(0x1788f4),
  rightHemi: new THREE.Color(0x24a5ff),
  cerebellum: new THREE.Color(0x21bfea),
  stem: new THREE.Color(0x6f9cff),
};

let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let controls: OrbitControls;
let composer: EffectComposer;
let bloomPass: UnrealBloomPass;
let brainGroup: THREE.Group;
let pulseMesh: THREE.InstancedMesh;
let brainData: BrainData;
let simulation: NeuralSimulation;
let currentInference: BayesianUpdate;
let captureMode = false;
let captureTime = 0;
let metricAccumulator = 0;

const regionObjects = new Map<BrainRegion, THREE.Object3D[]>();
const pointVisuals: PointVisual[] = [];
const connectionVisuals: ConnectionVisual[] = [];
const shellVisuals: ShellVisual[] = [];
const activitySamples = Array.from({ length: 96 }, () => 0);
const tempMatrix = new THREE.Matrix4();
const tempPosition = new THREE.Vector3();
const tempScale = new THREE.Vector3();
const tempQuaternion = new THREE.Quaternion();
const tempColor = new THREE.Color();

function element<T extends HTMLElement>(selector: string): T {
  const match = document.querySelector<T>(selector);
  if (!match) throw new Error(`Elemento obrigatório ausente: ${selector}`);
  return match;
}

function createPointTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.18, "rgba(112,220,255,.95)");
  gradient.addColorStop(0.52, "rgba(13,112,255,.32)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 32, 32);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function addRegionObject(region: BrainRegion, object: THREE.Object3D): void {
  const objects = regionObjects.get(region) ?? [];
  objects.push(object);
  regionObjects.set(region, objects);
  brainGroup.add(object);
}

function createShell(region: BrainRegion, points: THREE.Vector3[]): void {
  const stride = Math.max(1, Math.floor(points.length / 180));
  const hullPoints = points.filter((_, index) => index % stride === 0);
  const geometry = new ConvexGeometry(hullPoints);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      shellColor: { value: regionColors[region].clone() },
      activity: { value: 0 },
      opacity: { value: region === "cerebellum" ? 0.12 : 0.085 },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewDirection;
      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vViewDirection = normalize(-viewPosition.xyz);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 shellColor;
      uniform float activity;
      uniform float opacity;
      varying vec3 vNormal;
      varying vec3 vViewDirection;
      void main() {
        float rim = pow(1.0 - abs(dot(vNormal, vViewDirection)), 2.4);
        float pulse = 0.7 + activity * 1.8;
        vec3 color = shellColor * (0.22 + rim * 1.55 + activity * 0.8);
        gl_FragColor = vec4(color, opacity * rim * pulse);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const shell = new THREE.Mesh(geometry, material);
  shell.renderOrder = -1;
  shellVisuals.push({ region, material });
  addRegionObject(region, shell);
}

function buildBrainVisuals(): void {
  brainGroup = new THREE.Group();
  brainGroup.rotation.set(0.04, 0.34, -0.025);
  scene.add(brainGroup);

  const pointTexture = createPointTexture();
  for (const region of Object.keys(brainData.groups) as BrainRegion[]) {
    const nodeIndices = brainData.groups[region];
    const pointsForRegion = nodeIndices.map((index) => brainData.nodes[index]);
    const colors = new Float32Array(nodeIndices.length * 3);
    for (let index = 0; index < nodeIndices.length; index += 1) {
      regionColors[region].toArray(colors, index * 3);
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(pointsForRegion);
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color: 0xffffff,
        vertexColors: true,
        size: region === "stem" ? 0.027 : 0.022,
        map: pointTexture,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    pointVisuals.push({ nodeIndices, geometry, baseColor: regionColors[region].clone() });
    addRegionObject(region, points);
    createShell(region, pointsForRegion);
  }

  const edgeBuckets = new Map<
    string,
    { regions: BrainRegion[]; records: ConnectionRecord[] }
  >();
  brainData.edges.forEach(([from, to], edgeIndex) => {
    const fromRegion = brainData.regionByNode[from];
    const toRegion = brainData.regionByNode[to];
    const regions = fromRegion === toRegion
      ? [fromRegion]
      : ([fromRegion, toRegion].sort() as BrainRegion[]);
    const key = regions.join(":");
    const bucket = edgeBuckets.get(key) ?? { regions, records: [] };
    bucket.records.push({ from, to, edgeIndex });
    edgeBuckets.set(key, bucket);
  });

  for (const { regions, records } of edgeBuckets.values()) {
    const positions: THREE.Vector3[] = [];
    for (const record of records) {
      positions.push(brainData.nodes[record.from], brainData.nodes[record.to]);
    }
    const colors = new Float32Array(records.length * 6);
    const baseColor = regions.length > 1 ? palette.featured.clone() : regionColors[regions[0]].clone();
    for (let index = 0; index < records.length * 2; index += 1) {
      baseColor.toArray(colors, index * 3);
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(positions);
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const lines = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({
        color: 0xffffff,
        vertexColors: true,
        transparent: true,
        opacity: regions.length > 1 ? 0.3 : 0.18,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    connectionVisuals.push({ records, regions, lines, geometry, baseColor });
    brainGroup.add(lines);
  }

  pulseMesh = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.018, 1),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
    MAX_VISIBLE_SIGNALS * TRAIL_LENGTH,
  );
  pulseMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  brainGroup.add(pulseMesh);
}

function isRegionVisible(region: BrainRegion): boolean {
  return {
    leftHemi: state.showLeftHemi,
    rightHemi: state.showRightHemi,
    cerebellum: state.showCerebellum,
    stem: state.showStem,
  }[region];
}

function updateVisibility(): void {
  for (const [region, objects] of regionObjects) {
    for (const object of objects) object.visible = isRegionVisible(region);
  }
  for (const connection of connectionVisuals) {
    connection.lines.visible = connection.regions.every(isRegionVisible);
  }
}

function updateNeuralVisuals(): void {
  for (const visual of pointVisuals) {
    const colorAttribute = visual.geometry.getAttribute("color") as THREE.BufferAttribute;
    for (let localIndex = 0; localIndex < visual.nodeIndices.length; localIndex += 1) {
      const node = visual.nodeIndices[localIndex];
      const activity = Math.min(1, simulation.activations[node]);
      const visibleActivity = Math.pow(activity, 1.7);
      const hotColor = brainData.neuronKindByNode[node] === "inhibitory"
        ? palette.inhibitory
        : palette.hot;
      tempColor
        .copy(visual.baseColor)
        .multiplyScalar(0.5 + visibleActivity * 0.24)
        .lerp(hotColor, visibleActivity * 0.76);
      colorAttribute.setXYZ(localIndex, tempColor.r, tempColor.g, tempColor.b);
    }
    colorAttribute.needsUpdate = true;
  }

  for (const visual of connectionVisuals) {
    const colorAttribute = visual.geometry.getAttribute("color") as THREE.BufferAttribute;
    visual.records.forEach((record, index) => {
      const activity = Math.max(
        simulation.activations[record.from],
        simulation.activations[record.to],
      );
      const visibleActivity = Math.pow(activity, 1.8);
      const weight = (
        Math.abs(simulation.getWeight(record.edgeIndex * 2)) +
        Math.abs(simulation.getWeight(record.edgeIndex * 2 + 1))
      ) / 2;
      tempColor
        .copy(visual.baseColor)
        .lerp(palette.hot, Math.min(0.72, visibleActivity * 0.68))
        .multiplyScalar(0.32 + weight * 0.3 + visibleActivity * 0.3);
      colorAttribute.setXYZ(index * 2, tempColor.r, tempColor.g, tempColor.b);
      colorAttribute.setXYZ(index * 2 + 1, tempColor.r, tempColor.g, tempColor.b);
    });
    colorAttribute.needsUpdate = true;
  }

  for (const visual of shellVisuals) {
    const nodes = brainData.groups[visual.region];
    let totalActivity = 0;
    for (const node of nodes) totalActivity += simulation.activations[node];
    visual.material.uniforms.activity.value = totalActivity / Math.max(1, nodes.length);
  }
}

function updateSignals(): void {
  const signals = simulation.signals.slice(-Math.min(state.pulseCount, MAX_VISIBLE_SIGNALS));
  let instance = 0;

  for (const signal of signals) {
    const synapse = brainData.synapses[signal.synapseIndex];
    const fromRegion = brainData.regionByNode[synapse.from];
    const toRegion = brainData.regionByNode[synapse.to];
    if (!isRegionVisible(fromRegion) || !isRegionVisible(toRegion)) continue;

    for (let trail = 0; trail < TRAIL_LENGTH; trail += 1) {
      const progress = signal.progress - trail * 0.065;
      if (progress < 0) continue;
      tempPosition.lerpVectors(
        brainData.nodes[synapse.from],
        brainData.nodes[synapse.to],
        Math.min(1, progress),
      );
      const trailFade = 1 - trail * 0.24;
      const scale = (0.72 + signal.strength * 0.8) * trailFade;
      tempScale.setScalar(scale);
      tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
      pulseMesh.setMatrixAt(instance, tempMatrix);
      pulseMesh.setColorAt(
        instance,
        trail === 0
          ? palette.pulseCore
          : signal.inhibitory
            ? palette.inhibitory
            : palette.pulseTrail,
      );
      instance += 1;
    }
  }

  pulseMesh.count = instance;
  pulseMesh.instanceMatrix.needsUpdate = true;
  if (pulseMesh.instanceColor) pulseMesh.instanceColor.needsUpdate = true;
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

function updateMetrics(delta: number): void {
  metricAccumulator += delta;
  if (metricAccumulator < 0.12) return;
  metricAccumulator = 0;
  activitySamples.shift();
  activitySamples.push(simulation.firingRate);
  element("#activity-rate").textContent = simulation.firingRate.toFixed(1);
  const stateLabel = simulation.firingRate > 8
    ? "INTENSO"
    : simulation.firingRate > 1
      ? "PROPAGANDO"
      : "LATENTE";
  element("#network-state").textContent = stateLabel;
  element("#mean-weight").textContent = simulation.meanWeight().toFixed(3);
  drawActivityTrace();
}

function advanceSimulationTo(targetTick: SimulationTick): void {
  if (targetTick < simulation.tick) {
    throw new RangeError("O relógio não pode recuar o estado da simulação.");
  }

  while (simulation.tick < targetTick) {
    simulation.step({
      intensity: state.stimulusIntensity,
      confidence: currentInference.posterior,
    });
  }
}

function renderFrame(time: number, forcedRotation?: number, frameDelta = 0): void {
  brainGroup.rotation.y = forcedRotation ?? 0.34 + time * state.rotationSpeed * 0.115;
  brainGroup.rotation.x = 0.035 + Math.sin(time * 0.17) * 0.035;
  brainGroup.rotation.z = -0.025 + Math.cos(time * 0.13) * 0.018;
  updateNeuralVisuals();
  updateSignals();
  if (frameDelta > 0) updateMetrics(frameDelta);
  controls.update();
  composer.render();
}

function animate(timestamp: number): void {
  requestAnimationFrame(animate);
  if (captureMode) return;
  const frame = simulationClock.observe(timestamp, state.pulseSpeed);
  advanceSimulationTo(frame.targetTick);
  renderFrame(frame.renderTimeSeconds, undefined, frame.frameDeltaSeconds);
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
  element("#likelihood-val").textContent = update.likelihood.toFixed(2);
  element("#posterior-val").textContent = update.posterior.toFixed(2);
  element("#stimulus-val").textContent = `${Math.round(update.observation * 100)}%`;
}

function setupInterface(): void {
  element("#node-count").textContent = formatCount(brainData.nodes.length);
  element("#synapse-count").textContent = formatCount(brainData.synapses.length);

  bindRange("rotation-speed", "rot-speed-val", "rotationSpeed", (value) => `${value.toFixed(1)}×`);
  bindRange("pulse-speed", "pulse-speed-val", "pulseSpeed", (value) => `${value.toFixed(1)}×`);
  bindRange("pulse-count", "pulse-count-val", "pulseCount", String);
  bindRange("learning-rate", "learning-rate-val", "learningRate", (value) => value.toFixed(3), () => {
    simulation.setPlasticity(state.learningRate);
  });
  bindRange("bloom-strength", "bloom-strength-val", "bloomStrength", (value) => value.toFixed(1), () => {
    bloomPass.strength = state.bloomStrength;
  });
  bindRange("bloom-radius", "bloom-radius-val", "bloomRadius", (value) => value.toFixed(2), () => {
    bloomPass.radius = state.bloomRadius;
  });

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
      updateVisibility();
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
  if (!window.__TAURI_INTERNALS__) {
    status.textContent = "SIMULAÇÃO TS · WEBGL · ZOD";
    return;
  }
  try {
    const info = await invoke<RuntimeInfo>("neural_runtime_info");
    status.textContent = `${info.engine} · ${info.renderer} · ${info.schema}`.toUpperCase();
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

function init(): void {
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
  simulation = new NeuralSimulation(brainData, SIMULATION_STEP_SECONDS);
  simulation.setPlasticity(state.learningRate);
  buildBrainVisuals();
  setupInterface();
  updateVisibility();
  resolveRuntime();

  window.__BRAIN_ENGINE__ = {
    setCaptureMode(enabled) {
      captureMode = enabled;
      document.body.dataset.capture = String(enabled);
      if (enabled) {
        simulation.reset();
        simulation.setPlasticity(state.learningRate);
        simulationClock.synchronize(0);
        captureTime = 0;
        const warmup = simulationClock.advanceTicks(120);
        advanceSimulationTo(warmup.targetTick);
      } else {
        simulationClock.rebase(performance.now());
      }
    },
    capture(time, rotation) {
      const delta = Math.max(0, time - captureTime);
      const frame = simulationClock.advanceExact(delta, state.pulseSpeed);
      advanceSimulationTo(frame.targetTick);
      captureTime = time;
      renderFrame(time, rotation);
    },
  };

  window.addEventListener("resize", onResize);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !captureMode) simulationClock.rebase(performance.now());
  });
  const startTimestamp = performance.now();
  simulationClock.reset(simulation.tick, startTimestamp);
  animate(startTimestamp);
}

window.addEventListener("DOMContentLoaded", init);
