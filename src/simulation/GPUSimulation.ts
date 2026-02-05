// filepath: c:\code\aquarium\src\simulation\GPUSimulation.ts
import { WebGLRenderer, Vector3, RepeatWrapping, Texture } from "three";
import { GPUComputationRenderer } from "three/examples/jsm/misc/GPUComputationRenderer.js";
import { BOUNDS, BOUNDS_HALF, WIDTH } from "../constants";
import fragmentShaderPosition from "../shader/position.glsl?raw";
import fragmentShaderVelocity from "../shader/velocity.glsl?raw";

export class GPUSimulation {
  gpuCompute: GPUComputationRenderer;
  velocityVariable: any;
  positionVariable: any;
  positionUniforms: any;
  velocityUniforms: any;

  constructor(renderer: WebGLRenderer) {
    this.gpuCompute = new GPUComputationRenderer(WIDTH, WIDTH, renderer);
    this.init();
  }

  private init() {
    const dtPosition = this.gpuCompute.createTexture();
    const dtVelocity = this.gpuCompute.createTexture();
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

    const error = this.gpuCompute.init();
    if (error !== null) {
      console.error(error);
    }
  }

  private initUniforms() {
    this.positionUniforms["time"] = { value: 0.0 };
    this.positionUniforms["delta"] = { value: 0.0 };
    this.velocityUniforms["time"] = { value: 1.0 };
    this.velocityUniforms["delta"] = { value: 0.0 };
    this.velocityUniforms["testing"] = { value: 1.0 };
    this.velocityUniforms["separationDistance"] = { value: 1.0 };
    this.velocityUniforms["alignmentDistance"] = { value: 1.0 };
    this.velocityUniforms["cohesionDistance"] = { value: 1.0 };
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
    this.gpuCompute.compute();
  }

  getCurrentPositionTexture(): Texture {
    return this.gpuCompute.getCurrentRenderTarget(this.positionVariable).texture;
  }

  getCurrentVelocityTexture(): Texture {
    return this.gpuCompute.getCurrentRenderTarget(this.velocityVariable).texture;
  }
}
