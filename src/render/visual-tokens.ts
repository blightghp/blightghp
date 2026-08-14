import * as THREE from "three";

// Presentation colors live here so a semantic identity cannot drift between
// views. Consumers copy colors before interpolation; these instances are tokens.
export const VISUAL_COLORS = {
  transparentBlack: 0x000000,
  white: 0xffffff,
  network: 0x147df5,
  excitatory: 0x31c8ff,
  inhibitory: 0xc879ff,
  shunting: 0xffb45b,
  inactive: 0x526f89,
  featured: 0x2ed9ff,
  pulseCore: 0xf4fbff,
  pulseTrail: 0x36bfff,
  hot: 0xeafcff,
  dendrite: 0x4ac9ff,
  fieldBoundary: 0x2d91ff,
  recurrent: 0x6aaeff,
  feedback: 0xffb45b,
  regionLeftHemi: 0x1788f4,
  regionRightHemi: 0x24a5ff,
  regionCerebellum: 0x21bfea,
  regionStem: 0x6f9cff,
  glutamate: 0x43e0b2,
  gaba: 0xc879ff,
  ampa: 0x31c8ff,
  nmda: 0x6aaeff,
  gabaa: 0xc879ff,
  gabab: 0x9f71e8,
  recapture: 0xffb45b,
  presynapticMembrane: 0x285a78,
  postsynapticMembrane: 0x183d5c,
  cleftBoundary: 0x4f8dbd,
  vascularArterial: 0xe25e4f,
  vascularVenous: 0x527fd6,
  vascularCapillary: 0xd9b56d,
} as const;

export const COLOR_TOKENS = {
  network: new THREE.Color(VISUAL_COLORS.network),
  excitatory: new THREE.Color(VISUAL_COLORS.excitatory),
  inhibitory: new THREE.Color(VISUAL_COLORS.inhibitory),
  shunting: new THREE.Color(VISUAL_COLORS.shunting),
  inactive: new THREE.Color(VISUAL_COLORS.inactive),
  featured: new THREE.Color(VISUAL_COLORS.featured),
  pulseCore: new THREE.Color(VISUAL_COLORS.pulseCore),
  pulseTrail: new THREE.Color(VISUAL_COLORS.pulseTrail),
  hot: new THREE.Color(VISUAL_COLORS.hot),
  white: new THREE.Color(VISUAL_COLORS.white),
  glutamate: new THREE.Color(VISUAL_COLORS.glutamate),
  gaba: new THREE.Color(VISUAL_COLORS.gaba),
  ampa: new THREE.Color(VISUAL_COLORS.ampa),
  nmda: new THREE.Color(VISUAL_COLORS.nmda),
  gabaa: new THREE.Color(VISUAL_COLORS.gabaa),
  gabab: new THREE.Color(VISUAL_COLORS.gabab),
  recapture: new THREE.Color(VISUAL_COLORS.recapture),
} as const;

export const REGION_COLOR_TOKENS = {
  leftHemi: new THREE.Color(VISUAL_COLORS.regionLeftHemi),
  rightHemi: new THREE.Color(VISUAL_COLORS.regionRightHemi),
  cerebellum: new THREE.Color(VISUAL_COLORS.regionCerebellum),
  stem: new THREE.Color(VISUAL_COLORS.regionStem),
} as const;

export const POINT_TEXTURE_STOPS = [
  [0, "rgba(255,255,255,1)"],
  [0.18, "rgba(112,220,255,.95)"],
  [0.52, "rgba(13,112,255,.32)"],
  [1, "rgba(0,0,0,0)"],
] as const;

export const ACTIVITY_TRACE_STOPS = [
  [0, "rgba(29,126,235,.25)"],
  [1, "rgba(100,220,255,.95)"],
] as const;

export type ProjectionColorKind =
  | "recurrent"
  | "feedforward"
  | "feedback"
  | "thalamocortical"
  | "reticular";

export function projectionColorToken(kind: ProjectionColorKind): number {
  if (kind === "recurrent") return VISUAL_COLORS.recurrent;
  if (kind === "feedforward" || kind === "thalamocortical") {
    return VISUAL_COLORS.excitatory;
  }
  if (kind === "feedback") return VISUAL_COLORS.feedback;
  return VISUAL_COLORS.inhibitory;
}
