import { describe, expect, it } from "vitest";
import saves from "./fixtures/fih-saves.json";
import { FIH_DESIGN_VERSION, parseFihDesign, serializeFihDesign } from "../src/fih/design";
import { createSharedFihRecord, parseSharedFih } from "../src/fih/shared";
import { LEGACY_STORAGE_KEY, PREVIOUS_STORAGE_KEY, V3_STORAGE_KEY, VISIT_SCHEMA_VERSION,
  VISIT_STORAGE_KEY, parseVisit, readVisit, saveVisit } from "../src/fih/visit";

const localStorage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
  };
};

describe("versioned fih compatibility", () => {
  it("migrates the original shared fih unchanged and round-trips the explicit format", () => {
    const original = JSON.stringify(saves.unversioned);
    const decoded = parseSharedFih("owner", saves.unversioned)!;
    expect(decoded.design).toEqual(saves.unversioned.design);
    expect(serializeFihDesign(decoded.design)).toEqual(saves.versioned);
    expect(parseFihDesign(saves.versioned)).toEqual(decoded.design);
    expect(serializeFihDesign(parseFihDesign(saves.versioned)!)).toEqual(saves.versioned);
    expect(JSON.stringify(saves.unversioned)).toBe(original);
  });

  it("upgrades v1/v2/v3 local saves with pinned historical defaults and retains originals", () => {
    const expectedDefaults = {
      shape: "classic", finShape: "triangle", headShape: "pointed", color: "#c8bfe7",
      finColor: null, headColor: null, finSize: 1, bodySize: 1, headSize: 1, pattern: "plain", count: 3,
    };
    const cases = [
      { key: LEGACY_STORAGE_KEY, value: saves.visitV1, expected: expectedDefaults },
      { key: PREVIOUS_STORAGE_KEY, value: saves.visitV2, expected: { ...expectedDefaults, shape: "sail", finColor: "#b5e61d" } },
      { key: V3_STORAGE_KEY, value: { elapsed: 40000, fih: saves.unversioned.design }, expected: { ...saves.unversioned.design, count: 3 } },
    ];
    for (const { key, value, expected } of cases) {
      const storage = localStorage();
      const raw = JSON.stringify(value);
      storage.setItem(key, raw);
      const visit = readVisit(storage);
      expect(visit).toEqual({ elapsed: 40000, fih: expected });
      expect(saveVisit(storage, visit)).toBe(true);
      expect(storage.getItem(key)).toBe(raw);
      expect(readVisit(storage)).toEqual(visit);
      expect(JSON.parse(storage.getItem(VISIT_STORAGE_KEY)!)).toEqual({
        schemaVersion: VISIT_SCHEMA_VERSION, elapsed: 40000,
        fih: { schemaVersion: FIH_DESIGN_VERSION, ...expected },
      });
    }
  });

  it.each([2, 99, 0, -1, 1.5, "1", null])("rejects unsupported design versions: %j", (schemaVersion) => {
    const design = { ...saves.versioned, schemaVersion };
    expect(parseFihDesign(design)).toBeNull();
    expect(parseSharedFih("owner", { ...saves.unversioned, design })).toBeNull();
    expect(() => serializeFihDesign(design as never)).toThrow();
  });

  it("does not silently strip unknown fields from an explicitly versioned design", () => {
    expect(parseFihDesign({ ...saves.versioned, effects: { glow: 1 } })).toBeNull();
  });

  it("normalizes old shared aliases using the same migration as local saves", () => {
    expect(parseFihDesign({ ...saves.unversioned.design, shape: "long", headShape: "beak" }))
      .toEqual({ ...saves.unversioned.design, shape: "classic", headShape: "pointed" });
  });

  it.each([
    { schemaVersion: 2, elapsed: 40000, fih: saves.versioned },
    { schemaVersion: 1, elapsed: 40000, fih: { ...saves.versioned, schemaVersion: 2, artwork: "future" } },
    { schemaVersion: 1, elapsed: 40000, fih: { ...saves.versioned, effects: { glow: 1 } } },
  ])("preserves unknown local formats, including when another tab upgrades them", (future) => {
    const storage = localStorage();
    storage.setItem(V3_STORAGE_KEY, JSON.stringify({ elapsed: 40000, fih: saves.unversioned.design }));
    const oldVisit = readVisit(storage);
    const raw = JSON.stringify(future);
    storage.setItem(VISIT_STORAGE_KEY, raw);
    expect(readVisit(storage)).toEqual({ elapsed: 40000, fih: null });
    expect(saveVisit(storage, oldVisit)).toBe(false);
    expect(storage.getItem(VISIT_STORAGE_KEY)).toBe(raw);
    expect(parseVisit(raw)?.fih).toBeNull();
  });

  it("preserves creation time when upgrading cloud data and refuses transaction downgrades", () => {
    const design = parseFihDesign(saves.versioned)!;
    const timestamp = { ".sv": "timestamp" };
    expect(createSharedFihRecord(null, design, timestamp)).toEqual({ design: saves.versioned, createdAt: timestamp, updatedAt: timestamp });
    expect(createSharedFihRecord(saves.unversioned, design, timestamp)).toEqual({
      design: saves.versioned, createdAt: saves.unversioned.createdAt, updatedAt: timestamp,
    });
    for (const unsupported of [{ ...saves.versioned, schemaVersion: 2 }, { ...saves.versioned, effects: {} }]) {
      expect(() => createSharedFihRecord({ ...saves.unversioned, design: unsupported }, design, timestamp)).toThrow("newer app");
    }
  });
});
