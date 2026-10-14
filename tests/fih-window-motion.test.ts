// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountFihCreator } from "../src/ui/fih-creator";

vi.mock("../src/ui/fih-preview", () => ({ drawFihPreview: vi.fn() }));

let creator: ReturnType<typeof mountFihCreator>;
let panel: HTMLElement;
let frames: Map<number, FrameRequestCallback>;

function settle() {
  for (let count = 0; frames.size && count < 120; count++) {
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
  return parseFloat(panel.style.getPropertyValue(`--window-${property}`));
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
  // Reproduce the preference that disabled all motion in the later commit.
  vi.spyOn(window, "matchMedia").mockReturnValue(
    Object.assign(new EventTarget(), { matches: true }) as MediaQueryList,
  );
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
  it("keeps pointer tilt and parallax with the original reduced-motion behavior", () => {
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

  it("holds tilt steady over slots and resumes after leaving them", () => {
    point(window, 880, 100);
    const shape = panel.querySelector<HTMLElement>('[data-part="body"] .fih-reel')!;
    shape.dispatchEvent(new WheelEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true }));
    point(shape, 880, 100);
    expect(value("ry")).toBe(6);
    expect(panel.querySelector(".fih-description")!.textContent).toContain("chubby body");
    const size = panel.querySelector<HTMLInputElement>("#fih-head-size")!;
    size.value = "1.5";
    size.dispatchEvent(new Event("input", { bubbles: true }));
    point(size, 120, 580);
    expect(value("ry")).toBe(6);
    expect(panel.querySelector<HTMLOutputElement>("#fih-head-size-value")!.value).toBe("150%");
    const spin = panel.querySelector<HTMLButtonElement>(".fih-spin")!;
    spin.click();
    point(spin, 880, 100);
    expect(value("parallax-x")).toBe(-12);
    expect(panel.querySelector(".fih-undo")).toBeNull();
    const color = panel.querySelector<HTMLInputElement>("#fih-head-picker")!;
    color.value = "#123456";
    color.dispatchEvent(new Event("input", { bubbles: true }));
    point(color, 120, 580);
    expect(value("parallax-x")).toBe(-12);
    point(window, 120, 580);
    expect(value("ry")).toBe(-6);
    expect(value("parallax-x")).toBe(12);
  });

  it("freezes an in-flight spring at its rendered angle when a slot is entered", () => {
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
    expect(value("ry")).toBe(angle);
    point(reel, 880, 100);
    expect(value("ry")).toBe(angle);
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
    expect(frames.size).toBe(1);
    creator.destroy();
    point(window, 120, 580);
    expect(frames.size).toBe(0);
  });
});
