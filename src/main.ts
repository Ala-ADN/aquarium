import "./style.css";
import {
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
  Color,
  Mesh,
  ShaderMaterial,
  DoubleSide,
  BufferGeometry,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { FihGeometry } from "./fih/geometry/fih";
import { fihTemplate } from "./fih/appearance";
import { getPatternTexture } from "./fih/pattern-texture";
import { GPUSimulation } from "./simulation/GPUSimulation";
import {
  BACKGROUND_GRADIENT,
  CAMERA_SETTINGS,
  FIH_FIN_SHADE,
  FIH_FADE_IN_MS,
  FIH_FLOCKING,
  INITIAL_FIH,
  MAX_RENDER_PIXEL_RATIO,
} from "./constants";
import { createWaterEnvironment, withWaterColor } from "./water/WaterEnvironment";
import type { FihDesign } from "./types";
import { readFirebaseConfig } from "./fih/firebase-config";
import { selectSharedSchool } from "./fih/shared";
import type { FihSaveStatus, SharedFih } from "./fih/shared";
import { createSharedFihSync } from "./fih/shared-sync";
import { readVisit } from "./fih/visit";
import fihVertexShader from "./fih/shader/vertex.glsl?raw";
import fihFragmentShader from "./fih/shader/fragment.glsl?raw";

// Download the public reader while the graphics context is being created.
const firebaseConfig = readFirebaseConfig(import.meta.env, import.meta.env.DEV);
let firebaseModule = firebaseConfig ? import("./fih/firebase") : null;

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

const geometry = new FihGeometry({}, INITIAL_FIH);
let firstFrameAt: number | null = null;
const fadeTime = () => firstFrameAt === null ? 0 : (performance.now() - firstFrameAt) / 1000;
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
  fadeTime: { value: 0 },
  fadeDuration: { value: Math.max(0, FIH_FADE_IN_MS) / 1000 },
};

