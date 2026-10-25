import type { FihAppearance } from "../types";
import { fihTemplate, resolveFihColors } from "../fih/appearance";
import { createFihParts } from "../fih/parts";

export function createFihFaviconUpdater(onUpdate?: (url: string) => void) {
  let previous = "";
  return (appearance: FihAppearance) => {
    const key = JSON.stringify(appearance);
    if (key === previous) return;
    previous = key;

    const triangles = createFihParts(fihTemplate(appearance));
    const points = triangles.flatMap(({ points }) => points);
    const minX = Math.min(...points.map(([x]) => x));
    const maxX = Math.max(...points.map(([x]) => x));
    const minY = Math.min(...points.map(([, y]) => y));
    const maxY = Math.max(...points.map(([, y]) => y));
    const scale = 30 / Math.max(maxX - minX, maxY - minY);
    const point = ([x, y]: readonly number[]) =>
      `${(16 + (x - (minX + maxX) / 2) * scale).toFixed(3)} ${(16 - (y - (minY + maxY) / 2) * scale).toFixed(3)}`;
    const colors = resolveFihColors(appearance);
    const path = (parts: readonly string[], color: string) => {
      const d = triangles.filter(({ part }) => parts.includes(part))
        .map(({ points }) => `M${points.map(point).join("L")}Z`).join("");
      return `<path d="${d}" fill="${color}"/>`;
    };
    // Paint the connected body/head together, matching the editor's small icon.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${
      path(["fin"], colors.fin.getStyle())
    }${path(["body", "head"], colors.body.getStyle())}${
      colors.head.equals(colors.body) ? "" : path(["head"], colors.head.getStyle())
    }</svg>`;
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.append(link);
    }
    link.type = "image/svg+xml";
    link.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    onUpdate?.(link.href);
  };
}
