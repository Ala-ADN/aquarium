import { describe, expect, it } from "vitest";
import { Color } from "three";
import { DEFAULT_APPEARANCE, FihDraft, FIH_PALETTE, fihTemplate, randomizeFih, resolveFihColors } from "../src/fih/appearance";
import { FIH_PRESETS } from "../src/fih/presets";
import { FihGeometry } from "../src/fih/geometry/fih";
import { getPatternMask, MASK_HEIGHT, MASK_WIDTH } from "../src/fih/patterns";
import { advanceVisit, earnedFih, LEGACY_STORAGE_KEY, PREVIOUS_STORAGE_KEY, parseVisit, readVisit, saveVisit, VISIT_STORAGE_KEY } from "../src/fih/visit";
import { FIN_SHAPES, HEAD_SHAPES } from "../src/fih/parts";
import { WIDTH } from "../src/constants";

describe("preset geometry", () => {
  for (const preset of FIH_PRESETS) {
    it(`${preset.label} has finite, non-degenerate geometry and stable simulation slots`, () => {
      const count = WIDTH + 1;
      const geometry = new FihGeometry({ bodyShape: preset.id }, count);
      const positions = geometry.getAttribute("position");
      const references = geometry.getAttribute("reference");
      const localVertex = geometry.getAttribute("fihVertex");
      const uv = geometry.getAttribute("bodyUv");
      const pointsPerFih = positions.count / count;
      expect(pointsPerFih).toBe((preset.outline ? preset.outline.length + 1 : 3) * 3);
      expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);
      for (let i = 0; i < positions.count; i++) {
        const fish = Math.floor(i / pointsPerFih);
        expect(references.getX(i)).toBeCloseTo(((fish % WIDTH) + .5) / WIDTH);
        expect(references.getY(i)).toBeCloseTo((Math.floor(fish / WIDTH) + .5) / WIDTH);
        expect(localVertex.getX(i)).toBe(i % pointsPerFih);
        if (i % pointsPerFih >= 3) {
          expect(uv.getX(i)).toBeGreaterThanOrEqual(0);
          expect(uv.getX(i)).toBeLessThanOrEqual(1);
          expect(uv.getY(i)).toBeGreaterThanOrEqual(0);
          expect(uv.getY(i)).toBeLessThanOrEqual(1);
        }
      }
      for (let i = 0; i < positions.count; i += 3) {
        const area = (positions.getZ(i + 1) - positions.getZ(i)) * (positions.getY(i + 2) - positions.getY(i))
          - (positions.getY(i + 1) - positions.getY(i)) * (positions.getZ(i + 2) - positions.getZ(i));
        expect(Math.abs(area)).toBeGreaterThan(.001);
      }
      geometry.dispose();
    });
  }
  it("preserves the classic body and original tail shade", () => {
    const { body, fin } = resolveFihColors(DEFAULT_APPEARANCE);
    expect(fin.equals(new Color(DEFAULT_APPEARANCE.color).multiplyScalar(.65))).toBe(true);
    const geometry = new FihGeometry({ bodyColor: body, finColor: fin }, 1);
    expect(geometry.getAttribute("position").count).toBe(9);
    expect(geometry.getAttribute("position").getZ(8)).toBe(12);
  });
});

