// filepath: c:\code\aquarium\src\simulation\GPUSimulation.ts
import { WebGLRenderer, Vector3, RepeatWrapping, Texture } from "three";
import { GPUComputationRenderer } from "three/examples/jsm/misc/GPUComputationRenderer.js";
import { BOUNDS, BOUNDS_HALF, FIH_FLOCKING, INITIAL_FIH, WIDTH } from "../constants";
import fragmentShaderPosition from "../fih/shader/position.glsl?raw";
import fragmentShaderVelocity from "../fih/shader/velocity.glsl?raw";

export class GPUSimulation {
  gpuCompute: GPUComputationRenderer;
  velocityVariable: any;
  positionVariable: any;
  positionUniforms: any;
  velocityUniforms: any;
  private initialPosition: Texture;
  private initialVelocity: Texture;
  private initialized = false;
  private initializationError: string | null = null;

  constructor(renderer: WebGLRenderer) {
    this.gpuCompute = new GPUComputationRenderer(WIDTH, WIDTH, renderer);
    this.initialPosition = this.gpuCompute.createTexture();
    this.initialVelocity = this.gpuCompute.createTexture();
    this.init();
  }

  private init() {
    const dtPosition = this.initialPosition;
    const dtVelocity = this.initialVelocity;
    this.fillPositionTexture(dtPosition);
    this.fillVelocityTexture(dtVelocity);

    this.velocityVariable = this.gpuCompute.addVariable(
      "textureVelocity",
      fragmentShaderVelocity,
      dtVelocity
    );
    this.positionVariable = this.gpuCompute.addVariable(
      "texturePosition",
      fragmentShaderPosition,
      dtPosition
    );

    this.gpuCompute.setVariableDependencies(this.velocityVariable, [
      this.positionVariable,
      this.velocityVariable,
    ]);
    this.gpuCompute.setVariableDependencies(this.positionVariable, [
      this.positionVariable,
      this.velocityVariable,
    ]);

    this.positionUniforms = this.positionVariable.material.uniforms;
    this.velocityUniforms = this.velocityVariable.material.uniforms;

    this.initUniforms();
    this.velocityVariable.wrapS = RepeatWrapping;
    this.velocityVariable.wrapT = RepeatWrapping;
    this.positionVariable.wrapS = RepeatWrapping;
    this.positionVariable.wrapT = RepeatWrapping;

    // Initial data textures can draw the tank immediately. Allocate ping-pong
    // targets and compile the copy/compute passes only when simulation starts.
  }

  private initUniforms() {
    this.positionUniforms["time"] = { value: 0.0 };
    this.positionUniforms["delta"] = { value: 0.0 };
    this.velocityUniforms["time"] = { value: 1.0 };
    this.velocityUniforms["activeCount"] = { value: INITIAL_FIH };
    this.velocityUniforms["delta"] = { value: 0.0 };
    this.velocityUniforms["testing"] = { value: 1.0 };
    this.velocityUniforms["separationDistance"] = { value: FIH_FLOCKING.separation };
    this.velocityUniforms["alignmentDistance"] = { value: FIH_FLOCKING.alignment };
    this.velocityUniforms["cohesionDistance"] = { value: FIH_FLOCKING.cohesion };
    this.velocityUniforms["speedLimit"] = { value: FIH_FLOCKING.speedLimit };
    this.velocityUniforms["freedomFactor"] = { value: 1.0 };
    this.velocityUniforms["predator"] = { value: new Vector3() };
    this.velocityVariable.material.defines.BOUNDS = BOUNDS.toFixed(2);
  }

  private fillPositionTexture(texture: Texture) {
    const theArray = (texture.image as any).data;
    for (let k = 0, kl = theArray.length; k < kl; k += 4) {
      theArray[k + 0] = Math.random() * BOUNDS - BOUNDS_HALF;
      theArray[k + 1] = Math.random() * BOUNDS - BOUNDS_HALF;
      theArray[k + 2] = Math.random() * BOUNDS - BOUNDS_HALF;
      theArray[k + 3] = 1;
    }
  }

  private fillVelocityTexture(texture: Texture) {
    const theArray = (texture.image as any).data;
    for (let k = 0, kl = theArray.length; k < kl; k += 4) {
      theArray[k + 0] = (Math.random() - 0.5) * 10;
      theArray[k + 1] = (Math.random() - 0.5) * 10;
      theArray[k + 2] = (Math.random() - 0.5) * 10;
      theArray[k + 3] = 1;
    }
  }

  compute() {
    if (this.initializationError !== null) return;
    if (!this.initialized) {
      this.initializationError = this.gpuCompute.init();
      if (this.initializationError !== null) {
        console.error(this.initializationError);
        return;
      }
      this.initialized = true;
    }
    this.gpuCompute.compute();
  }

  getCurrentPositionTexture(): Texture {
    return this.initialized ? this.gpuCompute.getCurrentRenderTarget(this.positionVariable).texture : this.initialPosition;
  }

  getCurrentVelocityTexture(): Texture {
    return this.initialized ? this.gpuCompute.getCurrentRenderTarget(this.velocityVariable).texture : this.initialVelocity;
  }
}
