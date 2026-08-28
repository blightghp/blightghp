import { describe, expect, it } from "vitest";
import {
  WEBGL_SHADER_COMPILATION_FAILURE,
  failClosedForWebGlShaderCompilation,
} from "./webgl-safety-fallback";

describe("WebGL shader safety fallback", () => {
  it("fails closed across tone mapping, materiality and clipping", () => {
    const calls: string[] = [];
    failClosedForWebGlShaderCompilation({
      toneMapping: {
        setSafetyFallback(reason) {
          calls.push(`tone:${reason}`);
        },
      },
      materialProfile: {
        failAtomic(reason) {
          calls.push(`material:${reason}`);
        },
      },
      clipping: {
        disable() {
          calls.push("clipping:disable");
        },
      },
    });

    expect(calls).toEqual([
      `tone:${WEBGL_SHADER_COMPILATION_FAILURE}`,
      `material:${WEBGL_SHADER_COMPILATION_FAILURE}`,
      "clipping:disable",
    ]);
  });

  it("is safe before every presentation subsystem is initialized", () => {
    expect(() => failClosedForWebGlShaderCompilation({})).not.toThrow();
  });
});
