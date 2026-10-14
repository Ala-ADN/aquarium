import { FIH_INTERVAL_MS, MAX_VISITOR_FIH } from "../constants";
import type { FihDesign } from "../types";
import { DEFAULT_APPEARANCE, isHexColor, isPartSize } from "./appearance";
import { FIH_PRESETS } from "./presets";
import { FIN_SHAPES, HEAD_SHAPES } from "./parts";

export const VISIT_STORAGE_KEY = "aquarium.visitor.v3";
export const PREVIOUS_STORAGE_KEY = "aquarium.visitor.v2";
export const LEGACY_STORAGE_KEY = "aquarium.visitor.v1";
export const MAX_VISIT_TIME = MAX_VISITOR_FIH * FIH_INTERVAL_MS;
export interface FihVisit { elapsed: number; fih: FihDesign | null }
export const earnedFih = (elapsed: number) => Math.min(MAX_VISITOR_FIH, Math.floor(elapsed / FIH_INTERVAL_MS));
export function advanceVisit(elapsed: number, delta: number, visible: boolean) {
  return Math.min(MAX_VISIT_TIME, elapsed + (visible ? Math.max(0, delta) : 0));
}
export function parseVisit(raw: string | null, version: 1 | 2 | 3 = 3): FihVisit | null {
  try {
    const saved = JSON.parse(raw ?? "null");
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return null;
    const elapsed = typeof saved.elapsed === "number" && Number.isFinite(saved.elapsed)
      ? Math.max(0, Math.min(saved.elapsed, MAX_VISIT_TIME)) : 0;
    const design = saved.fih ?? (version === 1 ? saved.fish : null);
    if (!design || !FIH_PRESETS.some((item) => item.id === design.shape) ||
        !isHexColor(design.color) || !Number.isInteger(design.count) || design.count <= 0 || earnedFih(elapsed) === 0 ||
        (version >= 2 && !(design.finColor === null || isHexColor(design.finColor))) ||
        (version === 3 && (!FIN_SHAPES.some((item) => item.id === design.finShape) ||
          !HEAD_SHAPES.some((item) => item.id === design.headShape) ||
          !(design.headColor === null || isHexColor(design.headColor)) ||
          ![design.finSize, design.bodySize, design.headSize].every(isPartSize) || design.pattern !== "plain"))) {
      return { elapsed, fih: null };
    }
    return { elapsed, fih: {
      ...DEFAULT_APPEARANCE, shape: design.shape, color: design.color.toLowerCase(),
      finColor: version === 1 ? null : design.finColor?.toLowerCase() ?? null,
      ...(version === 3 ? { finShape: design.finShape, headShape: design.headShape,
        headColor: design.headColor?.toLowerCase() ?? null, finSize: design.finSize,
        bodySize: design.bodySize, headSize: design.headSize } : {}),
      // Effects remain unavailable until the interaction unlock feature is built.
      pattern: "plain", count: Math.min(design.count, earnedFih(elapsed)),
    } };
  } catch { return null; }
}
export function readVisit(storage: Pick<Storage, "getItem">): FihVisit {
  try {
    return parseVisit(storage.getItem(VISIT_STORAGE_KEY)) ??
      parseVisit(storage.getItem(PREVIOUS_STORAGE_KEY), 2) ??
      parseVisit(storage.getItem(LEGACY_STORAGE_KEY), 1) ?? { elapsed: 0, fih: null };
  } catch { return { elapsed: 0, fih: null }; }
}
export function saveVisit(storage: Pick<Storage, "setItem">, visit: FihVisit): boolean {
  try { storage.setItem(VISIT_STORAGE_KEY, JSON.stringify(visit)); return true; }
  catch { return false; }
}