const fihMaterial = new ShaderMaterial({
  uniforms: fihUniforms,
  vertexShader: fihVertexShader,
  fragmentShader: withWaterColor(fihFragmentShader),
  side: DoubleSide,
  transparent: true,
  depthWrite: false,
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
  transparent: true,
  depthWrite: false,
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
let backgroundOffset = 0;
let backgroundCount = INITIAL_FIH;
let sharedRevealTimes = new Map<string, number[]>();

function refreshSchool() {
  const school = selectSharedSchool(sharedEntries, ownDesign, ownerId);
  if (backgroundOffset !== school.count || backgroundCount !== school.backgroundCount) {
    fihMesh.geometry.dispose();
    fihMesh.geometry = new FihGeometry({}, school.backgroundCount, school.count);
    backgroundOffset = school.count;
    backgroundCount = school.backgroundCount;
  }
  gpuSim.velocityUniforms.activeCount.value = school.totalCount;
  const key = JSON.stringify(school.placements);
  if (key === schoolKey) return;
  schoolKey = key;
  const now = fadeTime();
  const nextRevealTimes = new Map<string, number[]>();
  const pieces = school.placements.map(({ ownerId, design, offset }) => {
    const previous = sharedRevealTimes.get(ownerId) ?? [];
    const times = Array.from({ length: design.count }, (_, i) => previous[i] ?? now);
    nextRevealTimes.set(ownerId, times);
    return new FihGeometry(fihTemplate(design), design.count, offset, times);
  });
  sharedRevealTimes = nextRevealTimes;
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
    design.count,
    0,
    fadeTime()
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

const debug = new URLSearchParams(window.location.search).has("debug");
let debugPanel: ReturnType<typeof import("./ui/debug-panel")["createDebugPanel"]> | null = null;
let debugLoading: Promise<void> | null = null;
let creator: ReturnType<typeof import("./ui/fih-editor")["mountFihEditor"]> | null = null;
let mediaPlayer: ReturnType<typeof import("./ui/media-player")["mountMediaPlayer"]> | null = null;
let saveStatus: FihSaveStatus | null = null;
let disposed = false;

const effectController = {
  separation: Number(FIH_FLOCKING.separation),
  alignment: Number(FIH_FLOCKING.alignment),
  cohesion: Number(FIH_FLOCKING.cohesion),
  paused: false,
};

// Restore saved fih independently of the editor's deferred download and setup.
try {
  const saved = readVisit(localStorage).fih;
  if (saved) displayFih(saved);
} catch { /* The tank still starts when browser storage is unavailable. */ }

function setSaveStatus(status: FihSaveStatus) {
  saveStatus = status;
  creator?.setSaveStatus(status);
}

async function loadEditor() {
  try {
    const { mountFihEditor } = await import("./ui/fih-editor");
    if (disposed) return;
    creator = mountFihEditor({
      onDisplay: displayFih, water: water.uniforms,
      isPaused: () => effectController.paused,
      onRelease: (design) => sharing?.submit(design),
    });
    restoringVisit = false;
    if (saveStatus) creator.setSaveStatus(saveStatus);
  } catch {
    if (disposed) return;
    const retry = document.createElement("button");
    retry.type = "button";
    retry.style.pointerEvents = "auto";
    retry.textContent = "retry loading fih creator";
    // Failed module fetches may be cached, and a deployment may have replaced
    // the old chunk URL. Reload the entry document to recover in either case.
    retry.addEventListener("click", () => window.location.reload(), { once: true });
    document.querySelector("#fih-footer")?.replaceChildren(retry);
  }
}

async function loadMediaPlayer() {
  const host = document.querySelector<HTMLElement>("#portfolio-content");
  if (!host) return;
  try {
    const { mountMediaPlayer } = await import("./ui/media-player");
    if (!disposed) mediaPlayer = mountMediaPlayer(host);
  } catch {
    if (disposed) return;
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "media-player-retry";
    retry.style.pointerEvents = "auto";
    retry.textContent = "Retry loading media player";
    retry.addEventListener("click", () => window.location.reload(), { once: true });
    host.append(retry);
  }
}

// Loading Firebase never blocks the animation or browser-only persistence.
if (firebaseConfig) {
  type FirebaseClient = Awaited<ReturnType<typeof import("./fih/firebase")["connectFirebaseAquarium"]>>;
  let client: FirebaseClient | null = null;
  let connecting: Promise<FirebaseClient> | null = null;
  const connect = () => {
    if (!connecting) connecting = (firebaseModule ??= import("./fih/firebase")).then(({ connectFirebaseAquarium }) =>
      connectFirebaseAquarium(firebaseConfig, {
        onEntries: (entries) => { sharedEntries = entries; scheduleSchool(); },
        onOwner: (id) => { ownerId = id; scheduleSchool(); },
        onError: () => setSaveStatus("unavailable"),
        onConnected: () => sharing?.retry(),
      })
    ).then((connected) => {
      client = connected;
      if (disposed) connected.close();
      return connected;
    }).catch((error: unknown) => { connecting = null; firebaseModule = null; throw error; });
    return connecting;
  };
  let storage: Storage | null = null;
  try { storage = localStorage; } catch { /* The current visit can still share online. */ }
  sharing = createSharedFihSync({
    send: async (design) => { await (await connect()).save(design); },
    onStatus: (status) => setSaveStatus(status),
    storage,
  });
  const reconnect = () => sharing?.retry();
  window.addEventListener("online", reconnect);
  void connect().catch(() => setSaveStatus("unavailable"));
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
  if (debugPanel) debugPanel.setVisible(paused || debug);
  else if (paused || debug) void loadDebug();
}

function loadDebug() {
  if (!debugLoading) debugLoading = import("./ui/debug-panel").then(({ createDebugPanel }) => {
    if (disposed) return;
    debugPanel = createDebugPanel({ canvas, water, camera, scene, gpuSim,
      flocking: effectController, onFlockingChange: valuesChanger, onPauseChange: setDebugMode });
    debugPanel.setVisible(effectController.paused || debug);
  }).catch(() => { debugLoading = null; });
  return debugLoading;
}

const valuesChanger = function () {
  gpuSim.velocityUniforms["separationDistance"].value = effectController.separation;
  gpuSim.velocityUniforms["alignmentDistance"].value = effectController.alignment;
  gpuSim.velocityUniforms["cohesionDistance"].value = effectController.cohesion;
};

valuesChanger();

let lastTime = performance.now();
let mouseX = 0;
let mouseY = 0;
let renderedFirstFrame = false;
let deferredFrame = 0;
let deferredWork: ReturnType<typeof setTimeout> | undefined;

renderer.setAnimationLoop(() => {
  const now = performance.now();
  firstFrameAt ??= now;
  fihUniforms.fadeTime.value = (now - firstFrameAt) / 1000;
  let delta = (now - lastTime) / 1000;
  if (delta > 1) delta = 1; // safety cap on large deltas
  lastTime = now;
  visitorMaterial.uniforms.releaseGlow.value = Math.max(0, 1 - (now - releasedAt) / 800);

  if (!effectController.paused && renderedFirstFrame) {
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
  debugPanel?.update();
  renderer.render(scene, camera);
  if (!renderedFirstFrame) {
    renderedFirstFrame = true;
    // Give the browser a paint before loading CSS, editor DOM, or debug tools.
    deferredFrame = requestAnimationFrame(() => {
      deferredWork = setTimeout(() => {
        if (disposed) return;
        void loadEditor();
        void loadMediaPlayer();
        if (debug || effectController.paused) void loadDebug();
      }, 0);
    });
  }
});

import.meta.hot?.dispose(() => {
  disposed = true;
  cancelAnimationFrame(deferredFrame);
  clearTimeout(deferredWork);
  creator?.destroy();
  mediaPlayer?.destroy();
  debugPanel?.destroy();
  renderer.setAnimationLoop(null);
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
