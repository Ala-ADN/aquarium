// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountFihCreator } from "../src/ui/fih-creator";
import { VISIT_STORAGE_KEY, PREVIOUS_STORAGE_KEY, LEGACY_STORAGE_KEY } from "../src/fih/visit";
import { DEFAULT_APPEARANCE, FIH_PALETTE } from "../src/fih/appearance";

vi.mock("../src/ui/fih-preview", () => ({ drawFihPreview: vi.fn() }));
let creator: ReturnType<typeof mountFihCreator>;
let intersect: IntersectionObserverCallback;
const find = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const reel = (part: string) => find(`.fih-lane[data-part="${part}"] .fih-reel`);
const shape = (part: string) => reel(part).dataset.shape;
const choose = (part: string, control: string, value: string) => {
  if (control === "color") { inputValue(`#fih-${part}-picker`, value); return; }
  for (let i = 0; i < Number(reel(part).getAttribute("aria-valuemax")) && shape(part) !== value; i++) {
    find<HTMLButtonElement>(`[data-part="${part}"] [data-direction="1"]`).click();
  }
  expect(shape(part)).toBe(value);
};
const inputValue = (selector: string, value: string) => {
  const input = find<HTMLInputElement>(selector);
  input.value = value; input.dispatchEvent(new Event("input", { bubbles: true }));
};
const submit = () => find<HTMLFormElement>("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "performance", "Date"] });
  document.body.innerHTML = '<footer id="fih-footer"></footer>';
  localStorage.clear();
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: IntersectionObserverCallback) { intersect = callback; }
    observe() {} disconnect() {}
  });
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
});
afterEach(() => { creator?.destroy(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("three-lane creator", () => {
  it("offers three independently selectable parts and releases only on submit", () => {
    const display = vi.fn(); creator = mountFihCreator(display);
    expect(document.querySelectorAll(".fih-lane")).toHaveLength(3);
    expect(reel("fin").getAttribute("aria-valuemax")).toBe("4");
    expect(reel("body").getAttribute("aria-valuemax")).toBe("6");
    expect(reel("head").getAttribute("aria-valuemax")).toBe("4");
    vi.advanceTimersByTime(10_000);
    expect(find<HTMLButtonElement>(".fih-release").disabled).toBe(true);
    reel("fin").focus();
    choose("fin", "shape", "fork"); choose("body", "shape", "round"); choose("head", "shape", "blunt");
    choose("fin", "color", "#ff8fbd"); choose("body", "color", "#70c7ff"); choose("head", "color", "#ffd166");
    inputValue("#fih-fin-size", "1.25"); inputValue("#fih-body-size", ".8"); inputValue("#fih-head-size", "1.4");
    expect(display).not.toHaveBeenCalled();
    submit();
    expect(display).toHaveBeenLastCalledWith({ ...DEFAULT_APPEARANCE, finShape: "fork", shape: "round", headShape: "blunt",
      finColor: "#ff8fbd", color: "#70c7ff", headColor: "#ffd166", finSize: 1.25, bodySize: .8, headSize: 1.4, count: 1 });
    expect(find(".fih-release").textContent).toBe("update my fih");
    const saved = JSON.parse(localStorage.getItem(VISIT_STORAGE_KEY)!).fih;
    choose("head", "shape", "beak");
    expect(display).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(VISIT_STORAGE_KEY)!).fih).toEqual(saved);
    submit(); expect(display).toHaveBeenLastCalledWith({ ...saved, headShape: "beak" });
  });
  it("wraps individual reels without changing the other columns", () => {
    creator = mountFihCreator(vi.fn());
    find<HTMLButtonElement>('[data-part="fin"] [data-direction="-1"]').click();
    expect(shape("fin")).toBe("ribbon");
    expect(shape("body")).toBe("classic");
    expect(shape("head")).toBe("pointed");
    find<HTMLButtonElement>('[data-part="fin"] [data-direction="1"]').click();
    expect(shape("fin")).toBe("triangle");
  });
  it("spins shapes, sizes, and palette colors without releasing the draft", () => {
    const display = vi.fn(); creator = mountFihCreator(display);
    choose("head", "shape", "beak"); inputValue("#fih-head-size", "1.5");
    vi.spyOn(Math, "random").mockReturnValue(0);
    find<HTMLButtonElement>(".fih-spin").click();
    expect(shape("head")).toBe("pointed");
    expect(display).not.toHaveBeenCalled();
    for (const part of ["fin", "body", "head"]) {
      expect(find<HTMLInputElement>(`#fih-${part}-size`).value).toBe("0.6");
      expect(find<HTMLInputElement>(`#fih-${part}-picker`).value).toBe(FIH_PALETTE[0].hex);
    }
    vi.advanceTimersByTime(10_000); reel("head").focus(); submit();
    expect(display.mock.lastCall?.[0]).toMatchObject({ finSize: .6, bodySize: .6, headSize: .6,
      color: FIH_PALETTE[0].hex, headColor: FIH_PALETTE[0].hex, finColor: FIH_PALETTE[0].hex });
  });
  it("removes dropdowns, special effects, and undo while retaining plain designs", () => {
    const display = vi.fn(); creator = mountFihCreator(display);
    expect(document.querySelector("select, .fih-effects, .fih-undo")).toBeNull();
    for (let i = 0; i < 5; i++) find<HTMLButtonElement>(".fih-spin").click();
    vi.advanceTimersByTime(10_000); reel("head").focus(); submit();
    expect(display.mock.lastCall?.[0].pattern).toBe("plain");
    expect(document.querySelector("select, .fih-effects, .fih-undo")).toBeNull();
  });
  it("updates inherited head and fin colors and supports independent custom colors", () => {
    const display = vi.fn(); creator = mountFihCreator(display);
    const oldFin = find<HTMLInputElement>("#fih-fin-picker").value;
    choose("body", "color", "#70c7ff");
    expect(find<HTMLInputElement>("#fih-head-picker").value).toBe("#70c7ff");
    expect(find<HTMLInputElement>("#fih-fin-picker").value).not.toBe(oldFin);
    inputValue("#fih-head-picker", "#123456");
    choose("body", "color", "#ffd166");
    expect(find<HTMLInputElement>("#fih-head-picker").value).toBe("#123456");
    vi.advanceTimersByTime(10_000); reel("head").focus(); submit();
    expect(display.mock.lastCall?.[0].headColor).toBe("#123456");
  });
  it("migrates v1 and v2 saves and restores three-part v3 designs", () => {
    const display = vi.fn();
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ elapsed: 30_000, fish: { shape: "long", color: "#123456", count: 2 } }));
    creator = mountFihCreator(display);
    expect(display).toHaveBeenCalledWith({ ...DEFAULT_APPEARANCE, shape: "long", color: "#123456", count: 2 });
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).not.toBeNull();
    creator.destroy(); localStorage.removeItem(VISIT_STORAGE_KEY);
    localStorage.setItem(PREVIOUS_STORAGE_KEY, JSON.stringify({ elapsed: 30_000, fih: { shape: "sail", color: "#ff9955", finColor: "#ffffff", pattern: "spots", count: 2 } }));
    creator = mountFihCreator(display);
    expect(display.mock.lastCall?.[0].pattern).toBe("plain");
    expect(find<HTMLInputElement>("#fih-fin-picker").value).toBe("#ffffff");
    creator.destroy();
    localStorage.setItem(VISIT_STORAGE_KEY, JSON.stringify({ elapsed: 30_000, fih: { ...DEFAULT_APPEARANCE, finShape: "fan", headShape: "round", headColor: "#123456", bodySize: 1.2, count: 2 } }));
    creator = mountFihCreator(display);
    expect(shape("fin")).toBe("fan");
    expect(shape("head")).toBe("round");
    expect(find<HTMLInputElement>("#fih-body-size").value).toBe("1.2");
  });
  it("accepts partial visibility and releases despite storage failure", () => {
    vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    const display = vi.fn(); creator = mountFihCreator(display);
    vi.advanceTimersByTime(10_000);
    intersect([{ isIntersecting: true, intersectionRatio: .001 } as IntersectionObserverEntry], {} as IntersectionObserver);
    submit(); expect(display).toHaveBeenCalledTimes(1);
    expect(find(".fih-status").textContent).toContain("Browser saving is unavailable");
  });
  it("does not earn in a hidden tab and caps release at ten", () => {
    let hidden = false;
    vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
    const display = vi.fn(); creator = mountFihCreator(display);
    vi.advanceTimersByTime(5000); hidden = true; document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(30_000); expect(find<HTMLOutputElement>("#fih-count").value).toBe("0 / 10");
    hidden = false; document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(5000); expect(find<HTMLOutputElement>("#fih-count").value).toBe("1 / 10");
    vi.advanceTimersByTime(200_000); reel("body").focus(); submit();
    expect(display.mock.lastCall?.[0].count).toBe(10);
  });
  it("cycles only the hovered slot with the mouse wheel and keeps page scrolling outside it", () => {
    creator = mountFihCreator(vi.fn());
    const wheel = new WheelEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true });
    reel("fin").dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true);
    expect(shape("fin")).toBe("fork");
    expect(shape("body")).toBe("classic");
    expect(shape("head")).toBe("pointed");
    reel("fin").dispatchEvent(new WheelEvent("wheel", { deltaY: -100, cancelable: true }));
    expect(shape("fin")).toBe("triangle");
    const outside = new WheelEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true });
    find(".fih-preview").dispatchEvent(outside);
    expect(outside.defaultPrevented).toBe(false);
    expect(shape("fin")).toBe("triangle");
  });
  it("accumulates trackpad motion, supports line/page wheels, and leaves zoom alone", () => {
    creator = mountFihCreator(vi.fn());
    for (let i = 0; i < 3; i++) reel("body").dispatchEvent(new WheelEvent("wheel", { deltaY: 10 }));
    expect(shape("body")).toBe("classic");
    reel("body").dispatchEvent(new WheelEvent("wheel", { deltaY: 10 }));
    expect(shape("body")).toBe("round");
    reel("body").dispatchEvent(new WheelEvent("wheel", { deltaY: 3, deltaMode: 1 }));
    expect(shape("body")).toBe("long");
    reel("body").dispatchEvent(new WheelEvent("wheel", { deltaY: -1, deltaMode: 2 }));
    expect(shape("body")).toBe("round");
    const zoom = new WheelEvent("wheel", { deltaY: 100, cancelable: true });
    // happy-dom's WheelEvent omits MouseEvent modifier properties.
    Object.defineProperty(zoom, "ctrlKey", { value: true });
    reel("body").dispatchEvent(zoom);
    expect(zoom.defaultPrevented).toBe(false);
    expect(shape("body")).toBe("round");
  });
  it("supports keyboard cycling and announces the selected shape", () => {
    creator = mountFihCreator(vi.fn());
    const head = reel("head");
    head.focus();
    head.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    expect(shape("head")).toBe("beak");
    expect(head.getAttribute("aria-valuenow")).toBe("4");
    expect(head.getAttribute("aria-valuetext")).toBe("beak");
    head.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    expect(shape("head")).toBe("pointed");
    head.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    expect(shape("head")).toBe("beak");
    expect(document.activeElement).toBe(head);
  });
  it("captures wheel input for the entire slot before page handlers run", () => {
    creator = mountFihCreator(vi.fn());
    const pageWheel = vi.fn();
    document.addEventListener("wheel", pageWheel, { once: true });
    const slot = find('[data-part="head"]');
    const wheel = new WheelEvent("wheel", { deltaY: 100, cancelable: true, bubbles: true });
    slot.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true);
    expect(pageWheel).not.toHaveBeenCalled();
    expect(shape("head")).toBe("round");
    document.removeEventListener("wheel", pageWheel);
  });
  it("routes wheel events through visual slot bounds when a 3D ancestor is hit", () => {
    creator = mountFihCreator(vi.fn());
    const slot = find('[data-part="body"]');
    vi.spyOn(slot, "getBoundingClientRect").mockReturnValue({
      x: 600, y: 100, left: 600, right: 680, top: 100, bottom: 400,
      width: 80, height: 300, toJSON() {},
    });
    const wheel = new WheelEvent("wheel", {
      clientX: 640, clientY: 250, deltaY: 100, cancelable: true, bubbles: true,
    });
    // happy-dom's WheelEvent does not inherit MouseEvent coordinates either.
    Object.defineProperties(wheel, { clientX: { value: 640 }, clientY: { value: 250 } });
    find(".glass-window__surface").dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true);
    expect(shape("body")).toBe("round");
    expect(slot.hasAttribute("data-hovered")).toBe(true);
  });
  it("updates and disposes the live preview with the draft", () => {
    const live = { update: vi.fn(), resize: vi.fn(), destroy: vi.fn() };
    const createPreview = vi.fn(() => live);
    creator = mountFihCreator(vi.fn(), createPreview);
    expect(createPreview).toHaveBeenCalledWith(find(".fih-preview canvas"), DEFAULT_APPEARANCE);
    inputValue("#fih-head-size", "1.5");
    expect(live.update).toHaveBeenLastCalledWith({ ...DEFAULT_APPEARANCE, headSize: 1.5 });
    creator.destroy();
    expect(live.destroy).toHaveBeenCalledTimes(1);
  });
});
