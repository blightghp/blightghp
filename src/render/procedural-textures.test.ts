import { afterEach, describe, expect, it, vi } from "vitest";
import {
  generateProceduralNormalMap,
  ProceduralNormalMapCache,
} from "./procedural-textures";

interface FakeCanvas {
  width: number;
  height: number;
  pixels?: Uint8ClampedArray;
  getContext(type: string): {
    createImageData(width: number, height: number): ImageData;
    putImageData(image: ImageData): void;
  } | null;
}

function installFakeCanvasDocument(): void {
  vi.stubGlobal("document", {
    createElement(tagName: string): FakeCanvas {
      if (tagName !== "canvas") throw new Error(`unexpected element: ${tagName}`);
      const canvas: FakeCanvas = {
        width: 0,
        height: 0,
        getContext(type) {
          if (type !== "2d") return null;
          return {
            createImageData(width, height) {
              return {
                width,
                height,
                colorSpace: "srgb",
                data: new Uint8ClampedArray(width * height * 4),
              } as ImageData;
            },
            putImageData(image) {
              canvas.pixels = image.data.slice();
            },
          };
        },
      };
      return canvas;
    },
  } as unknown as Document);
}

afterEach(() => vi.unstubAllGlobals());

describe("procedural normal-map contract", () => {
  it("is deterministic by type and seed without external assets", () => {
    installFakeCanvasDocument();
    const first = generateProceduralNormalMap(32, 32, "cortical", 17);
    const replay = generateProceduralNormalMap(32, 32, "cortical", 17);
    const other = generateProceduralNormalMap(32, 32, "membrane", 17);
    const firstPixels = (first.image as unknown as FakeCanvas).pixels;
    const replayPixels = (replay.image as unknown as FakeCanvas).pixels;
    const otherPixels = (other.image as unknown as FakeCanvas).pixels;
    expect(firstPixels).toEqual(replayPixels);
    expect(firstPixels).not.toEqual(otherPixels);
    expect(first.name).toContain("cortical");
    first.dispose();
    replay.dispose();
    other.dispose();
  });

  it("caches three shared 256² maps and disposes each exactly once", () => {
    installFakeCanvasDocument();
    const cache = new ProceduralNormalMapCache();
    const cortical = cache.get("cortical");
    const membrane = cache.get("membrane");
    const vesicle = cache.get("vesicle");
    expect(cache.get("cortical")).toBe(cortical);
    expect(cache.count()).toBe(3);
    expect(cache.estimatedBytes()).toBe(1_048_576);
    const disposalEvents = [cortical, membrane, vesicle].map((texture) => {
      const disposed = vi.fn();
      texture.addEventListener("dispose", disposed);
      return disposed;
    });
    cache.dispose();
    cache.dispose();
    for (const disposed of disposalEvents) expect(disposed).toHaveBeenCalledOnce();
  });
});
