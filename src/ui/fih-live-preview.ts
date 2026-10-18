import { Color, DataTexture, DoubleSide, FloatType, Mesh, PerspectiveCamera,
  Scene, ShaderMaterial, Vector2, WebGLRenderer } from "three";
import { FIH_FIN_SHADE, MAX_RENDER_PIXEL_RATIO } from "../constants";
import { fihTemplate } from "../fih/appearance";
import { FihGeometry } from "../fih/geometry/fih";
import { getPatternTexture } from "../fih/pattern-texture";
import { advanceFihSwimPhase, getFihPreviewViewport, setFihPreviewCamera } from "../fih/preview-camera";
import { withWaterColor } from "../water/WaterEnvironment";
import type { createWaterEnvironment } from "../water/WaterEnvironment";
import type { FihAppearance } from "../types";
import vertexShader from "../fih/shader/vertex.glsl?raw";
import fragmentShader from "../fih/shader/fragment.glsl?raw";

export interface FihPreviewController {
  update(appearance: FihAppearance): void;
  resize(): void;
  destroy(): void;
}
export type FihPreviewFactory = (canvas: HTMLCanvasElement, appearance: FihAppearance) => FihPreviewController;

export function createFihLivePreview(canvas: HTMLCanvasElement, appearance: FihAppearance, environment: {
  water: ReturnType<typeof createWaterEnvironment>["uniforms"];
  isPaused: () => boolean;
}): FihPreviewController {
  const parent = canvas.parentElement!;
  // Creating a second WebGL context is expensive even when nothing is drawn.
  // Wait until the footer enters view, keeping the initial tank on the fast path.
  let renderer: WebGLRenderer | null = null;
  const camera = new PerspectiveCamera();
  const scene = new Scene();
  const positionData = new Float32Array([0, 0, 0, 1]);
  const velocityData = new Float32Array([3, 0, 0, 0]);
  const position = new DataTexture(positionData, 1, 1);
  const velocity = new DataTexture(velocityData, 1, 1);
  position.type = velocity.type = FloatType;
  position.needsUpdate = velocity.needsUpdate = true;
  const material = new ShaderMaterial({
    vertexShader, fragmentShader: withWaterColor(fragmentShader), side: DoubleSide,
    uniforms: { ...environment.water, viewport: { value: new Vector2(1, 1) },
      texturePosition: { value: position }, textureVelocity: { value: velocity },
      time: { value: 0 }, useTemplateColor: { value: true }, finShade: { value: FIH_FIN_SHADE },
      patternMask: { value: getPatternTexture("plain") }, patternColor: { value: new Color() }, releaseGlow: { value: 0 } },
  });
  const fish = new Mesh(new FihGeometry(fihTemplate(appearance), 1), material);
  fish.rotation.y = Math.PI / 2;
  fish.frustumCulled = false;
  scene.add(fish);
  const events = new AbortController();
  const options = { signal: events.signal };
  let frame = 0;
  let visible = false;
  let destroyed = false;
  let lastFrame = performance.now();
  let swimTime = 0;
  let phase = 1;
  let previousDesign = JSON.stringify(appearance);
  let frameWidth = 0;
  let frameHeight = 0;
  let pixelRatio = 0;
  let projectionDirty = true;
  canvas.dataset.livePreview = "true";

  function resize() {
    if (destroyed || !renderer) return;
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_RENDER_PIXEL_RATIO);
    // Layout dimensions stay stable while the surrounding window tilts.
    const width = Math.max(1, parent.clientWidth);
    const height = Math.max(1, parent.clientHeight);
    if (!projectionDirty && frameWidth === width && frameHeight === height && ratio === pixelRatio) return;
    frameWidth = width; frameHeight = height; pixelRatio = ratio; projectionDirty = false;
    const viewport = getFihPreviewViewport(fish.geometry, width, height);
    renderer.setPixelRatio(ratio);
    renderer.setSize(viewport.width, viewport.height, false);
    material.uniforms.viewport.value.set(Math.round(viewport.width * ratio), Math.round(viewport.height * ratio));
    // Enlarge only the transparent drawing area, never shrink the fish to fit.
    canvas.style.left = `${-viewport.paddingX}px`;
    canvas.style.top = `${-viewport.paddingY}px`;
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    setFihPreviewCamera(camera, viewport.width, viewport.height);
  }
  function render() {
    if (destroyed || !visible || document.hidden) return;
    if (!renderer) {
      renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true });
      renderer.setClearColor(0, 0);
    }
    resize();
    renderer.render(scene, camera);
  }
  function animate(now: number) {
    frame = 0;
    if (destroyed || !visible || document.hidden) return;
    const delta = Math.min(Math.max(0, (now - lastFrame) / 1000), .1);
    lastFrame = now;
    if (!environment.isPaused()) {
      swimTime += delta;
      const motion = { x: 3, y: Math.sin(swimTime * .8) * .1, z: Math.sin(swimTime * .6) * .25 };
      phase = advanceFihSwimPhase(phase, delta, motion);
      velocityData[0] = motion.x; velocityData[1] = motion.y; velocityData[2] = motion.z;
      positionData[0] = Math.sin(swimTime * .45) * .5;
      positionData[1] = Math.sin(swimTime * .8) * .25;
      positionData[3] = phase;
      position.needsUpdate = velocity.needsUpdate = true;
      material.uniforms.time.value = now;
    }
    render();
    frame = requestAnimationFrame(animate);
  }
  function schedule() {
    if (frame || destroyed || !visible || document.hidden) return;
    lastFrame = performance.now();
    frame = requestAnimationFrame(animate);
  }
  function stop() { cancelAnimationFrame(frame); frame = 0; }
  const observer = new IntersectionObserver((entries) => {
    visible = entries.some((entry) => entry.isIntersecting);
    if (visible) { render(); schedule(); } else stop();
  });
  observer.observe(parent);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop(); else { render(); schedule(); }
  }, options);
  return {
    update(nextAppearance) {
      if (destroyed) return;
      const design = JSON.stringify(nextAppearance);
      if (design !== previousDesign) {
        const geometry = fish.geometry;
        fish.geometry = new FihGeometry(fihTemplate(nextAppearance), 1);
        geometry.dispose();
        previousDesign = design;
        projectionDirty = true;
      }
      render();
    },
    resize: render,
    destroy() {
      if (destroyed) return;
      destroyed = true; stop(); observer.disconnect(); events.abort();
      fish.geometry.dispose(); material.dispose(); position.dispose(); velocity.dispose();
      renderer?.dispose(); renderer?.forceContextLoss();
    },
  };
}
