// Serialized into temporary production builds only; no production globals or
// instrumentation are shipped by the normal Vite build.
export function createPerformanceProbe(renderer) {
  const gl = renderer.getContext();
  const timer = gl.getExtension("EXT_disjoint_timer_query_webgl2");
  const debug = gl.getExtension("WEBGL_debug_renderer_info");
  const environment = {
    gpu: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
    timer: Boolean(timer),
    floatBlend: Boolean(gl.getExtension("EXT_float_blend")),
    parallelCompile: Boolean(gl.getExtension("KHR_parallel_shader_compile")),
  };
  let enabled = false, frame = 0, generation = 0, lastFrame = 0, error = null;
  let pending = [];
  let samples = {};
  const reset = () => {
    samples = Object.fromEntries(["simulationGPU", "simulationCPU", "drawGPU", "drawCPU", "frameCPU", "frameInterval"].map(key => [key, []]));
  };
  reset();
  function poll() {
    if (gl.isContextLost()) error = "WebGL context was lost.";
    if (pending.length && gl.getParameter(timer.GPU_DISJOINT_EXT)) error = "GPU timings were disjoint; rerun on an idle GPU.";
    pending = pending.filter(item => {
      if (!error && !gl.getQueryParameter(item.query, gl.QUERY_RESULT_AVAILABLE)) return true;
      if (!error && item.generation === generation) samples[`${item.kind}GPU`].push(gl.getQueryParameter(item.query, gl.QUERY_RESULT) / 1e6);
      gl.deleteQuery(item.query);
      return false;
    });
  }
  return {
    environment,
    get frame() { return frame; },
    get pending() { return pending.filter(item => item.generation === generation).length; },
    tick() {
      poll();
      const now = performance.now();
      if (enabled && lastFrame) samples.frameInterval.push(now - lastFrame);
      lastFrame = now;
      frame++;
    },
    measure(kind, callback) {
      const query = enabled && timer ? gl.createQuery() : null;
      if (enabled && !query) error = "GPU timer query could not be created.";
      if (query) gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
      const start = performance.now();
      try { callback(); } finally {
        if (enabled) samples[`${kind}CPU`].push(performance.now() - start);
        if (query) { gl.endQuery(timer.TIME_ELAPSED_EXT); pending.push({ kind, query, generation }); }
      }
    },
    endFrame(start) { if (enabled) samples.frameCPU.push(performance.now() - start); },
    start() { generation++; reset(); lastFrame = 0; enabled = true; },
    stop() { enabled = false; },
    collect() { poll(); if (error) throw new Error(error); return samples; },
  };
}
