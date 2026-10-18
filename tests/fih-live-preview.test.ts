// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Mesh, PerspectiveCamera, Scene, ShaderMaterial, WebGLRenderer } from "three";
import { DEFAULT_APPEARANCE } from "../src/fih/appearance";
import { createWaterEnvironment } from "../src/water/WaterEnvironment";
import { createFihLivePreview } from "../src/ui/fih-live-preview";
import vertexShader from "../src/fih/shader/vertex.glsl?raw";

// Exercise the real scene, geometry, textures, and animation without a browser GPU.
vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();
  class PreviewRenderer {
    static instances: PreviewRenderer[] = [];
    scene?: Scene;
    camera?: PerspectiveCamera;
    constructor() { PreviewRenderer.instances.push(this); }
    setClearColor = vi.fn();
    setPixelRatio = vi.fn();
    setSize = vi.fn();
    dispose = vi.fn();
    forceContextLoss = vi.fn();
    render = vi.fn((scene: Scene, camera: PerspectiveCamera) => { this.scene = scene; this.camera = camera; });
  }
  return { ...actual, WebGLRenderer: PreviewRenderer };
});

interface PreviewRenderer {
  scene: Scene;
  camera: PerspectiveCamera;
  setSize: ReturnType<typeof vi.fn>;
  render: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  forceContextLoss: ReturnType<typeof vi.fn>;
}
let preview: ReturnType<typeof createFihLivePreview>;
let renderer: PreviewRenderer;
let intersect: IntersectionObserverCallback;
let frames: Map<number, FrameRequestCallback>;
let canvas: HTMLCanvasElement;
let width: number;
let paused: boolean;
let hidden: boolean;
let now: number;

function step() {
  const pending = [...frames.values()];
  frames.clear();
  now += 16;
  pending.forEach((callback) => callback(now));
}
const fish = () => renderer.scene.children[0] as Mesh<import("three").BufferGeometry, ShaderMaterial>;
const phase = () => fish().material.uniforms.texturePosition.value.image.data[3] as number;

beforeEach(() => {
  frames = new Map();
  width = 340; now = 0; paused = false; hidden = false;
  let nextFrame = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback); return nextFrame;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: IntersectionObserverCallback) { intersect = callback; }
    observe() {} disconnect() {}
  });
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
  document.body.innerHTML = '<div><canvas></canvas></div>';
  canvas = document.querySelector("canvas")!;
  Object.defineProperties(canvas.parentElement!, {
    clientWidth: { get: () => width }, clientHeight: { get: () => width * .75 },
  });
  const water = createWaterEnvironment(new Scene());
  preview = createFihLivePreview(canvas, DEFAULT_APPEARANCE, { water: water.uniforms, isPaused: () => paused });
  intersect([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
  renderer = (WebGLRenderer as unknown as { instances: PreviewRenderer[] }).instances.at(-1)!;
});

afterEach(() => { preview.destroy(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("swimming preview", () => {
  it("creates no WebGL context offscreen, retains edits, and initializes on first visibility", () => {
    preview.destroy();
    const renderers = (WebGLRenderer as unknown as { instances: PreviewRenderer[] }).instances;
    const previousCount = renderers.length;
    const water = createWaterEnvironment(new Scene());
    preview = createFihLivePreview(canvas, DEFAULT_APPEARANCE, { water: water.uniforms, isPaused: () => paused });
    preview.update({ ...DEFAULT_APPEARANCE, bodySize: 1.5 });
    preview.resize();
    intersect([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver);
    expect(renderers).toHaveLength(previousCount);
    expect(frames.size).toBe(0);
    intersect([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    expect(renderers).toHaveLength(previousCount + 1);
    renderer = renderers.at(-1)!;
    expect(fish().geometry.getAttribute("position").count).toBeGreaterThan(0);
    expect(renderer.render).toHaveBeenCalledOnce();
    expect(frames.size).toBe(1);
  });

  it("can destroy an unseen preview without creating a context", () => {
    preview.destroy();
    const renderers = (WebGLRenderer as unknown as { instances: PreviewRenderer[] }).instances;
    const previousCount = renderers.length;
    const water = createWaterEnvironment(new Scene());
    preview = createFihLivePreview(canvas, DEFAULT_APPEARANCE, { water: water.uniforms, isPaused: () => paused });
    preview.destroy();
    expect(renderers).toHaveLength(previousCount);
    expect(frames.size).toBe(0);
  });

  it("uses the aquarium shader and advances swimming only while the tank is running", () => {
    expect(fish().material.vertexShader).toBe(vertexShader);
    expect(fish().material.wireframe).toBe(false);
    intersect([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    const original = phase();
    step();
    expect(phase()).toBeGreaterThan(original);
    paused = true;
    const frozen = phase();
    step();
    expect(phase()).toBe(frozen);
    paused = false;
    step();
    expect(phase()).toBeGreaterThan(frozen);
  });

  it("extends the canvas for large designs without moving the camera or scaling the mesh", () => {
    const position = renderer.camera.position.clone();
    const oldGeometry = fish().geometry;
    const disposed = vi.spyOn(oldGeometry, "dispose");
    preview.update({ ...DEFAULT_APPEARANCE, bodySize: 1.5, headSize: 1.5, finSize: 1.5 });
    expect(renderer.camera.position).toEqual(position);
    expect(renderer.camera.zoom).toBe(1);
    expect(fish().scale.toArray()).toEqual([1, 1, 1]);
    expect(parseFloat(canvas.style.width)).toBeGreaterThan(width);
    expect(parseFloat(canvas.style.left)).toBeLessThan(0);
    expect(parseFloat(canvas.style.height)).toBeGreaterThan(width * .75);
    expect(disposed).toHaveBeenCalledOnce();
  });

  it("keeps the drawing buffer stable across animation and resizes with the frame", () => {
    intersect([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    const sizes = renderer.setSize.mock.calls.length;
    step(); step(); step();
    expect(renderer.setSize).toHaveBeenCalledTimes(sizes);
    const position = renderer.camera.position.clone();
    width = 240;
    preview.resize();
    expect(renderer.setSize).toHaveBeenCalledTimes(sizes + 1);
    expect(renderer.camera.position).toEqual(position);
  });

  it("stops offscreen and hidden, and releases resources on teardown", () => {
    intersect([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    expect(frames.size).toBe(1);
    intersect([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver);
    expect(frames.size).toBe(0);
    intersect([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    hidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(frames.size).toBe(0);
    hidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(frames.size).toBe(1);
    const disposed = vi.spyOn(fish().geometry, "dispose");
    preview.destroy();
    expect(frames.size).toBe(0);
    expect(disposed).toHaveBeenCalledOnce();
    expect(renderer.dispose).toHaveBeenCalledOnce();
    expect(renderer.forceContextLoss).toHaveBeenCalledOnce();
  });
});
