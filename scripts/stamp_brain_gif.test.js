import { describe, expect, it } from "vitest";
import { stampBrainGifReference } from "./stamp_brain_gif.js";

describe("stampBrainGifReference", () => {
  it("replaces the cache key with the source commit", () => {
    const sha = "1234567890abcdef1234567890abcdef12345678";
    const source = '<img src="assets/brain.gif?v=old" />';

    expect(stampBrainGifReference(source, sha)).toContain(
      "assets/brain.gif?v=1234567890ab",
    );
  });

  it("rejects invalid commits and missing references", () => {
    expect(() => stampBrainGifReference("README", "short")).toThrow(/40-character/);
    expect(() =>
      stampBrainGifReference(
        "README",
        "1234567890abcdef1234567890abcdef12345678",
      ),
    ).toThrow(/not found/);
  });

  it("is idempotent when the README already contains the source commit", () => {
    const sha = "1234567890abcdef1234567890abcdef12345678";
    const source = '<img src="assets/brain.gif?v=1234567890ab" />';
    expect(stampBrainGifReference(source, sha)).toBe(source);
  });
});
