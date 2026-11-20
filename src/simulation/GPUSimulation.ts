import { WebGLRenderer, Vector3, RepeatWrapping, Texture, DataTexture, RedFormat, RGFormat, FloatType, ShaderMaterial } from "three";
import { GPUComputationRenderer } from "three/examples/jsm/misc/GPUComputationRenderer.js";
import { BOUNDS, BOUNDS_HALF, FIH_FLOCKING, INITIAL_FIH, WIDTH } from "../constants";
import fragmentShaderPosition from "../fih/shader/position.glsl?raw";
import fragmentShaderVelocity from "../fih/shader/velocity.glsl?raw";
import { SpatialGrid, GRID_MIN_FIH, GRID_SIDE, GRID_SLOTS_PER_WORD, GRID_WORDS } from "./SpatialGrid";

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
  private activeSlotMask = new Uint8Array(WIDTH * WIDTH);
  private activeSlots = new DataTexture(this.activeSlotMask, WIDTH, WIDTH, RedFormat);
  private activeSlotCoordinates = new Float32Array(WIDTH * WIDTH * 2);
  private activeReferences = new DataTexture(this.activeSlotCoordinates, WIDTH, WIDTH, RGFormat, FloatType);
  private renderer: WebGLRenderer;
  private grid: SpatialGrid | null = null;
  private slots: number[] = [];
  private densityProbeMask = new Uint32Array(4);
  private supportsSpatialGrid: boolean | null = null;
  private directVelocityMaterial!: ShaderMaterial;
  private gridVelocityMaterial: ShaderMaterial | null = null;
  private gridCompilation: Promise<void> | null = null;
  private gridReady = false;
  private disposed = false;

  constructor(renderer: WebGLRenderer) {
    this.renderer = renderer;
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
    this.directVelocityMaterial = this.velocityVariable.material;

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
    this.velocityUniforms["activeSlots"] = { value: this.activeSlots };
    this.velocityUniforms["activeReferences"] = { value: this.activeReferences };
    this.velocityUniforms["contiguousActiveSlots"] = { value: true };
    this.velocityUniforms["useSpatialGrid"] = { value: false };
    this.velocityUniforms["spatialGrid"] = { value: null };
    this.velocityUniforms["gridCellSize"] = { value: 120 };
    this.velocityUniforms["gridWordCount"] = { value: GRID_WORDS };
    this.velocityUniforms["densityProbeWord"] = { value: 0 };
    this.velocityUniforms["densityProbeMask"] = { value: this.densityProbeMask };
    this.velocityVariable.material.defines.GRID_SIDE = GRID_SIDE.toFixed(1);
    this.velocityVariable.material.defines.GRID_WORDS = GRID_WORDS.toFixed(1);
    this.velocityVariable.material.defines.USE_SPATIAL_GRID = 0;
    this.positionUniforms["activeSlots"] = { value: this.activeSlots };
    this.positionUniforms["activeCount"] = this.velocityUniforms["activeCount"];
    this.positionUniforms["contiguousActiveSlots"] = this.velocityUniforms["contiguousActiveSlots"];
    this.setActiveSlots(Array.from({ length: INITIAL_FIH }, (_, slot) => slot));
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

  setActiveSlots(slots: readonly number[]) {
    const mask = this.activeSlotMask;
    mask.fill(0);
    let upperBound = 0;
    const sorted = [...slots].sort((a, b) => a - b);
    const wordCounts = new Uint16Array(GRID_WORDS);
    const wordMasks = new Uint32Array(GRID_WORDS * 4);
    this.slots = sorted;
    this.grid?.setActiveSlots(sorted);
    this.activeSlotCoordinates.fill(0);
    for (let index = 0; index < sorted.length; index++) {
      const slot = sorted[index];
      const word = Math.floor(slot / GRID_SLOTS_PER_WORD);
      wordCounts[word]++;
      wordMasks[word * 4 + Math.floor((slot % GRID_SLOTS_PER_WORD) / 24)] |= 1 << (slot % 24);
      mask[slot] = 255;
      upperBound = Math.max(upperBound, slot + 1);
      this.activeSlotCoordinates[index * 2] = ((slot % WIDTH) + .5) / WIDTH;
      this.activeSlotCoordinates[index * 2 + 1] = (Math.floor(slot / WIDTH) + .5) / WIDTH;
    }
    this.activeSlots.needsUpdate = true;
    this.activeReferences.needsUpdate = true;
    // Dense schools use direct coordinates. Sparse schools visit only occupied
    // slots through this compact list, without moving any simulation state.
    this.velocityUniforms.activeCount.value = sorted.length;
    this.velocityUniforms.contiguousActiveSlots.value = upperBound === sorted.length;
    this.velocityUniforms.gridWordCount.value = Math.ceil(upperBound / GRID_SLOTS_PER_WORD);
    // Probe the most populated word to choose between two exact neighbor kernels
    // when the school concentrates. This changes work selection, never physics.
    let probeWord = 0;
    for (let word = 1; word < GRID_WORDS; word++) if (wordCounts[word] > wordCounts[probeWord]) probeWord = word;
    this.velocityUniforms.densityProbeWord.value = probeWord;
    this.densityProbeMask.set(wordMasks.subarray(probeWord * 4, probeWord * 4 + 4));
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
    if (this.disposed) return;
    if (this.initializationError !== null) return;
    if (!this.initialized) {
      this.initializationError = this.gpuCompute.init();
      if (this.initializationError !== null) {
        console.error(this.initializationError);
        return;
      }
      this.initialized = true;
    }
    const radius = this.velocityUniforms.separationDistance.value +
      this.velocityUniforms.alignmentDistance.value + this.velocityUniforms.cohesionDistance.value;
    // Small schools and wide interaction radii favor the direct loop. The grid
    // remains optional on WebGL2 hardware without additive float blending.
    const eligible = this.slots.length >= GRID_MIN_FIH && radius > 0 && radius <= BOUNDS / GRID_SIDE;
    if (eligible && this.supportsSpatialGrid === null) {
      this.supportsSpatialGrid = this.renderer.extensions.has("EXT_float_blend") &&
        this.renderer.extensions.has("KHR_parallel_shader_compile");
    }
    if (eligible && this.supportsSpatialGrid === true) void this.prepareSpatialGrid();
    const useGrid = eligible && this.gridReady;
    this.velocityUniforms.useSpatialGrid.value = useGrid;
    this.velocityVariable.material = useGrid ? this.gridVelocityMaterial! : this.directVelocityMaterial;
    if (useGrid) {
      // A small rounding margin keeps a diameter within two cells per axis.
      const cellSize = Math.max(radius * 2 + .001, BOUNDS / GRID_SIDE);
      this.velocityUniforms.gridCellSize.value = cellSize;
      this.grid!.update(this.renderer, this.getCurrentPositionTexture(), cellSize);
    }
    this.gpuCompute.compute();
  }

  // Keep the compact direct kernel running while optional programs compile.
  // This promise is also useful when explicitly warming a large school.
  prepareSpatialGrid(): Promise<void> {
    if (this.gridCompilation) return this.gridCompilation;
    if (!this.initialized || this.supportsSpatialGrid !== true || this.disposed) return Promise.resolve();
    this.grid = new SpatialGrid();
    this.grid.setActiveSlots(this.slots);
    this.velocityUniforms.spatialGrid.value = this.grid.target.texture;
    this.gridVelocityMaterial = this.directVelocityMaterial.clone();
    this.gridVelocityMaterial.uniforms = this.velocityUniforms;
    this.gridVelocityMaterial.defines.USE_SPATIAL_GRID = 1;
    try {
      this.gridCompilation = this.grid.compile(this.renderer, this.gridVelocityMaterial,
        this.gpuCompute.getCurrentRenderTarget(this.velocityVariable))
        .then(() => { if (!this.disposed) this.gridReady = true; })
        .catch(() => { this.supportsSpatialGrid = false; });
    } catch {
      this.supportsSpatialGrid = false;
      this.gridCompilation = Promise.resolve();
    }
    return this.gridCompilation;
  }

  getCurrentPositionTexture(): Texture {
    return this.initialized ? this.gpuCompute.getCurrentRenderTarget(this.positionVariable).texture : this.initialPosition;
  }

  getCurrentVelocityTexture(): Texture {
    return this.initialized ? this.gpuCompute.getCurrentRenderTarget(this.velocityVariable).texture : this.initialVelocity;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const disposeGrid = () => { this.grid?.dispose(); this.gridVelocityMaterial?.dispose(); };
    // compileAsync still polls these materials until its promise settles.
    if (this.gridCompilation && !this.gridReady) void this.gridCompilation.finally(disposeGrid);
    else disposeGrid();
    this.activeSlots.dispose();
    this.activeReferences.dispose();
    this.positionVariable.material.dispose();
    this.directVelocityMaterial.dispose();
    this.gpuCompute.dispose();
  }
}
