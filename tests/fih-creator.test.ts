// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountFihCreator } from "../src/ui/fih-creator";
import { VISIT_STORAGE_KEY, PREVIOUS_STORAGE_KEY, LEGACY_STORAGE_KEY } from "../src/fih/visit";
import { DEFAULT_APPEARANCE } from "../src/fih/appearance";

vi.mock("../src/ui/fih-preview", () => ({ drawFihPreview: vi.fn() }));
let creator: ReturnType<typeof mountFihCreator>;
let intersect: IntersectionObserverCallback;
const find = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const choose = (part: string, control: string, value: string) => {
  const input = find<HTMLSelectElement>(`#fih-${part}-${control}`);
  input.value = value;
  input.dispatchEvent(new Event("change", { bubbles: true }));
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
    expect(find<HTMLSelectElement>("#fih-fin-shape").options).toHaveLength(4);
    expect(find<HTMLSelectElement>("#fih-body-shape").options).toHaveLength(6);
    expect(find<HTMLSelectElement>("#fih-head-shape").options).toHaveLength(4);
    vi.advanceTimersByTime(10_000);
    expect(find<HTMLButtonElement>(".fih-release").disabled).toBe(true);
    find<HTMLSelectElement>("#fih-fin-shape").focus();
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
    expect(find<HTMLSelectElement>("#fih-fin-shape").value).toBe("ribbon");
    expect(find<HTMLSelectElement>("#fih-body-shape").value).toBe("classic");
    expect(find<HTMLSelectElement>("#fih-head-shape").value).toBe("pointed");
    find<HTMLButtonElement>('[data-part="fin"] [data-direction="1"]').click();
    expect(find<HTMLSelectElement>("#fih-fin-shape").value).toBe("triangle");
  });
  it("spins only the draft and undo restores every part's settings", () => {
    const display = vi.fn(); creator = mountFihCreator(display);
    choose("head", "shape", "beak"); inputValue("#fih-head-size", "1.5");
    vi.spyOn(Math, "random").mockReturnValue(0);
    find<HTMLButtonElement>(".fih-spin").click();
    expect(find<HTMLSelectElement>("#fih-head-shape").value).toBe("pointed");
    expect(find(".fih-undo").hidden).toBe(false);
    expect(display).not.toHaveBeenCalled();
    find<HTMLButtonElement>(".fih-undo").click();
    expect(find<HTMLSelectElement>("#fih-head-shape").value).toBe("beak");
    expect(find<HTMLInputElement>("#fih-head-size").value).toBe("1.5");
    expect(find(".fih-undo").hidden).toBe(true);
    expect(document.activeElement).toBe(find(".fih-spin"));
  });
  it("keeps all special effects locked after spins and manual edits", () => {
    const display = vi.fn(); creator = mountFihCreator(display);
    expect(document.querySelectorAll(".fih-effects button:disabled")).toHaveLength(3);
    for (let i = 0; i < 5; i++) find<HTMLButtonElement>(".fih-spin").click();
    vi.advanceTimersByTime(10_000); find<HTMLSelectElement>("#fih-head-shape").focus(); submit();
    expect(display.mock.lastCall?.[0].pattern).toBe("plain");
    expect(document.querySelectorAll(".fih-effects button:disabled")).toHaveLength(3);
  });
  it("updates inherited head and fin colors and supports independent custom colors", () => {
    const display = vi.fn(); creator = mountFihCreator(display);
    const oldFin = find<HTMLInputElement>("#fih-fin-picker").value;
    choose("body", "color", "#70c7ff");
    expect(find<HTMLInputElement>("#fih-head-picker").value).toBe("#70c7ff");
    expect(find<HTMLInputElement>("#fih-fin-picker").value).not.toBe(oldFin);
    inputValue("#fih-head-picker", "#123456");
    expect(find<HTMLSelectElement>("#fih-head-color").value).toBe("custom");
    choose("body", "color", "#ffd166");
    expect(find<HTMLInputElement>("#fih-head-picker").value).toBe("#123456");
    vi.advanceTimersByTime(10_000); find<HTMLSelectElement>("#fih-head-shape").focus(); submit();
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
    expect(find<HTMLSelectElement>("#fih-fin-color").value).toBe("custom");
    creator.destroy();
    localStorage.setItem(VISIT_STORAGE_KEY, JSON.stringify({ elapsed: 30_000, fih: { ...DEFAULT_APPEARANCE, finShape: "fan", headShape: "round", headColor: "#123456", bodySize: 1.2, count: 2 } }));
    creator = mountFihCreator(display);
    expect(find<HTMLSelectElement>("#fih-fin-shape").value).toBe("fan");
    expect(find<HTMLSelectElement>("#fih-head-shape").value).toBe("round");
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
    vi.advanceTimersByTime(200_000); find<HTMLSelectElement>("#fih-body-shape").focus(); submit();
    expect(display.mock.lastCall?.[0].count).toBe(10);
  });
});
