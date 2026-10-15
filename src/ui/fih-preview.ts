import { Color } from "three";
import type { FihAppearance, FihPart } from "../types";
import { fihTemplate } from "../fih/appearance";
import { FihGeometry } from "../fih/geometry/fih";

export function drawFihPreview(canvas: HTMLCanvasElement, appearance: FihAppearance, part?: FihPart) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const geometry = new FihGeometry(fihTemplate(appearance), 1);
  const vertices = geometry.getAttribute("position");
  const parts = geometry.getAttribute("fihPart");
  const colors = geometry.getAttribute("fihColor");
  const selected = part === "fin" ? 0 : part === "body" ? 1 : 2;
  const indices = Array.from({ length: vertices.count }, (_, i) => i).filter((i) => !part || parts.getX(i) === selected);
  const minZ = Math.min(...indices.map((i) => vertices.getZ(i)));
  const maxZ = Math.max(...indices.map((i) => vertices.getZ(i)));
  const minY = Math.min(...indices.map((i) => vertices.getY(i)));
  const maxY = Math.max(...indices.map((i) => vertices.getY(i)));
  const width = canvas.clientWidth || (part ? 100 : 500);
  const height = canvas.clientHeight || (part ? 72 : 180);
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  const scale = Math.min(width * .78 / (part ? 12 : 20), height * .75 / (part ? 8 : 12), width * .85 / (maxZ - minZ), height * .85 / (maxY - minY));
  const centerZ = (minZ + maxZ) / 2;
  const centerY = (minY + maxY) / 2;
  const colorFor = (currentPart: number) => {
    const first = indices.find((i) => parts.getX(i) === currentPart);
    return first === undefined ? undefined
      : new Color(colors.getX(first), colors.getY(first), colors.getZ(first)).getStyle();
  };
  const finColor = colorFor(0);
  const bodyColor = colorFor(1);
  const headColor = colorFor(2);
  // Fill the connected body and head together so canvas antialiasing cannot
  // leave a hairline gap along their shared edge. A custom head color is then
  // painted over the solid silhouette, keeping its color boundary sharp.
  const passes = part
    ? [{ parts: [selected], color: colorFor(selected) }]
    : [{ parts: [0], color: finColor }, { parts: [1, 2], color: bodyColor },
      ...(headColor !== bodyColor ? [{ parts: [2], color: headColor }] : [])];
  for (const pass of passes) {
    if (pass.color === undefined) continue;
    context.fillStyle = pass.color;
    context.beginPath();
    for (let i = 0; i < vertices.count; i += 3) {
      if (!pass.parts.includes(parts.getX(i))) continue;
      for (let j = 0; j < 3; j++) {
        const x = width / 2 + (vertices.getZ(i + j) - centerZ) * scale;
        const y = height / 2 - (vertices.getY(i + j) - centerY) * scale;
        if (j === 0) context.moveTo(x, y); else context.lineTo(x, y);
      }
      context.closePath();
    }
    context.fill();
  }
  geometry.dispose();
}
