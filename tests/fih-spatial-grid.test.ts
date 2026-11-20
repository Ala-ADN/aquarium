import { describe, expect, it, vi } from "vitest";
import { Color, DataTexture, FloatType, WebGLRenderTarget } from "three";
import type { Points, Scene, WebGLRenderer } from "three";
import { SpatialGrid } from "../src/simulation/SpatialGrid";
import { GPUSimulation } from "../src/simulation/GPUSimulation";
import { WIDTH } from "../src/constants";

function mockRenderer() {
  let target: WebGLRenderTarget | null = new WebGLRenderTarget(1, 1);
  let color = new Color("#123456");
  let alpha = .5;
  return {
    autoClear: false,
    extensions: { has: vi.fn<(extension: string) => boolean>(() => true) },
    getRenderTarget: () => target,
    setRenderTarget: vi.fn((value: WebGLRenderTarget | null) => { target = value; }),
    getClearColor: (value: Color) => value.copy(color),
    getClearAlpha: () => alpha,
    setClearColor: vi.fn((value: Color | number, nextAlpha: number) => { color = new Color(value); alpha = nextAlpha; }),
    render: vi.fn<(scene: Scene) => void>(),
    compileAsync: vi.fn(() => Promise.resolve()),
  };
}

function mockSimulation(renderer: ReturnType<typeof mockRenderer>) {
  const simulation = new GPUSimulation(renderer as unknown as WebGLRenderer);
  const position = new WebGLRenderTarget(WIDTH, WIDTH);
  const velocity = new WebGLRenderTarget(WIDTH, WIDTH);
  vi.spyOn(simulation.gpuCompute, "init").mockImplementation(() => {
    simulation.positionVariable.renderTargets[0] = position;
    simulation.velocityVariable.renderTargets[0] = velocity;
    return null;
  });
  vi.spyOn(simulation.gpuCompute, "compute").mockImplementation(() => {});
  return simulation;
}

