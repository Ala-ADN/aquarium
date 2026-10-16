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
  BufferGeometry,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { FihGeometry } from "./fih/geometry/fih";
import { fihTemplate } from "./fih/appearance";
import { getPatternTexture } from "./fih/pattern-texture";
import { GPUSimulation } from "./simulation/GPUSimulation";
import { GUI } from "three/addons/libs/lil-gui.module.min.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  BACKGROUND_GRADIENT,
  CAMERA_SETTINGS,
  FIH_FIN_SHADE,
  FIH_FLOCKING,
  MAX_FIH,
  MAX_RENDER_PIXEL_RATIO,
} from "./constants";
import { mountFihCreator } from "./ui/fih-creator";
import { createFihLivePreview } from "./ui/fih-live-preview";
import { addDebugControls } from "./ui/debug";
import { createWaterEnvironment, withWaterColor } from "./water/WaterEnvironment";
import type { FihDesign } from "./types";
import { readFirebaseConfig } from "./fih/firebase-config";
import { selectSharedSchool } from "./fih/shared";
import type { SharedFih } from "./fih/shared";
import { createSharedFihSync } from "./fih/shared-sync";
import fihVertexShader from "./fih/shader/vertex.glsl?raw";
import fihFragmentShader from "./fih/shader/fragment.glsl?raw";

const scene = new Scene();
scene.background = new Color(BACKGROUND_GRADIENT.deep);
document.body.style.backgroundColor = BACKGROUND_GRADIENT.deep;
const camera = new PerspectiveCamera(CAMERA_SETTINGS.fov, window.innerWidth / window.innerHeight, 1, 3000);
camera.position.z = CAMERA_SETTINGS.distance;

const canvas = document.querySelector("#canvas") as HTMLCanvasElement;
const renderer = new WebGLRenderer({ canvas: canvas, antialias: true });
const renderPixelRatio = () => Math.min(window.devicePixelRatio || 1, MAX_RENDER_PIXEL_RATIO);
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
  finShade: { value: FIH_FIN_SHADE },
  patternMask: { value: getPatternTexture("plain") },
  patternColor: { value: new Color() },
  releaseGlow: { value: 0 },
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

const templateMaterial = () => new ShaderMaterial({
  uniforms: { ...fihUniforms, useTemplateColor: { value: true },
    patternMask: { value: getPatternTexture("plain") },
    patternColor: { value: new Color() }, releaseGlow: { value: 0 } },
  vertexShader: fihVertexShader,
  fragmentShader: withWaterColor(fihFragmentShader),
  side: DoubleSide,
});
const visitorMaterial = templateMaterial();
const sharedMaterial = templateMaterial();
const sharedMesh = new Mesh(new BufferGeometry(), sharedMaterial);
sharedMesh.visible = false;
sharedMesh.frustumCulled = false;
sharedMesh.rotation.y = Math.PI / 2;
sharedMesh.matrixAutoUpdate = false;
sharedMesh.updateMatrix();
scene.add(sharedMesh);
let visitorMesh: Mesh<FihGeometry, ShaderMaterial> | null = null;
let releasedAt = -Infinity;
let restoringVisit = true;
let ownDesign: FihDesign | null = null;
let ownerId: string | null = null;
let sharedEntries: SharedFih[] = [];
let schoolKey = "";
let schoolFrame = 0;
let sharing: ReturnType<typeof createSharedFihSync> | null = null;

function refreshSchool() {
  const school = selectSharedSchool(sharedEntries, ownDesign, ownerId);
  const verticesPerFih = geometry.getAttribute("position").count / MAX_FIH;
  geometry.setDrawRange(school.count * verticesPerFih, (MAX_FIH - school.count) * verticesPerFih);
  const key = JSON.stringify(school.placements);
  if (key === schoolKey) return;
  schoolKey = key;
  const pieces = school.placements.map(({ design, offset }) => new FihGeometry(fihTemplate(design), design.count, offset));
  const merged = pieces.length ? mergeGeometries(pieces) : null;
  pieces.forEach((piece) => piece.dispose());
  sharedMesh.geometry.dispose();
  sharedMesh.geometry = merged ?? new BufferGeometry();
  sharedMesh.visible = merged !== null;
}
function scheduleSchool() {
  if (schoolFrame) return;
  schoolFrame = requestAnimationFrame(() => { schoolFrame = 0; refreshSchool(); });
}

