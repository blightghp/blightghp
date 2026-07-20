import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { generateBrainData, BrainData } from './brain';

// Controle mestre das variáveis de estado. A matemática bayesiana não perdoa latência.
const state = {
  rotationSpeed: 0.8,
  pulseSpeed: 1.0,
  pulseCount: 120,
  bloomStrength: 1.5,
  bloomRadius: 0.6,
  showLeftHemi: true,
  showRightHemi: true,
  showCerebellum: true,
  showStem: true
};

// Amarrando o DOM com o motor. Nada de frescuras, direto ao ponto.
let container: HTMLDivElement;
let rotSpeedSlider: HTMLInputElement;
let pulseSpeedSlider: HTMLInputElement;
let pulseCountSlider: HTMLInputElement;
let bloomStrengthSlider: HTMLInputElement;
let bloomRadiusSlider: HTMLInputElement;
let leftHemiCheckbox: HTMLInputElement;
let rightHemiCheckbox: HTMLInputElement;
let cerebellumCheckbox: HTMLInputElement;
let stemCheckbox: HTMLInputElement;

// Displays para o feedback visual em tempo real
let rotSpeedVal: HTMLSpanElement;
let pulseSpeedVal: HTMLSpanElement;
let pulseCountVal: HTMLSpanElement;
let bloomStrengthVal: HTMLSpanElement;
let bloomRadiusVal: HTMLSpanElement;

// A trindade do WebGL
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let controls: OrbitControls;
let composer: EffectComposer;
let bloomPass: UnrealBloomPass;
let brainGroup: THREE.Group;

// Isolando as regiões anatômicas pra gente ter controle granular do modelo formalista
let leftHemiLines: THREE.LineSegments;
let rightHemiLines: THREE.LineSegments;
let cerebellumLines: THREE.LineSegments;
let stemLines: THREE.LineSegments;
let bridgeLines: THREE.LineSegments;

let leftHemiPoints: THREE.Points;
let rightHemiPoints: THREE.Points;
let cerebellumPoints: THREE.Points;
let stemPoints: THREE.Points;

// Mesh instanciada pros pulsos elétricos - otimização pura pra não chorar frame rate
let pulseMesh: THREE.InstancedMesh;
let boltLines: THREE.LineSegments;
let brainData: BrainData;
let activePaths: { path: number[]; tOffset: number; isBolt: boolean }[] = [];

// Paleta dos "raios" hero: núcleo branco-quente esmaecendo pro âmbar, contra o azul-frio do resto da rede
const BOLT_COLOR = new THREE.Color(0xffb64d);
const NETWORK_COLOR = new THREE.Color(0xdff2ff);

// Textura procedural pros nós neurais. Um gradiente sutil pra dar aquele ar de 'rede acesa'
function createPointTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.2, 'rgba(0, 180, 255, 0.8)');
  grad.addColorStop(0.6, 'rgba(0, 100, 255, 0.2)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 16, 16);
  return new THREE.CanvasTexture(canvas);
}

