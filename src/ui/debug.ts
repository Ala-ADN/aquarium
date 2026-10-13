import type { PerspectiveCamera, Scene } from "three";
import type { GUI } from "three/addons/libs/lil-gui.module.min.js";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { BUBBLE_DENSITY, CAMERA_SETTINGS } from "../constants";
import type { GPUSimulation } from "../simulation/GPUSimulation";
import type { createWaterEnvironment } from "../water/WaterEnvironment";

export function addDebugControls(gui: GUI, options: {
  water: ReturnType<typeof createWaterEnvironment>;
  camera: PerspectiveCamera;
  controls: OrbitControls;
  scene: Scene;
  gpuSim: GPUSimulation;
  flocking: { separation: number; alignment: number; cohesion: number };
  onFlockingChange: () => void;
}) {
  const { water, camera, controls, scene, gpuSim, flocking, onFlockingChange } = options;
  const u = water.uniforms;
  const p = water.particleUniforms;
  const slider = (folder: GUI, uniform: { value: number }, label: string, min: number, max: number, step = 0.01) =>
    folder.add(uniform, "value", min, max, step).name(label);

  const waterFolder = gui.addFolder("Water");
  const colors = {
    surface: `#${u.surfaceColor.value.getHexString()}`,
    middle: `#${u.middleColor.value.getHexString()}`,
    deep: `#${u.deepColor.value.getHexString()}`,
  };
  waterFolder.addColor(colors, "surface").name("Surface color").onChange((value: string) => u.surfaceColor.value.set(value));
  waterFolder.addColor(colors, "middle").name("Middle color").onChange((value: string) => u.middleColor.value.set(value));
  waterFolder.addColor(colors, "deep").name("Deep color").onChange((value: string) => {
    u.deepColor.value.set(value);
    scene.background = u.deepColor.value.clone();
    document.body.style.backgroundColor = value;
  });
  slider(waterFolder, u.waterSurfaceStrength, "Surface strength", 0, 3);
  slider(waterFolder, u.waterSurfaceSpeed, "Surface speed", 0, 3);
  waterFolder.add(u.fishFog.value, "y", u.fishFog.value.x + 1, 2500, 1).name("Fish haze distance");

  const rayFolder = gui.addFolder("God rays");
  slider(rayFolder, u.godRayStrength, "Strength", 0, 3);
  slider(rayFolder, u.godRaySpeed, "Speed", 0, 3);
  rayFolder.add(u.godRayPosition.value, "x", -0.5, 1.5, 0.01).name("Source X");
  rayFolder.add(u.godRayPosition.value, "y", 0.6, 2, 0.01).name("Source Y");
  rayFolder.close();

  // Multipliers retain the variation already configured in constants.ts.
  const bubbleDefaults = {
    riseSpeed: p.bubbleRiseSpeed.value.clone(),
    size: p.bubbleSize.value.clone(),
    opacity: p.bubbleOpacity.value.clone(),
  };
  const bubbleTuning = { density: 1, riseSpeed: 1, size: 1, opacity: 1 };
  const bubbleFolder = gui.addFolder("Bubbles");
  bubbleFolder.add(bubbleTuning, "density", 0, 5, 0.05).name("Density ×").onChange((value: number) => {
    water.setBubbleDensity(BUBBLE_DENSITY.desktop * value, BUBBLE_DENSITY.mobile * value);
  });
  slider(bubbleFolder, p.bubbleBlur, "Blur", 0, 1);
  bubbleFolder.add(bubbleTuning, "riseSpeed", 0, 3, 0.01).name("Rise speed ×").onChange((value: number) => {
    p.bubbleRiseSpeed.value.copy(bubbleDefaults.riseSpeed).multiplyScalar(value);
  });
  bubbleFolder.add(bubbleTuning, "size", 0.1, 3, 0.01).name("Size ×").onChange((value: number) => {
    p.bubbleSize.value.copy(bubbleDefaults.size).multiplyScalar(value);
  });
  bubbleFolder.add(bubbleTuning, "opacity", 0, 2, 0.01).name("Opacity ×").onChange((value: number) => {
    p.bubbleOpacity.value.copy(bubbleDefaults.opacity).multiplyScalar(value);
  });
  slider(bubbleFolder, p.bubbleDrift, "Drift", 0, 3);
  bubbleFolder.add(p.bubbleFog.value, "y", p.bubbleFog.value.x + 1, 2500, 1).name("Haze distance");
  bubbleFolder.close();

  const fishFolder = gui.addFolder("Fish");
  fishFolder.add(flocking, "separation", 0, 100, 1).onChange(onFlockingChange);
  fishFolder.add(flocking, "alignment", 0, 100, 0.001).onChange(onFlockingChange);
  fishFolder.add(flocking, "cohesion", 0, 100, 0.025).onChange(onFlockingChange);
  slider(fishFolder, gpuSim.velocityUniforms.speedLimit, "Speed limit", 0, 30, 0.1);
  fishFolder.close();

  const cameraFolder = gui.addFolder("Camera");
  cameraFolder.add(camera, "fov", 35, 110, 1).name("Field of view").onChange(() => camera.updateProjectionMatrix());
  const cameraTuning = { distance: Number(CAMERA_SETTINGS.distance) };
  cameraFolder.add(cameraTuning, "distance", 100, 1000, 1).name("Distance").onChange((value: number) => {
    camera.position.sub(controls.target).normalize().multiplyScalar(value).add(controls.target);
    controls.update();
  });
  cameraFolder.close();

  gui.add({ reset: () => {
    controls.reset();
    for (const folder of gui.folders) folder.reset();
  } }, "reset").name("Reset experiments");
}