describe("appearance and randomization", () => {
  it("uses custom tail color without darkening it", () => {
    expect(resolveFihColors({ ...DEFAULT_APPEARANCE, finColor: "#70c7ff" }).fin.getHexString()).toBe("70c7ff");
  });
  it("always changes a design even with a constant random source", () => {
    expect(randomizeFih(DEFAULT_APPEARANCE, () => 0)).not.toEqual(DEFAULT_APPEARANCE);
  });
  it("randomizes all parts and sizes while keeping effects locked", () => {
    for (let i = 0; i < 100; i++) {
      const design = randomizeFih(DEFAULT_APPEARANCE);
      expect(FIH_PRESETS.some((preset) => preset.id === design.shape)).toBe(true);
      expect(FIH_PALETTE.some((color) => color.hex === design.color)).toBe(true);
      expect(FIH_PALETTE.some((color) => color.hex === design.finColor)).toBe(true);
      expect(FIH_PALETTE.some((color) => color.hex === design.headColor)).toBe(true);
      expect(FIN_SHAPES.some((item) => item.id === design.finShape)).toBe(true);
      expect(HEAD_SHAPES.some((item) => item.id === design.headShape)).toBe(true);
      expect(design.pattern).toBe("plain");
      for (const size of [design.finSize, design.bodySize, design.headSize]) {
        expect(size).toBeGreaterThanOrEqual(.6); expect(size).toBeLessThanOrEqual(1.5);
      }
    }
  });
  it("undo restores all fields and manual edits clear undo", () => {
    const original = { ...DEFAULT_APPEARANCE, finColor: "#123456", headColor: "#654321", headShape: "blunt" as const, finSize: 1.25 };
    const draft = new FihDraft(original);
    draft.surprise(() => 0);
    expect(draft.canUndo).toBe(true);
    draft.undo();
    expect(draft.appearance).toEqual(original);
    expect(draft.canUndo).toBe(false);
    draft.surprise();
    draft.change({ color: "#abcdef" });
    expect(draft.canUndo).toBe(false);
    draft.undo();
    expect(draft.appearance.color).toBe("#abcdef");
  });
});

describe("shared pattern masks", () => {
  const value = (pattern: Parameters<typeof getPatternMask>[0], u: number, v: number) =>
    getPatternMask(pattern)[(Math.floor(v * MASK_HEIGHT) * MASK_WIDTH + Math.floor(u * MASK_WIDTH)) * 4];
  it("generates opaque cached masks with the specified marks", () => {
    expect(getPatternMask("spots")).toBe(getPatternMask("spots"));
    expect(getPatternMask("plain").length).toBe(MASK_WIDTH * MASK_HEIGHT * 4);
    expect(value("plain", .8, .5)).toBe(0);
    expect(value("stripes", .2, .5)).toBe(255);
    expect(value("stripes", .3, .5)).toBe(0);
    expect(value("spots", .22, .35)).toBe(255);
    expect(value("spots", .1, .1)).toBe(0);
    expect(value("dip", .69, .5)).toBe(0);
    expect(value("dip", .8, .5)).toBe(255);
  });
});

describe("visitor persistence and earning", () => {
  const encode = (fih: unknown, elapsed = 25_000) => JSON.stringify({ elapsed, fih });
  it("migrates both fih and fish legacy saves without changing appearance", () => {
    for (const property of ["fih", "fish"]) {
      const visit = parseVisit(JSON.stringify({ elapsed: 25_000, [property]: { shape: "round", color: "#ABCDEF", count: 5 } }), 1);
      expect(visit).toEqual({ elapsed: 25_000, fih: { ...DEFAULT_APPEARANCE, shape: "round", color: "#abcdef", count: 2 } });
    }
  });
  it("round-trips extended designs and prefers v3 without overwriting older saves", () => {
    const data = new Map([[LEGACY_STORAGE_KEY, encode({ shape: "long", color: "#123456", count: 1 })]]);
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
    const old = data.get(LEGACY_STORAGE_KEY);
    const visit = { elapsed: 100_000, fih: { ...DEFAULT_APPEARANCE, shape: "sail" as const, finColor: "#abcdef", headColor: "#123456", finShape: "fan" as const, headShape: "round" as const, headSize: 1.2, count: 10 } };
    expect(saveVisit(storage, visit)).toBe(true);
    expect(readVisit(storage)).toEqual(visit);
    expect(data.get(LEGACY_STORAGE_KEY)).toBe(old);
    expect(data.has(VISIT_STORAGE_KEY)).toBe(true);
  });
  it("retains valid time for invalid designs and handles malformed JSON", () => {
    expect(parseVisit("{bad")).toBeNull();
    for (const change of [{ shape: "unknown" }, { color: "red" }, { finColor: "bad" }, { headColor: "bad" }, { finShape: "bad" }, { headShape: "bad" }, { headSize: 3 }, { bodySize: .1 }, { finSize: null }, { pattern: "stripes" }, { count: -2 }]) {
      expect(parseVisit(encode({ ...DEFAULT_APPEARANCE, count: 2, ...change }))).toEqual({ elapsed: 25_000, fih: null });
    }
    expect(parseVisit(encode({ ...DEFAULT_APPEARANCE, count: 2 }, 5000))?.fih).toBeNull();
  });
  it("falls back to legacy JSON when v3 is malformed and tolerates storage errors", () => {
    expect(readVisit({ getItem: (key) => key === VISIT_STORAGE_KEY ? "broken" : key === PREVIOUS_STORAGE_KEY ? null : encode({ shape: "classic", color: "#ff9955", count: 1 }) }).fih?.count).toBe(1);
    expect(readVisit({ getItem: () => { throw new Error("blocked"); } })).toEqual({ elapsed: 0, fih: null });
    expect(saveVisit({ setItem: () => { throw new Error("quota"); } }, { elapsed: 10_000, fih: null })).toBe(false);
  });
  it("counts only visible time and caps the allowance at ten", () => {
    expect(advanceVisit(9000, 5000, false)).toBe(9000);
    expect(earnedFih(advanceVisit(9000, 1000, true))).toBe(1);
    expect(advanceVisit(99_000, 60_000, true)).toBe(100_000);
    expect(earnedFih(100_000)).toBe(10);
  });
});


