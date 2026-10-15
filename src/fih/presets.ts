import type { FihShape } from "../types";

export interface FihPreset {
  id: FihShape;
  label: string;
  length: number;
  height: number;
  tailLength: number;
  tailHeight: number;
  outline?: ReadonlyArray<readonly [number, number]>;
}

// Outline coordinates are fractions of body length and half-height (z, y).
export const FIH_PRESETS: readonly FihPreset[] = [
  { id: "classic", label: "classic", length: 60, height: 15, tailLength: 20, tailHeight: 20 },
  { id: "round", label: "chubby", length: 40, height: 22, tailLength: 20, tailHeight: 20,
    outline: [[0, 0], [.2, 1], [.75, 1], [1, 0], [.75, -1], [.2, -1]] },
  { id: "diamond", label: "diamond", length: 54, height: 24, tailLength: 20, tailHeight: 20,
    outline: [[0, 0], [.5, 1], [1, 0], [.5, -1]] },
  { id: "sail", label: "sailfin", length: 58, height: 16, tailLength: 20, tailHeight: 20,
    outline: [[0, 0], [.2, .4], [.45, 2], [.7, .4], [1, 0], [.7, -1], [.2, -.7]] },
];

export function getFihPreset(shape: FihShape): FihPreset {
  return FIH_PRESETS.find((preset) => preset.id === shape)!;
}
