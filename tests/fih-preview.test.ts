import { describe, expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import { DEFAULT_APPEARANCE, fihTemplate } from "../src/fih/appearance";
import { FihGeometry } from "../src/fih/geometry/fih";
import { advanceFihSwimPhase, getFihPreviewViewport, setFihPreviewCamera } from "../src/fih/preview-camera";

describe("fixed preview magnification and overflow", () => {
  it("keeps projected pixel size independent of the frame and drawing area", () => {
    const reference = new PerspectiveCamera();
    setFihPreviewCamera(reference, 340, 255);
    const point = new Vector3(12, 3, 0);
    const projected = point.clone().project(reference);
    for (const [width, height] of [[340, 255], [180, 135], [900, 700]]) {
      const camera = new PerspectiveCamera();
      setFihPreviewCamera(camera, width, height);
      const resized = point.clone().project(camera);
      expect(resized.x * width / 2).toBeCloseTo(projected.x * 170);
      expect(resized.y * height / 2).toBeCloseTo(projected.y * 127.5);
      expect(camera.position).toEqual(reference.position);
    }
  });

  it("allows maximum sizes beyond the frame while extending the transparent canvas", () => {
    const geometry = new FihGeometry(fihTemplate({ ...DEFAULT_APPEARANCE,
      finSize: 1.5, bodySize: 1.5, headSize: 1.5 }), 1);
    const before = Array.from(geometry.getAttribute("position").array);
    const camera = new PerspectiveCamera();
    setFihPreviewCamera(camera, 340, 255);
    const positions = geometry.getAttribute("position");
    const projected = Array.from({ length: positions.count }, (_, i) =>
      new Vector3(positions.getZ(i), positions.getY(i), 0).project(camera));
    expect(Math.min(...projected.map((point) => point.x))).toBeLessThan(-1);
    expect(Math.max(...projected.map((point) => point.x))).toBeGreaterThan(1);
    const viewport = getFihPreviewViewport(geometry, 340, 255);
    expect(viewport.width).toBeGreaterThan(340);
    expect(viewport.height).toBeGreaterThan(255);
    setFihPreviewCamera(camera, viewport.width, viewport.height);
    for (let i = 0; i < positions.count; i++) {
      const point = new Vector3(positions.getZ(i), positions.getY(i), 0).project(camera);
      expect(Math.abs(point.x)).toBeLessThan(1);
      expect(Math.abs(point.y)).toBeLessThan(1);
    }
    expect(Array.from(geometry.getAttribute("position").array)).toEqual(before);
    geometry.dispose();
  });

  it("changes fish dimensions with the size choices instead of fitting each design", () => {
    const camera = new PerspectiveCamera();
    setFihPreviewCamera(camera, 340, 255);
    const span = (size: number) => {
      const geometry = new FihGeometry(fihTemplate({ ...DEFAULT_APPEARANCE,
        bodySize: size, headSize: size, finSize: size }), 1);
      const positions = geometry.getAttribute("position");
      const x = Array.from({ length: positions.count }, (_, i) =>
        new Vector3(positions.getZ(i), positions.getY(i), 0).project(camera).x);
      geometry.dispose();
      return Math.max(...x) - Math.min(...x);
    };
    expect(span(1.5) / span(.6)).toBeCloseTo(2.5);
  });
});

describe("swimming animation phase", () => {
  it("matches the aquarium's speed, vertical motion, and phase wrapping", () => {
    expect(advanceFihSwimPhase(1, .1, { x: 3, y: 0, z: 0 })).toBeCloseTo(2);
    expect(advanceFihSwimPhase(1, .1, { x: 3, y: 2, z: 4 })).toBeCloseTo(3.8);
    expect(advanceFihSwimPhase(1, 0, { x: 3, y: 0, z: 0 })).toBe(1);
    expect(advanceFihSwimPhase(62.8, .1, { x: 3, y: -2, z: 0 })).toBeCloseTo(.97);
  });
});
