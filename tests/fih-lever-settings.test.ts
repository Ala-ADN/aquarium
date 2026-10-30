// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { BufferGeometry } from "three";
import { buildFihLever } from "../src/ui/fih-lever";
import { createFihLeverSettings, exportFihLeverSettings } from "../src/ui/fih-lever-settings";
import { FIH_LEVER_GEOMETRY } from "../src/constants";

let controller: ReturnType<typeof buildFihLever> | undefined;
afterEach(() => {
  controller?.destroy();
  controller = undefined;
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});
function mount() {
  document.body.innerHTML = '<section class="fih-window"><form><button class="fih-lever"></button></form></section>';
  const lever = document.querySelector<HTMLButtonElement>("button")!;
  controller = buildFihLever(lever);
  return { lever, canvas: lever.querySelector("canvas")!, view: controller };
}

describe("live lever tuning", () => {
  it("expands the canvas, hit area, and window clearance when the lever grows", () => {
    const { lever, canvas, view } = mount();
    const width = parseFloat(canvas.style.width);
    const height = parseFloat(canvas.style.height);
    const hitWidth = parseFloat(lever.style.width);
    const settings = createFihLeverSettings();
    settings.geometry.scale *= 2;
    settings.geometry.sphereRadius *= 1.5;
    view.setSettings(settings);
    expect(parseFloat(canvas.style.width)).toBeGreaterThan(width);
    expect(parseFloat(canvas.style.height)).toBeGreaterThan(height);
    expect(parseFloat(lever.style.width)).toBeGreaterThan(hitWidth);
    expect(Number(document.querySelector<HTMLElement>(".fih-window")!.dataset.rightOverhang)).toBeGreaterThan(78);
    view.setPull(1);
    view.reset();
    expect(canvas.style.cssText).not.toMatch(/NaN|Infinity/);
  });

  it("preserves geometry during shading edits and releases old buffers on shape edits", () => {
    const { view } = mount();
    const dispose = vi.spyOn(BufferGeometry.prototype, "dispose");
    const settings = createFihLeverSettings();
    settings.shading.smoothShading = false;
    settings.shading.sphereColor = "#123456";
    settings.shading.reflection = 0;
    view.setSettings(settings);
    expect(dispose).not.toHaveBeenCalled();
    settings.geometry.armSegments = 6;
    settings.geometry.mountSegments = 8;
    view.setSettings(settings);
    expect(dispose).toHaveBeenCalled();
  });

  it("keeps mutable menu settings independent of defaults and copies every settings group", () => {
    const settings = createFihLeverSettings();
    settings.geometry.sphereRadius = 32;
    settings.shading.metallicShading = .4;
    settings.shading.reflection = 2;
    settings.shading.smoothShading = false;
    settings.placement.verticalOffset = 20;
    settings.motion.triggerThreshold = .5;
    expect(createFihLeverSettings().geometry.sphereRadius).toBe(FIH_LEVER_GEOMETRY.sphereRadius);
    const declarations = Object.fromEntries([...exportFihLeverSettings(settings).matchAll(
      /export const (\w+) = ([\s\S]*?)(?: as const)?;/g
    )].map(([, name, value]) => [name, JSON.parse(value)]));
    expect(declarations.FIH_LEVER_GEOMETRY).toEqual(settings.geometry);
    expect(declarations.FIH_LEVER_PLACEMENT).toEqual(settings.placement);
    expect(declarations.FIH_LEVER_MOTION).toEqual(settings.motion);
    expect(declarations.FIH_LEVER_METALLIC_SHADING).toBe(.4);
    expect(declarations.FIH_LEVER_REFLECTION).toBe(2);
    const { metallicShading: _metal, reflection: _reflection, ...shading } = settings.shading;
    expect(declarations.FIH_LEVER_SHADING).toEqual(shading);
  });
});
