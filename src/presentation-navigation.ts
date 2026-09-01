import type { SimulationView } from "./render";

/**
 * Navigation is a presentation contract.  It deliberately has no scientific
 * preset, Worker message, snapshot field, or replay input.
 */
export const PRESENTATION_NAVIGATION_SCHEMA_VERSION = 1;
export const PRESENTATION_TRANSITION_DURATION_MS = 420;

export interface PresentationVector {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface PresentationCameraPose {
  readonly position: PresentationVector;
  readonly target: PresentationVector;
  readonly up: PresentationVector;
}

export interface SavedViewpoint {
  readonly id: "frontal" | "lateral" | "superior" | "oblique";
  readonly label: string;
  readonly shortLabel: string;
  readonly orientation: "frontal" | "lateral" | "superior" | "oblique";
  readonly pose: PresentationCameraPose;
}

export type SavedViewpointId = SavedViewpoint["id"];

const vector = (x: number, y: number, z: number): PresentationVector => ({ x, y, z });
const pose = (
  position: PresentationVector,
  target: PresentationVector = vector(0, -0.05, 0),
  up: PresentationVector = vector(0, 1, 0),
): PresentationCameraPose => ({ position, target, up });

/** Fixed, reviewable viewpoints; they are not part of a scientific preset. */
export const SAVED_VIEWPOINTS = [
  {
    id: "frontal",
    label: "Frontal",
    shortLabel: "FRENTE",
    orientation: "frontal",
    pose: pose(vector(0.18, 0.08, 4.82)),
  },
  {
    id: "lateral",
    label: "Lateral",
    shortLabel: "LATERAL",
    orientation: "lateral",
    pose: pose(vector(4.82, 0.08, 0.01)),
  },
  {
    id: "superior",
    label: "Superior",
    shortLabel: "SUPERIOR",
    orientation: "superior",
    pose: pose(vector(0.01, 4.82, 0.01), vector(0, -0.05, 0), vector(0, 0, -1)),
  },
  {
    id: "oblique",
    label: "Oblíqua",
    shortLabel: "OBLÍQUA",
    orientation: "oblique",
    pose: pose(vector(3.45, 2.6, 3.45)),
  },
] as const satisfies readonly SavedViewpoint[];

export type ScaleStepId =
  | "encephalon"
  | "region"
  | "column"
  | "patch"
  | "neuron"
  | "synapse";

export interface PresentationScaleStep {
  readonly id: ScaleStepId;
  readonly label: string;
  readonly view: SimulationView;
  readonly selectionId: string;
  readonly pose: PresentationCameraPose;
  readonly note: string;
}

/**
 * The trail preserves the user's orientation across local presentation roots.
 * Distances are readable camera placements, never calibrated anatomical scale.
 */
export const PRESENTATION_SCALE_TRAIL = [
  {
    id: "encephalon",
    label: "Encéfalo",
    view: "overview",
    selectionId: "brain-pro:anatomy/encephalon",
    pose: pose(vector(0.18, 0.08, 5.2)),
    note: "Rede e campo procedurais; dezenas de centímetros apenas orientativos.",
  },
  {
    id: "region",
    label: "Região",
    view: "overview",
    selectionId: "brain-pro:anatomy/cerebrum",
    pose: pose(vector(0.18, 0.08, 4.5)),
    note: "Região procedural; não é atlas parcelado ou coordenada de indivíduo.",
  },
  {
    id: "column",
    label: "Coluna",
    view: "laminar",
    selectionId: "brain-pro:anatomy/cortical-column",
    pose: pose(vector(1.58, 0.82, 4.28)),
    note: "L1–L6 e relé/TRN são um esquema didático de coluna local.",
  },
  {
    id: "patch",
    label: "Patch",
    view: "cell",
    selectionId: "brain-pro:anatomy/cell-patch",
    pose: pose(vector(0.92, 0.42, 3.82)),
    note: "Patch de 12 células; não é uma amostra histológica calibrada.",
  },
  {
    id: "neuron",
    label: "Neurônio",
    view: "neuron",
    selectionId: "brain-pro:anatomy/neuron",
    pose: pose(vector(0.58, 0.24, 3.32)),
    note: "Morfologia ilustrativa de uma célula publicada pelo patch.",
  },
  {
    id: "synapse",
    label: "Sinapse",
    view: "synapse",
    selectionId: "brain-pro:anatomy/synapse",
    pose: pose(vector(0.36, 0.16, 2.92)),
    note: "Microdomínio químico representativo com escala visual exagerada.",
  },
] as const satisfies readonly PresentationScaleStep[];

export const PRESENTATION_NAVIGATION_CONTRACT = {
  schemaVersion: PRESENTATION_NAVIGATION_SCHEMA_VERSION,
  savedViewpoints: SAVED_VIEWPOINTS,
  scaleTrail: PRESENTATION_SCALE_TRAIL,
} as const;

export function savedViewpointById(id: string): SavedViewpoint | undefined {
  return SAVED_VIEWPOINTS.find((viewpoint) => viewpoint.id === id);
}

export function presentationScaleStepById(id: string): PresentationScaleStep | undefined {
  return PRESENTATION_SCALE_TRAIL.find((step) => step.id === id);
}

export function presentationScaleStepFor(
  view: SimulationView,
  selectedScale?: string,
): ScaleStepId | undefined {
  if (view === "overview") return selectedScale === "region" ? "region" : "encephalon";
  if (view === "laminar") return "column";
  if (view === "cell" || view === "electricity") return "patch";
  if (view === "neuron") return "neuron";
  if (view === "synapse") return "synapse";
  return undefined;
}

export function lerpPresentationVector(
  from: PresentationVector,
  to: PresentationVector,
  progress: number,
): PresentationVector {
  const amount = Math.min(1, Math.max(0, progress));
  return vector(
    from.x + (to.x - from.x) * amount,
    from.y + (to.y - from.y) * amount,
    from.z + (to.z - from.z) * amount,
  );
}

export function interpolatePresentationCameraPose(
  from: PresentationCameraPose,
  to: PresentationCameraPose,
  progress: number,
): PresentationCameraPose {
  return {
    position: lerpPresentationVector(from.position, to.position, progress),
    target: lerpPresentationVector(from.target, to.target, progress),
    up: lerpPresentationVector(from.up, to.up, progress),
  };
}

export function easePresentationTransition(progress: number): number {
  const amount = Math.min(1, Math.max(0, progress));
  return 1 - (1 - amount) ** 3;
}

export interface PresentationFrameTarget {
  readonly center: PresentationVector;
  readonly radius: number;
}

export interface FramePresentationCameraOptions {
  readonly verticalFovDegrees: number;
  readonly aspect: number;
  readonly minDistance: number;
  readonly maxDistance: number;
  readonly padding?: number;
}

function subtract(first: PresentationVector, second: PresentationVector): PresentationVector {
  return vector(first.x - second.x, first.y - second.y, first.z - second.z);
}

function length(value: PresentationVector): number {
  return Math.hypot(value.x, value.y, value.z);
}

function normalize(value: PresentationVector): PresentationVector {
  const magnitude = length(value);
  return magnitude > Number.EPSILON ? vector(value.x / magnitude, value.y / magnitude, value.z / magnitude) :
    vector(0, 0, 1);
}

function add(first: PresentationVector, second: PresentationVector): PresentationVector {
  return vector(first.x + second.x, first.y + second.y, first.z + second.z);
}

function multiply(value: PresentationVector, scalar: number): PresentationVector {
  return vector(value.x * scalar, value.y * scalar, value.z * scalar);
}

/** Frames a presentation-only bound while preserving the current orientation. */
export function framePresentationCameraPose(
  current: PresentationCameraPose,
  target: PresentationFrameTarget,
  options: FramePresentationCameraOptions,
): PresentationCameraPose {
  const radius = Math.max(target.radius, 0.001);
  const verticalHalfFov = (options.verticalFovDegrees * Math.PI) / 360;
  const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * Math.max(options.aspect, 0.01));
  const limitingHalfFov = Math.min(verticalHalfFov, horizontalHalfFov);
  const padding = Math.max(options.padding ?? 1.25, 1);
  const requiredDistance = (radius / Math.sin(limitingHalfFov)) * padding;
  const distance = Math.min(options.maxDistance, Math.max(options.minDistance, requiredDistance));
  const direction = normalize(subtract(current.position, current.target));
  return {
    position: add(target.center, multiply(direction, distance)),
    target: target.center,
    up: current.up,
  };
}