describe("GPU spatial grid", () => {
  it.each([false, true])("preserves rendering state when the grid pass throws: %s", (throws) => {
    const grid = new SpatialGrid();
    const renderer = mockRenderer();
    const originalTarget = renderer.getRenderTarget();
    renderer.render.mockImplementation(() => {
      expect(renderer.getRenderTarget()).toBe(grid.target);
      expect(renderer.getClearAlpha()).toBe(0);
      expect(renderer.autoClear).toBe(true);
      if (throws) throw new Error("GPU unavailable");
    });
    const update = () => grid.update(renderer as unknown as WebGLRenderer, new DataTexture(), 120);
    if (throws) expect(update).toThrow("GPU unavailable");
    else update();
    expect(renderer.getRenderTarget()).toBe(originalTarget);
    expect(renderer.getClearColor(new Color()).getHexString()).toBe("123456");
    expect(renderer.getClearAlpha()).toBe(.5);
    expect(renderer.autoClear).toBe(false);
    grid.dispose();
  });

  it("rasterizes only occupied slots and keeps sparse slot identities after removals", () => {
    const grid = new SpatialGrid();
    const renderer = mockRenderer();
    grid.setActiveSlots([1, 35, 999]);
    grid.update(renderer as unknown as WebGLRenderer, new DataTexture(), 120);
    const scene = renderer.render.mock.calls[0][0] as Scene;
    const points = scene.children[0] as Points;
    expect(grid.target.texture.type).toBe(FloatType);
    expect(points.frustumCulled).toBe(false);
    expect(points.geometry.drawRange.count).toBe(3);
    const references = points.geometry.getAttribute("position");
    for (const [index, slot] of [1, 35, 999].entries()) {
      expect(references.getX(index)).toBeCloseTo(((slot % WIDTH) + .5) / WIDTH);
      expect(references.getY(index)).toBeCloseTo((Math.floor(slot / WIDTH) + .5) / WIDTH);
      expect(references.getZ(index)).toBe(slot);
    }
    grid.setActiveSlots([999]);
    expect(points.geometry.drawRange.count).toBe(1);
    expect(references.getZ(0)).toBe(999);
    grid.dispose();
  });

  it("uses the current position texture, rebuilds membership each step, and returns to the small-school path", async () => {
    const renderer = mockRenderer();
    const simulation = mockSimulation(renderer);
    simulation.compute();
    expect(renderer.extensions.has).not.toHaveBeenCalled();
    expect(renderer.render).not.toHaveBeenCalled();
    simulation.setActiveSlots(Array.from({ length: 530 }, (_, slot) => slot));
    simulation.compute();
    expect(simulation.velocityUniforms.useSpatialGrid.value).toBe(false);
    expect(simulation.velocityVariable.material.defines.USE_SPATIAL_GRID).toBe(0);
    await simulation.prepareSpatialGrid();
    simulation.compute();
    expect(simulation.velocityUniforms.useSpatialGrid.value).toBe(true);
    expect(simulation.velocityVariable.material.defines.USE_SPATIAL_GRID).toBe(1);
    expect(simulation.velocityUniforms.gridWordCount.value).toBe(6);
    expect(Array.from(simulation.velocityUniforms.densityProbeMask.value)).toEqual(Array(4).fill(2 ** 24 - 1));
    expect(renderer.extensions.has).toHaveBeenCalledWith("EXT_float_blend");
    const scene = renderer.render.mock.calls[0][0] as Scene;
    const points = scene.children[0] as Points;
    const material = points.material as import("three").ShaderMaterial;
    expect(material.uniforms.texturePosition.value).toBe(simulation.getCurrentPositionTexture());
    simulation.compute();
    expect(renderer.render).toHaveBeenCalledTimes(2);
    expect(renderer.extensions.has).toHaveBeenCalledTimes(2);
    simulation.setActiveSlots([35, 999]);
    simulation.compute();
    expect(simulation.velocityUniforms.useSpatialGrid.value).toBe(false);
    expect(simulation.velocityUniforms.activeCount.value).toBe(2);
    expect(renderer.render).toHaveBeenCalledTimes(2);
    simulation.dispose();
  });

  it("keeps simulating with the direct kernel if optional compilation fails", async () => {
    const renderer = mockRenderer();
    renderer.compileAsync.mockRejectedValueOnce(new Error("Shader unavailable"));
    const simulation = mockSimulation(renderer);
    simulation.setActiveSlots(Array.from({ length: 1000 }, (_, slot) => slot));
    simulation.compute();
    await simulation.prepareSpatialGrid();
    simulation.compute();
    expect(simulation.velocityUniforms.useSpatialGrid.value).toBe(false);
    expect(simulation.velocityVariable.material.defines.USE_SPATIAL_GRID).toBe(0);
    expect(simulation.gpuCompute.compute).toHaveBeenCalledTimes(2);
    expect(renderer.render).not.toHaveBeenCalled();
    simulation.dispose();
  });

  it("does not reactivate a disposed simulation after pending compilation finishes", async () => {
    const renderer = mockRenderer();
    let finish!: () => void;
    renderer.compileAsync.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    const simulation = mockSimulation(renderer);
    simulation.setActiveSlots(Array.from({ length: 1000 }, (_, slot) => slot));
    simulation.compute();
    const compiling = simulation.prepareSpatialGrid();
    simulation.dispose();
    finish();
    await compiling;
    simulation.compute();
    expect(simulation.gpuCompute.compute).toHaveBeenCalledTimes(1);
    expect(renderer.render).not.toHaveBeenCalled();
  });

  it("chooses a populated density probe even when the lowest slots are empty", () => {
    const simulation = mockSimulation(mockRenderer());
    simulation.setActiveSlots(Array.from({ length: 300 }, (_, slot) => slot + 600));
    expect(simulation.velocityUniforms.densityProbeWord.value).toBe(7);
    expect(Array.from(simulation.velocityUniforms.densityProbeMask.value)).toEqual(Array(4).fill(2 ** 24 - 1));
    simulation.dispose();
  });

  it.each(["EXT_float_blend", "KHR_parallel_shader_compile"])("keeps the exact direct path without %s", (missingExtension) => {
    const renderer = mockRenderer();
    renderer.extensions.has.mockImplementation((extension: string) => extension !== missingExtension);
    const simulation = mockSimulation(renderer);
    simulation.setActiveSlots(Array.from({ length: 1000 }, (_, slot) => slot));
    simulation.compute();
    simulation.compute();
    expect(simulation.velocityUniforms.useSpatialGrid.value).toBe(false);
    expect(renderer.extensions.has).toHaveBeenCalledTimes(missingExtension === "EXT_float_blend" ? 1 : 2);
    expect(renderer.render).not.toHaveBeenCalled();
    expect(simulation.gpuCompute.compute).toHaveBeenCalledTimes(2);
    simulation.dispose();
  });

  it("falls back when debug settings make the interaction radius too wide for the grid", () => {
    const renderer = mockRenderer();
    const simulation = mockSimulation(renderer);
    simulation.setActiveSlots(Array.from({ length: 1000 }, (_, slot) => slot));
    simulation.velocityUniforms.cohesionDistance.value = 200;
    simulation.compute();
    expect(simulation.velocityUniforms.useSpatialGrid.value).toBe(false);
    expect(renderer.render).not.toHaveBeenCalled();
    simulation.dispose();
  });
});
