import { AxesHelper } from "three";
import { GUI } from "three/addons/libs/lil-gui.module.min.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { addDebugControls } from "./debug";

type DebugOptions = Omit<Parameters<typeof addDebugControls>[1], "controls" | "flocking"> & {
  canvas: HTMLCanvasElement;
  flocking: Parameters<typeof addDebugControls>[1]["flocking"] & { paused: boolean };
  onPauseChange: (paused: boolean) => void;
};

// Orbit controls, GUI code, and their DOM are only needed in debug mode.
export function createDebugPanel(options: DebugOptions) {
  const controls = new OrbitControls(options.camera, options.canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.enabled = false;
  const axes = new AxesHelper(100);
  options.scene.add(axes);
  const gui = new GUI();
  gui.add(options.flocking, "paused").name("Pause Simulation").onChange(options.onPauseChange);
  addDebugControls(gui, { ...options, controls });
  gui.close();
  return {
    setVisible(visible: boolean) {
      controls.enabled = options.flocking.paused;
      axes.visible = visible;
      if (visible) { gui.show(); gui.open(); } else gui.hide();
      gui.controllersRecursive().forEach((controller) => controller.updateDisplay());
    },
    update() { if (controls.enabled) controls.update(); },
    destroy() {
      controls.dispose(); gui.destroy(); options.scene.remove(axes);
      axes.geometry.dispose();
      if (Array.isArray(axes.material)) axes.material.forEach((material) => material.dispose());
      else axes.material.dispose();
    },
  };
}
