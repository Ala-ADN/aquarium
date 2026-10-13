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
  BUBBLE_DENSITY,
  BUBBLE_MOBILE_BREAKPOINT,
  GOD_RAY_POSITION,
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

  // A seeded 3D cloud, independent of screen coordinates and viewport size.
  let randomState = 173;
  const random = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 4294967296;
  };
  const particleCapacity = Math.max(BUBBLE_DENSITY.desktop, BUBBLE_DENSITY.mobile);
  const positions = new Float32Array(particleCapacity * 3);
  const seeds = new Float32Array(particleCapacity * 4);
  for (let index = 0; index < particleCapacity; index++) {
    // Interleave layers so the mobile subset keeps the same depth distribution.
    const layer = index % 10;
    const depth =
      layer === 0 ? 90 + random() * 190
        : layer < 5 ? 280 + random() * 470 : 750 + random() * 900;
    const halfHeight = Math.max(140, depth * 0.84);
    positions[index * 3] = (random() - 0.5) * depth * 2.9;
    positions[index * 3 + 1] = (random() - 0.5) * halfHeight * 2;
    positions[index * 3 + 2] = 350 - depth;
    seeds[index * 4] = random();
    seeds[index * 4 + 1] = random();
    seeds[index * 4 + 2] = random();
    seeds[index * 4 + 3] = halfHeight;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("particleSeed", new Float32BufferAttribute(seeds, 4));

  const particleUniforms = {
    ...uniforms,
    pixelRatio: { value: 1 },
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

  return {
    uniforms,
    update(delta: number) {
      uniforms.waterTime.value += delta;
    },
    resize(width: number, height: number, pixelRatio: number) {
      uniforms.viewport.value.set(Math.floor(width * pixelRatio), Math.floor(height * pixelRatio));
      particleUniforms.pixelRatio.value = pixelRatio;
      geometry.setDrawRange(
        0,
        width <= BUBBLE_MOBILE_BREAKPOINT ? BUBBLE_DENSITY.mobile : BUBBLE_DENSITY.desktop
      );
    },
  };
}
