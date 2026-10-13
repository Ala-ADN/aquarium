export const WIDTH = 32;
export const MAX_FIH = WIDTH * WIDTH;
export const BOUNDS = 800;
export const BOUNDS_HALF = BOUNDS / 2;
export const DEFAULT_FIN_SIZE = 2;
export const FIH_INTERVAL_MS = 10_000;
export const MAX_VISITOR_FIH = 10;

// Edit these values to tune the open-water backdrop.
export const BACKGROUND_GRADIENT = {
  deep: "#086c92",
  middle: "#35b8c6",
  surface: "#c9fcf1",
} as const;

// Maximum visible particles at each viewport size.
export const BUBBLE_DENSITY = {
  desktop: 600,
  mobile: 300,
} as const;
export const BUBBLE_MOBILE_BREAKPOINT = 560;

// Normalized screen coordinates: (0, 0) is bottom-left; (1, 1) is top-right.
// The light drifts around this position while the scene animates.
export const GOD_RAY_POSITION = { x: 0.3, y: 1.2 } as const;
