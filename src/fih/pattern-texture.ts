import { DataTexture, LinearFilter, NoColorSpace } from "three";
import type { FihPattern } from "../types";
import { getPatternMask, MASK_HEIGHT, MASK_WIDTH } from "./patterns";

const textures = new Map<FihPattern, DataTexture>();
export function getPatternTexture(pattern: FihPattern) {
  let texture = textures.get(pattern);
  if (!texture) {
    texture = new DataTexture(getPatternMask(pattern), MASK_WIDTH, MASK_HEIGHT);
    texture.colorSpace = NoColorSpace;
    texture.minFilter = texture.magFilter = LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    textures.set(pattern, texture);
  }
  return texture;
}
