import * as THREE from "three";
import type { NeuralSnapshot } from "../protocol";
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
import { COLOR_TOKENS, VISUAL_COLORS } from "./visual-tokens";
import { encodeStateColor } from "./visual-encoding";

const TRANSMITTER_COUNT = 2;
const RECEPTOR_COUNT = 4;
const VESICLE_COUNT = 24;
const CLOUD_PARTICLES = 56;
const MAX_CLEFT_CONCENTRATION = 25;
const RELEASE_VISIBLE_SECONDS = 0.018;
const RECAPTURE_REFERENCE_MOLES = 2e-20;

export function concentrationActivity(molesPerCubicMeter: number): number {
  if (!Number.isFinite(molesPerCubicMeter) || molesPerCubicMeter <= 0) return 0;
  return THREE.MathUtils.clamp(
    Math.log1p(molesPerCubicMeter) / Math.log1p(MAX_CLEFT_CONCENTRATION),
    0,
    1,
  );
}

export function releaseActivity(snapshot: NeuralSnapshot, transmitter: number): number {
  const releaseTime = snapshot.chemical.latestReleaseTimeSeconds[transmitter] ?? -1;
  const releasedMoles = snapshot.chemical.latestReleaseMoles[transmitter] ?? 0;
  if (releaseTime < 0 || releasedMoles <= 0) return 0;
  const age = Math.max(0, snapshot.chemical.timeSeconds - releaseTime);
  return THREE.MathUtils.clamp(1 - age / RELEASE_VISIBLE_SECONDS, 0, 1);
}

export function recaptureActivity(
  snapshot: NeuralSnapshot,
  previous: NeuralSnapshot | undefined,
  transmitter: number,
): number {
  if (!previous) return 0;
  const delta = Math.max(
    0,
    (snapshot.chemical.clearedMoles[transmitter] ?? 0) -
      (previous.chemical.clearedMoles[transmitter] ?? 0),
  );
  return THREE.MathUtils.clamp(1 - Math.exp(-delta / RECAPTURE_REFERENCE_MOLES), 0, 1);
}

function vesiclePosition(index: number, transmitter: number): THREE.Vector3 {
  const localIndex = transmitter === 0 ? index : index - 16;
  const ring = Math.floor(localIndex / 8);
  const angle = (localIndex % 8) / 8 * Math.PI * 2 + ring * 0.37;
  const radius = 0.15 + ring * 0.14;
  return new THREE.Vector3(
    (transmitter === 0 ? -0.22 : 0.22) + Math.cos(angle) * radius,
    0.57 + ring * 0.14,
    Math.sin(angle) * radius * 0.72,
  );
}

function cloudPosition(index: number, transmitter: number): THREE.Vector3 {
  const phase = (index * 2.399_963_229_728_653 + transmitter * 1.17) % (Math.PI * 2);
  const radius = 0.13 + ((index * 37) % CLOUD_PARTICLES) / CLOUD_PARTICLES * 0.82;
  const layer = ((index * 29) % CLOUD_PARTICLES) / (CLOUD_PARTICLES - 1);
  return new THREE.Vector3(
    Math.cos(phase) * radius,
    0.43 - layer * 0.78,
    Math.sin(phase) * radius * 0.68 + (transmitter === 0 ? -0.05 : 0.05),
  );
}

export class SynapseRenderLayer implements RenderLayer {
  readonly group = new THREE.Group();
  private readonly bouton: THREE.Mesh;
  private readonly postsynapticMembrane: THREE.Mesh;
  private readonly cleftRim: THREE.Mesh;
  private readonly vesicles: THREE.InstancedMesh;
  private readonly transmitterClouds: THREE.InstancedMesh[] = [];
  private readonly releaseSites: THREE.Mesh[] = [];
  private readonly receptorSites: THREE.InstancedMesh;
  private readonly recaptureSites: THREE.Mesh[] = [];
  private readonly matrix = new THREE.Matrix4();
  private readonly color = new THREE.Color();

