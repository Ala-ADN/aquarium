import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE, fihTemplate } from "../src/fih/appearance";
import { selectSharedSchool } from "../src/fih/shared";
import type { FihSchool, SharedFih } from "../src/fih/shared";
import { FihGeometry } from "../src/fih/geometry/fih";
import { MAX_FIH, WIDTH } from "../src/constants";

const design = { ...DEFAULT_APPEARANCE, count: 10 };
const entry = (ownerId: string, updatedAt = 1, count = 10): SharedFih =>
  ({ ownerId, updatedAt, design: { ...design, count } });
const slotsFor = (school: FihSchool, ownerId: string) =>
  school.placements.find((placement) => placement.ownerId === ownerId)!.slots;
const expectValidSchool = (school: FihSchool) => {
  const slots = [...school.ownSlots, ...school.backgroundSlots, ...school.placements.flatMap((placement) => placement.slots)];
  expect(slots).toHaveLength(school.totalCount);
  expect(new Set(slots).size).toBe(slots.length);
  expect([...school.activeSlots].sort((a, b) => a - b)).toEqual([...slots].sort((a, b) => a - b));
  expect(slots.every((slot) => slot >= 0 && slot < MAX_FIH)).toBe(true);
};

describe("stable school simulation slots", () => {
  it("keeps background and shared fih in place as newer swarms arrive and update", () => {
    const initial = selectSharedSchool([], null, null);
    const alice = selectSharedSchool([entry("alice")], null, null, initial, 1);
    const bob = selectSharedSchool([entry("alice"), entry("bob", 2)], null, null, alice, 2);
    const updated = selectSharedSchool([entry("bob", 2), { ...entry("alice", 3), design: { ...design, color: "#ff0000" } }], null, null, bob, 3);
    for (const school of [alice, bob, updated]) {
      expect(school.backgroundSlots).toEqual(initial.backgroundSlots);
      expect(slotsFor(school, "alice")).toEqual(slotsFor(alice, "alice"));
      expectValidSchool(school);
    }
    expect(slotsFor(updated, "bob")).toEqual(slotsFor(bob, "bob"));
    expect(updated.revealTimes.get(slotsFor(updated, "alice")[0])).toBe(1);
    expect(updated.revealTimes.get(slotsFor(updated, "bob")[0])).toBe(2);
  });

  it("reuses removed slots without moving survivors or keeping the old reveal time", () => {
    const initial = selectSharedSchool([entry("alice", 2), entry("bob")], null, null);
    const removed = selectSharedSchool([entry("bob")], null, null, initial, 1);
    const added = selectSharedSchool([entry("bob"), entry("carol", 3)], null, null, removed, 2);
    expect(slotsFor(removed, "bob")).toEqual(slotsFor(initial, "bob"));
    expect(slotsFor(added, "bob")).toEqual(slotsFor(initial, "bob"));
    expect(slotsFor(added, "carol")).toEqual(slotsFor(initial, "alice"));
    expect(added.backgroundSlots).toEqual(initial.backgroundSlots);
    expect(added.revealTimes.get(slotsFor(added, "carol")[0])).toBe(2);
    expectValidSchool(removed);
    expectValidSchool(added);
  });

  it("grows and shrinks a swarm without moving other swarms or refading survivors", () => {
    const initial = selectSharedSchool([entry("alice", 2, 3), entry("bob")], null, null);
    const grown = selectSharedSchool([entry("alice", 3), entry("bob")], null, null, initial, 1);
    const shrunk = selectSharedSchool([entry("alice", 4, 2), entry("bob")], null, null, grown, 2);
    expect(slotsFor(grown, "alice").slice(0, 3)).toEqual(slotsFor(initial, "alice"));
    expect(slotsFor(shrunk, "alice")).toEqual(slotsFor(initial, "alice").slice(0, 2));
    for (const school of [grown, shrunk]) {
      expect(slotsFor(school, "bob")).toEqual(slotsFor(initial, "bob"));
      expect(school.backgroundSlots).toEqual(initial.backgroundSlots);
      expectValidSchool(school);
    }
    expect(grown.revealTimes.get(slotsFor(grown, "alice")[0])).toBe(0);
    expect(grown.revealTimes.get(slotsFor(grown, "alice")[3])).toBe(1);
  });

  it("preserves slots through local restore, delayed identity, and repeated editor restore", () => {
    const initial = selectSharedSchool([], null, null);
    const local = selectSharedSchool([], design, null, initial, 1);
    const feed = selectSharedSchool([entry("me", 2), entry("alice")], design, null, local, 2);
    const authenticated = selectSharedSchool([entry("me", 2), entry("alice")], design, "me", feed, 3);
    const restoredAgain = selectSharedSchool([entry("me", 2), entry("alice")], { ...design }, "me", authenticated, 4);
    for (const school of [feed, authenticated, restoredAgain]) {
      expect(school.ownSlots).toEqual(local.ownSlots);
      expect(school.backgroundSlots).toEqual(initial.backgroundSlots);
      expect(school.revealTimes.get(school.ownSlots[0])).toBe(1);
      expectValidSchool(school);
    }
    expect(slotsFor(authenticated, "alice")).toEqual(slotsFor(feed, "alice"));
    expect(slotsFor(restoredAgain, "alice")).toEqual(slotsFor(feed, "alice"));
    expect(authenticated.placements.some((placement) => placement.ownerId === "me")).toBe(false);
  });

  it("transfers an existing cloud swarm to local rendering without a jump or fade restart", () => {
    const cloud = selectSharedSchool([entry("me", 2), entry("alice")], null, "me", undefined, 1);
    const local = selectSharedSchool([entry("me", 2), entry("alice")], design, "me", cloud, 2);
    expect(local.ownSlots).toEqual(slotsFor(cloud, "me"));
    expect(local.revealTimes.get(local.ownSlots[0])).toBe(1);
    expect(slotsFor(local, "alice")).toEqual(slotsFor(cloud, "alice"));
    expectValidSchool(local);
  });

  it("evicts background/old swarms at capacity and refills holes without moving survivors", () => {
    const initial = selectSharedSchool([], null, null);
    const entries = Array.from({ length: 100 }, (_, i) => entry(String(i), i));
    const full = selectSharedSchool(entries, null, null, initial, 1);
    const withLocal = selectSharedSchool(entries, design, "local", full, 2);
    const refill = selectSharedSchool(entries.slice(1), design, "local", withLocal, 3);
    expect(full.totalCount).toBe(MAX_FIH);
    expect(full.backgroundCount).toBe(0);
    expect(withLocal.totalCount).toBe(MAX_FIH);
    for (const placement of withLocal.placements) {
      expect(placement.slots).toEqual(slotsFor(full, placement.ownerId));
      expect(slotsFor(refill, placement.ownerId)).toEqual(placement.slots);
    }
    for (const school of [full, withLocal, refill]) expectValidSchool(school);
    const sparse = selectSharedSchool([entries[99]], design, "local", withLocal, 4);
    expect(sparse.backgroundCount).toBe(30);
    expect(slotsFor(sparse, "99")).toEqual(slotsFor(full, "99"));
    expect(sparse.ownSlots).toEqual(withLocal.ownSlots);
    expectValidSchool(sparse);
  });

  it("renders explicit noncontiguous slots across texture rows with per-fih reveal times", () => {
    const slots = [35, 1, 999];
    const geometry = new FihGeometry(fihTemplate(design), slots.length, slots, [1, 2, 3]);
    const references = geometry.getAttribute("reference");
    const times = geometry.getAttribute("revealedAt");
    const perFih = references.count / slots.length;
    for (let i = 0; i < references.count; i++) {
      const fish = Math.floor(i / perFih);
      expect(references.getX(i)).toBeCloseTo(((slots[fish] % WIDTH) + .5) / WIDTH);
      expect(references.getY(i)).toBeCloseTo((Math.floor(slots[fish] / WIDTH) + .5) / WIDTH);
      expect(times.getX(i)).toBe(fish + 1);
    }
    geometry.dispose();
  });
});
