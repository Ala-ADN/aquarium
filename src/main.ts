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
} from "three";
import { FihGeometry } from "./geometry/fih";
import { GPUSimulation } from "./simulation/GPUSimulation";
import vertexShader from "./shader/vertex.glsl?raw";
import fragmentShader from "./shader/fragment.glsl?raw";

const scene = new Scene();
scene.background = new Color(0x006994);
scene.fog = new Fog(0x006994, 100, 1000);
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
  vertexShader: vertexShader,
  fragmentShader: fragmentShader,
  side: DoubleSide,
});

const fihMesh = new Mesh(geometry, fihMaterial);
fihMesh.rotation.y = Math.PI / 2;
fihMesh.matrixAutoUpdate = false;
fihMesh.updateMatrix();
scene.add(fihMesh);

let lastTime = performance.now();
let mouseX = 0;
let mouseY = 0;

renderer.setAnimationLoop(() => {
  const now = performance.now();
  let delta = (now - lastTime) / 1000;
  if (delta > 1) delta = 1; // safety cap on large deltas
  lastTime = now;

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
