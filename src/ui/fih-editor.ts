import { mountFihCreator } from "./fih-creator";
import { createFihLivePreview } from "./fih-live-preview";
import type { FihDesign } from "../types";
import type { createWaterEnvironment } from "../water/WaterEnvironment";

// Loaded after the tank's first frame, including the editor's window CSS.
export function mountFihEditor(options: {
  onDisplay: (design: FihDesign) => void;
  water: ReturnType<typeof createWaterEnvironment>["uniforms"];
  isPaused: () => boolean;
  onRelease: (design: FihDesign) => void;
  onRetry: () => void;
}) {
  return mountFihCreator(options.onDisplay,
    (canvas, appearance) => createFihLivePreview(canvas, appearance, options), options);
}
