import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { serverTimestamp } from "firebase/database";
import { DEFAULT_APPEARANCE } from "../src/fih/appearance";
import { serializeFihDesign } from "../src/fih/design";

let env: RulesTestEnvironment;
const design = serializeFihDesign({ ...DEFAULT_APPEARANCE, count: 2 });
const record = (change = {}) => ({ design: { ...design, ...change }, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
const database = (uid?: string) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).database();
const seed = async (path: string, value: unknown) => {
  await env.withSecurityRulesDisabled(async (context) => { await context.database().ref(path).set(value); });
};
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-aquarium",
    database: {
      host: "127.0.0.1", port: 9000,
      rules: readFileSync(new URL("../database.rules.json", import.meta.url), "utf8"),
    },
  });
});
beforeEach(async () => {
  await env.clearDatabase();
  await seed("settings", { writesEnabled: true });
});
afterAll(async () => { await env?.cleanup(); });

describe("server-enforced fih ownership and concurrency", () => {
  it("accepts simultaneous transactions for independent visitors without losing either design", async () => {
    await Promise.all(["alice", "bob"].map((uid) => assertSucceeds(
      database(uid).ref(`fih/${uid}`).transaction(() => record())
    )));
    const snapshot = await assertSucceeds(database().ref("fih").orderByChild("updatedAt").limitToLast(1000).get());
    expect(Object.keys(snapshot.val()).sort()).toEqual(["alice", "bob"]);
  });
  it("rejects unauthenticated writes, another owner's path, and arbitrary root writes", async () => {
    await assertFails(database().ref("fih/alice").set(record()));
    await assertFails(database("alice").ref("fih/bob").set(record()));
    await assertFails(database("alice").ref("elsewhere").set("spam"));
  });
  it("rejects deletion and tampering with another visitor's existing design", async () => {
    await seed("fih/bob", { ...record(), createdAt: 1000, updatedAt: Date.now() - 20_000 });
    await assertFails(database("alice").ref("fih/bob").update({ "design/color": "#123456", updatedAt: serverTimestamp() }));
    await assertFails(database("bob").ref("fih/bob").remove());
  });
  it("enforces the cooldown and permits a later owner update without changing createdAt", async () => {
    const own = database("alice").ref("fih/alice");
    await assertSucceeds(own.set(record()));
    await assertFails(own.update({ "design/color": "#123456", updatedAt: serverTimestamp() }));
    await seed("fih/alice", { ...record(), createdAt: 1000, updatedAt: Date.now() - 20_000 });
    await assertSucceeds(own.transaction((current) => ({ ...current, design: { ...design, color: "#123456" }, updatedAt: serverTimestamp() })));
    expect((await own.get()).val().createdAt).toBe(1000);
    await seed("fih/alice/updatedAt", Date.now() - 20_000);
    await assertFails(own.update({ createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  });
  it("requires server timestamps instead of accepting a forged clock", async () => {
    await assertFails(database("alice").ref("fih/alice").set({ ...record(), createdAt: 1, updatedAt: 1 }));
  });
  it("defaults to closed if the kill switch is missing and rejects client changes to it", async () => {
    await seed("settings", null);
    await assertFails(database("alice").ref("fih/alice").set(record()));
    await assertFails(database("alice").ref("settings/writesEnabled").set(true));
    await seed("settings", { writesEnabled: false });
    await assertFails(database("alice").ref("fih/alice").set(record()));
  });
});

describe("server-enforced schema", () => {
  it("upgrades an unversioned record without changing its creation timestamp", async () => {
    const { schemaVersion: _, ...legacy } = design;
    await seed("fih/alice", { design: legacy, createdAt: 1000, updatedAt: Date.now() - 20_000 });
    const own = database("alice").ref("fih/alice");
    await assertSucceeds(own.transaction((current) => ({ ...current, design, updatedAt: serverTimestamp() })));
    expect((await own.get()).val().design.schemaVersion).toBe(1);
    expect((await own.get()).val().createdAt).toBe(1000);
  });
  it("rejects old clients' unversioned writes and removing a stored version", async () => {
    await assertFails(database("alice").ref("fih/alice").set(record({ schemaVersion: null })));
    await seed("fih/alice", { ...record(), createdAt: 1000, updatedAt: Date.now() - 20_000 });
    await assertFails(database("alice").ref("fih/alice").update({ "design/schemaVersion": null, updatedAt: serverTimestamp() }));
  });
  it("rejects downgrading a record written by a future client", async () => {
    await seed("fih/alice", { ...record({ schemaVersion: 2 }), createdAt: 1000, updatedAt: Date.now() - 20_000 });
    await assertFails(database("alice").ref("fih/alice").set({ ...record(), createdAt: 1000 }));
  });
  it.each([
    { schemaVersion: 0 }, { schemaVersion: 2 }, { schemaVersion: "1" },
    { count: 0 }, { count: 11 }, { count: 1.5 }, { count: "2" },
    { shape: "unknown" }, { finShape: "unknown" }, { headShape: "unknown" },
    { color: "red" }, { finColor: "#ffffff00" }, { headColor: 12 },
    { bodySize: 1.51 }, { finSize: 0.59 }, { headSize: "1" },
    { pattern: "spots" }, { extra: "x".repeat(2000) },
    { count: null },
  ])("rejects malformed or unbounded design fields: %j", async (change) => {
    await assertFails(database("alice").ref("fih/alice").set(record(change)));
  });
  it("rejects extra record metadata and accepts omitted nullable colors", async () => {
    const own = database("alice").ref("fih/alice");
    await assertFails(own.set({ ...record(), extra: "spam" }));
    await assertSucceeds(own.set(record({ finColor: null, headColor: null })));
  });
});

describe("bounded public reads", () => {
  it("permits the indexed bounded feed, but denies full scans, excessive limits, and settings reads", async () => {
    await assertSucceeds(database().ref("fih").orderByChild("updatedAt").limitToLast(1000).get());
    await assertFails(database().ref("fih").get());
    await assertFails(database().ref("fih").orderByChild("updatedAt").limitToLast(1001).get());
    await assertFails(database().ref("fih").orderByKey().limitToLast(100).get());
    await assertFails(database("alice").ref("settings").get());
  });
  it("permits an owner's transaction read without exposing an unbounded collection", async () => {
    await assertSucceeds(database("alice").ref("fih/alice").get());
    await assertFails(database("alice").ref("fih").get());
  });
});
