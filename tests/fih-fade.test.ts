import { describe, expect, it } from "vitest";
import { ShaderMaterial } from "three";
import { updateFihFade } from "../src/fih/fade";

const material = (duration = 0.6) => new ShaderMaterial({
  alphaHash: true,
  uniforms: { fadeDuration: { value: duration } },
});

describe("batch fade shader selection", () => {
  it("switches to opaque only when the newest fish finishes fading", () => {
    const fish = material();
    updateFihFade(fish, 10.5, 10);
    expect(fish.alphaHash).toBe(true);
    updateFihFade(fish, 10.6, 10);
    expect(fish.alphaHash).toBe(false);
  });

  it("reuses the shader until the next release starts another fade", () => {
    const fish = material();
    const initialVersion = fish.version;
    updateFihFade(fish, 0.3, 0);
    expect(fish.version).toBe(initialVersion);
    updateFihFade(fish, 1, 0);
    expect(fish.version).toBe(initialVersion + 1);
    updateFihFade(fish, 2, 0);
    expect(fish.version).toBe(initialVersion + 1);
    updateFihFade(fish, 2, 2);
    expect(fish.alphaHash).toBe(true);
    expect(fish.version).toBe(initialVersion + 2);
  });

  it("skips the hashed shader entirely when fading is disabled", () => {
    const fish = material(0);
    updateFihFade(fish, 0, 0);
    expect(fish.alphaHash).toBe(false);
    updateFihFade(fish, 10, 10);
    expect(fish.alphaHash).toBe(false);
  });
});
