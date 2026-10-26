// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";

// Simulate hiding styles from the creator while retaining their supported definitions.
vi.mock("../src/fih/presets", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/fih/presets")>();
  return { ...actual, FIH_PRESETS: actual.FIH_PRESETS.filter(({ id }) => id !== "sail") };
});
vi.mock("../src/fih/parts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/fih/parts")>();
  return { ...actual, FIN_SHAPES: actual.FIN_SHAPES.filter(({ id }) => id !== "ribbon"),
    HEAD_SHAPES: actual.HEAD_SHAPES.filter(({ id }) => id !== "blunt") };
});

import { DEFAULT_APPEARANCE, describeFih, FihDraft, fihTemplate, partOptions, randomizeFih } from "../src/fih/appearance";
import { parseFihDesign, serializeFihDesign } from "../src/fih/design";
import { FihGeometry } from "../src/fih/geometry/fih";
import { sampleFihSpin } from "../src/ui/fih-spin";
import { mountFihCreator } from "../src/ui/fih-creator";
import { VISIT_STORAGE_KEY } from "../src/fih/visit";

vi.mock("../src/ui/fih-preview", () => ({ drawFihPreview: vi.fn() }));

const retired = { ...DEFAULT_APPEARANCE, shape: "sail" as const, finShape: "ribbon" as const, headShape: "blunt" as const, count: 2 };

describe("retained style definitions", () => {
  it("restores retired styles in the actual editor and retains them when releasing color edits", () => {
    document.body.innerHTML = '<main id="portfolio-content"></main>';
    localStorage.clear();
    localStorage.setItem(VISIT_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, elapsed: 20000, fih: serializeFihDesign(retired) }));
    vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} });
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    const display = vi.fn();
    const creator = mountFihCreator(display);
    try {
      const bodyReel = document.querySelector<HTMLElement>('[data-part="body"] .fih-reel')!;
      expect(bodyReel.dataset.shape).toBe("sail");
      expect(bodyReel.getAttribute("aria-valuetext")).toBe("sailfin");
      const color = document.querySelector<HTMLInputElement>("#fih-body-picker")!;
      color.value = "#abcdef";
      color.dispatchEvent(new Event("input", { bubbles: true }));
      bodyReel.focus();
      document.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
      expect(display).toHaveBeenLastCalledWith({ ...retired, color: "#abcdef", count: 2 });
      expect(JSON.parse(localStorage.getItem(VISIT_STORAGE_KEY)!).fih).toEqual(serializeFihDesign({ ...retired, color: "#abcdef", count: 2 }));
      const previous = document.querySelector<HTMLButtonElement>('[data-part="fin"] [data-direction="-1"]')!;
      previous.click();
      expect(document.querySelector<HTMLElement>('[data-part="fin"] .fih-reel')!.dataset.shape).toBe("fan");
      expect(bodyReel.dataset.shape).toBe("sail");
    } finally {
      creator.destroy();
      vi.unstubAllGlobals();
      localStorage.clear();
    }
  });
  it("loads, describes, renders, edits, and resaves styles hidden from new selections", () => {
    const saved = serializeFihDesign(retired);
    expect(parseFihDesign(saved)).toEqual(retired);
    expect(describeFih(retired)).toContain("sailfin");
    const geometry = new FihGeometry(fihTemplate(retired), 2);
    expect(Array.from(geometry.getAttribute("position").array).every(Number.isFinite)).toBe(true);
    geometry.dispose();
    const draft = new FihDraft(retired);
    draft.change({ color: "#abcdef" });
    expect(serializeFihDesign({ ...draft.appearance, count: 2 })).toEqual({ ...saved, color: "#abcdef" });
    for (const [part, id] of [["body", "sail"], ["fin", "ribbon"], ["head", "blunt"]] as const) {
      expect(partOptions(part).some((choice) => choice.id === id)).toBe(false);
      expect(partOptions(part, retired).some((choice) => choice.id === id)).toBe(true);
    }
  });

  it("spins from retired shapes onto selectable shapes without losing the initial appearance", () => {
    const from = new FihDraft(retired).appearance;
    const target = randomizeFih(from, () => .99999);
    expect([target.shape, target.finShape, target.headShape]).not.toContain("sail");
    expect(target.finShape).not.toBe("ribbon");
    expect(target.headShape).not.toBe("blunt");
    expect(sampleFihSpin(from, target, 0).appearance).toEqual(from);
    expect(sampleFihSpin(from, target, 3000).appearance).toEqual(target);
  });
});
