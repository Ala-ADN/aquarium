// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Scene } from "three";
import { buildFihLever } from "../src/ui/fih-lever";
import { createFihLeverSettings } from "../src/ui/fih-lever-settings";

const angles = vi.hoisted(() => [] as number[]);
vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();
  return {
    ...actual,
    WebGLRenderer: class {
      setClearColor() {}
      setPixelRatio() {}
      setSize() {}
      render(scene: Scene) {
        const assembly = scene.children.find((child) => child.type === "Group")!;
        const arm = assembly.children.find((child) => child.type === "Group")!;
        angles.push(arm.rotation.x);
      }
      dispose() {}
      forceContextLoss() {}
    },
    PMREMGenerator: class {
      fromScene() { return { texture: new actual.Texture(), dispose() {} }; }
      dispose() {}
    },
  };
});
let view: ReturnType<typeof buildFihLever>;
let frames: Map<number, FrameRequestCallback>;
let frameId = 0;
const lastAngle = () => angles.at(-1)!;
function advance(ms: number) {
  vi.advanceTimersByTime(ms);
  const callbacks = [...frames.values()];
  frames.clear();
  callbacks.forEach((callback) => callback(performance.now()));
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["performance"] });
  frames = new Map();
  angles.length = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as WebGL2RenderingContext);
  document.body.innerHTML = '<section class="fih-window"><button></button></section>';
  view = buildFihLever(document.querySelector("button")!);
  view.setVisible(true);
});
afterEach(() => {
  view.destroy();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("configured lever return", () => {
  it("animates for the configured duration even when the browser requests reduced motion", () => {
    const settings = createFihLeverSettings();
    settings.motion.returnDuration = 650;
    view.setSettings(settings);
    const rest = lastAngle();
    view.setPull(1);
    const pulled = lastAngle();
    view.reset();
    expect(lastAngle()).toBe(pulled);
    expect(frames.size).toBe(1);
    advance(325);
    expect(lastAngle()).toBeGreaterThan(rest + .01);
    expect(lastAngle()).toBeLessThan(pulled);
    advance(324);
    expect(frames.size).toBe(1);
    advance(1);
    expect(lastAngle()).toBe(rest);
    expect(frames.size).toBe(0);
  });

  it("does not restart the return when pointer capture cleanup requests another reset", () => {
    const rest = lastAngle();
    view.setPull(1);
    view.reset();
    advance(200);
    view.reset();
    advance(450);
    expect(lastAngle()).toBe(rest);
    expect(frames.size).toBe(0);
  });

  it("lets a new pull interrupt the return and supports disabling the animation explicitly", () => {
    const rest = lastAngle();
    view.setPull(1);
    view.reset();
    advance(100);
    view.setPull(.5);
    const held = lastAngle();
    advance(650);
    expect(lastAngle()).toBe(held);
    expect(frames.size).toBe(0);
    const settings = createFihLeverSettings();
    settings.motion.returnDuration = 0;
    view.setSettings(settings);
    view.reset();
    expect(lastAngle()).toBe(rest);
    expect(frames.size).toBe(0);
  });
});
