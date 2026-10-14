import type { FihPattern } from "../types";

export const MASK_WIDTH = 128;
export const MASK_HEIGHT = 64;
const masks = new Map<FihPattern, Uint8Array>();

export function getPatternMask(pattern: FihPattern): Uint8Array {
  const cached = masks.get(pattern);
  if (cached) return cached;
  const mask = new Uint8Array(MASK_WIDTH * MASK_HEIGHT * 4);
  const spots = [[.22, .35], [.48, .35], [.74, .35], [.32, .65], [.58, .65], [.84, .65]];
  for (let y = 0; y < MASK_HEIGHT; y++) {
    for (let x = 0; x < MASK_WIDTH; x++) {
      const u = (x + .5) / MASK_WIDTH;
      const v = (y + .5) / MASK_HEIGHT;
      const marked = pattern === "dip" ? u >= .7
        : pattern === "stripes" ? [.2, .4, .6, .8].some((center) => Math.abs(u - center) < .04)
        : pattern === "spots" ? spots.some(([cx, cy]) => ((u - cx) / .065) ** 2 + ((v - cy) / .11) ** 2 < 1)
        : false;
      const offset = (y * MASK_WIDTH + x) * 4;
      mask[offset] = mask[offset + 1] = mask[offset + 2] = marked ? 255 : 0;
      mask[offset + 3] = 255;
    }
  }
  masks.set(pattern, mask);
  return mask;
}
