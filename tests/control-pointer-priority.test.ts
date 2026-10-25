// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prioritizeControlClicks } from "../src/ui/control-pointer-priority";

let abort: AbortController;
let form: HTMLFormElement;
let plane: HTMLElement;
let button: HTMLButtonElement;
let picker: HTMLInputElement;
let slider: HTMLInputElement;
let bounds: DOMRect;
const rect = (left: number, top: number) => ({ left, top, right: left + 100, bottom: top + 34,
  x: left, y: top, width: 100, height: 34, toJSON() {} }) as DOMRect;

function pointer(target: EventTarget, type: string, x = 550, y = 117, pointerType = "mouse") {
  const event = new PointerEvent(type, { clientX: x, clientY: y, pointerId: 7, pointerType,
    isPrimary: true, button: 0, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}
function click(target: EventTarget, x = 550, y = 117) {
  const event = new MouseEvent("click", { clientX: x, clientY: y, button: 0, detail: 1,
    bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  document.body.innerHTML = '<section><form><button type="button">spin</button><input type="color"><input type="range"></form></section>';
  plane = document.querySelector("section")!;
  form = document.querySelector("form")!;
  button = form.querySelector("button")!;
  picker = form.querySelector('[type="color"]')!;
  slider = form.querySelector('[type="range"]')!;
  bounds = rect(500, 100);
  vi.spyOn(button, "getBoundingClientRect").mockImplementation(() => bounds);
  abort = new AbortController();
  prioritizeControlClicks(form, abort.signal);
});
afterEach(() => { abort.abort(); vi.restoreAllMocks(); document.body.replaceChildren(); });

describe("3D control click priority", () => {
  it("routes an ancestor hit to the pressed button even after it moves, without double activation", () => {
    const action = vi.fn();
    const ancestorPress = vi.fn();
    const pageClick = vi.fn();
    button.addEventListener("click", action);
    plane.addEventListener("pointerdown", ancestorPress);
    plane.addEventListener("click", pageClick);
    slider.focus(); // Changing focus must not be mistaken for the window losing focus.
    expect(pointer(plane, "pointerdown").defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(button);
    bounds = rect(500, 180);
    pointer(plane, "pointerup");
    expect(click(plane).defaultPrevented).toBe(true);
    expect(action).toHaveBeenCalledOnce();
    expect(pageClick).toHaveBeenCalledOnce(); // The forwarded button click only.
    expect(ancestorPress).not.toHaveBeenCalled();
  });

  it("leaves a native button click untouched", () => {
    const action = vi.fn();
    const activation = vi.spyOn(button, "click");
    button.addEventListener("click", action);
    expect(pointer(button, "pointerdown").defaultPrevented).toBe(false);
    pointer(button, "pointerup");
    expect(click(button).defaultPrevented).toBe(false);
    expect(action).toHaveBeenCalledOnce();
    expect(activation).not.toHaveBeenCalled();
  });

  it("opens the native color picker through a missed hit on the window plane", () => {
    vi.spyOn(picker, "getBoundingClientRect").mockReturnValue(rect(650, 100));
    const showPicker = vi.fn();
    Object.defineProperty(picker, "showPicker", { value: showPicker });
    pointer(plane, "pointerdown", 700, 117);
    pointer(plane, "pointerup", 700, 117);
    click(plane, 700, 117);
    expect(showPicker).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(picker);
  });

  it("uses native color click activation if showPicker is unavailable", () => {
    vi.spyOn(picker, "getBoundingClientRect").mockReturnValue(rect(650, 100));
    Object.defineProperty(picker, "showPicker", { value: undefined });
    const activation = vi.spyOn(picker, "click");
    pointer(plane, "pointerdown", 700, 117);
    click(plane, 700, 117);
    expect(activation).toHaveBeenCalledOnce();
  });

  it("never activates a disabled button, including one disabled after pressing", () => {
    const action = vi.fn();
    button.addEventListener("click", action);
    button.disabled = true;
    pointer(plane, "pointerdown");
    click(plane);
    button.disabled = false;
    pointer(plane, "pointerdown");
    button.disabled = true;
    click(plane);
    expect(action).not.toHaveBeenCalled();
  });

  it("cancels activation for a drag away, touch scrolling, or a cancelled pointer", () => {
    const action = vi.fn();
    button.addEventListener("click", action);
    pointer(plane, "pointerdown");
    click(plane, 900, 500);
    pointer(plane, "pointerdown", 550, 117, "touch");
    pointer(plane, "pointermove", 550, 150, "touch");
    click(plane);
    pointer(plane, "pointerdown");
    pointer(plane, "pointercancel");
    expect(click(plane).defaultPrevented).toBe(false);
    expect(action).not.toHaveBeenCalled();
  });

  it("preserves sliders, keyboard activation, and controls outside the creator", () => {
    const action = vi.fn();
    button.addEventListener("click", action);
    expect(pointer(slider, "pointerdown").defaultPrevented).toBe(false);
    click(slider);
    expect(action).not.toHaveBeenCalled();
    button.click();
    expect(action).toHaveBeenCalledOnce();
    const foreign = document.createElement("button");
    foreign.type = "button";
    document.body.append(foreign);
    const otherAction = vi.fn();
    foreign.addEventListener("click", otherAction);
    pointer(foreign, "pointerdown");
    click(foreign);
    expect(action).toHaveBeenCalledOnce();
    expect(otherAction).toHaveBeenCalledOnce();
  });

  it("clears the pending press and removes capture handlers on blur or destruction", () => {
    const action = vi.fn();
    button.addEventListener("click", action);
    pointer(plane, "pointerdown");
    window.dispatchEvent(new Event("blur"));
    click(plane);
    expect(action).not.toHaveBeenCalled();
    pointer(plane, "pointerdown");
    abort.abort();
    expect(click(plane).defaultPrevented).toBe(false);
    expect(action).not.toHaveBeenCalled();
  });

  it("preserves native summary activation over a projected button", () => {
    const action = vi.fn();
    button.addEventListener("click", action);
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "Format";
    details.append(summary);
    form.append(details);
    expect(pointer(summary, "pointerdown").defaultPrevented).toBe(false);
    expect(click(summary).defaultPrevented).toBe(false);
    expect(action).not.toHaveBeenCalled();
  });

  it("does not redirect clicks from a window in front to a button behind it", () => {
    const action = vi.fn();
    button.addEventListener("click", action);
    plane.className = "glass-window";
    const otherWindow = document.createElement("section");
    otherWindow.className = "glass-window";
    const foreground = document.createElement("div");
    otherWindow.append(foreground);
    document.body.append(otherWindow);
    expect(pointer(foreground, "pointerdown").defaultPrevented).toBe(false);
    expect(click(foreground).defaultPrevented).toBe(false);
    expect(action).not.toHaveBeenCalled();
  });

  it("ignores hidden controls even when they report nonempty bounds", () => {
    const action = vi.fn();
    button.addEventListener("click", action);
    button.hidden = true;
    expect(pointer(plane, "pointerdown").defaultPrevented).toBe(false);
    click(plane);
    expect(action).not.toHaveBeenCalled();
    button.hidden = false;
    const menu = document.createElement("details");
    form.append(menu);
    menu.append(button);
    expect(pointer(plane, "pointerdown").defaultPrevented).toBe(false);
    click(plane);
    expect(action).not.toHaveBeenCalled();
  });
});