function displayFih(design: FihDesign) {
  ownDesign = design;
  visitorMaterial.uniforms.patternMask.value = getPatternTexture("plain");
  releasedAt = restoringVisit ? -Infinity : performance.now();
  const visitorGeometry = new FihGeometry(
    fihTemplate(design),
    design.count
  );
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
  refreshSchool();
}

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
  separation: Number(FIH_FLOCKING.separation),
  alignment: Number(FIH_FLOCKING.alignment),
  cohesion: Number(FIH_FLOCKING.cohesion),
  paused: false,
};

const creator = mountFihCreator(displayFih, (preview, appearance) => createFihLivePreview(preview, appearance, {
  water: water.uniforms,
  isPaused: () => effectController.paused,
}), {
  onRelease: (design) => sharing?.submit(design),
  onRetry: () => sharing?.retry(),
});
restoringVisit = false;

// Loading Firebase never blocks the animation or browser-only persistence.
const firebaseConfig = readFirebaseConfig(import.meta.env, import.meta.env.DEV);
if (firebaseConfig) {
  type FirebaseClient = Awaited<ReturnType<typeof import("./fih/firebase")["connectFirebaseAquarium"]>>;
  let client: FirebaseClient | null = null;
  let connecting: Promise<FirebaseClient> | null = null;
  let disposed = false;
  const connect = () => {
    if (!connecting) connecting = import("./fih/firebase").then(({ connectFirebaseAquarium }) =>
      connectFirebaseAquarium(firebaseConfig, {
        onEntries: (entries) => { sharedEntries = entries; scheduleSchool(); },
        onOwner: (id) => { ownerId = id; scheduleSchool(); },
        onError: () => creator.setSaveStatus("unavailable", false),
        onConnected: () => sharing?.retry(),
      })
    ).then((connected) => {
      client = connected;
      if (disposed) connected.close();
      return connected;
    }).catch((error: unknown) => { connecting = null; throw error; });
    return connecting;
  };
  let storage: Storage | null = null;
  try { storage = localStorage; } catch { /* The current visit can still share online. */ }
  sharing = createSharedFihSync({
    send: async (design) => { await (await connect()).save(design); },
    onStatus: (status) => creator.setSaveStatus(status),
    storage,
  });
  const reconnect = () => sharing?.retry();
  window.addEventListener("online", reconnect);
  void connect().catch(() => creator.setSaveStatus("unavailable", false));
  sharing.retry();
  import.meta.hot?.dispose(() => {
    disposed = true;
    sharing?.destroy();
    client?.close();
    window.removeEventListener("online", reconnect);
    cancelAnimationFrame(schoolFrame);
  });
}

function setDebugMode(paused: boolean) {
  effectController.paused = paused;
  controls.enabled = paused;
  axesHelper.visible = paused;
  if (paused || debug) {
    gui.show();
    if (paused) gui.open();
  }
  else gui.hide();
  gui.controllersRecursive().forEach((controller) => controller.updateDisplay());
}

const valuesChanger = function () {
  gpuSim.velocityUniforms["separationDistance"].value = effectController.separation;
  gpuSim.velocityUniforms["alignmentDistance"].value = effectController.alignment;
  gpuSim.velocityUniforms["cohesionDistance"].value = effectController.cohesion;
};

valuesChanger();

gui.add(effectController, "paused").name("Pause Simulation").onChange(setDebugMode);
addDebugControls(gui, { water, camera, controls, scene, gpuSim, flocking: effectController, onFlockingChange: valuesChanger });
if (!debug) gui.close();

let lastTime = performance.now();
let mouseX = 0;
let mouseY = 0;

renderer.setAnimationLoop(() => {
  const now = performance.now();
  let delta = (now - lastTime) / 1000;
  if (delta > 1) delta = 1; // safety cap on large deltas
  lastTime = now;
  visitorMaterial.uniforms.releaseGlow.value = Math.max(0, 1 - (now - releasedAt) / 800);

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
    (target.closest("input, button, textarea, select, a, [role='button'], [role='spinbutton']") ||
      target.isContentEditable)
  )
    return;
  event.preventDefault();
  if (!event.repeat) setDebugMode(!effectController.paused);
});
