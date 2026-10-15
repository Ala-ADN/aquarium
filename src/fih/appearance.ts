import { Color } from "three";
import { DEFAULT_FIH_COLOR, DEFAULT_FIN_SIZE, FIH_FIN_SHADE } from "../constants";
import type { FihAppearance, FihPart, FihTemplate } from "../types";
import { FIH_PRESETS, getFihPreset } from "./presets";
import { FIN_SHAPES, HEAD_SHAPES, MIN_PART_SIZE, MAX_PART_SIZE } from "./parts";

// MS Paint palette, in the supplied order.
export const FIH_PALETTE = [
  { name: "black", hex: "#000000" }, { name: "white", hex: "#ffffff" },
  { name: "gray", hex: "#7f7f7f" }, { name: "light gray", hex: "#c3c3c3" },
  { name: "dark red", hex: "#880015" }, { name: "brown", hex: "#b97a57" },
  { name: "red", hex: "#ed1c24" }, { name: "pink", hex: "#ffaec9" },
  { name: "orange", hex: "#ff7f27" }, { name: "gold", hex: "#ffc90e" },
  { name: "yellow", hex: "#fff200" }, { name: "cream", hex: "#efe4b0" },
  { name: "green", hex: "#22b14c" }, { name: "lime", hex: "#b5e61d" },
  { name: "turquoise", hex: "#00a2e8" }, { name: "light turquoise", hex: "#99d9ea" },
  { name: "indigo", hex: "#3f48cc" }, { name: "blue gray", hex: "#7092be" },
  { name: "purple", hex: "#a349a4" }, { name: "lavender", hex: "#c8bfe7" },
] as const;
export const DEFAULT_APPEARANCE: FihAppearance = {
  shape: "classic", finShape: "triangle", headShape: "pointed",
  color: DEFAULT_FIH_COLOR, finColor: null, headColor: null,
  finSize: 1, bodySize: 1, headSize: 1, pattern: "plain",
};
export const isHexColor = (value: unknown): value is string =>
  typeof value === "string" && /^#[\da-f]{6}$/i.test(value);
export const isPartSize = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= MIN_PART_SIZE && value <= MAX_PART_SIZE;

export function resolveFihColors(appearance: FihAppearance) {
  const body = new Color(appearance.color);
  const fin = appearance.finColor === null
    ? body.clone().multiplyScalar(FIH_FIN_SHADE) : new Color(appearance.finColor);
  const head = appearance.headColor === null ? body.clone() : new Color(appearance.headColor);
  return { body, fin, head };
}
export function fihTemplate(appearance: FihAppearance): Partial<FihTemplate> {
  const { body, fin, head } = resolveFihColors(appearance);
  return { bodyShape: appearance.shape, finShape: appearance.finShape, headShape: appearance.headShape,
    bodyColor: body, finColor: fin, headColor: head, bodySize: appearance.bodySize,
    finSize: appearance.finSize * DEFAULT_FIN_SIZE, headSize: appearance.headSize };
}
export function partOptions(part: FihPart): readonly { id: string; label: string }[] {
  return part === "fin" ? FIN_SHAPES : part === "head" ? HEAD_SHAPES : FIH_PRESETS;
}
export function partShape(appearance: FihAppearance, part: FihPart) {
  return part === "fin" ? appearance.finShape : part === "head" ? appearance.headShape : appearance.shape;
}
export function describeFih(appearance: FihAppearance) {
  const name = (hex: string) => FIH_PALETTE.find((color) => color.hex === hex.toLowerCase())?.name ?? hex;
  const finName = FIN_SHAPES.find((item) => item.id === appearance.finShape)!.label;
  const headName = HEAD_SHAPES.find((item) => item.id === appearance.headShape)!.label;
  return `${finName} fin · ${name(appearance.color)} ${getFihPreset(appearance.shape).label} body · ${headName} head`;
}
export function randomizeFih(current: FihAppearance, random = Math.random): FihAppearance {
  const choose = <T>(items: readonly T[]) => items[Math.min(items.length - 1, Math.floor(random() * items.length))];
  const sizeSteps = Math.round((MAX_PART_SIZE - MIN_PART_SIZE) / .05);
  const size = () => Math.round((MIN_PART_SIZE + Math.round(random() * sizeSteps) * .05) * 100) / 100;
  const candidate: FihAppearance = {
    shape: choose(FIH_PRESETS).id, finShape: choose(FIN_SHAPES).id, headShape: choose(HEAD_SHAPES).id,
    color: choose(FIH_PALETTE).hex, finColor: choose(FIH_PALETTE).hex, headColor: choose(FIH_PALETTE).hex,
    finSize: size(), bodySize: size(), headSize: size(), pattern: "plain",
  };
  if (JSON.stringify(candidate) === JSON.stringify(current)) {
    const index = FIH_PRESETS.findIndex((item) => item.id === current.shape);
    candidate.shape = FIH_PRESETS[(index + 1) % FIH_PRESETS.length].id;
  }
  return candidate;
}
export class FihDraft {
  appearance: FihAppearance;
  constructor(appearance = DEFAULT_APPEARANCE) {
    const { shape, finShape, headShape, color, finColor, headColor, finSize, bodySize, headSize } = appearance;
    this.appearance = { shape, finShape, headShape, color, finColor, headColor, finSize, bodySize, headSize, pattern: "plain" };
  }
  change(change: Partial<FihAppearance>) { this.appearance = { ...this.appearance, ...change, pattern: "plain" }; }
  surprise(random = Math.random) { this.appearance = randomizeFih(this.appearance, random); }
}