// Onde a arquitetura ganha vida.
function init() {
  container = document.querySelector('#canvas-container')!;
  
  // Pegando os elementos na força bruta
  rotSpeedSlider = document.querySelector('#rotation-speed')!;
  pulseSpeedSlider = document.querySelector('#pulse-speed')!;
  pulseCountSlider = document.querySelector('#pulse-count')!;
  bloomStrengthSlider = document.querySelector('#bloom-strength')!;
  bloomRadiusSlider = document.querySelector('#bloom-radius')!;
  
  leftHemiCheckbox = document.querySelector('#toggle-left-hemi')!;
  rightHemiCheckbox = document.querySelector('#toggle-right-hemi')!;
  cerebellumCheckbox = document.querySelector('#toggle-cerebellum')!;
  stemCheckbox = document.querySelector('#toggle-stem')!;

  rotSpeedVal = document.querySelector('#rot-speed-val')!;
  pulseSpeedVal = document.querySelector('#pulse-speed-val')!;
  pulseCountVal = document.querySelector('#pulse-count-val')!;
  bloomStrengthVal = document.querySelector('#bloom-strength-val')!;
  bloomRadiusVal = document.querySelector('#bloom-radius-val')!;

  const updateBayesianState = setupUIListeners();

// O vazio inicial
  scene = new THREE.Scene();
  // Fundo transparente para combinar com a estética da página
  scene.background = null;

  // Câmera posicionada cirurgicamente
  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0.5, 3.5);

  // Aqui a gente dita as regras do render. ACESFilmic pra segurar o estouro de luz do bloom. Fundo Alpha.
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0); // Totalmente transparente
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Limitando pra monitores de frescura
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  container.appendChild(renderer.domElement);

  // Deixando o usuário brincar com a perspectiva
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.maxDistance = 10;
  controls.minDistance = 1.5;

  // O pulo do gato: UnrealBloomPass pra dar aquela estética de sinapse queimando energia
  const renderScene = new RenderPass(scene, camera);
  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    state.bloomStrength,
    state.bloomRadius,
    0.15 
  );

  composer = new EffectComposer(renderer);
  composer.addPass(renderScene);
  composer.addPass(bloomPass);

  // Invocando os clusters geométricos do nosso cérebro artificial
  brainData = generateBrainData();
  buildBrainVisuals();

  // Fechando os circuitos elétricos
  setupPaths();

  // Só agora bloomPass e a rede existem de fato: seguro disparar o estado bayesiano inicial
  updateBayesianState();

  window.addEventListener('resize', onWindowResize);
}

let bayesianIntensity = 5;
const maxIntensity = 10;

// Ouvintes de evento sem firula. Retorna updateBayesianState pra ser disparada
// só depois que o resto do init() (bloomPass, brainData, pulseMesh) existir de verdade.
function setupUIListeners(): () => void {
  rotSpeedSlider.addEventListener('input', (e) => {
    state.rotationSpeed = parseFloat((e.target as HTMLInputElement).value);
    rotSpeedVal.textContent = `${state.rotationSpeed.toFixed(1)}x`;
  });

  pulseSpeedSlider.addEventListener('input', (e) => {
    state.pulseSpeed = parseFloat((e.target as HTMLInputElement).value);
    pulseSpeedVal.textContent = `${state.pulseSpeed.toFixed(1)}x`;
  });

  pulseCountSlider.addEventListener('input', (e) => {
    state.pulseCount = parseInt((e.target as HTMLInputElement).value);
    pulseCountVal.textContent = `${state.pulseCount}`;
    setupPaths();
  });

  bloomStrengthSlider.addEventListener('input', (e) => {
    state.bloomStrength = parseFloat((e.target as HTMLInputElement).value);
    bloomPass.strength = state.bloomStrength;
    bloomStrengthVal.textContent = state.bloomStrength.toFixed(1);
  });

  bloomRadiusSlider.addEventListener('input', (e) => {
    state.bloomRadius = parseFloat((e.target as HTMLInputElement).value);
    bloomPass.radius = state.bloomRadius;
    bloomRadiusVal.textContent = state.bloomRadius.toFixed(2);
  });

  leftHemiCheckbox.addEventListener('change', (e) => {
    state.showLeftHemi = (e.target as HTMLInputElement).checked;
    updateVisibility();
  });

  rightHemiCheckbox.addEventListener('change', (e) => {
    state.showRightHemi = (e.target as HTMLInputElement).checked;
    updateVisibility();
  });

  cerebellumCheckbox.addEventListener('change', (e) => {
    state.showCerebellum = (e.target as HTMLInputElement).checked;
    updateVisibility();
  });

  stemCheckbox.addEventListener('change', (e) => {
    state.showStem = (e.target as HTMLInputElement).checked;
    updateVisibility();
  });

  // Bayesian HUD Controls
  const btnUp = document.getElementById('btn-intensity-up');
  const btnDown = document.getElementById('btn-intensity-down');
  const priorVal = document.getElementById('prior-val');
  const likelihoodVal = document.getElementById('likelihood-val');
  const posteriorVal = document.getElementById('posterior-val');
  const excitationVal = document.getElementById('excitation-val');

  const updateBayesianState = () => {
    const prior = bayesianIntensity / maxIntensity;
    const likelihood = 0.5 + (Math.random() * 0.5); // Simulação estocástica
    const evidence = 0.8;
    const posterior = (likelihood * prior) / evidence;
    
    priorVal!.textContent = prior.toFixed(2);
    likelihoodVal!.textContent = likelihood.toFixed(2);
    posteriorVal!.textContent = Math.min(posterior, 0.99).toFixed(2);
    
    let levelStr = "Estável";
    if (bayesianIntensity > 7) levelStr = "Tempestade";
    else if (bayesianIntensity > 4) levelStr = "Ativo";
    else levelStr = "Repouso";
    excitationVal!.textContent = levelStr;

    // Atualiza os visuais baseados na inferência bayesiana
    state.pulseCount = 30 * bayesianIntensity;
    state.bloomStrength = 0.8 + (bayesianIntensity * 0.2);
    state.pulseSpeed = 0.5 + (bayesianIntensity * 0.15);
    
    bloomPass.strength = state.bloomStrength;
    pulseCountSlider.value = state.pulseCount.toString();
    pulseCountVal.textContent = state.pulseCount.toString();
    bloomStrengthSlider.value = state.bloomStrength.toString();
    bloomStrengthVal.textContent = state.bloomStrength.toFixed(1);
    pulseSpeedSlider.value = state.pulseSpeed.toString();
    pulseSpeedVal.textContent = state.pulseSpeed.toFixed(1);
    
    setupPaths();
  };

  btnUp?.addEventListener('click', () => {
    if (bayesianIntensity < maxIntensity) bayesianIntensity++;
    updateBayesianState();
  });

  btnDown?.addEventListener('click', () => {
    if (bayesianIntensity > 1) bayesianIntensity--;
    updateBayesianState();
  });

  return updateBayesianState;
}

