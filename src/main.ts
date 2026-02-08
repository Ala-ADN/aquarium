import "./style.css";
import {
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
  Color,
  Mesh,
  ShaderMaterial,
  DoubleSide,
  Texture,
  Fog,
  AxesHelper,
  PlaneGeometry,
  FrontSide,
  TextureLoader,
  RepeatWrapping,
} from "three";
import { FihGeometry } from "./fih/geometry/fih";
import { GPUSimulation } from "./simulation/GPUSimulation";
import { GUI } from "three/addons/libs/lil-gui.module.min.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { BOUNDS } from "./constants";
// @ TODO look for tilable noise texture
import voronoise from "./asset/voronoi_noise.png";
import fihVertexShader from "./fih/shader/vertex.glsl?raw";
import fihFragmentShader from "./fih/shader/fragment.glsl?raw";
import grFragmentShader from "./god-ray/fragment.glsl?raw";
import grVertexShader from "./god-ray/vertex.glsl?raw";

const scene = new Scene();
scene.background = new Color(0x003c5f);
scene.fog = new Fog(0x003c5f, 100, 1000);
const camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 3000);
camera.position.z = 350;

const canvas = document.querySelector("#canvas") as HTMLCanvasElement;
const renderer = new WebGLRenderer({ canvas: canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x090909);

const gpuSim = new GPUSimulation(renderer);

const geometry = new FihGeometry();
const fihUniforms = {
  color: { value: new Color(0xff0000) },
  texturePosition: { value: null as Texture | null },
  textureVelocity: { value: null as Texture | null },
  time: { value: 1.0 },
  delta: { value: 0.0 },
};

const fihMaterial = new ShaderMaterial({
  uniforms: fihUniforms,
  vertexShader: fihVertexShader,
  fragmentShader: fihFragmentShader,
  side: DoubleSide,
});

const fihMesh = new Mesh(geometry, fihMaterial);
fihMesh.rotation.y = Math.PI / 2;
fihMesh.matrixAutoUpdate = false;
fihMesh.updateMatrix();
scene.add(fihMesh);

const noiseTexture = new TextureLoader().load(voronoise);
noiseTexture.wrapS = RepeatWrapping;
noiseTexture.wrapT = RepeatWrapping;

const grPlane = new PlaneGeometry(2 * BOUNDS, BOUNDS);
const grMaterial = new ShaderMaterial({
  side: FrontSide,
  uniforms: {
    time: { value: 1.0 },
    uniformTexture: { value: noiseTexture },
    BOUNDS: { value: BOUNDS },
  },
  transparent: true,
  vertexShader: grVertexShader,
  fragmentShader: grFragmentShader,
});
const grMesh = new Mesh(grPlane, grMaterial);
scene.add(grMesh);

// orbit controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enabled = false; // Start disabled

// Add axis helper
const axesHelper = new AxesHelper(100);
axesHelper.visible = false; // Set to true to see the axes
scene.add(axesHelper);

const gui = new GUI();

const effectController = {
  separation: 20.0,
  alignment: 20.0,
  cohesion: 20.0,
  freedom: 0.75,
  paused: true,
};

const valuesChanger = function () {
  gpuSim.velocityUniforms["separationDistance"].value = effectController.separation;
  gpuSim.velocityUniforms["alignmentDistance"].value = effectController.alignment;
  gpuSim.velocityUniforms["cohesionDistance"].value = effectController.cohesion;
  gpuSim.velocityUniforms["freedomFactor"].value = effectController.freedom;
};

valuesChanger();

gui.add(effectController, "separation", 0.0, 100.0, 1.0).onChange(valuesChanger);
gui.add(effectController, "alignment", 0.0, 100, 0.001).onChange(valuesChanger);
gui.add(effectController, "cohesion", 0.0, 100, 0.025).onChange(valuesChanger);
gui
  .add(effectController, "paused")
  .name("Pause Simulation")
  .onChange((value: boolean) => {
    controls.enabled = value; // Enable free camera when paused
  });
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
    grMaterial.uniforms["time"].value = now;
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
  renderer.render(scene, camera);
});

const resize = () => {
  windowHalfX = window.innerWidth / 2;
  windowHalfY = window.innerHeight / 2;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
};
addEventListener("resize", resize);

let windowHalfX = window.innerWidth / 2;
let windowHalfY = window.innerHeight / 2;
const onPointerMove = (event: PointerEvent) => {
  if (event.isPrimary === false) return;
  mouseX = event.clientX - windowHalfX;
  mouseY = event.clientY - windowHalfY;
};
document.addEventListener("pointermove", onPointerMove);
document.addEventListener("keydown", (event) => {
  if (event.code === "Space") {
    effectController.paused = !effectController.paused;
    controls.enabled = effectController.paused;
    axesHelper.visible = effectController.paused;
    gui.controllers.forEach((controller) => controller.updateDisplay());
  }
});
