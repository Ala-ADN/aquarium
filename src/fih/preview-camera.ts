import { PerspectiveCamera, Vector3 } from "three";
import type { BufferGeometry } from "three";
import { CAMERA_SETTINGS } from "../constants";

// Fixed pixels per world unit. Frame size and fish size never change this lens.
export const FIH_PREVIEW_VIEW = { distance: 12, centerX: 4, extent: 340, motionPadding: 96 } as const;

export function setFihPreviewCamera(camera: PerspectiveCamera, width: number, height: number) {
  camera.fov = CAMERA_SETTINGS.fov;
  camera.near = .1;
  camera.far = 3000;
  camera.zoom = 1;
  camera.position.set(FIH_PREVIEW_VIEW.centerX, 0, FIH_PREVIEW_VIEW.distance);
  camera.rotation.set(0, 0, 0);
  const extent = FIH_PREVIEW_VIEW.extent;
  camera.setViewOffset(extent, extent, (extent - width) / 2, (extent - height) / 2, width, height);
  camera.updateMatrixWorld();
}

export function getFihPreviewViewport(geometry: BufferGeometry, width: number, height: number) {
  const camera = new PerspectiveCamera();
  setFihPreviewCamera(camera, width, height);
  const positions = geometry.getAttribute("position");
  const point = new Vector3();
  let overflowX = 0;
  let overflowY = 0;
  for (let i = 0; i < positions.count; i++) {
    // The same side-on model rotation used by the aquarium shader.
    point.set(positions.getZ(i), positions.getY(i), -positions.getX(i)).project(camera);
    overflowX = Math.max(overflowX, (Math.abs(point.x) - 1) * width / 2);
    overflowY = Math.max(overflowY, (Math.abs(point.y) - 1) * height / 2);
  }
  const paddingX = Math.ceil(overflowX + FIH_PREVIEW_VIEW.motionPadding);
  const paddingY = Math.ceil(overflowY + FIH_PREVIEW_VIEW.motionPadding);
  return { width: width + paddingX * 2, height: height + paddingY * 2, paddingX, paddingY };
}

// Keep the preview's phase integration identical to fih/shader/position.glsl.
export function advanceFihSwimPhase(phase: number, delta: number, velocity: { x: number; y: number; z: number }) {
  return (phase + delta * (1 + Math.hypot(velocity.x, velocity.z) * 3 + Math.max(velocity.y, 0) * 6)) % 62.83;
}
