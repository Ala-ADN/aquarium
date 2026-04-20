import { describe, expect, it, vi } from "vitest";
import { BOUNDS_HALF, WIDTH } from "../src/constants";
import { RepeatWrapping, Vector3 } from "three";

vi.mock("three/examples/jsm/misc/GPUComputationRenderer.js", () => {
  class MockGPUComputationRenderer {
    width: number;
    height: number;
    renderer: unknown;

    constructor(width: number, height: number, renderer: unknown) {
      this.width = width;
      this.height = height;
      this.renderer = renderer;
    }

    createTexture() {
      return {
        image: {
          data: new Float32Array(this.width * this.height * 4),
        },
      };
    }

    addVariable(name: string, fragmentShader: string, texture: unknown) {
      return {
        name,
        fragmentShader,
        initialTexture: texture,
        material: {
          uniforms: {},
          defines: {},
        },
        wrapS: null,
        wrapT: null,
      };
    }

    setVariableDependencies() {
      // No-op.
    }

    init() {
      return null;
    }

    compute() {
      // No-op.
    }

    getCurrentRenderTarget(variable: any) {
      return {
        texture: variable.initialTexture,
      };
    }
  }

  return {
    GPUComputationRenderer: MockGPUComputationRenderer,
  };
});

import { GPUSimulation } from "../src/simulation/GPUSimulation";

describe("GPUSimulation", () => {
  it("fills position texture within bounds and sets required uniform/wrap defaults", () => {
    const simulation = new GPUSimulation({} as any);

    const positionData = simulation.positionVariable.initialTexture.image.data as Float32Array;

    expect(positionData.length).toBe(WIDTH * WIDTH * 4);

    for (let i = 0; i < positionData.length; i += 4) {
      expect(positionData[i + 0]).toBeGreaterThanOrEqual(-BOUNDS_HALF);
      expect(positionData[i + 0]).toBeLessThanOrEqual(BOUNDS_HALF);
      expect(positionData[i + 1]).toBeGreaterThanOrEqual(-BOUNDS_HALF);
      expect(positionData[i + 1]).toBeLessThanOrEqual(BOUNDS_HALF);
      expect(positionData[i + 2]).toBeGreaterThanOrEqual(-BOUNDS_HALF);
      expect(positionData[i + 2]).toBeLessThanOrEqual(BOUNDS_HALF);
      expect(positionData[i + 3]).toBe(1);
    }

    expect(simulation.positionUniforms.time.value).toBe(0);
    expect(simulation.positionUniforms.delta.value).toBe(0);
    expect(simulation.velocityUniforms.time.value).toBe(1);
    expect(simulation.velocityUniforms.delta.value).toBe(0);
    expect(simulation.velocityUniforms.testing.value).toBe(1);
    expect(simulation.velocityUniforms.separationDistance.value).toBe(1);
    expect(simulation.velocityUniforms.alignmentDistance.value).toBe(1);
    expect(simulation.velocityUniforms.cohesionDistance.value).toBe(1);
    expect(simulation.velocityUniforms.freedomFactor.value).toBe(1);
    expect(simulation.velocityUniforms.predator.value).toBeInstanceOf(Vector3);

    expect(simulation.positionVariable.wrapS).toBe(RepeatWrapping);
    expect(simulation.positionVariable.wrapT).toBe(RepeatWrapping);
    expect(simulation.velocityVariable.wrapS).toBe(RepeatWrapping);
    expect(simulation.velocityVariable.wrapT).toBe(RepeatWrapping);
  });
});
