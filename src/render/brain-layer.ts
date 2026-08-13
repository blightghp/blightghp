import * as THREE from "three";
import { ConvexGeometry } from "three/examples/jsm/geometries/ConvexGeometry.js";
import type { BrainData, BrainRegion } from "../brain";
import type { NeuralSnapshot } from "../protocol";
import type { BrainSettings } from "../schema";
import {
  declareVisual,
  disposeObjectTree,
  mountLayer,
} from "./render-types";
import type {
  InterpolatedSnapshot,
  RenderContext,
  RenderLayer,
  RenderTopology,
} from "./render-types";
import {
  COLOR_TOKENS,
  POINT_TEXTURE_STOPS,
  REGION_COLOR_TOKENS,
  VISUAL_COLORS,
} from "./visual-tokens";
import { encodeStateColor } from "./visual-encoding";

export interface PointVisual {
  nodeIndices: number[];
  geometry: THREE.BufferGeometry;
  baseColor: THREE.Color;
}

export interface ConnectionRecord {
  from: number;
  to: number;
  edgeIndex: number;
}

export interface ConnectionVisual {
  records: ConnectionRecord[];
  regions: BrainRegion[];
  lines: THREE.LineSegments;
  geometry: THREE.BufferGeometry;
  baseColor: THREE.Color;
}

export interface ShellVisual {
  region: BrainRegion;
  material: THREE.ShaderMaterial;
}

const TRAIL_LENGTH = 3;
const MAX_VISIBLE_SIGNALS = 300;

export const PALETTE = COLOR_TOKENS;

export const REGION_COLORS: Record<BrainRegion, THREE.Color> = REGION_COLOR_TOKENS;

export function interpolatePublishedValue(
  current: number,
  previous: number | undefined,
  alpha: number,
): number {
  const boundedAlpha = Math.max(0, Math.min(1, alpha));
  return (previous ?? current) + (current - (previous ?? current)) * boundedAlpha;
}

export function composeNodeActivity(activation: number, fieldWave: number): number {
  // Field and spikes are two resolutions of one signal. Taking the envelope
  // avoids inventing extra activity by summing both representations.
  return Math.max(activation, fieldWave * 0.7);
}

export function signalPulseDiameter(inhibitory: boolean): number {
  return inhibitory ? 0.015 : 0.019;
}

function createPointTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
  for (const [offset, color] of POINT_TEXTURE_STOPS) {
    gradient.addColorStop(offset, color);
  }
  context.fillStyle = gradient;
  context.fillRect(0, 0, 32, 32);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class BrainRenderLayers implements RenderLayer {
  readonly group: THREE.Group;
  readonly regionObjects = new Map<BrainRegion, THREE.Object3D[]>();
  readonly pointVisuals: PointVisual[] = [];
  readonly connectionVisuals: ConnectionVisual[] = [];
  readonly shellVisuals: ShellVisual[] = [];
  pulseMesh!: THREE.InstancedMesh;

  private readonly data: BrainData;
  private readonly tempMatrix = new THREE.Matrix4();
  private readonly tempPosition = new THREE.Vector3();
  private readonly tempScale = new THREE.Vector3();
  private readonly tempQuaternion = new THREE.Quaternion();
  private readonly tempColor = new THREE.Color();
  private visibleSignalLimit = MAX_VISIBLE_SIGNALS;

  constructor(data: BrainData) {
    this.data = data;
    this.group = new THREE.Group();
    this.group.rotation.set(0.04, 0.34, -0.025);
    this.buildLayers();
  }

  private buildLayers(): void {
    const pointTexture = createPointTexture();

    for (const region of Object.keys(this.data.groups) as BrainRegion[]) {
      const nodeIndices = this.data.groups[region];
      const pointsForRegion = nodeIndices.map((index) => this.data.nodes[index]);
      const colors = new Float32Array(nodeIndices.length * 3);
      for (let index = 0; index < nodeIndices.length; index += 1) {
        REGION_COLORS[region].toArray(colors, index * 3);
      }

      const geometry = new THREE.BufferGeometry().setFromPoints(pointsForRegion);
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      const points = new THREE.Points(
        geometry,
        new THREE.PointsMaterial({
          color: VISUAL_COLORS.white,
          vertexColors: true,
          size: region === "stem" ? 0.027 : 0.022,
          map: pointTexture,
          transparent: true,
          opacity: 0.7,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      this.pointVisuals.push({ nodeIndices, geometry, baseColor: REGION_COLORS[region].clone() });
      declareVisual(points, "emission", "state", {
        field: `activations[region=${region}]`,
        unit: "normalized activity",
        transform: "base-to-white color ramp and point opacity",
        redundancy: ["position", "size"],
      });
      this.addRegionObject(region, points);
      this.createShell(region, pointsForRegion);
    }

    const edgeBuckets = new Map<
      string,
      { regions: BrainRegion[]; records: ConnectionRecord[] }
    >();
    this.data.edges.forEach(([from, to], edgeIndex) => {
      const fromRegion = this.data.regionByNode[from];
      const toRegion = this.data.regionByNode[to];
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
        positions.push(this.data.nodes[record.from], this.data.nodes[record.to]);
      }
      const colors = new Float32Array(records.length * 6);
      const baseColor = regions.length > 1 ? PALETTE.featured.clone() : REGION_COLORS[regions[0]].clone();
      for (let index = 0; index < records.length * 2; index += 1) {
        baseColor.toArray(colors, index * 3);
      }
      const geometry = new THREE.BufferGeometry().setFromPoints(positions);
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      const lines = new THREE.LineSegments(
        geometry,
        new THREE.LineBasicMaterial({
          color: VISUAL_COLORS.white,
          vertexColors: true,
          transparent: true,
          opacity: regions.length > 1 ? 0.3 : 0.18,
          blending: THREE.NormalBlending,
          depthWrite: true,
        }),
      );
      declareVisual(lines, "matter", "state", {
        field: "weights[synapse]",
        unit: "model weight",
        transform: "absolute weight to line opacity",
        redundancy: ["position"],
      });
      this.connectionVisuals.push({ records, regions, lines, geometry, baseColor });
      this.group.add(lines);
    }

    this.pulseMesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.018, 1),
      new THREE.MeshBasicMaterial({
        color: VISUAL_COLORS.white,
        vertexColors: true,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
      MAX_VISIBLE_SIGNALS * TRAIL_LENGTH,
    );
    this.pulseMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    declareVisual(this.pulseMesh, "emission", "state", {
      field: "signals.{progress,strength,inhibitory}",
      unit: "fraction/model strength/class",
      transform: "path position, scale, diameter class and color token",
      redundancy: ["position", "size", "label"],
    });
    this.group.add(this.pulseMesh);
  }

  private addRegionObject(region: BrainRegion, object: THREE.Object3D): void {
    const objects = this.regionObjects.get(region) ?? [];
    objects.push(object);
    this.regionObjects.set(region, objects);
    this.group.add(object);
  }

  private createShell(region: BrainRegion, points: THREE.Vector3[]): void {
    const stride = Math.max(1, Math.floor(points.length / 180));
    const hullPoints = points.filter((_, index) => index % stride === 0);
    const geometry = new ConvexGeometry(hullPoints);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        shellColor: { value: REGION_COLORS[region].clone() },
        activity: { value: 0 },
        opacity: { value: region === "cerebellum" ? 0.12 : 0.085 },
      },
      vertexShader: `
        #include <clipping_planes_pars_vertex>
        varying vec3 vNormal;
        varying vec3 vViewDirection;
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vViewDirection = normalize(-mvPosition.xyz);
          gl_Position = projectionMatrix * mvPosition;
          #include <clipping_planes_vertex>
        }
      `,
      fragmentShader: `
        #include <clipping_planes_pars_fragment>
        uniform vec3 shellColor;
        uniform float activity;
        uniform float opacity;
        varying vec3 vNormal;
        varying vec3 vViewDirection;
        void main() {
          #include <clipping_planes_fragment>
          float rim = pow(1.0 - abs(dot(vNormal, vViewDirection)), 2.4);
          float pulse = 0.7 + activity * 1.8;
          vec3 color = shellColor * (0.22 + rim * 1.55 + activity * 0.8);
          gl_FragColor = vec4(color, opacity * rim * pulse);
        }
      `,
      transparent: true,
      depthWrite: true,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
      clipping: true,
    });
    const shell = new THREE.Mesh(geometry, material);
    shell.name = `${region}-shell`;
    shell.renderOrder = -1;
    declareVisual(shell, "matter", "state", {
      field: `mean(activations[region=${region}])`,
      unit: "normalized activity",
      transform: "regional mean to shell opacity",
      redundancy: ["position", "shape"],
    });
    this.shellVisuals.push({ region, material });
    this.addRegionObject(region, shell);
  }

  updateVisibility(settings: BrainSettings, focusRegion: BrainRegion | "all" = "all"): void {
    const isVisible = (region: BrainRegion) => {
      const settingsVisibility = {
        leftHemi: settings.showLeftHemi,
        rightHemi: settings.showRightHemi,
        cerebellum: settings.showCerebellum,
        stem: settings.showStem,
      }[region];
      if (!settingsVisibility) return false;
      if (focusRegion === "all") return true;
      return region === focusRegion;
    };

    for (const [region, objects] of this.regionObjects) {
      for (const object of objects) {
        object.visible = isVisible(region);
      }
    }

    for (const connection of this.connectionVisuals) {
      connection.lines.visible = connection.regions.every(isVisible);
    }
  }

  updateInterpolated(
    currSnapshot: NeuralSnapshot,
    prevSnapshot: NeuralSnapshot | undefined,
    alpha: number,
    visibleSignalLimit = MAX_VISIBLE_SIGNALS,
  ): void {
    const interpolatedActivations = new Float32Array(currSnapshot.activations.length);
    for (let index = 0; index < currSnapshot.activations.length; index += 1) {
      const prev = prevSnapshot ? prevSnapshot.activations[index] : currSnapshot.activations[index];
      const curr = currSnapshot.activations[index];
      interpolatedActivations[index] = prev + (curr - prev) * alpha;
    }

    const fieldWave = currSnapshot.field ? currSnapshot.field.waveActivity : undefined;
    const prevFieldWave = prevSnapshot?.field ? prevSnapshot.field.waveActivity : undefined;

    for (const visual of this.pointVisuals) {
      const colorAttribute = visual.geometry.getAttribute("color") as THREE.BufferAttribute;
      for (let localIndex = 0; localIndex < visual.nodeIndices.length; localIndex += 1) {
        const node = visual.nodeIndices[localIndex];
        const activity = Math.min(1, interpolatedActivations[node]);
        const fieldVertex = this.data.corticalField.vertexByNode[node];
        const wave = fieldWave && fieldVertex >= 0
          ? interpolatePublishedValue(
              fieldWave[fieldVertex],
              prevFieldWave?.[fieldVertex],
              alpha,
            )
          : 0;
        const visibleActivity = Math.pow(composeNodeActivity(activity, wave), 1.7);
        this.tempColor.copy(encodeStateColor(visual.baseColor, visibleActivity));
        colorAttribute.setXYZ(localIndex, this.tempColor.r, this.tempColor.g, this.tempColor.b);
      }
      colorAttribute.needsUpdate = true;
    }

    const regionActivities: Record<BrainRegion, number> = {
      leftHemi: 0,
      rightHemi: 0,
      cerebellum: 0,
      stem: 0,
    };
    for (const region of Object.keys(this.data.groups) as BrainRegion[]) {
      const nodes = this.data.groups[region];
      const sum = nodes.reduce((total, index) => {
        const act = interpolatedActivations[index];
        const fieldVertex = this.data.corticalField.vertexByNode[index];
        const wv = fieldWave && fieldVertex >= 0 ? fieldWave[fieldVertex] : 0;
        return total + composeNodeActivity(act, wv * (0.5 / 0.7));
      }, 0);
      regionActivities[region] = sum / nodes.length;
    }

    for (const shell of this.shellVisuals) {
      shell.material.uniforms.activity.value = regionActivities[shell.region];
    }

    for (const visual of this.connectionVisuals) {
      const colorAttribute = visual.geometry.getAttribute("color") as THREE.BufferAttribute;
      for (let recordIndex = 0; recordIndex < visual.records.length; recordIndex += 1) {
        const record = visual.records[recordIndex];
        const weight = currSnapshot.weights[record.edgeIndex];
        const activityFrom = interpolatedActivations[record.from];
        const activityTo = interpolatedActivations[record.to];
        const localActivity = (activityFrom + activityTo) * 0.5;
        const normalizedWeight = weight > 0 ? (weight - 0.12) / 0.8 : 0.6;
        this.tempColor.copy(visual.baseColor);
        if (weight < 0) {
          this.tempColor.lerp(PALETTE.inhibitory, 0.65);
        } else {
          this.tempColor.lerp(PALETTE.featured, normalizedWeight * 0.45);
        }
        if (localActivity > 0.08) {
          this.tempColor.lerp(PALETTE.hot, Math.min(1, localActivity * 1.3));
        }

        const pointIndex = recordIndex * 2;
        colorAttribute.setXYZ(pointIndex, this.tempColor.r, this.tempColor.g, this.tempColor.b);
        colorAttribute.setXYZ(pointIndex + 1, this.tempColor.r, this.tempColor.g, this.tempColor.b);
      }
      colorAttribute.needsUpdate = true;
    }

    this.renderSignals(currSnapshot, visibleSignalLimit);
  }

  mount(context: RenderContext, _topology: RenderTopology): void {
    mountLayer(this.group, context);
  }

  update(view: InterpolatedSnapshot): void {
    this.updateInterpolated(
      view.current,
      view.previous,
      view.alpha,
      this.visibleSignalLimit,
    );
  }

  setDetail(level: number): void {
    this.visibleSignalLimit = Math.max(0, Math.min(MAX_VISIBLE_SIGNALS, Math.floor(level)));
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  dispose(): void {
    disposeObjectTree(this.group);
  }

  private renderSignals(snapshot: NeuralSnapshot, visibleSignalLimit: number): void {
    const totalInstances = MAX_VISIBLE_SIGNALS * TRAIL_LENGTH;
    for (let index = 0; index < totalInstances; index += 1) {
      this.tempScale.setScalar(0.0001);
      this.tempMatrix.compose(this.tempPosition.set(0, -999, 0), this.tempQuaternion.identity(), this.tempScale);
      this.pulseMesh.setMatrixAt(index, this.tempMatrix);
    }

    const { synapseIds, progress, strength, inhibitory } = snapshot.signals;
    const signalCount = Math.min(
      synapseIds.length,
      MAX_VISIBLE_SIGNALS,
      Math.max(0, Math.floor(visibleSignalLimit)),
    );
    let instanceIndex = 0;

    for (let signalIndex = 0; signalIndex < signalCount; signalIndex += 1) {
      const synapse = this.data.synapses[synapseIds[signalIndex]];
      const fromPos = this.data.nodes[synapse.from];
      const toPos = this.data.nodes[synapse.to];
      const baseProgress = progress[signalIndex];
      const isInhibitory = Boolean(inhibitory[signalIndex]);
      const pulseStrength = strength[signalIndex];

      for (let trailIndex = 0; trailIndex < TRAIL_LENGTH; trailIndex += 1) {
        const offset = trailIndex * 0.035;
        const trailProgress = baseProgress - offset;
        if (trailProgress < 0 || trailProgress > 1) continue;

        this.tempPosition.lerpVectors(fromPos, toPos, trailProgress);
        const scaleFactor = (1 - trailIndex / TRAIL_LENGTH) * (0.8 + pulseStrength * 0.4);
        const size = signalPulseDiameter(isInhibitory) * scaleFactor;
        this.tempScale.set(size, size, size);
        this.tempMatrix.compose(this.tempPosition, this.tempQuaternion.identity(), this.tempScale);
        this.pulseMesh.setMatrixAt(instanceIndex, this.tempMatrix);

        if (trailIndex === 0) {
          this.tempColor.copy(isInhibitory ? PALETTE.inhibitory : PALETTE.pulseCore);
        } else {
          this.tempColor.copy(isInhibitory ? PALETTE.inhibitory : PALETTE.pulseTrail);
        }
        this.pulseMesh.setColorAt(instanceIndex, this.tempColor);
        instanceIndex += 1;
      }
    }

    this.pulseMesh.instanceMatrix.needsUpdate = true;
    if (this.pulseMesh.instanceColor) this.pulseMesh.instanceColor.needsUpdate = true;
  }
}
