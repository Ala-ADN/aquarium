import {
  AddEquation, BufferAttribute, BufferGeometry, Color, CustomBlending,
  FloatType, Mesh, NearestFilter, OneFactor, OrthographicCamera, PlaneGeometry, Points,
  Scene, ShaderMaterial, WebGLRenderTarget,
} from "three";
import type { Texture, WebGLRenderer } from "three";
import { WIDTH } from "../constants";
import vertexShader from "./grid-vertex.glsl?raw";
import fragmentShader from "./grid-fragment.glsl?raw";

export const GRID_SIDE = 8;
// Four exactly representable 24-bit integers per RGBA32F texel.
// Each occupied slot adds one distinct bit, so even a full cell cannot overflow.
export const GRID_SLOTS_PER_WORD = 96;
export const GRID_WORDS = Math.ceil(WIDTH * WIDTH / GRID_SLOTS_PER_WORD);
export const GRID_MIN_FIH = 256;

export class SpatialGrid {
  readonly target = new WebGLRenderTarget(GRID_SIDE * GRID_WORDS, GRID_SIDE * GRID_SIDE, {
    type: FloatType, minFilter: NearestFilter, magFilter: NearestFilter,
    depthBuffer: false, stencilBuffer: false,
  });
  private scene = new Scene();
  private camera = new OrthographicCamera();
  private previousColor = new Color();
  private coordinates = new Float32Array(WIDTH * WIDTH * 3);
  private vertices = new BufferAttribute(this.coordinates, 3);
  private geometry = new BufferGeometry().setAttribute("position", this.vertices);
  private material = new ShaderMaterial({
    vertexShader, fragmentShader,
    defines: { GRID_SIDE: GRID_SIDE.toFixed(1), GRID_WORDS: GRID_WORDS.toFixed(1) },
    uniforms: { texturePosition: { value: null }, cellSize: { value: 120 } },
    blending: CustomBlending, blendEquation: AddEquation, blendSrc: OneFactor, blendDst: OneFactor,
    transparent: true, depthTest: false, depthWrite: false,
  });

  constructor() {
    const points = new Points(this.geometry, this.material);
    points.frustumCulled = false;
    points.matrixAutoUpdate = false;
    points.updateMatrix();
    this.scene.add(points);
  }

  compile(renderer: WebGLRenderer, velocityMaterial: ShaderMaterial, computeTarget: WebGLRenderTarget) {
    const quad = new Mesh(new PlaneGeometry(2, 2), velocityMaterial);
    this.scene.add(quad);
    const previousTarget = renderer.getRenderTarget();
    const cleanup = () => { this.scene.remove(quad); quad.geometry.dispose(); };
    try {
      // Match the compute pass's output color space so its cached program is
      // reused when the kernel activates, rather than compiled a second time.
      renderer.setRenderTarget(computeTarget);
      return renderer.compileAsync(this.scene, this.camera).finally(cleanup);
    } catch (error) {
      cleanup();
      throw error;
    } finally {
      renderer.setRenderTarget(previousTarget);
    }
  }

  setActiveSlots(slots: readonly number[]) {
    for (let index = 0; index < slots.length; index++) {
      const slot = slots[index];
      this.coordinates[index * 3] = ((slot % WIDTH) + .5) / WIDTH;
      this.coordinates[index * 3 + 1] = (Math.floor(slot / WIDTH) + .5) / WIDTH;
      this.coordinates[index * 3 + 2] = slot;
    }
    this.vertices.needsUpdate = true;
    this.geometry.setDrawRange(0, slots.length);
  }

  update(renderer: WebGLRenderer, position: Texture, cellSize: number) {
    this.material.uniforms.texturePosition.value = position;
    this.material.uniforms.cellSize.value = cellSize;
    const previousTarget = renderer.getRenderTarget();
    renderer.getClearColor(this.previousColor);
    const previousAlpha = renderer.getClearAlpha();
    const previousAutoClear = renderer.autoClear;
    try {
      renderer.autoClear = true;
      renderer.setClearColor(0, 0);
      renderer.setRenderTarget(this.target);
      renderer.render(this.scene, this.camera);
    } finally {
      renderer.setRenderTarget(previousTarget);
      renderer.setClearColor(this.previousColor, previousAlpha);
      renderer.autoClear = previousAutoClear;
    }
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.target.dispose();
  }
}
