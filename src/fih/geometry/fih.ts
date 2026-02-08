import { MAX_FIH, WIDTH, DEFAULT_FIN_SIZE } from "../../constants";

import { BufferGeometry, BufferAttribute, Color } from "three";
import type { FihTemplate } from "../../types";

export class FihGeometry extends BufferGeometry {
  constructor(template?: Partial<FihTemplate>) {
    super();

    const finSize = template?.finSize ?? DEFAULT_FIN_SIZE;
    const bodySize = template?.bodySize ?? 1.0;
    const bodyColor = new Color(template?.bodyColor ?? 0x666666);
    const finColor = new Color(template?.finColor ?? 0x888888);
    const scale = template?.scale ?? 1.0;
    const headRatio = template?.headRatio ?? 0.33;

    const trianglesPerFih = 3; // 2 for body + tail fin
    const triangles = MAX_FIH * trianglesPerFih;
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

    const bodyLength = 60 * bodySize;
    const bodyHeight = 15 * bodySize;
    const finOffset = 10 * finSize;
    const finHeight = 10 * finSize;

    for (let f = 0; f < MAX_FIH; f++) {
      // TODO: rotate fih
      // Tail fin
      verts_push(0, finHeight, -finOffset, 0, -finHeight, -finOffset, 0, 0, 0);
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
      const x = (fihIndex % WIDTH) / WIDTH;
      const y = ~~(fihIndex / WIDTH) / WIDTH;

      const color = localTriangle === 2 ? finColor : bodyColor;

      const variation = (fihIndex / MAX_FIH) * 0.3;
      (fihColors.array as Float32Array)[i * 3 + 0] = Math.min(color.r + variation, 1);
      (fihColors.array as Float32Array)[i * 3 + 1] = Math.min(color.g + variation, 1);
      (fihColors.array as Float32Array)[i * 3 + 2] = Math.min(color.b + variation, 1);

      (references.array as Float32Array)[i * 2] = x;
      (references.array as Float32Array)[i * 2 + 1] = y;
      (fihVertex.array as Float32Array)[i] = i % 9;
    }

    this.scale(0.2 * scale, 0.2 * scale, 0.2 * scale);
  }
}
