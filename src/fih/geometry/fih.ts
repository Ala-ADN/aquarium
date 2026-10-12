import { MAX_FIH, WIDTH, DEFAULT_FIN_SIZE } from "../../constants";

import { BufferGeometry, BufferAttribute, Color } from "three";
import type { FihTemplate } from "../../types";

export class FihGeometry extends BufferGeometry {
  constructor(template?: Partial<FihTemplate>, count = MAX_FIH) {
    super();

    const finSize = template?.finSize ?? DEFAULT_FIN_SIZE;
    const bodySize = template?.bodySize ?? 1.0;
    const bodyColor = new Color(template?.bodyColor ?? 0x666666);
    const finColor = new Color(template?.finColor ?? 0x888888);
    const scale = template?.scale ?? 1.0;
    const headRatio = template?.headRatio ?? 0.33;

    const shape = template?.bodyShape ?? "classic";
    const trianglesPerFih = shape === "round" ? 7 : 3;
    const triangles = count * trianglesPerFih;
    const points = triangles * 3;

    const vertices = new BufferAttribute(new Float32Array(points * 3), 3);
    const fihColors = new BufferAttribute(new Float32Array(points * 3), 3);
    const references = new BufferAttribute(new Float32Array(points * 2), 2);
    const fihVertex = new BufferAttribute(new Float32Array(points), 1);

    this.setAttribute("position", vertices);
    this.setAttribute("fihColor", fihColors);
    this.setAttribute("reference", references);
    this.setAttribute("fihVertex", fihVertex);

    let v = 0;
    const verts_push = (...args: number[]) => {
      for (let i = 0; i < args.length; i++) {
        (vertices.array as Float32Array)[v++] = args[i];
      }
    };

    const bodyLength = (shape === "round" ? 40 : shape === "long" ? 80 : 60) * bodySize;
    const bodyHeight = (shape === "round" ? 22 : shape === "long" ? 10 : 15) * bodySize;
    const finOffset = 10 * finSize;
    const finHeight = 10 * finSize;

    for (let f = 0; f < count; f++) {
      // Tail fin
      verts_push(0, finHeight, -finOffset, 0, -finHeight, -finOffset, 0, 0, 0);
      if (shape === "round") {
        const outline = [
          [0, 0],
          [bodyLength * 0.2, bodyHeight],
          [bodyLength * 0.75, bodyHeight],
          [bodyLength, 0],
          [bodyLength * 0.75, -bodyHeight],
          [bodyLength * 0.2, -bodyHeight],
        ];
        for (let i = 0; i < outline.length; i++) {
          const [z1, y1] = outline[i];
          const [z2, y2] = outline[(i + 1) % outline.length];
          verts_push(0, 0, bodyLength / 2, 0, y1, z1, 0, y2, z2);
        }
        continue;
      }
      // Body
      verts_push(
        0,
        0,
        0,
        0,
        bodyHeight,
        bodyLength * (1 - headRatio),
        0,
        -bodyHeight,
        bodyLength * (1 - headRatio)
      );
      // Head
      verts_push(
        0,
        bodyHeight,
        bodyLength * (1 - headRatio),
        0,
        -bodyHeight,
        bodyLength * (1 - headRatio),
        0,
        0,
        bodyLength
      );
    }

    for (let i = 0; i < triangles * 3; i++) {
      const triangleIndex = ~~(i / 3);
      const fihIndex = ~~(triangleIndex / trianglesPerFih);
      const localTriangle = triangleIndex % trianglesPerFih;
      const x = ((fihIndex % WIDTH) + 0.5) / WIDTH;
      const y = (~~(fihIndex / WIDTH) + 0.5) / WIDTH;

      const color = localTriangle === 0 ? finColor : bodyColor;
      (fihColors.array as Float32Array)[i * 3 + 0] = color.r;
      (fihColors.array as Float32Array)[i * 3 + 1] = color.g;
      (fihColors.array as Float32Array)[i * 3 + 2] = color.b;

      (references.array as Float32Array)[i * 2] = x;
      (references.array as Float32Array)[i * 2 + 1] = y;
      (fihVertex.array as Float32Array)[i] = i % (trianglesPerFih * 3);
    }

    this.scale(0.2 * scale, 0.2 * scale, 0.2 * scale);
  }
}
