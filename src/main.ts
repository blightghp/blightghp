import * as THREE from "three";
import { invoke } from "@tauri-apps/api/core";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { BrainData, BrainRegion, generateBrainData } from "./brain";
import { BrainSettings, getInitialBrainSettings } from "./schema";

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

interface ActivePath {
  path: number[];
  offset: number;
  featured: boolean;
}

const state: BrainSettings = getInitialBrainSettings();
const palette = {
  network: new THREE.Color(0x147df5),
  featured: new THREE.Color(0x2ed9ff),
  pulseCore: new THREE.Color(0xf4fbff),
  pulseTrail: new THREE.Color(0x36bfff),
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
let activePaths: ActivePath[] = [];
let captureMode = false;

const regionObjects = new Map<BrainRegion, THREE.Object3D[]>();
const bridgeObjects: THREE.Object3D[] = [];
const clock = new THREE.Clock();
const tempMatrix = new THREE.Matrix4();
const tempPosition = new THREE.Vector3();
const tempScale = new THREE.Vector3();

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

function buildBrainVisuals(): void {
  brainGroup = new THREE.Group();
  brainGroup.rotation.set(0.04, 0.34, -0.025);
  scene.add(brainGroup);

  const pointTexture = createPointTexture();
  const edgeBuckets = new Map<BrainRegion | "bridge", THREE.Vector3[]>();
  const nodeBuckets = new Map<BrainRegion, THREE.Vector3[]>();

  for (const region of Object.keys(brainData.groups) as BrainRegion[]) {
    nodeBuckets.set(
      region,
      brainData.groups[region].map((index) => brainData.nodes[index]),
    );
  }

  for (const [from, to] of brainData.edges) {
    const fromRegion = brainData.regionByNode[from];
    const toRegion = brainData.regionByNode[to];
    const bucket = fromRegion === toRegion ? fromRegion : "bridge";
    const points = edgeBuckets.get(bucket) ?? [];
    points.push(brainData.nodes[from], brainData.nodes[to]);
    edgeBuckets.set(bucket, points);
  }

  const regionOpacity: Record<BrainRegion, number> = {
    leftHemi: 0.34,
    rightHemi: 0.34,
    cerebellum: 0.42,
    stem: 0.46,
  };

  for (const region of Object.keys(brainData.groups) as BrainRegion[]) {
    const pointsGeometry = new THREE.BufferGeometry().setFromPoints(nodeBuckets.get(region) ?? []);
    const points = new THREE.Points(
      pointsGeometry,
      new THREE.PointsMaterial({
        color: region === "cerebellum" ? 0x36bfff : 0x2596ff,
        size: region === "stem" ? 0.026 : 0.021,
        map: pointTexture,
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    addRegionObject(region, points);

    const lineGeometry = new THREE.BufferGeometry().setFromPoints(edgeBuckets.get(region) ?? []);
    const lines = new THREE.LineSegments(
      lineGeometry,
      new THREE.LineBasicMaterial({
        color: region === "cerebellum" ? 0x168ee8 : 0x0c62d7,
        transparent: true,
        opacity: regionOpacity[region],
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    addRegionObject(region, lines);
  }

  const bridgeGeometry = new THREE.BufferGeometry().setFromPoints(edgeBuckets.get("bridge") ?? []);
  const bridges = new THREE.LineSegments(
    bridgeGeometry,
    new THREE.LineBasicMaterial({
      color: 0x20a9ff,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  bridgeObjects.push(bridges);
  brainGroup.add(bridges);

  const featuredSegments: THREE.Vector3[] = [];
  for (const path of brainData.signalPaths) {
    for (let index = 0; index < path.length - 1; index += 1) {
      featuredSegments.push(brainData.nodes[path[index]], brainData.nodes[path[index + 1]]);
    }
  }
  const featuredLines = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(featuredSegments),
    new THREE.LineBasicMaterial({
      color: 0x1fb8ff,
      transparent: true,
      opacity: 0.78,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  bridgeObjects.push(featuredLines);
  brainGroup.add(featuredLines);

  const trailLength = 4;
  const pulseCapacity = 300 * trailLength;
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
    pulseCapacity,
  );
  pulseMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  brainGroup.add(pulseMesh);
}

function setupPaths(): void {
  const featured = brainData.signalPaths.map((path, index) => ({
    path,
    offset: index / Math.max(1, brainData.signalPaths.length),
    featured: true,
  }));
  const featuredSet = new Set(brainData.signalPaths);
  const regular = brainData.paths
    .filter((path) => !featuredSet.has(path))
    .slice(0, Math.max(0, state.pulseCount - featured.length))
    .map((path, index) => ({
      path,
      offset: (index * 0.61803398875) % 1,
      featured: false,
    }));

  activePaths = [...featured, ...regular].slice(0, 300);
  pulseMesh.count = activePaths.length * 4;
  for (let pathIndex = 0; pathIndex < activePaths.length; pathIndex += 1) {
    for (let trail = 0; trail < 4; trail += 1) {
      const instance = pathIndex * 4 + trail;
      pulseMesh.setColorAt(
        instance,
        trail === 0
          ? palette.pulseCore
          : activePaths[pathIndex].featured
            ? palette.featured
            : palette.pulseTrail,
      );
    }
  }
  if (pulseMesh.instanceColor) pulseMesh.instanceColor.needsUpdate = true;
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
  const anyBrain = state.showLeftHemi || state.showRightHemi;
  for (const bridge of bridgeObjects) {
    bridge.visible = anyBrain || state.showCerebellum || state.showStem;
  }
}

function updatePulses(time: number): void {
  for (let pathIndex = 0; pathIndex < activePaths.length; pathIndex += 1) {
    const active = activePaths[pathIndex];
    const path = active.path;
    const visible = path.some((nodeIndex) => isRegionVisible(brainData.regionByNode[nodeIndex]));

    for (let trail = 0; trail < 4; trail += 1) {
      const instance = pathIndex * 4 + trail;
      if (!visible) {
        tempMatrix.makeScale(0, 0, 0);
        pulseMesh.setMatrixAt(instance, tempMatrix);
        continue;
      }

      const trailOffset = trail * 0.013;
      const progress = (time * state.pulseSpeed * 0.19 + active.offset - trailOffset + 10) % 1;
      const pathPosition = progress * (path.length - 1);
      const segment = Math.min(path.length - 2, Math.floor(pathPosition));
      const fraction = pathPosition - segment;
      tempPosition.lerpVectors(
        brainData.nodes[path[segment]],
        brainData.nodes[path[segment + 1]],
        fraction,
      );

      const featuredScale = active.featured ? 1.28 : 1;
      const trailScale = featuredScale * (1 - trail * 0.19);
      const voltage = 0.92 + 0.14 * Math.sin(time * 7 + pathIndex * 0.73);
      tempScale.setScalar(trailScale * voltage);
      tempMatrix.compose(tempPosition, new THREE.Quaternion(), tempScale);
      pulseMesh.setMatrixAt(instance, tempMatrix);
    }
  }
  pulseMesh.instanceMatrix.needsUpdate = true;
}

function renderFrame(time: number, forcedRotation?: number): void {
  brainGroup.rotation.y =
    forcedRotation ?? 0.34 + time * state.rotationSpeed * 0.115;
  brainGroup.rotation.x = 0.035 + Math.sin(time * 0.17) * 0.035;
  brainGroup.rotation.z = -0.025 + Math.cos(time * 0.13) * 0.018;
  updatePulses(time);
  controls.update();
  composer.render();
}

function animate(): void {
  requestAnimationFrame(animate);
  if (!captureMode) renderFrame(clock.getElapsedTime());
}

function bindRange(
  id: string,
  displayId: string,
  key: "rotationSpeed" | "pulseSpeed" | "pulseCount" | "bloomStrength" | "bloomRadius",
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

function setupInterface(): void {
  bindRange("rotation-speed", "rot-speed-val", "rotationSpeed", (value) => `${value.toFixed(1)}×`);
  bindRange("pulse-speed", "pulse-speed-val", "pulseSpeed", (value) => `${value.toFixed(1)}×`);
  bindRange("pulse-count", "pulse-count-val", "pulseCount", String, setupPaths);
  bindRange("bloom-strength", "bloom-strength-val", "bloomStrength", (value) => value.toFixed(1), () => {
    bloomPass.strength = state.bloomStrength;
  });
  bindRange("bloom-radius", "bloom-radius-val", "bloomRadius", (value) => value.toFixed(2), () => {
    bloomPass.radius = state.bloomRadius;
  });

  type VisibilityKey = "showLeftHemi" | "showRightHemi" | "showCerebellum" | "showStem";
  const toggles: Array<[string, BrainRegion, VisibilityKey]> = [
    ["toggle-left-hemi", "leftHemi", "showLeftHemi"],
    ["toggle-right-hemi", "rightHemi", "showRightHemi"],
    ["toggle-cerebellum", "cerebellum", "showCerebellum"],
    ["toggle-stem", "stem", "showStem"],
  ];
  for (const [id, , key] of toggles) {
    const input = element<HTMLInputElement>(`#${id}`);
    input.checked = Boolean(state[key]);
    input.addEventListener("change", () => {
      state[key] = input.checked;
      updateVisibility();
    });
  }

  let intensity = 5;
  const updateInference = (): void => {
    const prior = 0.2 + intensity * 0.065;
    const likelihood = 0.52 + intensity * 0.042;
    const evidence = prior * likelihood + (1 - prior) * (1 - likelihood);
    const posterior = (likelihood * prior) / evidence;
    element("#prior-val").textContent = prior.toFixed(2);
    element("#likelihood-val").textContent = likelihood.toFixed(2);
    element("#posterior-val").textContent = posterior.toFixed(2);
    element("#excitation-val").textContent =
      intensity > 7 ? "TEMPESTADE" : intensity > 4 ? "ATIVO" : "REPOUSO";

    state.pulseCount = Math.min(300, 55 + intensity * 21);
    state.pulseSpeed = 0.45 + intensity * 0.13;
    element<HTMLInputElement>("#pulse-count").value = String(state.pulseCount);
    element("#pulse-count-val").textContent = String(state.pulseCount);
    element<HTMLInputElement>("#pulse-speed").value = String(state.pulseSpeed);
    element("#pulse-speed-val").textContent = `${state.pulseSpeed.toFixed(1)}×`;
    setupPaths();
  };
  element("#btn-intensity-up").addEventListener("click", () => {
    intensity = Math.min(10, intensity + 1);
    updateInference();
  });
  element("#btn-intensity-down").addEventListener("click", () => {
    intensity = Math.max(1, intensity - 1);
    updateInference();
  });
  updateInference();
}

async function resolveRuntime(): Promise<void> {
  const status = element("#runtime-status");
  if (!window.__TAURI_INTERNALS__) {
    status.textContent = "WEBGL · TYPESCRIPT · ZOD";
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
}

function init(): void {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0.18, 0.08, 4.65);

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
  buildBrainVisuals();
  setupPaths();
  setupInterface();
  updateVisibility();
  resolveRuntime();

  window.__BRAIN_ENGINE__ = {
    setCaptureMode(enabled) {
      captureMode = enabled;
      document.body.dataset.capture = String(enabled);
    },
    capture(time, rotation) {
      renderFrame(time, rotation);
    },
  };

  window.addEventListener("resize", onResize);
  animate();
}

window.addEventListener("DOMContentLoaded", init);
