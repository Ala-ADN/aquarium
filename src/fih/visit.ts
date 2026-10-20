import { FIH_EARNING_DURATION_MS, MAX_VISITOR_FIH } from "../constants";
import type { FihDesign } from "../types";
import { isProtectedFihDesign, isRecord, migrateLegacyFihDesign, parseFihDesign, serializeFihDesign } from "./design";

// Separate from old clients' keys; subsequent versions use the envelope version.
export const VISIT_STORAGE_KEY = "aquarium.visitor.v4";
export const V3_STORAGE_KEY = "aquarium.visitor.v3";
export const PREVIOUS_STORAGE_KEY = "aquarium.visitor.v2";
export const LEGACY_STORAGE_KEY = "aquarium.visitor.v1";
export const VISIT_SCHEMA_VERSION = 1;
export const MAX_VISIT_TIME = FIH_EARNING_DURATION_MS;
export interface FihVisit { elapsed: number; fih: FihDesign | null }
// elapsed is in milliseconds; the displayed allowance keeps its fractional value.
export const fihAllowance = (elapsed: number) => Math.min(MAX_VISITOR_FIH,
  1 + (MAX_VISITOR_FIH - 1) * Math.sqrt(Math.max(0, elapsed) / FIH_EARNING_DURATION_MS));
export const earnedFih = (elapsed: number) => Math.floor(fihAllowance(elapsed));
export function advanceVisit(elapsed: number, delta: number, visible: boolean) {
  return elapsed + (visible ? Math.max(0, delta) : 0);
}
function protectedVisit(saved: unknown): boolean {
  return isRecord(saved) && (("schemaVersion" in saved && saved.schemaVersion !== VISIT_SCHEMA_VERSION) ||
    isProtectedFihDesign(saved.fih));
}

export function parseVisit(raw: string | null, version: 1 | 2 | 3 | 4 = 4): FihVisit | null {
  try {
    const saved: unknown = JSON.parse(raw ?? "null");
    if (!isRecord(saved)) return null;
    const elapsed = typeof saved.elapsed === "number" && Number.isFinite(saved.elapsed)
      ? Math.max(0, saved.elapsed) : 0;
    const previous = saved.fih ?? (version === 1 ? saved.fish : null);
    // Preserve future formats without falling back to a stale older design.
    if (protectedVisit(saved) || !isRecord(previous) || !Number.isInteger(previous.count) ||
        (previous.count as number) <= 0 || earnedFih(elapsed) === 0) return { elapsed, fih: null };
    const value = { ...previous, count: Math.min(previous.count as number, earnedFih(elapsed)) };
    const fih = version <= 2
      ? migrateLegacyFihDesign(value, version as 1 | 2) : parseFihDesign(value);
    return { elapsed, fih };
  } catch { return null; }
}
export function readVisit(storage: Pick<Storage, "getItem">): FihVisit {
  try {
    return parseVisit(storage.getItem(VISIT_STORAGE_KEY)) ??
      parseVisit(storage.getItem(V3_STORAGE_KEY), 3) ??
      parseVisit(storage.getItem(PREVIOUS_STORAGE_KEY), 2) ??
      parseVisit(storage.getItem(LEGACY_STORAGE_KEY), 1) ?? { elapsed: 0, fih: null };
  } catch { return { elapsed: 0, fih: null }; }
}
export function saveVisit(storage: Pick<Storage, "getItem" | "setItem">, visit: FihVisit): boolean {
  try {
    const raw = storage.getItem(VISIT_STORAGE_KEY);
    let previous: unknown;
    try { previous = JSON.parse(raw ?? "null"); } catch { /* A corrupt save can be replaced. */ }
    if (protectedVisit(previous)) return false;
    const fih = visit.fih === null ? null : serializeFihDesign(visit.fih);
    storage.setItem(VISIT_STORAGE_KEY, JSON.stringify({ schemaVersion: VISIT_SCHEMA_VERSION, elapsed: visit.elapsed, fih }));
    return true;
  }
  catch { return false; }
}
