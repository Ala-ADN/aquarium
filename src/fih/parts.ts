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
  { id: "blunt", label: "blunt" },
];
export const FIH_PARTS: readonly FihPart[] = ["fin", "body", "head"];
export const MIN_PART_SIZE = .6;
export const MAX_PART_SIZE = 1.5;
export interface FihTriangle { part: FihPart; points: readonly (readonly [number, number])[] }

export function triangulatePart(outline: readonly (readonly [number, number])[], part: FihPart): FihTriangle[] {
  const points = outline.map(([z, y]) => new Vector2(z, y));
  return ShapeUtils.triangulateShape(points, []).map((indices) => ({
    part, points: indices.map((index) => outline[index]),
  })).filter(({ points: [a, b, c] }) => Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) > .0001);
}

export function createFihParts(template: Partial<FihTemplate>): FihTriangle[] {
  const preset = getFihPreset(template.bodyShape ?? "classic");
  const bodySize = template.bodySize ?? 1;
  const finSize = (template.finSize ?? DEFAULT_FIN_SIZE) / DEFAULT_FIN_SIZE;
  const headSize = template.headSize ?? 1;
  const length = preset.length * bodySize;
  const height = preset.height * bodySize;
  const headRatio = template.headRatio ?? .33;
  const neck = length * (1 - headRatio);
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
  const seam = body.filter(([z]) => Math.abs(z - neck) < .0001);
  const upperVertex = seam.reduce((a, b) => a[1] > b[1] ? a : b);
  const lowerVertex = seam.reduce((a, b) => a[1] < b[1] ? a : b);
  const upper = upperVertex[1];
  const lower = lowerVertex[1];
  const mid = (upper + lower) / 2;
  // Reuse the body's two seam vertices verbatim. Head size affects only the
  // remaining vertices, measured from the seam's center at the preset's scale.
  const headLength = preset.length * headRatio * headSize;
  const headHeight = (upper - lower) / (2 * bodySize) * headSize;
  const top = mid + headHeight;
  const bottom = mid - headHeight;
  const headShape = template.headShape ?? "pointed";
  const head: [number, number][] = headShape === "round"
    ? [upperVertex, [neck + headLength * .35, top], [neck + headLength * .8, mid + (top - mid) * .7], [neck + headLength, mid], [neck + headLength * .8, mid + (bottom - mid) * .7], [neck + headLength * .35, bottom], lowerVertex]
    : headShape === "blunt"
      ? [upperVertex, [neck + headLength, mid + headHeight * .85], [neck + headLength, mid - headHeight * .85], lowerVertex]
      : [upperVertex, [neck + headLength, mid], lowerVertex];
  const fin = FIN_SHAPES.find((item) => item.id === (template.finShape ?? "triangle"))!;
  return [
    ...triangulatePart(fin.outline.map(([z, y]) => [z * finSize, y * finSize]), "fin"),
    ...triangulatePart(body, "body"), ...triangulatePart(head, "head"),
  ];
}
