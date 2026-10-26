export const WIDTH = 32;
// The simulation texture has 1024 slots; at most 1000 are visible.
export const MAX_FIH = 1000;
export const INITIAL_FIH = 30;
// Time for newly loaded or released fih to become fully visible; 0 disables fading.
export const FIH_FADE_IN_MS = 600;
export const BOUNDS = 800;
export const BOUNDS_HALF = BOUNDS / 2;
export const DEFAULT_FIN_SIZE = 2;
export const FIH_EARNING_DURATION_MS = 600_000;
export const MAX_VISITOR_FIH = 10;
// sRGB midpoint of the seeded school's teal color variation.
export const DEFAULT_FIH_COLOR = "#25a4aa";
export const FIH_FIN_SHADE = 0.65;

// Camera distance is in world units; FOV is in degrees.
export const CAMERA_SETTINGS = { fov: 75, distance: 350 } as const;
export const MAX_RENDER_PIXEL_RATIO = 1.5;

export const FIH_FLOCKING = {
  separation: 20,
  alignment: 20,
  cohesion: 20,
  speedLimit: 9,
} as const;

// Spring speeds, tilt in degrees, parallax in pixels per degree, keyboard step in pixels.
export const WINDOW_MOTION = {
  speed: 50,
  dragSpeedMultiplier: 5,
  tilt: 6,
  parallax: 2,
  keyboardStep: 16,
} as const;

// Edit these values to tune the open-water backdrop.
export const BACKGROUND_GRADIENT = {
  deep: "#086c92",
  middle: "#35b8c6",
  surface: "#c9fcf1",
} as const;

// Heights are normalized from bottom (0) to top (1).
export const BACKGROUND_GRADIENT_BLEND = {
  middleHeight: 0.7,
  surfaceStart: 0.8,
  surfaceStrength: 0.7,
} as const;

// Multipliers: 1 keeps the current look; 0 disables the strength or motion.
export const GOD_RAY_STYLE = { strength: 1, speed: 1 } as const;
export const WATER_SURFACE = { strength: 1, speed: 1 } as const;

// Camera-space distance at which objects start fading and become fully hazy.
export const DEPTH_FOG = { near: 160, fishFar: 1000, bubbleFar: 1500 } as const;

// Maximum visible particles at each viewport size.
export const BUBBLE_DENSITY = {
  desktop: 400,
  mobile: 200,
} as const;
export const BUBBLE_MOBILE_BREAKPOINT = 560;

// 0 = crisp glass outlines; 1 = fully soft bubbles.
export const BUBBLE_BLUR = 0.1;

// World units per second, with a small variation between particles.
export const BUBBLE_RISING_SPEED = { min: 15, max: 35, variation: 0.15 } as const;

// World-space size range and maximum screen size in CSS pixels.
export const BUBBLE_SIZE = { min: 1, max: 4.5, maxPixels: 28 } as const;
export const BUBBLE_OPACITY = { min: 0.22, max: 0.48 } as const;
// Multiplier for sideways/depth drift and the gentle vertical wobble.
export const BUBBLE_DRIFT = 1;

// Normalized screen coordinates: (0, 0) is bottom-left; (1, 1) is top-right.
// The light drifts around this position while the scene animates.
export const GOD_RAY_POSITION = { x: 0.3, y: 1.2 } as const;
