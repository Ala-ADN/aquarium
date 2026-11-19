import { INITIAL_FIH, MAX_FIH } from "../constants";
import { hasUnsupportedDesignVersion, isRecord, parseFihDesign, serializeFihDesign } from "./design";
import type { FihDesign } from "../types";

// Keep these limits in sync with database.rules.json.
export const SHARED_QUERY_LIMIT = 1000;
export const SHARED_SAVE_INTERVAL_MS = 10_000;
export const PENDING_FIH_KEY = "aquarium.pending.v2";
export const LEGACY_PENDING_FIH_KEY = "aquarium.pending.v1";
export const SHARED_RETRY_AT_KEY = "aquarium.sharedRetryAt.v1";

export interface SharedFih {
  ownerId: string;
  design: FihDesign;
  updatedAt: number;
}
export interface FihPlacement { ownerId: string; design: FihDesign; slots: number[] }
export interface FihSchool {
  placements: FihPlacement[];
  ownerId: string | null;
  ownSlots: number[];
  backgroundSlots: number[];
  activeSlots: number[];
  revealTimes: Map<number, number>;
  count: number;
  backgroundCount: number;
  totalCount: number;
}
export type FihSaveStatus = "local" | "saving" | "saved" | "offline" | "unavailable";

export const parseSharedDesign = parseFihDesign;

// Called on every transaction retry, including after another tab upgrades a save.
export function createSharedFihRecord(current: unknown, design: FihDesign, timestamp: unknown) {
  if (isRecord(current) && isRecord(current.design) &&
      (hasUnsupportedDesignVersion(current.design) || !parseFihDesign(current.design))) {
    throw new Error("This saved fih needs a newer app. Reload before updating it.");
  }
  return {
    design: serializeFihDesign(design),
    createdAt: isRecord(current) ? current.createdAt ?? timestamp : timestamp,
    updatedAt: timestamp,
  };
}

export function parseSharedFih(ownerId: string, value: unknown): SharedFih | null {
  if (!isRecord(value) || !Number.isSafeInteger(value.createdAt) ||
      !Number.isSafeInteger(value.updatedAt) || (value.createdAt as number) < 0 ||
      (value.updatedAt as number) < (value.createdAt as number)) return null;
  const design = parseSharedDesign(value.design);
  return design ? { ownerId, design, updatedAt: value.updatedAt as number } : null;
}

export function selectSharedSchool(
  entries: readonly SharedFih[], own: FihDesign | null, ownerId: string | null,
  previous?: FihSchool, now = 0,
): FihSchool {
  let count = own?.count ?? 0;
  const placements: FihPlacement[] = [];
  for (const entry of [...entries].sort((a, b) => b.updatedAt - a.updatedAt || a.ownerId.localeCompare(b.ownerId))) {
    if (own && entry.ownerId === ownerId) continue;
    const available = Math.min(entry.design.count, MAX_FIH - count);
    if (available <= 0) break;
    placements.push({ ownerId: entry.ownerId, design: { ...entry.design, count: available }, slots: [] });
    count += available;
  }
  const backgroundCount = Math.min(INITIAL_FIH, MAX_FIH - count);
  const used = new Set<number>();
  const revealTimes = new Map<number, number>();
  const retain = (slots: readonly number[] = [], length: number) => slots.slice(0, length).filter((slot) => {
    if (used.has(slot)) return false;
    used.add(slot);
    revealTimes.set(slot, previous?.revealTimes.get(slot) ?? now);
    return true;
  });
  const previousPlacements = new Map(previous?.placements.map((placement) => [placement.ownerId, placement.slots]));
  // A cloud swarm can become the local swarm once its owner releases a design.
  const ownSlots = retain(previous?.ownSlots.length ? previous.ownSlots : previousPlacements.get(ownerId ?? ""), own?.count ?? 0);
  for (const placement of placements) {
    placement.slots = retain(previousPlacements.get(placement.ownerId) ??
      (placement.ownerId === previous?.ownerId ? previous.ownSlots : undefined), placement.design.count);
  }
  const backgroundSlots = retain(previous?.backgroundSlots, backgroundCount);

  // Reserve every survivor before filling holes. Arrival/update order must never
  // change which position and velocity an already visible fih samples.
  let nextSlot = 0;
  const fill = (slots: number[], length: number) => {
    while (slots.length < length) {
      while (used.has(nextSlot)) nextSlot++;
      slots.push(nextSlot);
      used.add(nextSlot);
      revealTimes.set(nextSlot, now);
      nextSlot++;
    }
  };
  fill(ownSlots, own?.count ?? 0);
  for (const placement of placements) fill(placement.slots, placement.design.count);
  fill(backgroundSlots, backgroundCount);
  return { placements, ownerId, ownSlots, backgroundSlots, activeSlots: [...used], revealTimes,
    count, backgroundCount, totalCount: count + backgroundCount };
}
