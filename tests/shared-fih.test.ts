import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE } from "../src/fih/appearance";
import { FihGeometry } from "../src/fih/geometry/fih";
import { MAX_FIH, WIDTH } from "../src/constants";
import { parseSharedDesign, parseSharedFih, selectSharedSchool } from "../src/fih/shared";
import { readFirebaseConfig } from "../src/fih/firebase-config";

const design = { ...DEFAULT_APPEARANCE, count: 10 };

describe("untrusted shared fih", () => {
  it("normalizes Firebase's omitted null colors and strips unknown fields", () => {
    expect(parseSharedDesign({ ...design, finColor: undefined, headColor: undefined, color: "#AABBCC", extra: "ignored" }))
      .toEqual({ ...design, color: "#aabbcc" });
  });
  it.each([
    { count: 0 }, { count: 11 }, { count: 1.5 }, { count: "10" },
    { bodySize: NaN }, { bodySize: 1.51 }, { finSize: 0.59 },
    { pattern: "spots" }, { shape: "injected" }, { color: "red" },
  ])("rejects unsafe remote designs: %j", (change) => {
    expect(parseSharedDesign({ ...design, ...change })).toBeNull();
  });
  it("rejects missing or inconsistent timestamps", () => {
    expect(parseSharedFih("alice", { design })).toBeNull();
    expect(parseSharedFih("alice", { design, createdAt: 2, updatedAt: 1 })).toBeNull();
    expect(parseSharedFih("alice", { design, createdAt: 1, updatedAt: 2 }))
      .toEqual({ ownerId: "alice", design, updatedAt: 2 });
  });
});

describe("bounded shared school", () => {
  it("reserves the local swarm, excludes its cloud duplicate, and never renders over 1000", () => {
    const entries = Array.from({ length: 200 }, (_, i) => ({ ownerId: String(i), design, updatedAt: i }));
    const school = selectSharedSchool(entries, design, "199");
    expect(MAX_FIH).toBe(1000);
    expect(school.count).toBe(1000);
    expect(school.placements).toHaveLength(99);
    expect(school.placements[0].offset).toBe(10);
    expect(school.placements.at(-1)!.offset).toBe(990);
    expect(school.placements.reduce((sum, item) => sum + item.design.count, 0)).toBe(990);
  });
  it("fills a partial last swarm and can display one's cloud design without a local save", () => {
    const entries = Array.from({ length: 100 }, (_, i) => ({ ownerId: String(i), design, updatedAt: i }));
    const school = selectSharedSchool(entries, { ...design, count: 3 }, "outside-query");
    expect(school.count).toBe(1000);
    expect(school.placements.at(-1)!.design.count).toBe(7);
    expect(selectSharedSchool(entries.slice(0, 1), null, "0").count).toBe(10);
  });
  it("assigns separate simulation slots, including across texture rows", () => {
    const geometry = new FihGeometry({}, 2, 31);
    const references = geometry.getAttribute("reference");
    expect(references.getX(0)).toBeCloseTo(31.5 / WIDTH);
    expect(references.getY(0)).toBeCloseTo(0.5 / WIDTH);
    expect(references.getX(9)).toBeCloseTo(0.5 / WIDTH);
    expect(references.getY(9)).toBeCloseTo(1.5 / WIDTH);
    geometry.dispose();
  });
});

describe("Firebase configuration", () => {
  const env = {
    VITE_FIREBASE_API_KEY: "public-key", VITE_FIREBASE_AUTH_DOMAIN: "demo.firebaseapp.com",
    VITE_FIREBASE_DATABASE_URL: "https://demo.firebaseio.com", VITE_FIREBASE_PROJECT_ID: "demo",
    VITE_FIREBASE_APP_ID: "public-app-id", VITE_FIREBASE_APP_CHECK_SITE_KEY: "public-site-key",
  };
  it("allows browser-only use without Firebase", () => expect(readFirebaseConfig({})).toBeNull());
  it("requires complete configuration and App Check outside the emulator", () => {
    expect(() => readFirebaseConfig({ VITE_FIREBASE_API_KEY: "partial" })).toThrow("incomplete");
    expect(() => readFirebaseConfig({ ...env, VITE_FIREBASE_APP_CHECK_SITE_KEY: "" })).toThrow("App Check");
    expect(readFirebaseConfig(env)?.emulators).toBe(false);
  });
  it("rejects emulator settings in production and insecure production URLs", () => {
    expect(() => readFirebaseConfig({ ...env, VITE_FIREBASE_EMULATORS: "true" })).toThrow("development");
    expect(readFirebaseConfig({ ...env, VITE_FIREBASE_EMULATORS: "true" }, true)?.emulators).toBe(true);
    expect(() => readFirebaseConfig({ ...env, VITE_FIREBASE_DATABASE_URL: "http://localhost" })).toThrow("HTTPS");
  });
});
