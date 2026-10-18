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
