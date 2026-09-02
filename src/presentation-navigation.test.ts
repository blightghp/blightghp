import { describe, expect, it } from "vitest";
import {
  easePresentationTransition,
  framePresentationCameraPose,
  interpolatePresentationCameraPose,
  PRESENTATION_NAVIGATION_CONTRACT,
  PRESENTATION_NAVIGATION_SCHEMA_VERSION,
  PRESENTATION_SCALE_TRAIL,
  presentationScaleStepFor,
  savedViewpointById,
} from "./presentation-navigation";

describe("presentation navigation contract", () => {
  it("keeps saved viewpoints and the scale trail in a versioned presentation-only contract", () => {
    expect(PRESENTATION_NAVIGATION_CONTRACT.schemaVersion).toBe(
      PRESENTATION_NAVIGATION_SCHEMA_VERSION,
    );
    expect(PRESENTATION_NAVIGATION_CONTRACT.savedViewpoints.map(({ id }) => id)).toEqual([
      "frontal",
      "lateral",
      "superior",
      "oblique",
    ]);
    expect(PRESENTATION_SCALE_TRAIL.map(({ id }) => id)).toEqual([
      "encephalon",
      "region",
      "column",
      "patch",
      "neuron",
      "synapse",
    ]);
    expect(savedViewpointById("superior")?.pose.up).toEqual({ x: 0, y: 0, z: -1 });
  });

  it("maps each presentation view to the authoritative scale without changing a model", () => {
    expect(presentationScaleStepFor("overview", "encephalon")).toBe("encephalon");
    expect(presentationScaleStepFor("overview", "region")).toBe("region");
    expect(presentationScaleStepFor("laminar")).toBe("column");
    expect(presentationScaleStepFor("cell")).toBe("patch");
    expect(presentationScaleStepFor("electricity")).toBe("patch");
    expect(presentationScaleStepFor("neuron")).toBe("neuron");
    expect(presentationScaleStepFor("synapse")).toBe("synapse");
  });

  it("interpolates complete camera poses and clamps transition progress", () => {
    const from = {
      position: { x: 0, y: 0, z: 4 },
      target: { x: 0, y: 0, z: 0 },
      up: { x: 0, y: 1, z: 0 },
    };
    const to = {
      position: { x: 4, y: 2, z: 0 },
      target: { x: 1, y: 1, z: 1 },
      up: { x: 0, y: 0, z: -1 },
    };
    expect(interpolatePresentationCameraPose(from, to, 0.5)).toEqual({
      position: { x: 2, y: 1, z: 2 },
      target: { x: 0.5, y: 0.5, z: 0.5 },
      up: { x: 0, y: 0.5, z: -0.5 },
    });
    expect(interpolatePresentationCameraPose(from, to, 2)).toEqual(to);
    expect(easePresentationTransition(0)).toBe(0);
    expect(easePresentationTransition(1)).toBe(1);
  });

  it("frames selected presentation bounds within the orbit safety limits", () => {
    const framed = framePresentationCameraPose(
      {
        position: { x: 0, y: 0, z: 5 },
        target: { x: 0, y: 0, z: 0 },
        up: { x: 0, y: 1, z: 0 },
      },
      { center: { x: 1, y: 2, z: 3 }, radius: 0.6 },
      {
        verticalFovDegrees: 38,
        aspect: 16 / 9,
        minDistance: 2.8,
        maxDistance: 7,
      },
    );
    expect(framed.target).toEqual({ x: 1, y: 2, z: 3 });
    expect(framed.position.x).toBe(1);
    expect(framed.position.y).toBe(2);
    expect(framed.position.z).toBeGreaterThanOrEqual(5.8);
    expect(framed.position.z).toBeLessThanOrEqual(10);
  });
});
