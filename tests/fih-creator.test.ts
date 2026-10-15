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
  if (control === "color") {
    inputValue(`#fih-${part}-picker`, value);
    return;
  }
  for (
    let i = 0;
    i < Number(reel(part).getAttribute("aria-valuemax")) && shape(part) !== value;
    i++
  ) {
    find<HTMLButtonElement>(`[data-part="${part}"] [data-direction="1"]`).click();
  }
  expect(shape(part)).toBe(value);
};
const inputValue = (selector: string, value: string) => {
  const input = find<HTMLInputElement>(selector);
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
};
const submit = () =>
  find<HTMLFormElement>("form").dispatchEvent(
    new Event("submit", { bubbles: true, cancelable: true })
  );
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "performance", "Date"] });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 16));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
  document.body.innerHTML = '<footer id="fih-footer"></footer>';
  localStorage.clear();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        intersect = callback;
      }
      observe() {}
      disconnect() {}
    }
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    }
  );
});
afterEach(() => {
  creator?.destroy();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("three-lane creator", () => {
  it("offers three independently selectable parts and releases only on submit", () => {
    const display = vi.fn();
    creator = mountFihCreator(display);
    expect(document.querySelectorAll(".fih-lane")).toHaveLength(3);
    expect(reel("fin").getAttribute("aria-valuemax")).toBe("4");
    expect(reel("body").getAttribute("aria-valuemax")).toBe("4");
    expect(reel("head").getAttribute("aria-valuemax")).toBe("3");
    vi.advanceTimersByTime(10_000);
    expect(find<HTMLButtonElement>(".fih-release").disabled).toBe(true);
    reel("fin").focus();
    choose("fin", "shape", "fork");
    choose("body", "shape", "round");
    choose("head", "shape", "blunt");
    choose("fin", "color", "#ff8fbd");
    choose("body", "color", "#70c7ff");
    choose("head", "color", "#ffd166");
    inputValue("#fih-fin-size", "1.25");
    inputValue("#fih-body-size", ".8");
    inputValue("#fih-head-size", "1.4");
    expect(display).not.toHaveBeenCalled();
    submit();
    expect(display).toHaveBeenLastCalledWith({
      ...DEFAULT_APPEARANCE,
      finShape: "fork",
      shape: "round",
      headShape: "blunt",
      finColor: "#ff8fbd",
      color: "#70c7ff",
      headColor: "#ffd166",
      finSize: 1.25,
      bodySize: 0.8,
      headSize: 1.4,
      count: 1,
    });
    expect(find(".fih-release").textContent).toBe("update");
    const saved = JSON.parse(localStorage.getItem(VISIT_STORAGE_KEY)!).fih;
    choose("head", "shape", "round");
    expect(display).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(VISIT_STORAGE_KEY)!).fih).toEqual(saved);
    submit();
    expect(display).toHaveBeenLastCalledWith({ ...saved, headShape: "round" });
  });
  it("keeps visual controls without part labels, shape descriptors, or size readouts", () => {
    creator = mountFihCreator(vi.fn());
    expect(
      document.querySelector(
        ".fih-lane h3, .fih-lane label, .fih-shape-name, .fih-size-label, .fih-preview-caption, .fih-description, .fih-swarm-row, #fih-time"
      )
    ).toBeNull();
    expect(document.querySelectorAll('.fih-lane input[type="color"]')).toHaveLength(3);
    expect(document.querySelectorAll('.fih-lane input[type="range"]')).toHaveLength(3);
    for (const part of ["fin", "body", "head"]) {
      expect(find(`#fih-${part}-picker`).getAttribute("aria-label")).toBe(`Custom ${part} color`);
      expect(find(`#fih-${part}-size`).getAttribute("aria-label")).toBe(`${part} size`);
    }
  });
  it("shows earned progress with a time-spent hover message that continues after the bar fills", () => {
    creator = mountFihCreator(vi.fn());
    const progress = find("#fih-count");
    const fill = find("#fih-count > div");
    expect(progress.getAttribute("role")).toBe("progressbar");
    expect(progress.getAttribute("aria-valuemax")).toBe("10");
    expect(progress.textContent).toBe("");
    expect(fill.style.width).toBe("0%");
    vi.advanceTimersByTime(15_000);
    progress.dispatchEvent(new PointerEvent("pointerenter"));
    expect(progress.title).toBe("you spent 15 seconds here, thanks");
    expect(progress.getAttribute("aria-valuetext")).toBe("1 of 10 fih earned");
    expect(fill.style.width).toBe("15%");
    vi.advanceTimersByTime(110_000);
    expect(fill.style.width).toBe("100%");
    expect(progress.getAttribute("aria-valuenow")).toBe("10");
    expect(progress.title).toBe("you spent 125 seconds here, thanks");
    creator.destroy();
    creator = mountFihCreator(vi.fn());
    expect(find("#fih-count").title).toBe("you spent 125 seconds here, thanks");
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
    const display = vi.fn();
    creator = mountFihCreator(display);
    choose("head", "shape", "round");
    inputValue("#fih-head-size", "1.5");
    vi.spyOn(Math, "random").mockReturnValue(0);
    find<HTMLButtonElement>(".fih-spin").click();
    vi.advanceTimersByTime(2600);
    expect(shape("head")).toBe("pointed");
    expect(display).not.toHaveBeenCalled();
    for (const part of ["fin", "body", "head"]) {
      expect(find<HTMLInputElement>(`#fih-${part}-size`).value).toBe("0.6");
      expect(find<HTMLInputElement>(`#fih-${part}-picker`).value).toBe(FIH_PALETTE[0].hex);
    }
    vi.advanceTimersByTime(10_000);
    reel("head").focus();
    submit();
    expect(display.mock.lastCall?.[0]).toMatchObject({
      finSize: 0.6,
      bodySize: 0.6,
      headSize: 0.6,
      color: FIH_PALETTE[0].hex,
      headColor: FIH_PALETTE[0].hex,
      finColor: FIH_PALETTE[0].hex,
    });
  });
  it("animates reel motion and slot depth, then lands each column separately", () => {
    const display = vi.fn();
    creator = mountFihCreator(display);
    vi.spyOn(Math, "random").mockReturnValue(0);
    find<HTMLButtonElement>(".fih-spin").click();
    expect(document.querySelectorAll("[data-spinning]")).toHaveLength(3);
    expect(find("form").getAttribute("aria-busy")).toBe("true");
    vi.advanceTimersByTime(240);
    expect(parseFloat(find('[data-part="fin"]').style.getPropertyValue("--window-depth"))).toBeGreaterThan(0);
    expect(find('[data-part="fin"]').style.getPropertyValue("--fih-reel-offset")).not.toBe("0");
    expect(display).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(VISIT_STORAGE_KEY)!).fih).toBeNull();
    vi.advanceTimersByTime(1300);
    expect(document.querySelectorAll("[data-spinning]")).toHaveLength(2);
    const finSize = find<HTMLInputElement>("#fih-fin-size").value;
    vi.advanceTimersByTime(500);
    expect(document.querySelectorAll("[data-spinning]")).toHaveLength(1);
    expect(find<HTMLInputElement>("#fih-fin-size").value).toBe(finSize);
    vi.advanceTimersByTime(500);
    expect(document.querySelectorAll("[data-spinning]")).toHaveLength(0);
    expect(find("form").hasAttribute("aria-busy")).toBe(false);
    expect(find('[data-part="head"]').style.getPropertyValue("--window-depth")).toBe("");
    expect(find(".fih-spin-status").textContent).toContain("New combination:");
  });
  it("restarts a spin and lets manual input stop it without being overwritten later", () => {
    creator = mountFihCreator(vi.fn());
    const spin = find<HTMLButtonElement>(".fih-spin");
    spin.click();
    vi.advanceTimersByTime(320);
    spin.click();
    vi.advanceTimersByTime(320);
    expect(document.querySelectorAll("[data-spinning]")).toHaveLength(3);
    inputValue("#fih-head-size", "1.35");
    inputValue("#fih-fin-picker", "#123456");
    expect(document.querySelectorAll("[data-spinning]")).toHaveLength(0);
    vi.advanceTimersByTime(3000);
    expect(find<HTMLInputElement>("#fih-head-size").value).toBe("1.35");
    expect(find<HTMLInputElement>("#fih-fin-picker").value).toBe("#123456");
    creator.destroy();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("settles the final design before release when a spin is still running", () => {
    const display = vi.fn();
    creator = mountFihCreator(display);
    vi.advanceTimersByTime(10_000);
    reel("fin").focus();
    vi.spyOn(Math, "random").mockReturnValue(0);
    find<HTMLButtonElement>(".fih-spin").click();
    vi.advanceTimersByTime(200);
    submit();
    expect(display).toHaveBeenCalledTimes(1);
    expect(display.mock.lastCall?.[0]).toMatchObject({ finSize: .6, bodySize: .6, headSize: .6,
      color: FIH_PALETTE[0].hex, finColor: FIH_PALETTE[0].hex, headColor: FIH_PALETTE[0].hex });
    expect(document.querySelectorAll("[data-spinning]")).toHaveLength(0);
  });
  it("finishes a spin when the tab is hidden without leaving background animation frames", () => {
    let hidden = false;
    vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
    creator = mountFihCreator(vi.fn());
    find<HTMLButtonElement>(".fih-spin").click();
    vi.advanceTimersByTime(240);
    hidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(document.querySelectorAll("[data-spinning]")).toHaveLength(0);
    expect(find("form").hasAttribute("aria-busy")).toBe(false);
    expect(vi.getTimerCount()).toBe(1); // Only the visit timer remains.
    const settled = find<HTMLInputElement>("#fih-head-size").value;
    vi.advanceTimersByTime(3000);
    expect(find<HTMLInputElement>("#fih-head-size").value).toBe(settled);
  });
  it("completes spins and cancels animation frames on teardown", () => {
    creator = mountFihCreator(vi.fn());
    vi.spyOn(Math, "random").mockReturnValue(0);
    const spin = find<HTMLButtonElement>(".fih-spin");
    spin.click();
    expect(document.querySelectorAll("[data-spinning]")).toHaveLength(3);
    vi.advanceTimersByTime(240);
    const lane = find('[data-part="head"]');
    expect(Number(lane.style.getPropertyValue("--fih-reel-offset"))).toBeGreaterThan(0);
    expect(parseFloat(lane.style.getPropertyValue("--window-depth"))).toBeGreaterThan(0);
    expect(document.querySelectorAll("[data-spinning]")).toHaveLength(3);
    vi.advanceTimersByTime(2400);
    expect(document.querySelectorAll("[data-spinning]")).toHaveLength(0);
    expect(find<HTMLInputElement>("#fih-head-size").value).toBe("0.6");
    spin.click();
    expect(document.querySelectorAll("[data-spinning]")).toHaveLength(3);
    creator.destroy();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("removes dropdowns, special effects, and undo while retaining plain designs", () => {
    const display = vi.fn();
    creator = mountFihCreator(display);
    expect(document.querySelector("select, .fih-effects, .fih-undo")).toBeNull();
    for (let i = 0; i < 5; i++) find<HTMLButtonElement>(".fih-spin").click();
    vi.advanceTimersByTime(10_000);
    reel("head").focus();
    submit();
    expect(display.mock.lastCall?.[0].pattern).toBe("plain");
    expect(document.querySelector("select, .fih-effects, .fih-undo")).toBeNull();
  });
  it("updates inherited head and fin colors and supports independent custom colors", () => {
    const display = vi.fn();
    creator = mountFihCreator(display);
    const oldFin = find<HTMLInputElement>("#fih-fin-picker").value;
    choose("body", "color", "#70c7ff");
    expect(find<HTMLInputElement>("#fih-head-picker").value).toBe("#70c7ff");
    expect(find<HTMLInputElement>("#fih-fin-picker").value).not.toBe(oldFin);
    inputValue("#fih-head-picker", "#123456");
    choose("body", "color", "#ffd166");
    expect(find<HTMLInputElement>("#fih-head-picker").value).toBe("#123456");
    vi.advanceTimersByTime(10_000);
    reel("head").focus();
    submit();
    expect(display.mock.lastCall?.[0].headColor).toBe("#123456");
  });
  it("migrates v1 and v2 saves and restores three-part v3 designs", () => {
    const display = vi.fn();
    localStorage.setItem(
      LEGACY_STORAGE_KEY,
      JSON.stringify({ elapsed: 30_000, fish: { shape: "long", color: "#123456", count: 2 } })
    );
    creator = mountFihCreator(display);
    expect(display).toHaveBeenCalledWith({
      ...DEFAULT_APPEARANCE,
      shape: "classic",
      color: "#123456",
      count: 2,
    });
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).not.toBeNull();
    creator.destroy();
    localStorage.removeItem(VISIT_STORAGE_KEY);
    localStorage.setItem(
      PREVIOUS_STORAGE_KEY,
      JSON.stringify({
        elapsed: 30_000,
        fih: { shape: "sail", color: "#ff9955", finColor: "#ffffff", pattern: "spots", count: 2 },
      })
    );
    creator = mountFihCreator(display);
    expect(display.mock.lastCall?.[0].pattern).toBe("plain");
    expect(find<HTMLInputElement>("#fih-fin-picker").value).toBe("#ffffff");
    creator.destroy();
    localStorage.setItem(
      VISIT_STORAGE_KEY,
      JSON.stringify({
        elapsed: 30_000,
        fih: {
          ...DEFAULT_APPEARANCE,
          finShape: "fan",
          headShape: "round",
          headColor: "#123456",
          bodySize: 1.2,
          count: 2,
        },
      })
    );
    creator = mountFihCreator(display);
    expect(shape("fin")).toBe("fan");
    expect(shape("head")).toBe("round");
    expect(find<HTMLInputElement>("#fih-body-size").value).toBe("1.2");
  });
  it("accepts partial visibility and releases despite storage failure", () => {
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const display = vi.fn();
    creator = mountFihCreator(display);
    vi.advanceTimersByTime(10_000);
    intersect(
      [{ isIntersecting: true, intersectionRatio: 0.001 } as IntersectionObserverEntry],
      {} as IntersectionObserver
    );
    submit();
    expect(display).toHaveBeenCalledTimes(1);
    expect(find(".fih-spin-status").textContent).toContain("Browser saving is unavailable");
  });
  it("does not earn in a hidden tab and caps release at ten", () => {
    let hidden = false;
    vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
    const display = vi.fn();
    creator = mountFihCreator(display);
    vi.advanceTimersByTime(5000);
    hidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(30_000);
    expect(find("#fih-count").getAttribute("aria-valuenow")).toBe("0.5");
    hidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(5000);
    expect(find("#fih-count").getAttribute("aria-valuenow")).toBe("1");
    vi.advanceTimersByTime(200_000);
    reel("body").focus();
    submit();
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
    expect(shape("body")).toBe("diamond");
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
    expect(shape("head")).toBe("blunt");
    expect(head.getAttribute("aria-valuenow")).toBe("3");
    expect(head.getAttribute("aria-valuetext")).toBe("blunt");
    head.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    expect(shape("head")).toBe("pointed");
    head.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    expect(shape("head")).toBe("blunt");
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
      x: 600,
      y: 100,
      left: 600,
      right: 680,
      top: 100,
      bottom: 400,
      width: 80,
      height: 300,
      toJSON() {},
    });
    const wheel = new WheelEvent("wheel", {
      clientX: 640,
      clientY: 250,
      deltaY: 100,
      cancelable: true,
      bubbles: true,
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
