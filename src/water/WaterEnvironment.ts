import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Mesh,
  PlaneGeometry,
  Points,
  Scene,
  ShaderMaterial,
  Vector2,
} from "three";
import colorShader from "./colors.glsl?raw";
import waterVertexShader from "./vertex.glsl?raw";
import waterFragmentShader from "./fragment.glsl?raw";
import rayFragmentShader from "../god-ray/fragment.glsl?raw";
import particleVertexShader from "./particle-vertex.glsl?raw";
import particleFragmentShader from "./particle-fragment.glsl?raw";
import {
  BACKGROUND_GRADIENT,
  BACKGROUND_GRADIENT_BLEND,
  BUBBLE_BLUR,
  BUBBLE_DENSITY,
  BUBBLE_DRIFT,
  BUBBLE_MOBILE_BREAKPOINT,
  BUBBLE_OPACITY,
  BUBBLE_RISING_SPEED,
  BUBBLE_SIZE,
  CAMERA_SETTINGS,
  DEPTH_FOG,
  GOD_RAY_POSITION,
  GOD_RAY_STYLE,
  WATER_SURFACE,
} from "../constants";

export function withWaterColor(shader: string) {
  return shader.replace("#include <water_color>", colorShader);
}

export function createWaterEnvironment(scene: Scene) {
  const uniforms = {
    viewport: { value: new Vector2(1, 1) },
    waterTime: { value: 0 },
    deepColor: { value: new Color(BACKGROUND_GRADIENT.deep) },
    middleColor: { value: new Color(BACKGROUND_GRADIENT.middle) },
    surfaceColor: { value: new Color(BACKGROUND_GRADIENT.surface) },
    godRayPosition: { value: new Vector2(GOD_RAY_POSITION.x, GOD_RAY_POSITION.y) },
    godRayStrength: { value: GOD_RAY_STYLE.strength },
    godRaySpeed: { value: GOD_RAY_STYLE.speed },
    waterSurfaceStrength: { value: WATER_SURFACE.strength },
    waterSurfaceSpeed: { value: WATER_SURFACE.speed },
    gradientMiddleHeight: { value: BACKGROUND_GRADIENT_BLEND.middleHeight },
    gradientSurfaceStart: { value: BACKGROUND_GRADIENT_BLEND.surfaceStart },
    gradientSurfaceStrength: { value: BACKGROUND_GRADIENT_BLEND.surfaceStrength },
    fishFog: { value: new Vector2(DEPTH_FOG.near, DEPTH_FOG.fishFar) },
  };

  // Screen-space water stays continuous behind the portfolio and debug camera.
  const water = new Mesh(
    new PlaneGeometry(2, 2),
    new ShaderMaterial({
      uniforms,
      vertexShader: waterVertexShader,
      fragmentShader: withWaterColor(waterFragmentShader).replace(
        "#include <god_rays>",
        rayFragmentShader
      ),
      depthTest: false,
      depthWrite: false,
    })
  );
  water.frustumCulled = false;
  water.renderOrder = -100;
  scene.add(water);

  // Regenerating the seeded cloud preserves existing particles when density grows.
  function createParticleGeometry(count: number) {
    let randomState = 173;
    const random = () => {
      randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
      return randomState / 4294967296;
    };
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count * 4);
    for (let index = 0; index < count; index++) {
      // Interleave layers so the mobile subset keeps the same depth distribution.
      const layer = index % 10;
      const depth =
        layer === 0 ? 90 + random() * 190
          : layer < 5 ? 280 + random() * 470 : 750 + random() * 900;
      const halfHeight = Math.max(140, depth * 0.84);
      positions[index * 3] = (random() - 0.5) * depth * 2.9;
      positions[index * 3 + 1] = (random() - 0.5) * halfHeight * 2;
      positions[index * 3 + 2] = CAMERA_SETTINGS.distance - depth;
      seeds[index * 4] = random();
      seeds[index * 4 + 1] = random();
      seeds[index * 4 + 2] = random();
      seeds[index * 4 + 3] = halfHeight;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.setAttribute("particleSeed", new Float32BufferAttribute(seeds, 4));
    return geometry;
  }
  const density = { desktop: Number(BUBBLE_DENSITY.desktop), mobile: Number(BUBBLE_DENSITY.mobile) };
  let viewportWidth = 1;
  let geometry = createParticleGeometry(Math.max(density.desktop, density.mobile));

  const particleUniforms = {
    ...uniforms,
    pixelRatio: { value: 1 },
    bubbleBlur: { value: BUBBLE_BLUR },
    bubbleRiseSpeed: { value: new Vector2(BUBBLE_RISING_SPEED.min, BUBBLE_RISING_SPEED.max) },
    bubbleSpeedVariation: { value: BUBBLE_RISING_SPEED.variation },
    bubbleSize: { value: new Vector2(BUBBLE_SIZE.min, BUBBLE_SIZE.max) },
    bubbleMaxPixels: { value: BUBBLE_SIZE.maxPixels },
    bubbleOpacity: { value: new Vector2(BUBBLE_OPACITY.min, BUBBLE_OPACITY.max) },
    bubbleDrift: { value: BUBBLE_DRIFT },
    bubbleFog: { value: new Vector2(DEPTH_FOG.near, DEPTH_FOG.bubbleFar) },
  };
  const particles = new Points(
    geometry,
    new ShaderMaterial({
      uniforms: particleUniforms,
      vertexShader: particleVertexShader,
      fragmentShader: withWaterColor(particleFragmentShader),
      transparent: true,
      depthTest: true,
      depthWrite: false,
    })
  );
  particles.name = "water-particles";
  // Shader motion changes the cloud's bounds; keep camera clipping on the GPU.
  particles.frustumCulled = false;
  scene.add(particles);

  function updateParticleCount() {
    geometry.setDrawRange(0, viewportWidth <= BUBBLE_MOBILE_BREAKPOINT ? density.mobile : density.desktop);
  }

  return {
    uniforms,
    particleUniforms,
    setBubbleDensity(desktop: number, mobile: number) {
      density.desktop = Math.max(0, Math.round(desktop));
      density.mobile = Math.max(0, Math.round(mobile));
      const capacity = Math.max(density.desktop, density.mobile);
      if (capacity > geometry.getAttribute("position").count) {
        const previous = geometry;
        geometry = createParticleGeometry(capacity);
        particles.geometry = geometry;
        previous.dispose();
      }
      updateParticleCount();
    },
    update(delta: number) {
      uniforms.waterTime.value += delta;
    },
    resize(width: number, height: number, pixelRatio: number) {
      uniforms.viewport.value.set(Math.floor(width * pixelRatio), Math.floor(height * pixelRatio));
      particleUniforms.pixelRatio.value = pixelRatio;
      viewportWidth = width;
      updateParticleCount();
    },
  };
}
