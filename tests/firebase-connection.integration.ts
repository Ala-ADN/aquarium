import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { connectFirebaseAquarium } from "../src/fih/firebase";
import { DEFAULT_APPEARANCE } from "../src/fih/appearance";
import { serializeFihDesign } from "../src/fih/design";

let env: RulesTestEnvironment;
let client: Awaited<ReturnType<typeof connectFirebaseAquarium>> | undefined;
const config = {
  options: { apiKey: "demo-key", authDomain: "demo-aquarium.firebaseapp.com", projectId: "demo-aquarium",
    databaseURL: "https://demo-aquarium.firebaseio.com", appId: "demo-app" },
  appCheckSiteKey: "", emulators: true,
};
const design = { ...DEFAULT_APPEARANCE, count: 2 };
const record = (i: number) => ({ design: serializeFihDesign(design), createdAt: 1000, updatedAt: 2000 + i });
const seed = async (path: string, value: unknown) => {
  await env.withSecurityRulesDisabled(async (context) => { await context.database().ref(path).set(value); });
};
const callbacks = () => ({ onEntries: vi.fn(), onOwner: vi.fn(), onError: vi.fn(), onConnected: vi.fn() });

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: "demo-aquarium", database: {
    host: "127.0.0.1", port: 9000, rules: readFileSync(new URL("../database.rules.json", import.meta.url), "utf8"),
  } });
});
beforeEach(async () => { await env.clearDatabase(); await seed("settings", { writesEnabled: true }); });
afterEach(async () => { await client?.close(); client = undefined; });
afterAll(async () => { await env.cleanup(); });

describe("public feed and deferred authentication", () => {
  it("publishes a complete initial feed once and batches atomic live changes", async () => {
    const fih = Object.fromEntries(Array.from({ length: 1000 }, (_, i) => [`owner-${i}`, record(i)]));
    await seed("fih", fih);
    const events = callbacks();
    client = await connectFirebaseAquarium(config, events);
    await vi.waitFor(() => expect(events.onEntries).toHaveBeenCalled(), { timeout: 10_000 });
    expect(events.onEntries).toHaveBeenCalledTimes(1);
    expect(events.onEntries.mock.lastCall?.[0]).toHaveLength(1000);
    // A replacement, removal, and insertion belong to one logical update.
    await env.withSecurityRulesDisabled(async (context) => {
      await context.database().ref("fih").update({
        "owner-0": null, "owner-1": { ...record(1), design: { ...serializeFihDesign(design), color: "#123456" } },
        "new-owner": record(1001),
      });
    });
    await vi.waitFor(() => expect(events.onEntries).toHaveBeenCalledTimes(2));
    const latest = events.onEntries.mock.lastCall![0];
    expect(latest).toHaveLength(1000);
    expect(latest.some((entry: { ownerId: string }) => entry.ownerId === "owner-0")).toBe(false);
    expect(latest.find((entry: { ownerId: string }) => entry.ownerId === "owner-1").design.color).toBe("#123456");
    expect(latest.some((entry: { ownerId: string }) => entry.ownerId === "new-owner")).toBe(true);
    expect(events.onError).not.toHaveBeenCalled();
  });

  it("publishes an empty initial tank and reports removal of its last valid entry", async () => {
    const events = callbacks();
    client = await connectFirebaseAquarium(config, events);
    await vi.waitFor(() => expect(events.onEntries).toHaveBeenLastCalledWith([]));
    await seed("fih/owner", record(1));
    await vi.waitFor(() => expect(events.onEntries.mock.lastCall?.[0]).toHaveLength(1));
    await seed("fih/owner", null);
    await vi.waitFor(() => expect(events.onEntries).toHaveBeenLastCalledWith([]));
  });

  it("authenticates an explicit release, stores its version, and protects a newer cloud design", async () => {
    const events = callbacks();
    client = await connectFirebaseAquarium(config, events);
    // Do not wait for an initial feed or background identity restoration.
    await client.save(design);
    const uid = events.onOwner.mock.lastCall?.[0];
    expect(typeof uid).toBe("string");
    await env.withSecurityRulesDisabled(async (context) => {
      const saved = (await context.database().ref(`fih/${uid}`).get()).val();
      expect(saved.design.schemaVersion).toBe(1);
      expect(saved.design.count).toBe(2);
      await context.database().ref(`fih/${uid}`).set({
        ...saved, design: { ...saved.design, schemaVersion: 2 }, updatedAt: Date.now() - 20_000,
      });
    });
    await expect(client.save(design)).rejects.toThrow("newer app");
  });
});
