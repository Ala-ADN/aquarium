import {
  AmbientLight, Box3, CylinderGeometry, DirectionalLight, Group, Mesh,
  MeshStandardMaterial, OrthographicCamera, PMREMGenerator, Scene, SphereGeometry, Vector3,
  WebGLRenderer, type BufferGeometry, type WebGLRenderTarget,
} from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { createFihLeverSettings, type FihLeverSettings } from "./fih-lever-settings";

/** Native Three.js meshes rendered on a transparent surface in the window's 3D scene. */
export function buildFihLever(lever: HTMLButtonElement) {
  const canvas = document.createElement("canvas");
  canvas.className = "fih-lever-canvas";
  canvas.setAttribute("aria-hidden", "true");
  lever.append(canvas);
  const scene = new Scene();
  const camera = new OrthographicCamera(-96, 96, 150, -150, 1, 2000);
  camera.position.z = 1000;
  const ambient = new AmbientLight(0xffffff);
  const light = new DirectionalLight(0xffffff);
  light.position.set(-100, 180, 250);
  scene.add(ambient, light);
  const metal = new MeshStandardMaterial();
  const red = new MeshStandardMaterial();
  const mountMaterial = new MeshStandardMaterial();
  const assembly = new Group();
  assembly.position.set(-16, -36, -20);
  scene.add(assembly);
  const mount = new Mesh(undefined, mountMaterial);
  const arm = new Group();
  assembly.add(mount, arm);
  const lowerStem = new Mesh(undefined, metal);
  const upperStem = new Mesh(undefined, metal);
  const elbow = new Mesh(undefined, metal);
  const ball = new Mesh(undefined, red);
  arm.add(lowerStem, upperStem, elbow, ball);
  const meshes = [lowerStem, upperStem, elbow, mount, ball];
  const windowElement = lever.closest<HTMLElement>(".fih-window");
  let settings = createFihLeverSettings();
  let geometryKey = "";
  let placementKey = "";
  let renderer: WebGLRenderer | null = null;
  let environment: WebGLRenderTarget | null = null;
  let visible = false;
  let destroyed = false;
  let frame = 0;
  let pull = 0;
  let width = 192;
  let height = 300;
  const radians = (degrees: number) => degrees * Math.PI / 180;
  function replaceGeometry(mesh: Mesh, geometry: BufferGeometry) {
    mesh.geometry.dispose();
    mesh.geometry = geometry;
  }
  function rebuildGeometry() {
    const g = settings.geometry;
    assembly.scale.setScalar(g.scale);
    replaceGeometry(mount, new CylinderGeometry(g.mountRadius, g.mountRadius, g.mountLength, Math.round(g.mountSegments)));
    // Keep the upright embedded in the mount when its length changes.
    arm.position.set(10 + g.mountLength * 6 / 28.8, 0, 0);
    const pivot = new Vector3(-10, -3, 0);
    const bend = pivot.clone().add(new Vector3(0, g.lowerArmLength, 0));
    const angle = radians(g.bendAngle);
    const tip = bend.clone().add(new Vector3(Math.sin(angle), Math.cos(angle), 0).multiplyScalar(g.upperArmLength));
    function shaft(mesh: Mesh, from: Vector3, to: Vector3) {
      const direction = to.clone().sub(from);
      replaceGeometry(mesh, new CylinderGeometry(g.armRadius, g.armRadius, direction.length(), Math.round(g.armSegments)));
      mesh.position.copy(from).add(to).multiplyScalar(.5);
      mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), direction.normalize());
    }
    shaft(lowerStem, pivot, bend);
    shaft(upperStem, bend, tip);
    replaceGeometry(elbow, new SphereGeometry(g.armRadius, Math.round(g.armSegments), 12));
    elbow.position.copy(bend);
    replaceGeometry(ball, new SphereGeometry(g.sphereRadius, Math.round(g.sphereWidthSegments), Math.round(g.sphereHeightSegments)));
    ball.position.copy(tip);
    ball.quaternion.copy(upperStem.quaternion);
    ball.rotateZ(radians(g.sphereAxisOffset));
  }
  function applyShading() {
    const s = settings.shading;
    for (const [material, color, metalness, roughness] of [
      [metal, s.armColor, s.armMetalness, s.armRoughness],
      [mountMaterial, s.mountColor, s.mountMetalness, s.mountRoughness],
      [red, s.sphereColor, s.sphereMetalness, s.sphereRoughness],
    ] as const) {
      material.color.set(color);
      material.metalness = metalness * s.metallicShading;
      material.roughness = roughness;
      material.envMapIntensity = s.reflection;
      if (material.flatShading === s.smoothShading) {
        material.flatShading = !s.smoothShading;
        material.needsUpdate = true;
      }
    }
    ambient.intensity = s.ambientLight;
    light.intensity = s.keyLight;
  }
  function layout() {
    const p = settings.placement;
    mount.rotation.set(0, radians(p.mountAngle), Math.PI / 2);
    // Cover the entire pull and spring return, keeping enlarged shapes unclipped.
    const bounds = new Box3();
    for (let i = -1; i <= 11; i++) {
      arm.rotation.x = radians(p.restAngle + p.pullAngle * i / 10);
      bounds.union(new Box3().setFromObject(assembly));
    }
    camera.left = Math.floor(bounds.min.x - 16);
    camera.right = Math.ceil(bounds.max.x + 16);
    camera.bottom = Math.floor(bounds.min.y - 16);
    camera.top = Math.ceil(bounds.max.y + 16);
    camera.updateProjectionMatrix();
    width = camera.right - camera.left;
    height = camera.top - camera.bottom;
    const left = Math.max(0, Math.floor(26 + bounds.min.x - 6));
    const right = Math.ceil(26 + bounds.max.x + 6);
    const top = Math.floor(148 - bounds.max.y - 6);
    const bottom = Math.ceil(148 - bounds.min.y + 6);
    lever.style.right = `${-24 - right - p.horizontalOffset}px`;
    lever.style.top = `calc(50% + ${top - 158 + p.verticalOffset}px)`;
    lever.style.width = `${right - left}px`;
    lever.style.height = lever.style.minHeight = `${bottom - top}px`;
    canvas.style.left = `${26 + camera.left - left}px`;
    canvas.style.top = `${148 - camera.top - top}px`;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.style.transform = `translateZ(${p.depth}px)`;
    const overhang = Math.max(78, right + p.horizontalOffset);
    if (windowElement) {
      windowElement.dataset.rightOverhang = String(overhang);
      windowElement.style.setProperty("--fih-lever-overhang", `${overhang}px`);
    }
    renderer?.setSize(width, height, false);
  }
  function render() {
    const p = settings.placement;
    arm.rotation.x = radians(p.restAngle + pull * p.pullAngle);
    if (!visible || destroyed || document.hidden) return;
    renderer?.render(scene, camera);
  }
  function setSettings(next: FihLeverSettings) {
    if (destroyed) return;
    settings = structuredClone(next);
    const nextGeometry = JSON.stringify(settings.geometry);
    const nextPlacement = JSON.stringify(settings.placement);
    const geometryChanged = geometryKey !== nextGeometry;
    if (geometryChanged) rebuildGeometry();
    if (geometryChanged || placementKey !== nextPlacement) layout();
    geometryKey = nextGeometry;
    placementKey = nextPlacement;
    applyShading();
    render();
  }
  setSettings(settings);
  return {
    setSettings,
    getMotion: () => settings.motion,
    setVisible(value: boolean) {
      visible = value;
      if (!value) {
        cancelAnimationFrame(frame);
        frame = 0;
        pull = 0;
        return;
      }
      if (!renderer) {
        const context = canvas.getContext("webgl2", { alpha: true, antialias: true });
        if (!context) return;
        renderer = new WebGLRenderer({ canvas, context, alpha: true, antialias: true });
        renderer.setClearColor(0, 0);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(width, height, false);
        const room = new RoomEnvironment();
        const pmrem = new PMREMGenerator(renderer);
        environment = pmrem.fromScene(room);
        scene.environment = environment.texture;
        room.dispose();
        pmrem.dispose();
      }
      render();
    },
    setPull(value: number) {
      cancelAnimationFrame(frame);
      frame = 0;
      pull = value;
      render();
    },
    reset() {
      if (frame) return;
      // The explicitly tuned return duration controls this motion; 0 disables it.
      if (!renderer || !visible || document.hidden || destroyed || !pull || !settings.motion.returnDuration) {
        pull = 0;
        render();
        return;
      }
      const from = pull;
      const start = performance.now();
      const duration = settings.motion.returnDuration;
      function settle(now: number) {
        const t = Math.max(0, Math.min(1, (now - start) / duration));
        pull = from * (1 - t) ** 3;
        render();
        frame = t < 1 ? requestAnimationFrame(settle) : 0;
      }
      frame = requestAnimationFrame(settle);
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(frame);
      for (const mesh of meshes) mesh.geometry.dispose();
      metal.dispose();
      red.dispose();
      mountMaterial.dispose();
      scene.environment = null;
      environment?.dispose();
      renderer?.dispose();
      renderer?.forceContextLoss();
      canvas.remove();
    },
  };
}
