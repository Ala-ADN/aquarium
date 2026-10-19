import { MAX_FIH, WIDTH, DEFAULT_FIN_SIZE } from "../../constants";
import { BufferGeometry, BufferAttribute, Color } from "three";
import type { FihTemplate } from "../../types";
import { getFihPreset } from "../presets";
import { createFihParts } from "../parts";
import type { FihTriangle } from "../parts";

// Preserve the original school geometry; visitor fih use independently assembled parts.
function legacyTriangles(template: Partial<FihTemplate>): FihTriangle[] {
  const preset = getFihPreset(template.bodyShape ?? "classic");
  const length = preset.length * (template.bodySize ?? 1);
  const height = preset.height * (template.bodySize ?? 1);
  const finScale = (template.finSize ?? DEFAULT_FIN_SIZE) / DEFAULT_FIN_SIZE;
  const triangles: FihTriangle[] = [{ part: "fin", points: [[-preset.tailLength * finScale, preset.tailHeight * finScale], [-preset.tailLength * finScale, -preset.tailHeight * finScale], [0, 0]] }];
  if (preset.outline) {
    const outline = preset.outline.map(([z, y]) => [z * length, y * height] as [number, number]);
    for (let i = 0; i < outline.length; i++) triangles.push({ part: "body", points: [[length / 2, 0], outline[i], outline[(i + 1) % outline.length]] });
  } else {
    const neck = length * (1 - (template.headRatio ?? .33));
    triangles.push({ part: "body", points: [[0, 0], [neck, height], [neck, -height]] });
    triangles.push({ part: "head", points: [[neck, height], [neck, -height], [length, 0]] });
  }
  return triangles;
}

export class FihGeometry extends BufferGeometry {
  constructor(template: Partial<FihTemplate> = {}, count = MAX_FIH, offset = 0, revealedAt: number | readonly number[] = 0) {
    super();
    const triangles = template.finShape || template.headShape ? createFihParts(template) : legacyTriangles(template);
    const pointsPerFih = triangles.length * 3;
    const points = count * pointsPerFih;
    const vertices = new BufferAttribute(new Float32Array(points * 3), 3);
    const colors = new BufferAttribute(new Float32Array(points * 3), 3);
    const references = new BufferAttribute(new Float32Array(points * 2), 2);
    const localVertex = new BufferAttribute(new Float32Array(points), 1);
    const part = new BufferAttribute(new Float32Array(points), 1);
    const tailWeight = new BufferAttribute(new Float32Array(points), 1);
    const uv = new BufferAttribute(new Float32Array(points * 2), 2);
    const revealTimes = new BufferAttribute(new Float32Array(points), 1);
    const body = new Color(template.bodyColor ?? 0x666666);
    const fin = new Color(template.finColor ?? 0x888888);
    const head = new Color(template.headColor ?? body);
    const outline = triangles.filter((triangle) => triangle.part !== "fin").flatMap((triangle) => triangle.points);
    const maxZ = Math.max(...outline.map(([z]) => z));
    const minY = Math.min(...outline.map(([, y]) => y));
    const maxY = Math.max(...outline.map(([, y]) => y));
    for (let fish = 0; fish < count; fish++) {
      let local = 0;
      for (const triangle of triangles) {
        const color = triangle.part === "fin" ? fin : triangle.part === "head" ? head : body;
        for (const [z, y] of triangle.points) {
          const i = fish * pointsPerFih + local;
          vertices.setXYZ(i, 0, y, z);
          colors.setXYZ(i, color.r, color.g, color.b);
          revealTimes.setX(i, typeof revealedAt === "number" ? revealedAt : revealedAt[fish] ?? 0);
          const slot = fish + offset;
          references.setXY(i, ((slot % WIDTH) + .5) / WIDTH, (Math.floor(slot / WIDTH) + .5) / WIDTH);
          localVertex.setX(i, local++);
          part.setX(i, triangle.part === "fin" ? 0 : triangle.part === "body" ? 1 : 2);
          tailWeight.setX(i, triangle.part === "fin" && z < 0 ? 1 : 0);
          uv.setXY(i, z / maxZ, (y - minY) / (maxY - minY));
        }
      }
    }
    this.setAttribute("position", vertices);
    this.setAttribute("fihColor", colors);
    this.setAttribute("reference", references);
    this.setAttribute("fihVertex", localVertex);
    this.setAttribute("fihPart", part);
    this.setAttribute("tailWeight", tailWeight);
    this.setAttribute("bodyUv", uv);
    this.setAttribute("revealedAt", revealTimes);
    this.scale(.2 * (template.scale ?? 1), .2 * (template.scale ?? 1), .2 * (template.scale ?? 1));
  }
}