// Função casca-grossa que junta as geometrias do modelo algorítmico
function buildBrainVisuals() {
  brainGroup = new THREE.Group();
  scene.add(brainGroup);

  const leftHemiNodes: THREE.Vector3[] = [];
  const rightHemiNodes: THREE.Vector3[] = [];
  const cerebellumNodes: THREE.Vector3[] = [];
  const stemNodes: THREE.Vector3[] = [];

  // Mapeando as instâncias pros seus devidos clusters anatômicos
  brainData.nodes.forEach((n, idx) => {
    if (brainData.groups.leftHemi.includes(idx)) leftHemiNodes.push(n);
    else if (brainData.groups.rightHemi.includes(idx)) rightHemiNodes.push(n);
    else if (brainData.groups.cerebellum.includes(idx)) cerebellumNodes.push(n);
    else if (brainData.groups.stem.includes(idx)) stemNodes.push(n);
  });

  const leftHemiEdges: THREE.Vector3[] = [];
  const rightHemiEdges: THREE.Vector3[] = [];
  const cerebellumEdges: THREE.Vector3[] = [];
  const stemEdges: THREE.Vector3[] = [];
  const bridgeEdges: THREE.Vector3[] = [];
  const boltEdges: THREE.Vector3[] = [];

  // Traçando os raios hero como segmentos contínuos ao longo do trajeto curado
  brainData.boltPaths.forEach(path => {
    for (let i = 0; i < path.length - 1; i++) {
      boltEdges.push(brainData.nodes[path[i]], brainData.nodes[path[i + 1]]);
    }
  });

  // Conectando a rede. Isso aqui foi um parto pra acertar o threshold.
  brainData.edges.forEach(([u, v]) => {
    const p1 = brainData.nodes[u];
    const p2 = brainData.nodes[v];
    
    const uInLeft = brainData.groups.leftHemi.includes(u);
    const vInLeft = brainData.groups.leftHemi.includes(v);
    const uInRight = brainData.groups.rightHemi.includes(u);
    const vInRight = brainData.groups.rightHemi.includes(v);
    const uInCereb = brainData.groups.cerebellum.includes(u);
    const vInCereb = brainData.groups.cerebellum.includes(v);
    const uInStem = brainData.groups.stem.includes(u);
    const vInStem = brainData.groups.stem.includes(v);

    if (uInLeft && vInLeft) {
      leftHemiEdges.push(p1, p2);
    } else if (uInRight && vInRight) {
      rightHemiEdges.push(p1, p2);
    } else if (uInCereb && vInCereb) {
      cerebellumEdges.push(p1, p2);
    } else if (uInStem && vInStem) {
      stemEdges.push(p1, p2);
    } else {
      bridgeEdges.push(p1, p2);
    }
  });

  // Materiais. O segredo do visual tá no AdditiveBlending e opacity baixa.
  const pMat = new THREE.PointsMaterial({
    color: 0x00a0ff,
    size: 0.015,
    transparent: true,
    opacity: 0.4,
    map: createPointTexture(),
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const lineMat = new THREE.LineBasicMaterial({
    color: 0x0066cc,
    transparent: true,
    opacity: 0.28,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const bridgeLineMat = new THREE.LineBasicMaterial({
    color: 0x007acc,
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  // Material dos raios hero: âmbar vívido, opacidade alta pra ler como relâmpago mesmo estático,
  // o bloom cuida de engordar a linha fina numa faixa de luz.
  const boltLineMat = new THREE.LineBasicMaterial({
    color: 0xffa64d,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const buildPoints = (pts: THREE.Vector3[]): THREE.Points => {
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    return new THREE.Points(geo, pMat);
  };

  leftHemiPoints = buildPoints(leftHemiNodes);
  rightHemiPoints = buildPoints(rightHemiNodes);
  cerebellumPoints = buildPoints(cerebellumNodes);
  stemPoints = buildPoints(stemNodes);

  brainGroup.add(leftHemiPoints, rightHemiPoints, cerebellumPoints, stemPoints);

  const buildLines = (pts: THREE.Vector3[], mat: THREE.LineBasicMaterial): THREE.LineSegments => {
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    return new THREE.LineSegments(geo, mat);
  };

  leftHemiLines = buildLines(leftHemiEdges, lineMat);
  rightHemiLines = buildLines(rightHemiEdges, lineMat);
  cerebellumLines = buildLines(cerebellumEdges, lineMat);
  stemLines = buildLines(stemEdges, lineMat);
  bridgeLines = buildLines(bridgeEdges, bridgeLineMat);
  boltLines = buildLines(boltEdges, boltLineMat);

  brainGroup.add(leftHemiLines, rightHemiLines, cerebellumLines, stemLines, bridgeLines, boltLines);

  // A cereja do bolo: malha instanciada pras correntes neurais (sem fritar o WebGL)
  const pulseGeo = new THREE.SphereGeometry(0.007, 6, 6);
  const pulseMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 1.0,
    blending: THREE.AdditiveBlending,
    vertexColors: true // permite tingir cada instância (âmbar nos raios, azul-branco no resto)
  });

  pulseMesh = new THREE.InstancedMesh(pulseGeo, pulseMat, 300);
  brainGroup.add(pulseMesh);
}

// Calculando os caminhos dos elétrons como se fossem inferências bayesianas correndo na rede
function setupPaths() {
  const limit = Math.min(state.pulseCount, brainData.paths.length);
  const boltSet = new Set(brainData.boltPaths);

  // Os raios hero sempre disparam, ganhando prioridade sobre a amostra do resto da rede
  const boltEntries = brainData.boltPaths.map(path => ({
    path,
    tOffset: Math.random() * 200,
    isBolt: true
  }));

  const remaining: typeof boltEntries = [];
  for (let i = 0; i < brainData.paths.length && remaining.length < limit; i++) {
    const path = brainData.paths[i];
    if (boltSet.has(path)) continue;
    remaining.push({ path, tOffset: Math.random() * 200, isBolt: false });
  }

  activePaths = [...boltEntries, ...remaining].slice(0, 300); // Nunca estoura a capacidade da InstancedMesh
  pulseMesh.count = activePaths.length;

  // Tingindo cada instância: âmbar quente nos raios hero, azul-branco no restante da corrente
  for (let i = 0; i < activePaths.length; i++) {
    pulseMesh.setColorAt(i, activePaths[i].isBolt ? BOLT_COLOR : NETWORK_COLOR);
  }
  if (pulseMesh.instanceColor) pulseMesh.instanceColor.needsUpdate = true;
}

// Se o usuário desligar um hemisfério, a gente apaga a ponte. Óbvio.
function updateVisibility() {
  leftHemiPoints.visible = state.showLeftHemi;
  leftHemiLines.visible = state.showLeftHemi;

  rightHemiPoints.visible = state.showRightHemi;
  rightHemiLines.visible = state.showRightHemi;

  cerebellumPoints.visible = state.showCerebellum;
  cerebellumLines.visible = state.showCerebellum;

  stemPoints.visible = state.showStem;
  stemLines.visible = state.showStem;

  bridgeLines.visible = 
    (state.showLeftHemi && state.showRightHemi) || 
    (state.showCerebellum && (state.showLeftHemi || state.showRightHemi)) ||
    (state.showStem && state.showCerebellum);
}

// Responsividade mínima.
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}

// O loop sagrado
const clock = new THREE.Clock();
const tempMatrix = new THREE.Matrix4();
const tempPosition = new THREE.Vector3();

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  const time = clock.getElapsedTime();

  // Rotação sutil e elegante. Ninguém quer labirintite vendo isso.
  if (state.rotationSpeed > 0) {
    const speed = state.rotationSpeed * 0.15;
    brainGroup.rotation.y += speed * delta;
    
    // Wobble bem de leve pra quebrar a simetria artificial
    brainGroup.rotation.x = Math.sin(time * 0.3) * 0.08 + 0.1;
    brainGroup.rotation.z = Math.cos(time * 0.2) * 0.04;
  }

  // Despachando a lógica de update das sinapses baseadas no delta
  const nodes = brainData.nodes;
  const groups = brainData.groups;

  for (let i = 0; i < activePaths.length; i++) {
    const { path, tOffset } = activePaths[i];
    const L = path.length;
    
    // Matemática pura guiando o interpolador dos elétrons
    const pSpeed = state.pulseSpeed * 0.35;
    const progress = (time * pSpeed + tOffset) % 1.0;
    
    const segmentF = progress * L;
    const idx = Math.floor(segmentF) % L;
    const frac = segmentF - Math.floor(segmentF);
    
    const uNode = path[idx];
    const vNode = path[(idx + 1) % L];
    
    let isNodeVisible = true;
    
    const checkVisible = (nodeIdx: number): boolean => {
      if (groups.leftHemi.includes(nodeIdx)) return state.showLeftHemi;
      if (groups.rightHemi.includes(nodeIdx)) return state.showRightHemi;
      if (groups.cerebellum.includes(nodeIdx)) return state.showCerebellum;
      if (groups.stem.includes(nodeIdx)) return state.showStem;
      return true;
    };
    
    // Se escondeu a região anatômica, a sinapse some junto
    if (!checkVisible(uNode) && !checkVisible(vNode)) {
      isNodeVisible = false;
    }

    if (isNodeVisible) {
      const p1 = nodes[uNode];
      const p2 = nodes[vNode];
      
      // LERPing a posição em 3D.
      tempPosition.lerpVectors(p1, p2, frac);
      tempMatrix.makeTranslation(tempPosition.x, tempPosition.y, tempPosition.z);
      
      // Um pequeno pulso senoidal pra simular flutuação de voltagem 
      const pulseScale = 1.0 + 0.3 * Math.sin(time * 8 + i);
      tempMatrix.scale(new THREE.Vector3(pulseScale, pulseScale, pulseScale));
      
      pulseMesh.setMatrixAt(i, tempMatrix);
    } else {
      // Gambiarra necessária pra esconder as instâncias indesejadas: manda pro espaço sideral
      tempMatrix.makeTranslation(9999, 9999, 9999);
      pulseMesh.setMatrixAt(i, tempMatrix);
    }
  }
  
  pulseMesh.instanceMatrix.needsUpdate = true;
  controls.update();
  composer.render();
}

window.addEventListener('DOMContentLoaded', () => {
  init();
  animate();
});
