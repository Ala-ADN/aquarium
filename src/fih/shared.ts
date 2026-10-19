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
export interface FihPlacement { ownerId: string; design: FihDesign; offset: number }
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

export function selectSharedSchool(entries: readonly SharedFih[], own: FihDesign | null, ownerId: string | null) {
  let count = own?.count ?? 0;
  const placements: FihPlacement[] = [];
  for (const entry of [...entries].sort((a, b) => b.updatedAt - a.updatedAt || a.ownerId.localeCompare(b.ownerId))) {
    if (own && entry.ownerId === ownerId) continue;
    const available = Math.min(entry.design.count, MAX_FIH - count);
    if (available <= 0) break;
    placements.push({ ownerId: entry.ownerId, design: { ...entry.design, count: available }, offset: count });
    count += available;
  }
  const backgroundCount = Math.min(INITIAL_FIH, MAX_FIH - count);
  return { placements, count, backgroundCount, totalCount: count + backgroundCount };
}
