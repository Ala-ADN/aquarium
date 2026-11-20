import { describe, expect, it, vi } from "vitest";
import { DataTexture, WebGLRenderTarget } from "three";
import type { WebGLRenderer } from "three";
import { GPUSimulation } from "../src/simulation/GPUSimulation";
import { INITIAL_FIH, WIDTH } from "../src/constants";

describe("simulation startup", () => {
  it("provides seeded textures for the first frame without touching a WebGL renderer", () => {
    // Any GPU initialization would access renderer capabilities and fail here.
    const simulation = new GPUSimulation({} as WebGLRenderer);
    const position = simulation.getCurrentPositionTexture() as DataTexture;
    const velocity = simulation.getCurrentVelocityTexture() as DataTexture;
    expect(position).toBeInstanceOf(DataTexture);
    expect(velocity).toBeInstanceOf(DataTexture);
    expect(position.image.width).toBe(WIDTH);
    expect(position.image.height).toBe(WIDTH);
    expect(Array.from(position.image.data).every(Number.isFinite)).toBe(true);
    expect(Array.from(velocity.image.data).every(Number.isFinite)).toBe(true);
    expect(simulation.velocityUniforms.activeCount.value).toBe(INITIAL_FIH);
  });

  it("initializes once on the first simulation step and then exposes the computed textures", () => {
    const simulation = new GPUSimulation({} as WebGLRenderer);
    const position = new WebGLRenderTarget(WIDTH, WIDTH);
    const velocity = new WebGLRenderTarget(WIDTH, WIDTH);
    const initialize = vi.spyOn(simulation.gpuCompute, "init").mockImplementation(() => {
      simulation.positionVariable.renderTargets[0] = position;
      simulation.velocityVariable.renderTargets[0] = velocity;
      return null;
    });
    const compute = vi.spyOn(simulation.gpuCompute, "compute").mockImplementation(() => {});
    simulation.compute();
    expect(simulation.getCurrentPositionTexture()).toBe(position.texture);
    expect(simulation.getCurrentVelocityTexture()).toBe(velocity.texture);
    simulation.compute();
    expect(initialize).toHaveBeenCalledOnce();
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("marks sparse simulation slots active and clears removed slots in both compute passes", () => {
    const simulation = new GPUSimulation({} as WebGLRenderer);
    const mask = simulation.velocityUniforms.activeSlots.value as DataTexture;
    expect(simulation.positionUniforms.activeSlots.value).toBe(mask);
    expect(Array.from(mask.image.data).filter((value) => value === 255)).toHaveLength(INITIAL_FIH);
    simulation.setActiveSlots([1, 35, 999]);
    expect(simulation.velocityUniforms.activeCount.value).toBe(3);
    expect(simulation.velocityUniforms.contiguousActiveSlots.value).toBe(false);
    expect(Array.from(mask.image.data).flatMap((value, slot) => value === 255 ? [slot] : [])).toEqual([1, 35, 999]);
    simulation.setActiveSlots([35]);
    expect(simulation.velocityUniforms.activeCount.value).toBe(1);
    expect(mask.image.data[1]).toBe(0);
    expect(mask.image.data[35]).toBe(255);
    expect(mask.image.data[999]).toBe(0);
    simulation.setActiveSlots([]);
    expect(simulation.velocityUniforms.activeCount.value).toBe(0);
    expect(Array.from(mask.image.data).every((value) => value === 0)).toBe(true);
    expect(simulation.velocityUniforms.contiguousActiveSlots.value).toBe(true);
  });

  it("builds a compact neighbor list in slot order and bypasses it for dense schools", () => {
    const simulation = new GPUSimulation({} as WebGLRenderer);
    expect(simulation.velocityUniforms.contiguousActiveSlots.value).toBe(true);
    expect(simulation.positionUniforms.activeCount).toBe(simulation.velocityUniforms.activeCount);
    expect(simulation.positionUniforms.contiguousActiveSlots).toBe(simulation.velocityUniforms.contiguousActiveSlots);
    const references = simulation.velocityUniforms.activeReferences.value as DataTexture;
    simulation.setActiveSlots([999, 1, 35]);
    const coordinates = references.image.data!;
    for (const [index, slot] of [1, 35, 999].entries()) {
      expect(coordinates[index * 2]).toBeCloseTo(((slot % WIDTH) + .5) / WIDTH);
      expect(coordinates[index * 2 + 1]).toBeCloseTo((Math.floor(slot / WIDTH) + .5) / WIDTH);
    }
    simulation.setActiveSlots([2, 0, 1]);
    expect(simulation.velocityUniforms.activeCount.value).toBe(3);
    expect(simulation.velocityUniforms.contiguousActiveSlots.value).toBe(true);
    expect(Array.from(references.image.data!).slice(6).every((value) => value === 0)).toBe(true);
  });

  it("retains the first frame on unsupported hardware without retrying initialization every frame", () => {
    const simulation = new GPUSimulation({} as WebGLRenderer);
    const position = simulation.getCurrentPositionTexture();
    const initialize = vi.spyOn(simulation.gpuCompute, "init").mockReturnValue("Unsupported GPU");
    const compute = vi.spyOn(simulation.gpuCompute, "compute");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      simulation.compute();
      simulation.compute();
      expect(initialize).toHaveBeenCalledOnce();
      expect(compute).not.toHaveBeenCalled();
      expect(simulation.getCurrentPositionTexture()).toBe(position);
      expect(error).toHaveBeenCalledOnce();
    } finally { error.mockRestore(); }
  });
});