describe("assembled parts", () => {
  it("joins all 96 combinations at every size extreme with finite non-degenerate triangles", () => {
    for (const body of FIH_PRESETS) for (const fin of FIN_SHAPES) for (const head of HEAD_SHAPES) {
      for (const size of [.6, 1, 1.5]) {
        const appearance = { ...DEFAULT_APPEARANCE, shape: body.id, finShape: fin.id, headShape: head.id,
          finSize: size, bodySize: size, headSize: size, finColor: "#70c7ff", headColor: "#ff8fbd" };
        const geometry = new FihGeometry(fihTemplate(appearance), 1);
        const positions = geometry.getAttribute("position");
        const parts = geometry.getAttribute("fihPart");
        const tail = geometry.getAttribute("tailWeight");
        const colors = geometry.getAttribute("fihColor");
        const neck = body.length * size * .67 * .2;
        const bodySeam = new Set<string>();
        const headSeam = new Set<string>();
        for (let i = 0; i < positions.count; i++) {
          expect([positions.getY(i), positions.getZ(i)].every(Number.isFinite)).toBe(true);
          if (parts.getX(i) !== 0) expect(tail.getX(i)).toBe(0);
          if (Math.abs(positions.getZ(i) - neck) < .0001) {
            (parts.getX(i) === 1 ? bodySeam : headSeam).add(positions.getY(i).toFixed(4));
          }
          if (parts.getX(i) === 2) {
            const color = new Color(colors.getX(i), colors.getY(i), colors.getZ(i));
            expect(color.getHexString()).toBe("ff8fbd");
          }
        }
        expect(bodySeam.size).toBe(2);
        expect(headSeam).toEqual(bodySeam);
        for (let i = 0; i < positions.count; i += 3) {
          const area = (positions.getZ(i + 1) - positions.getZ(i)) * (positions.getY(i + 2) - positions.getY(i))
            - (positions.getY(i + 1) - positions.getY(i)) * (positions.getZ(i + 2) - positions.getZ(i));
          expect(Math.abs(area)).toBeGreaterThan(.000001);
        }
        geometry.dispose();
      }
    }
  });
  it("assigns the same simulation slot to every part across variable triangle counts", () => {
    const geometry = new FihGeometry(fihTemplate({ ...DEFAULT_APPEARANCE, finShape: "fan", headShape: "round" }), 33);
    const vertices = geometry.getAttribute("position");
    const references = geometry.getAttribute("reference");
    const perFish = vertices.count / 33;
    for (let i = 0; i < vertices.count; i++) {
      const fish = Math.floor(i / perFish);
      expect(references.getX(i)).toBeCloseTo(((fish % WIDTH) + .5) / WIDTH);
      expect(references.getY(i)).toBeCloseTo((Math.floor(fish / WIDTH) + .5) / WIDTH);
    }
    geometry.dispose();
  });
  it("migrates v2 colors while disabling previously selected effects", () => {
    const raw = JSON.stringify({ elapsed: 20_000, fih: { shape: "sail", color: "#abcdef", finColor: "#123456", pattern: "spots", count: 2 } });
    expect(parseVisit(raw, 2)).toEqual({ elapsed: 20_000, fih: { ...DEFAULT_APPEARANCE,
      shape: "sail", color: "#abcdef", finColor: "#123456", count: 2 } });
  });
});
