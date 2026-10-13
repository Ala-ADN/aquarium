import "./style.css";
import {
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
  Color,
  Mesh,
  ShaderMaterial,
  DoubleSide,
  AxesHelper,
} from "three";
import { FihGeometry } from "./fih/geometry/fih";
import { GPUSimulation } from "./simulation/GPUSimulation";
import { GUI } from "three/addons/libs/lil-gui.module.min.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { BACKGROUND_GRADIENT, MAX_FIH } from "./constants";
import { mountFihCreator } from "./ui/fih-creator";
import { createWaterEnvironment, withWaterColor } from "./water/WaterEnvironment";
import type { FihDesign } from "./types";
import fihVertexShader from "./fih/shader/vertex.glsl?raw";
import fihFragmentShader from "./fih/shader/fragment.glsl?raw";

const scene = new Scene();
scene.background = new Color(BACKGROUND_GRADIENT.deep);
document.body.style.backgroundColor = BACKGROUND_GRADIENT.deep;
const camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 3000);
camera.position.z = 350;

const canvas = document.querySelector("#canvas") as HTMLCanvasElement;
const renderer = new WebGLRenderer({ canvas: canvas, antialias: true });
const renderPixelRatio = () => Math.min(window.devicePixelRatio || 1, 1.5);
renderer.setPixelRatio(renderPixelRatio());
renderer.setSize(window.innerWidth, window.innerHeight, false);

const gpuSim = new GPUSimulation(renderer);
const water = createWaterEnvironment(scene);
water.resize(window.innerWidth, window.innerHeight, renderer.getPixelRatio());

const geometry = new FihGeometry();
const fihUniforms = {
  ...water.uniforms,
  texturePosition: { value: gpuSim.getCurrentPositionTexture() },
  textureVelocity: { value: gpuSim.getCurrentVelocityTexture() },
  time: { value: 1.0 },
  delta: { value: 0.0 },
  useTemplateColor: { value: false },
};

const fihMaterial = new ShaderMaterial({
  uniforms: fihUniforms,
  vertexShader: fihVertexShader,
  fragmentShader: withWaterColor(fihFragmentShader),
  side: DoubleSide,
});

const fihMesh = new Mesh(geometry, fihMaterial);
fihMesh.frustumCulled = false;
fihMesh.rotation.y = Math.PI / 2;
fihMesh.matrixAutoUpdate = false;
fihMesh.updateMatrix();
scene.add(fihMesh);

const visitorMaterial = new ShaderMaterial({
  uniforms: { ...fihUniforms, useTemplateColor: { value: true } },
  vertexShader: fihVertexShader,
  fragmentShader: withWaterColor(fihFragmentShader),
  side: DoubleSide,
});
let visitorMesh: Mesh<FihGeometry, ShaderMaterial> | null = null;

function displayFih(design: FihDesign) {
  const color = new Color(design.color);
  const visitorGeometry = new FihGeometry(
    {
      bodyShape: design.shape,
      bodyColor: color,
      finColor: color.clone().multiplyScalar(0.65),
    },
    design.count
  );
  geometry.setDrawRange(design.count * 9, (MAX_FIH - design.count) * 9);
  if (visitorMesh) {
    visitorMesh.geometry.dispose();
    visitorMesh.geometry = visitorGeometry;
  } else {
    visitorMesh = new Mesh(visitorGeometry, visitorMaterial);
    visitorMesh.rotation.y = Math.PI / 2;
    visitorMesh.matrixAutoUpdate = false;
    visitorMesh.updateMatrix();
    visitorMesh.frustumCulled = false;
    scene.add(visitorMesh);
  }
}

mountFihCreator(displayFih);

// orbit controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enabled = false; // Start disabled

// Add axis helper
const axesHelper = new AxesHelper(100);
axesHelper.visible = false;
scene.add(axesHelper);

const gui = new GUI();
const debug = new URLSearchParams(window.location.search).has("debug");
if (!debug) gui.hide();

const effectController = {
  separation: 20.0,
  alignment: 20.0,
  cohesion: 20.0,
  paused: false,
};

function setDebugMode(paused: boolean) {
  effectController.paused = paused;
  controls.enabled = paused;
  axesHelper.visible = paused;
  if (paused || debug) gui.show();
  else gui.hide();
  gui.controllers.forEach((controller) => controller.updateDisplay());
}

const valuesChanger = function () {
  gpuSim.velocityUniforms["separationDistance"].value = effectController.separation;
  gpuSim.velocityUniforms["alignmentDistance"].value = effectController.alignment;
  gpuSim.velocityUniforms["cohesionDistance"].value = effectController.cohesion;
};

valuesChanger();

gui.add(effectController, "separation", 0.0, 100.0, 1.0).onChange(valuesChanger);
gui.add(effectController, "alignment", 0.0, 100, 0.001).onChange(valuesChanger);
gui.add(effectController, "cohesion", 0.0, 100, 0.025).onChange(valuesChanger);
gui.add(effectController, "paused").name("Pause Simulation").onChange(setDebugMode);
gui.close();

let lastTime = performance.now();
let mouseX = 0;
let mouseY = 0;

renderer.setAnimationLoop(() => {
  const now = performance.now();
  let delta = (now - lastTime) / 1000;
  if (delta > 1) delta = 1; // safety cap on large deltas
  lastTime = now;

  if (!effectController.paused) {
    water.update(delta);
    // Update GPU simulation uniforms
    gpuSim.positionUniforms["time"].value = now;
    gpuSim.positionUniforms["delta"].value = delta;
    gpuSim.velocityUniforms["time"].value = now;
    gpuSim.velocityUniforms["delta"].value = delta;

    // Update bird mesh uniforms
    fihUniforms["time"].value = now;
    fihUniforms["delta"].value = delta;

    // Update predator (mouse) position
    gpuSim.velocityUniforms["predator"].value.set(
      (0.5 * mouseX) / windowHalfX,
      (-0.5 * mouseY) / windowHalfY,
      0
    );

    // Reset mouse (so it doesn't continuously affect)
    mouseX = 10000;
    mouseY = 10000;

    // Run GPU computation
    gpuSim.compute();

    // Pass computed textures to bird shader
    fihUniforms["texturePosition"].value = gpuSim.getCurrentPositionTexture();
    fihUniforms["textureVelocity"].value = gpuSim.getCurrentVelocityTexture();
  }
  // Render scene
  if (controls.enabled) controls.update();
  renderer.render(scene, camera);
});

const resize = () => {
  windowHalfX = window.innerWidth / 2;
  windowHalfY = window.innerHeight / 2;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(renderPixelRatio());
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  water.resize(window.innerWidth, window.innerHeight, renderer.getPixelRatio());
};
addEventListener("resize", resize);

let windowHalfX = window.innerWidth / 2;
let windowHalfY = window.innerHeight / 2;
const onPointerMove = (event: PointerEvent) => {
  if (event.isPrimary === false) return;
  mouseX = event.clientX - windowHalfX;
  mouseY = event.clientY - windowHalfY;
};
canvas.addEventListener("pointermove", onPointerMove);
document.addEventListener("keydown", (event) => {
  if (event.code !== "Space" || event.defaultPrevented) return;
  const target = event.target;
  if (
    target instanceof HTMLElement &&
    (target.closest("input, button, textarea, select, a, [role='button']") ||
      target.isContentEditable)
  )
    return;
  event.preventDefault();
  if (!event.repeat) setDebugMode(!effectController.paused);
});
