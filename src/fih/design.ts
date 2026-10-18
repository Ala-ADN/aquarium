import { MAX_VISITOR_FIH } from "../constants";
import type { FihAppearance, FihDesign } from "../types";
import { isHexColor, isPartSize } from "./appearance";
import { SUPPORTED_FIH_PRESETS } from "./presets";
import { SUPPORTED_FIN_SHAPES, SUPPORTED_HEAD_SHAPES } from "./parts";

// Unversioned three-part designs are v0. Persisted formats are independent of
// UI/runtime types: future migrations belong here, not in individual readers.
export const FIH_DESIGN_VERSION = 1;
export interface StoredFihDesign extends FihDesign { schemaVersion: typeof FIH_DESIGN_VERSION }

// Freeze historical defaults. Changing the creator's defaults must not restyle saves.
const V1_DEFAULTS: Readonly<FihAppearance> = Object.freeze({
  shape: "classic", finShape: "triangle", headShape: "pointed",
  color: "#ff9955", finColor: null, headColor: null,
  finSize: 1, bodySize: 1, headSize: 1, pattern: "plain",
});
const fields = new Set(["schemaVersion", ...Object.keys(V1_DEFAULTS), "count"]);

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function hasUnsupportedDesignVersion(value: unknown): boolean {
  return isRecord(value) && "schemaVersion" in value && value.schemaVersion !== FIH_DESIGN_VERSION;
}

export function isProtectedFihDesign(value: unknown): boolean {
  return isRecord(value) && "schemaVersion" in value &&
    (hasUnsupportedDesignVersion(value) || parseFihDesign(value) === null);
}

/** Decode current and unversioned v0 designs without mutating the source. */
export function parseFihDesign(value: unknown): FihDesign | null {
  if (!isRecord(value) || hasUnsupportedDesignVersion(value)) return null;
  const versioned = "schemaVersion" in value;
  // Explicit versions are contracts. Unknown fields must not be silently lost
  // when editing a record written by a client we cannot fully understand.
  if (versioned && Object.keys(value).some((key) => !fields.has(key))) return null;
  const design = versioned ? value : {
    ...value,
    shape: ["tiny", "long"].includes(value.shape as string) ? "classic" : value.shape,
    headShape: value.headShape === "beak" ? "pointed" : value.headShape,
  };
  if (!SUPPORTED_FIH_PRESETS.some(({ id }) => id === design.shape) ||
      !SUPPORTED_FIN_SHAPES.some(({ id }) => id === design.finShape) ||
      !SUPPORTED_HEAD_SHAPES.some(({ id }) => id === design.headShape) ||
      !isHexColor(design.color) ||
      !(design.finColor == null || isHexColor(design.finColor)) ||
      !(design.headColor == null || isHexColor(design.headColor)) ||
      ![design.finSize, design.bodySize, design.headSize].every(isPartSize) ||
      design.pattern !== "plain" || !Number.isInteger(design.count) ||
      (design.count as number) < 1 || (design.count as number) > MAX_VISITOR_FIH) return null;
  return {
    shape: design.shape as FihDesign["shape"],
    finShape: design.finShape as FihDesign["finShape"],
    headShape: design.headShape as FihDesign["headShape"],
    color: design.color.toLowerCase(),
    finColor: design.finColor == null ? null : (design.finColor as string).toLowerCase(),
    headColor: design.headColor == null ? null : (design.headColor as string).toLowerCase(),
    finSize: design.finSize as number, bodySize: design.bodySize as number,
    headSize: design.headSize as number, pattern: "plain", count: design.count as number,
  };
}

/** Upgrade the pre-three-part local formats to v0, then use the common decoder. */
export function migrateLegacyFihDesign(value: unknown, version: 1 | 2): FihDesign | null {
  if (!isRecord(value) || "schemaVersion" in value) return null;
  if (version === 2 && !(value.finColor === null || isHexColor(value.finColor))) return null;
  return parseFihDesign({
    ...V1_DEFAULTS, shape: value.shape, color: value.color, count: value.count,
    finColor: version === 1 ? null : value.finColor,
  });
}

export function serializeFihDesign(value: FihDesign): StoredFihDesign {
  const design = parseFihDesign(value);
  if (!design) throw new Error("Invalid or unsupported fih design.");
  return { schemaVersion: FIH_DESIGN_VERSION, ...design };
}
