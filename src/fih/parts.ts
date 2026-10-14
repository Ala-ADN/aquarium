import { ShapeUtils, Vector2 } from "three";
import type { FihPart, FihTemplate, FihFinShape, FihHeadShape } from "../types";
import { DEFAULT_FIN_SIZE } from "../constants";
import { getFihPreset } from "./presets";

export const FIN_SHAPES: readonly { id: FihFinShape; label: string; outline: readonly (readonly [number, number])[] }[] = [
  { id: "triangle", label: "triangle", outline: [[0, 0], [-20, 20], [-20, -20]] },
  { id: "fork", label: "forked", outline: [[0, 0], [-24, 22], [-16, 0], [-24, -22]] },
  { id: "fan", label: "fan", outline: [[0, 0], [-12, 28], [-22, 16], [-24, 0], [-22, -16], [-12, -28]] },
  { id: "ribbon", label: "ribbon", outline: [[0, 0], [-20, 10], [-32, 0], [-20, -10]] },
];
export const HEAD_SHAPES: readonly { id: FihHeadShape; label: string }[] = [
  { id: "pointed", label: "pointed" }, { id: "round", label: "rounded" },
  { id: "blunt", label: "blunt" }, { id: "beak", label: "beak" },
];
export const FIH_PARTS: readonly FihPart[] = ["fin", "body", "head"];
export const MIN_PART_SIZE = .6;
export const MAX_PART_SIZE = 1.5;
export interface FihTriangle { part: FihPart; points: [number, number][] }

export function triangulatePart(outline: readonly (readonly [number, number])[], part: FihPart): FihTriangle[] {
  const points = outline.map(([z, y]) => new Vector2(z, y));
  return ShapeUtils.triangulateShape(points, []).map((indices) => ({
    part, points: indices.map((index) => [points[index].x, points[index].y] as [number, number]),
  })).filter(({ points: [a, b, c] }) => Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) > .0001);
}

export function createFihParts(template: Partial<FihTemplate>): FihTriangle[] {
  const preset = getFihPreset(template.bodyShape ?? "classic");
  const bodySize = template.bodySize ?? 1;
  const finSize = (template.finSize ?? DEFAULT_FIN_SIZE) / DEFAULT_FIN_SIZE;
  const headSize = template.headSize ?? 1;
  const length = preset.length * bodySize;
  const height = preset.height * bodySize;
  const neck = length * (1 - (template.headRatio ?? .33));
  const original = (preset.outline ?? [[0, 0], [.67, 1], [1, 0], [.67, -1]])
    .map(([z, y]) => [z * length, y * height] as [number, number]);
  // Clip the body at the neck so every head shares exactly the same connection.
  const body: [number, number][] = [];
  for (let i = 0; i < original.length; i++) {
    const a = original[i];
    const b = original[(i + 1) % original.length];
    if (a[0] <= neck) body.push(a);
    if ((a[0] < neck && b[0] > neck) || (a[0] > neck && b[0] < neck)) {
      const t = (neck - a[0]) / (b[0] - a[0]);
      body.push([neck, a[1] + (b[1] - a[1]) * t]);
    }
  }
  const seam = body.filter(([z]) => Math.abs(z - neck) < .0001).map(([, y]) => y);
  const upper = Math.max(...seam);
  const lower = Math.min(...seam);
  const mid = (upper + lower) / 2;
  const headLength = preset.length * .33 * headSize;
  const top = mid + (upper - mid) * headSize;
  const bottom = mid + (lower - mid) * headSize;
  const headShape = template.headShape ?? "pointed";
  const head: [number, number][] = headShape === "round"
    ? [[neck, upper], [neck + headLength * .35, top], [neck + headLength * .8, mid + (top - mid) * .7], [neck + headLength, mid], [neck + headLength * .8, mid + (bottom - mid) * .7], [neck + headLength * .35, bottom], [neck, lower]]
    : headShape === "blunt"
      ? [[neck, upper], [neck + headLength, top * .85], [neck + headLength, bottom * .85], [neck, lower]]
      : headShape === "beak"
        ? [[neck, upper], [neck + headLength * .5, top * .5], [neck + headLength, mid], [neck + headLength * .5, bottom * .5], [neck, lower]]
        : [[neck, upper], [neck + headLength * .25, mid + (top - mid) * .75], [neck + headLength, mid], [neck + headLength * .25, mid + (bottom - mid) * .75], [neck, lower]];
  const fin = FIN_SHAPES.find((item) => item.id === (template.finShape ?? "triangle"))!;
  return [
    ...triangulatePart(fin.outline.map(([z, y]) => [z * finSize, y * finSize]), "fin"),
    ...triangulatePart(body, "body"), ...triangulatePart(head, "head"),
  ];
}
