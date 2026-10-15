// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFihReleaseFeedback } from "../src/ui/fih-release";

function animation() {
  let resolve!: () => void;
  let reject!: (reason: Error) => void;
  const finished = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return {
    finished,
    finish: () => resolve(),
    cancel: vi.fn(() => reject(new Error("cancelled"))),
  };
}

function setup() {
  document.body.innerHTML = '<div><canvas></canvas><span></span></div>';
  const frame = document.querySelector("div")!;
  const canvas = frame.querySelector("canvas")!;
  const ripple = frame.querySelector("span")!;
  const departures: ReturnType<typeof animation>[] = [];
  const rings: ReturnType<typeof animation>[] = [];
  Object.defineProperty(canvas, "animate", { value: vi.fn(() => {
    const next = animation(); departures.push(next); return next;
  }) });
  Object.defineProperty(ripple, "animate", { value: vi.fn(() => {
    const next = animation(); rings.push(next); return next;
  }) });
  return { feedback: createFihReleaseFeedback(canvas, ripple), frame, departures, rings };
}

afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); });

describe("release feedback", () => {
  it("plays departure and ripple together and restores the preview after both finish", async () => {
    const { feedback, frame, departures, rings } = setup();
    feedback.play();
    expect(frame.hasAttribute("data-releasing")).toBe(true);
    expect(departures).toHaveLength(1);
    expect(rings).toHaveLength(1);
    departures[0].finish();
    await Promise.resolve();
    expect(frame.hasAttribute("data-releasing")).toBe(true);
    rings[0].finish();
    await vi.waitFor(() => expect(frame.hasAttribute("data-releasing")).toBe(false));
  });

  it("cancels old effects on a repeated release without clearing the new animation", async () => {
    const { feedback, frame, departures, rings } = setup();
    feedback.play();
    feedback.play();
    expect(departures[0].cancel).toHaveBeenCalledOnce();
    expect(rings[0].cancel).toHaveBeenCalledOnce();
    await Promise.resolve();
    await Promise.resolve();
    expect(frame.hasAttribute("data-releasing")).toBe(true);
    expect(departures[1].cancel).not.toHaveBeenCalled();
    feedback.cancel();
    expect(frame.hasAttribute("data-releasing")).toBe(false);
    expect(departures[1].cancel).toHaveBeenCalledOnce();
    expect(rings[1].cancel).toHaveBeenCalledOnce();
  });

  it("skips effects when hidden and cancels cleanly when editing or destroying the creator", async () => {
    const { feedback, frame, departures } = setup();
    let hidden = true;
    vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
    feedback.play();
    expect(departures).toHaveLength(0);
    hidden = false;
    feedback.play();
    feedback.cancel();
    feedback.cancel();
    await Promise.resolve();
    expect(departures[0].cancel).toHaveBeenCalledOnce();
    expect(frame.hasAttribute("data-releasing")).toBe(false);
  });
});
