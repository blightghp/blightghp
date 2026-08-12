import * as THREE from "three";
import { decodeStateColor, encodeStateColor } from "./visual-encoding";

export interface RenderedStateSample {
  readonly expected: number;
  readonly recovered: number;
  readonly absoluteError: number;
  readonly rgba: readonly [number, number, number, number];
}

export interface RenderedStateProbeReport {
  readonly backend: string;
  readonly width: number;
  readonly height: number;
  readonly tolerance: number;
  readonly maximumError: number;
  readonly samples: readonly RenderedStateSample[];
}

const CLEAR_CHANNEL = 5 / 255;
const SAMPLE_STATES = [0, 0.125, 0.5, 0.875, 1] as const;

function byteToLinearSrgb(byte: number): number {
  const value = byte / 255;
  return value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4;
}

/**
 * Renders known state colors through WebGL, reads the center pixel, converts
 * the framebuffer sRGB bytes back to linear color and decodes the scalar.
 */
export function auditRenderedStatePixels(renderer: THREE.WebGLRenderer): RenderedStateProbeReport {
  const previousTarget = renderer.getRenderTarget();
  const previousColorSpace = renderer.outputColorSpace;
  const previousToneMapping = renderer.toneMapping;
  const previousAlpha = renderer.getClearAlpha();
  const previousClear = renderer.getClearColor(new THREE.Color()).clone();
  const target = new THREE.WebGLRenderTarget(7, 7, {
    depthBuffer: false,
    stencilBuffer: false,
  });
  target.texture.colorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
  camera.position.z = 1;
  const material = new THREE.MeshBasicMaterial({ toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  scene.add(mesh);
  const base = new THREE.Color(0x247fc4);
  const pixel = new Uint8Array(4);
  const samples: RenderedStateSample[] = [];

  try {
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.setClearColor(new THREE.Color(CLEAR_CHANNEL, CLEAR_CHANNEL, CLEAR_CHANNEL), 1);
    renderer.setRenderTarget(target);
    for (const expected of SAMPLE_STATES) {
      material.color.copy(encodeStateColor(base, expected));
      renderer.clear(true, false, false);
      renderer.render(scene, camera);
      renderer.readRenderTargetPixels(target, 3, 3, 1, 1, pixel);
      const recoveredColor = new THREE.Color(
        byteToLinearSrgb(pixel[0]),
        byteToLinearSrgb(pixel[1]),
        byteToLinearSrgb(pixel[2]),
      );
      const recovered = decodeStateColor(recoveredColor, base);
      samples.push({
        expected,
        recovered,
        absoluteError: Math.abs(recovered - expected),
        rgba: [pixel[0], pixel[1], pixel[2], pixel[3]],
      });
    }
  } finally {
    renderer.setRenderTarget(previousTarget);
    renderer.outputColorSpace = previousColorSpace;
    renderer.toneMapping = previousToneMapping;
    renderer.setClearColor(previousClear, previousAlpha);
    mesh.geometry.dispose();
    material.dispose();
    target.dispose();
  }

  const context = renderer.getContext();
  const debugInfo = context.getExtension("WEBGL_debug_renderer_info");
  const backend = debugInfo
    ? String(context.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL))
    : String(context.getParameter(context.RENDERER));
  return {
    backend,
    width: 7,
    height: 7,
    tolerance: 0.012,
    maximumError: Math.max(...samples.map(({ absoluteError }) => absoluteError)),
    samples,
  };
}