  constructor() {
    this.group.name = "published-chemical-synapse";

    this.bouton = new THREE.Mesh(
      new THREE.SphereGeometry(0.82, 36, 20, 0, Math.PI * 2, 0, Math.PI * 0.5),
      new THREE.MeshBasicMaterial({
        color: VISUAL_COLORS.presynapticMembrane,
        transparent: true,
        opacity: 0.32,
        blending: THREE.NormalBlending,
        depthWrite: true,
        side: THREE.BackSide,
      }),
    );
    this.bouton.name = "presynaptic-bouton";
    this.bouton.position.y = 0.34;
    declareVisual(this.bouton, "matter", "topology");
    this.group.add(this.bouton);

    this.postsynapticMembrane = new THREE.Mesh(
      new THREE.CylinderGeometry(0.96, 1.04, 0.14, 64),
      new THREE.MeshBasicMaterial({
        color: VISUAL_COLORS.postsynapticMembrane,
        transparent: true,
        opacity: 0.58,
        blending: THREE.NormalBlending,
        depthWrite: true,
      }),
    );
    this.postsynapticMembrane.name = "postsynaptic-membrane";
    this.postsynapticMembrane.position.y = -0.5;
    declareVisual(this.postsynapticMembrane, "matter", "topology");
    this.group.add(this.postsynapticMembrane);

    this.cleftRim = new THREE.Mesh(
      new THREE.TorusGeometry(1.02, 0.012, 8, 96),
      new THREE.MeshBasicMaterial({
        color: VISUAL_COLORS.cleftBoundary,
        transparent: true,
        opacity: 0.36,
        blending: THREE.NormalBlending,
        depthWrite: true,
      }),
    );
    this.cleftRim.name = "cleft-scale-boundary";
    this.cleftRim.rotation.x = Math.PI / 2;
    this.cleftRim.position.y = -0.41;
    declareVisual(this.cleftRim, "matter", "topology");
    this.group.add(this.cleftRim);

    this.vesicles = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.075, 12, 8),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.68,
        blending: THREE.NormalBlending,
        depthWrite: true,
      }),
      VESICLE_COUNT,
    );
    this.vesicles.name = "vesicular-reserve";
    this.vesicles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    declareVisual(this.vesicles, "matter", "state", {
      field: "chemical.vesicleAvailableFraction",
      unit: "fraction",
      transform: "available fraction to visible vesicle count",
      redundancy: ["size", "position", "label"],
    });
    this.group.add(this.vesicles);

    for (let transmitter = 0; transmitter < TRANSMITTER_COUNT; transmitter += 1) {
      const cloud = new THREE.InstancedMesh(
        new THREE.SphereGeometry(transmitter === 0 ? 0.024 : 0.031, 7, 5),
        new THREE.MeshBasicMaterial({
          color: transmitter === 0 ? VISUAL_COLORS.glutamate : VISUAL_COLORS.gaba,
          transparent: true,
          opacity: 0.72,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
        CLOUD_PARTICLES,
      );
      cloud.name = transmitter === 0 ? "glutamate-cloud" : "gaba-cloud";
      cloud.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      declareVisual(cloud, "emission", "state", {
        field: `chemical.cleftConcentrationMolesPerCubicMeter[${transmitter}]`,
        unit: "mol/m³",
        transform: "concentration to particle count/scale by transmitter",
        redundancy: ["size", "position", "label"],
      });
      this.transmitterClouds.push(cloud);
      this.group.add(cloud);

      const releaseSite = new THREE.Mesh(
        new THREE.TorusGeometry(0.13, 0.018, 8, 28),
        new THREE.MeshBasicMaterial({
          color: transmitter === 0 ? VISUAL_COLORS.glutamate : VISUAL_COLORS.gaba,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      releaseSite.name = transmitter === 0 ? "glutamate-release" : "gaba-release";
      releaseSite.position.set(transmitter === 0 ? -0.25 : 0.25, 0.35, 0);
      releaseSite.rotation.x = Math.PI / 2;
      declareVisual(releaseSite, "emission", "state", {
        field: `chemical.latestReleaseMoles[${transmitter}]`,
        unit: "mol",
        transform: "latest event amount to release-ring opacity/scale",
        redundancy: ["position", "size", "label"],
      });
      this.releaseSites.push(releaseSite);
      this.group.add(releaseSite);

      const recapture = new THREE.Mesh(
        new THREE.TorusGeometry(0.12, 0.025, 8, 22),
        new THREE.MeshBasicMaterial({
          color: VISUAL_COLORS.recapture,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      recapture.name = transmitter === 0 ? "glutamate-recapture" : "gaba-recapture";
      recapture.position.set(transmitter === 0 ? -0.78 : 0.78, -0.08, 0);
      recapture.rotation.y = Math.PI / 2;
      declareVisual(recapture, "emission", "state", {
        field: `chemical.clearedMoles[${transmitter}]`,
        unit: "mol",
        transform: "cleared delta to lateral recapture ring",
        redundancy: ["position", "orientation", "label"],
      });
      this.recaptureSites.push(recapture);
      this.group.add(recapture);
    }

    this.receptorSites = new THREE.InstancedMesh(
      new THREE.TorusGeometry(0.09, 0.018, 8, 20),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.74,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
      RECEPTOR_COUNT,
    );
    this.receptorSites.name = "published-receptor-occupancy";
    this.receptorSites.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    declareVisual(this.receptorSites, "emission", "state", {
      field: "chemical.receptorOccupancyFraction",
      unit: "fraction",
      transform: "receptor family and occupancy to position/scale",
      redundancy: ["position", "size", "label"],
    });
    this.group.add(this.receptorSites);
  }

  mount(context: RenderContext, _topology: RenderTopology): void {
    mountLayer(this.group, context);
  }

  update(view: InterpolatedSnapshot): void {
    const snapshot = view.current;
    for (let index = 0; index < VESICLE_COUNT; index += 1) {
      const transmitter = index < 16 ? 0 : 1;
      const available = THREE.MathUtils.clamp(
        snapshot.chemical.vesicleAvailableFraction[transmitter] ?? 0,
        0,
        1,
      );
      const localIndex = transmitter === 0 ? index : index - 16;
      const localCount = transmitter === 0 ? 16 : 8;
      const occupied = (localIndex + 0.5) / localCount <= available;
      const scale = occupied ? 0.72 + available * 0.34 : 0.08;
      this.matrix.compose(
        vesiclePosition(index, transmitter),
        new THREE.Quaternion(),
        new THREE.Vector3(scale, scale, scale),
      );
      this.vesicles.setMatrixAt(index, this.matrix);
      this.vesicles.setColorAt(
        index,
        transmitter === 0 ? COLOR_TOKENS.glutamate : COLOR_TOKENS.gaba,
      );
    }
    this.vesicles.instanceMatrix.needsUpdate = true;
    if (this.vesicles.instanceColor) this.vesicles.instanceColor.needsUpdate = true;

    for (let transmitter = 0; transmitter < TRANSMITTER_COUNT; transmitter += 1) {
      const concentration = concentrationActivity(
        snapshot.chemical.cleftConcentrationMolesPerCubicMeter[transmitter] ?? 0,
      );
      const cloud = this.transmitterClouds[transmitter];
      for (let index = 0; index < CLOUD_PARTICLES; index += 1) {
        const visible = (index + 0.5) / CLOUD_PARTICLES <= concentration;
        const scale = visible ? 0.62 + concentration * 0.78 : 0.001;
        this.matrix.compose(
          cloudPosition(index, transmitter),
          new THREE.Quaternion(),
          new THREE.Vector3(scale, scale, scale),
        );
        cloud.setMatrixAt(index, this.matrix);
      }
      cloud.instanceMatrix.needsUpdate = true;
      const release = releaseActivity(snapshot, transmitter);
      const releaseSite = this.releaseSites[transmitter];
      releaseSite.scale.setScalar(0.58 + release * 0.58);
      (releaseSite.material as THREE.MeshBasicMaterial).opacity = release * 0.54;

      const recapture = recaptureActivity(snapshot, view.previous, transmitter);
      const recaptureSite = this.recaptureSites[transmitter];
      recaptureSite.scale.setScalar(0.54 + recapture * 0.38);
      (recaptureSite.material as THREE.MeshBasicMaterial).opacity = recapture * 0.32;
    }

    const receptorColors = [
      COLOR_TOKENS.ampa,
      COLOR_TOKENS.nmda,
      COLOR_TOKENS.gabaa,
      COLOR_TOKENS.gabab,
    ];
    for (let receptor = 0; receptor < RECEPTOR_COUNT; receptor += 1) {
      const occupancy = THREE.MathUtils.clamp(
        snapshot.chemical.receptorOccupancyFraction[receptor] ?? 0,
        0,
        1,
      );
      const angle = (receptor / RECEPTOR_COUNT) * Math.PI * 2 + Math.PI / 4;
      this.matrix.compose(
        new THREE.Vector3(Math.cos(angle) * 0.62, -0.45, Math.sin(angle) * 0.42),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, angle)),
        new THREE.Vector3(0.58 + occupancy * 1.35, 0.58 + occupancy * 1.35, 1),
      );
      this.receptorSites.setMatrixAt(receptor, this.matrix);
      this.color.copy(encodeStateColor(receptorColors[receptor], occupancy, 0.58));
      this.receptorSites.setColorAt(receptor, this.color);
    }
    this.receptorSites.instanceMatrix.needsUpdate = true;
    if (this.receptorSites.instanceColor) {
      this.receptorSites.instanceColor.needsUpdate = true;
    }
  }

  setDetail(_level: number): void {
    // The published chemical buffers define density; presentation LOD does not
    // invent or remove chemical mass.
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  dispose(): void {
    disposeObjectTree(this.group);
  }
}
