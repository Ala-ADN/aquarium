import type { ShaderMaterial } from "three";

// Once every fish in a batch is visible, use the cached opaque shader variant.
// New releases switch back to the hashed variant only for their fade duration.
export function updateFihFade(material: ShaderMaterial, time: number, latestReveal: number) {
  const duration = material.uniforms.fadeDuration.value as number;
  const fading = duration > 0 && time < latestReveal + duration;
  if (material.alphaHash === fading) return;
  material.alphaHash = fading;
  material.needsUpdate = true;
}
