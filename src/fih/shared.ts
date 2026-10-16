import { MAX_FIH, MAX_VISITOR_FIH } from "../constants";
import { isHexColor, isPartSize } from "./appearance";
import { FIN_SHAPES, HEAD_SHAPES } from "./parts";
import { FIH_PRESETS } from "./presets";
import type { FihDesign } from "../types";

// Keep these limits in sync with database.rules.json.
export const SHARED_QUERY_LIMIT = 1000;
export const SHARED_SAVE_INTERVAL_MS = 10_000;
export const PENDING_FIH_KEY = "aquarium.pending.v1";
export const SHARED_RETRY_AT_KEY = "aquarium.sharedRetryAt.v1";

export interface SharedFih {
  ownerId: string;
  design: FihDesign;
  updatedAt: number;
}
export interface FihPlacement { design: FihDesign; offset: number }
export type FihSaveStatus = "local" | "saving" | "saved" | "offline" | "unavailable";

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseSharedDesign(value: unknown): FihDesign | null {
  if (!object(value) ||
      !FIH_PRESETS.some(({ id }) => id === value.shape) ||
      !FIN_SHAPES.some(({ id }) => id === value.finShape) ||
      !HEAD_SHAPES.some(({ id }) => id === value.headShape) ||
      !isHexColor(value.color) ||
      !(value.finColor == null || isHexColor(value.finColor)) ||
      !(value.headColor == null || isHexColor(value.headColor)) ||
      ![value.finSize, value.bodySize, value.headSize].every(isPartSize) ||
      value.pattern !== "plain" || !Number.isInteger(value.count) ||
      (value.count as number) < 1 || (value.count as number) > MAX_VISITOR_FIH) return null;
  // Pick known fields; never forward arbitrary remote properties to rendering/storage.
  return {
    shape: value.shape as FihDesign["shape"],
    finShape: value.finShape as FihDesign["finShape"],
    headShape: value.headShape as FihDesign["headShape"],
    color: (value.color as string).toLowerCase(),
    finColor: value.finColor == null ? null : (value.finColor as string).toLowerCase(),
    headColor: value.headColor == null ? null : (value.headColor as string).toLowerCase(),
    finSize: value.finSize as number, bodySize: value.bodySize as number,
    headSize: value.headSize as number, pattern: "plain", count: value.count as number,
  };
}

export function parseSharedFih(ownerId: string, value: unknown): SharedFih | null {
  if (!object(value) || !Number.isSafeInteger(value.createdAt) ||
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
    placements.push({ design: { ...entry.design, count: available }, offset: count });
    count += available;
  }
  return { placements, count };
}
