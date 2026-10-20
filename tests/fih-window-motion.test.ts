// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountFihCreator } from "../src/ui/fih-creator";

vi.mock("../src/ui/fih-preview", () => ({ drawFihPreview: vi.fn() }));

let creator: ReturnType<typeof mountFihCreator>;
let panel: HTMLElement;
let frames: Map<number, FrameRequestCallback>;

function settle() {
  for (let count = 0; frames.size && count < 240; count++) {
    const pending = [...frames.values()];
    frames.clear();
    vi.advanceTimersByTime(16);
    pending.forEach((callback) => callback(performance.now()));
  }
  expect(frames.size).toBe(0);
}

function point(target: EventTarget, x: number, y: number) {
  target.dispatchEvent(new PointerEvent("pointermove", {
    clientX: x, clientY: y, pointerType: "mouse", pointerId: 1,
    isPrimary: true, bubbles: true,
  }));
  settle();
}

function value(property: string) {
  if (property === "x" || property === "y")
    return parseFloat(panel.style.translate.split(" ")[property === "x" ? 0 : 1] ?? "0");
  const transform = panel.querySelector<HTMLElement>(".glass-window__surface")!.style.transform;
  if (property === "rx" || property === "ry")
    return parseFloat(transform.match(property === "rx" ? /rotateX\(([^)]+)\)/ : /rotateY\(([^)]+)\)/)?.[1] ?? "0");
  const position = transform.match(/translate3d\(([^)]+)\)/)?.[1].split(",");
  return parseFloat(position?.[property === "parallax-x" ? 0 : 1] ?? "0");
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "performance", "Date"] });
  frames = new Map();
  let nextFrame = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.stubGlobal("innerWidth", 1200);
  vi.stubGlobal("innerHeight", 800);
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  localStorage.clear();
  document.body.innerHTML = '<footer id="fih-footer"></footer>';
  creator = mountFihCreator(vi.fn());
  panel = document.querySelector<HTMLElement>("#fih-creator")!;
  Object.defineProperty(panel, "offsetWidth", { value: 760 });
  vi.spyOn(panel, "getBoundingClientRect").mockImplementation(() => {
    const x = 120 + (value("x") || 0);
    const y = 100 + (value("y") || 0);
    return { left: x, right: x + 760, top: y, bottom: y + 480,
      width: 760, height: 480, x, y, toJSON() {} };
  });
});

afterEach(() => {
  creator.destroy();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("customization preserves the original window motion", () => {
  it("coalesces pointer bursts into one window and slot bounds check per frame", () => {
    const bounds = vi.mocked(panel.getBoundingClientRect);
    const slots = [...panel.querySelectorAll<HTMLElement>(".fih-lane")];
    const slotBounds = slots.map(slot => vi.spyOn(slot, "getBoundingClientRect"));
    bounds.mockClear();
    for (let index = 0; index < 50; index++) {
      window.dispatchEvent(new PointerEvent("pointermove", {
        clientX: 120 + index * 10, clientY: 340, pointerType: "mouse", bubbles: true,
      }));
    }
    expect(bounds).not.toHaveBeenCalled();
    for (const read of slotBounds) expect(read).not.toHaveBeenCalled();
    settle();
    expect(bounds).toHaveBeenCalledOnce();
    for (const read of slotBounds) expect(read).toHaveBeenCalledOnce();
    expect(value("ry")).toBeCloseTo((490 / 760 * 2 - 1) * 6);
  });
  it("keeps the original pointer tilt and parallax", () => {
    point(window, 880, 100);
    expect(value("rx")).toBe(6);
    expect(value("ry")).toBe(6);
    expect(value("parallax-x")).toBe(-12);
    expect(value("parallax-y")).toBe(12);
    point(window, 120, 580);
    expect(value("rx")).toBe(-6);
    expect(value("ry")).toBe(-6);
    expect(value("parallax-x")).toBe(12);
    expect(value("parallax-y")).toBe(-12);
  });

  it("keeps tilting while hovering and editing the slot controls", () => {
    point(window, 880, 100);
    const shape = panel.querySelector<HTMLElement>('[data-part="body"] .fih-reel')!;
    shape.dispatchEvent(new WheelEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true }));
    point(shape, 880, 100);
    expect(value("ry")).toBe(6);
    expect(shape.dataset.shape).toBe("round");
    const size = panel.querySelector<HTMLInputElement>("#fih-head-size")!;
    size.value = "1.5";
    size.dispatchEvent(new Event("input", { bubbles: true }));
    point(size, 120, 580);
    expect(value("ry")).toBe(-6);
    expect(size.value).toBe("1.5");
    const spin = panel.querySelector<HTMLButtonElement>(".fih-spin")!;
    spin.click();
    point(spin, 880, 100);
    expect(value("parallax-x")).toBe(-12);
    expect(panel.querySelector(".fih-undo")).toBeNull();
    const color = panel.querySelector<HTMLInputElement>("#fih-head-picker")!;
    color.value = "#123456";
    color.dispatchEvent(new Event("input", { bubbles: true }));
    point(color, 120, 580);
    expect(value("parallax-x")).toBe(12);
    point(window, 120, 580);
    expect(value("ry")).toBe(-6);
    expect(value("parallax-x")).toBe(12);
  });

  it("keeps an in-flight spring responding when the pointer enters a slot", () => {
    window.dispatchEvent(new PointerEvent("pointermove", {
      clientX: 880, clientY: 100, pointerType: "mouse", bubbles: true,
    }));
    const pending = [...frames.values()];
    frames.clear();
    vi.advanceTimersByTime(16);
    pending.forEach((callback) => callback(performance.now()));
    const angle = value("ry");
    expect(angle).toBeGreaterThan(0);
    expect(angle).toBeLessThan(6);
    const reel = panel.querySelector<HTMLElement>(".fih-reel")!;
    point(reel, 120, 580);
    expect(value("ry")).toBe(-6);
    expect(value("rx")).toBe(-6);
    point(reel, 880, 100);
    expect(value("ry")).toBe(6);
    expect(value("rx")).toBe(6);
  });

  it("retains title-bar dragging and keyboard reset", () => {
    const handle = panel.querySelector<HTMLElement>(".glass-window__handle")!;
    handle.setPointerCapture = vi.fn();
    Object.defineProperty(handle, "offsetHeight", { value: 28 });
    handle.dispatchEvent(new PointerEvent("pointerdown", {
      clientX: 400, clientY: 110, pointerId: 1, button: 0, isPrimary: true,
    }));
    point(handle, 440, 142);
    expect(value("x")).toBe(40);
    expect(value("y")).toBe(32);
    handle.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1 }));
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    settle();
    expect(value("x")).toBe(56);
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "Home" }));
    settle();
    expect(value("x")).toBe(0);
    expect(value("y")).toBe(0);
    expect(value("rx")).toBe(0);
    expect(value("ry")).toBe(0);
  });

  it("removes motion listeners and pending frames on teardown", () => {
    window.dispatchEvent(new PointerEvent("pointermove", {
      clientX: 880, clientY: 100, pointerType: "mouse", isPrimary: true,
    }));
    expect(frames.size).toBeGreaterThan(0);
    creator.destroy();
    point(window, 120, 580);
    expect(frames.size).toBe(0);
  });
});
