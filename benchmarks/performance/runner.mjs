import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile, realpath } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { build } from "vite";
import { chromium } from "playwright";
import { createPerformanceProbe } from "./probe.mjs";

function replaceOnce(source, anchor, replacement) {
  if (source.split(anchor).length !== 2) throw new Error(`Performance instrumentation anchor changed: ${anchor}. Update the benchmark before committing.`);
  return source.replace(anchor, replacement);
}

export function instrumentMain(source, protocol) {
  let code = replaceOnce(source, "    gpuSim.compute();", "    __perf.measure('simulation', __perfStep);");
  code = replaceOnce(code, "const gpuSim = new GPUSimulation(renderer);", `
    const __perf = (${createPerformanceProbe.toString()})(renderer);
    const gpuSim = new GPUSimulation(renderer);
    const __perfStep = () => {
      gpuSim.positionUniforms.delta.value = ${protocol.stepSeconds};
      gpuSim.velocityUniforms.delta.value = ${protocol.stepSeconds};
      gpuSim.velocityUniforms.predator.value.set(10, 10, 0);
      gpuSim.compute();
    };`);
  code = replaceOnce(code, "const firebaseConfig = readFirebaseConfig(import.meta.env, import.meta.env.DEV);", "const firebaseConfig = null;");
  code = replaceOnce(code, "renderer.setAnimationLoop(() => {", "renderer.setAnimationLoop(() => {\nconst __frameStart = performance.now();\n__perf.tick();");
  code = replaceOnce(code, "water.update(delta);", `water.update(${protocol.stepSeconds});`);
  code = replaceOnce(code, "  renderer.render(scene, camera);", "  __perf.measure('draw', () => renderer.render(scene, camera));\n__perf.endFrame(__frameStart);");
  return code + `
    (window as any).__aquariumPerf = {
      probe: __perf,
      get ready() { return creator !== null; },
      get count() { return school.totalCount; },
      async configure(workload: { prefill: SharedFih[]; entries: SharedFih[]; ageSteps: number }) {
        if (workload.prefill.length) { sharedEntries = workload.prefill; refreshSchool(); }
        sharedEntries = workload.entries; refreshSchool();
        __perfStep(); await gpuSim.prepareSpatialGrid?.();
        // Reset after asynchronous setup so startup frame counts cannot change
        // the 60-second workload's initial state between repetitions.
        const simulation = gpuSim as any;
        for (const target of simulation.positionVariable.renderTargets) simulation.gpuCompute.renderTexture(simulation.initialPosition, target);
        for (const target of simulation.velocityVariable.renderTargets) simulation.gpuCompute.renderTexture(simulation.initialVelocity, target);
        water.uniforms.waterTime.value = 0;
        for (let i = 0; i < workload.ageSteps; i++) __perfStep();
        renderer.getContext().finish(); // Warm-up only, never inside timed frames.
        lastTime = performance.now();
      },
    };`;
}

async function serve(directories) {
  const roots = Object.fromEntries(await Promise.all(Object.entries(directories).map(async ([name, directory]) => [name, await realpath(directory)])));
  const requested = Object.fromEntries(Object.keys(roots).map(name => [name, new Set()]));
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".woff": "font/woff", ".woff2": "font/woff2" };
  const server = createServer(async (request, response) => {
    try {
      const parts = decodeURIComponent(new URL(request.url, "http://localhost").pathname).split("/").filter(Boolean);
      const referer = request.headers.referer ? new URL(request.headers.referer).pathname.split("/")[1] : null;
      const name = roots[parts[0]] ? parts.shift() : roots[referer] ? referer : "candidate";
      const root = roots[name];
      const file = await realpath(join(root, parts.length ? parts.join("/") : "index.html"));
      if (!file.startsWith(`${root}${sep}`)) throw new Error("Path outside benchmark build");
      requested[name].add(relative(root, file).split(sep).join("/"));
      const extension = file.slice(file.lastIndexOf("."));
      response.writeHead(200, { "Content-Type": types[extension] ?? "application/octet-stream", "Cache-Control": "no-store", "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "require-corp" });
      response.end(await readFile(file));
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise((accept, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", accept); });
  return { server, requested, origin: `http://127.0.0.1:${server.address().port}` };
}

const design = { shape: "classic", finShape: "triangle", headShape: "pointed", color: "#25a4aa", finColor: null, headColor: null, finSize: 1, bodySize: 1, headSize: 1, pattern: "plain", count: 10 };
const entries = count => Array.from({ length: count }, (_, index) => ({ ownerId: String(index), updatedAt: index + 1, design: { ...design } }));

async function waitFrames(page, count) {
  const target = await page.evaluate(n => window.__aquariumPerf.probe.frame + n, count);
  await page.waitForFunction(frame => window.__aquariumPerf.probe.frame >= frame, target, { polling: "raf", timeout: 30000 });
}

export async function measureApplication(root, temporary, protocol, onEnvironment, referenceDirectory = null) {
  const output = join(temporary, "build");
  const mainPath = resolve(root, "src/main.ts");
  await build({ root, base: "./", configFile: existsSync(join(root, "vite.config.ts")) ? join(root, "vite.config.ts") : false, logLevel: "error",
    build: { outDir: output, emptyOutDir: true },
    plugins: [{ name: "performance-probe", enforce: "pre", transform(code, id) { if (id.split("?")[0].replaceAll("\\", "/") === mainPath.replaceAll("\\", "/")) return instrumentMain(code, protocol); } }],
  });
  const { server, origin, requested } = await serve({ candidate: output, ...(referenceDirectory ? { reference: referenceDirectory } : {}) });
  let browser;
  const runs = [];
  const referenceRuns = [];
  let environment;
  try {
    const angle = process.env.AQUARIUM_PERF_ANGLE ?? (process.platform === "linux" ? "gl" : "default");
    browser = await chromium.launch({ headless: true,
      ...(process.env.AQUARIUM_PERF_BROWSER ? { executablePath: process.env.AQUARIUM_PERF_BROWSER } : { channel: "chromium" }),
      args: ["--enable-gpu", "--ignore-gpu-blocklist", ...(angle === "default" ? [] : ["--use-gl=angle", `--use-angle=${angle}`])],
    });
    for (let repetition = 0; repetition < protocol.repetitions; repetition++) {
      const cases = repetition % 2 ? [...protocol.scenarios].reverse() : protocol.scenarios;
      for (const scenario of cases) {
        const variants = referenceDirectory ? repetition % 2 ? ["candidate", "reference"] : ["reference", "candidate"] : ["candidate"];
        for (const variant of variants) {
        const context = await browser.newContext({ viewport: scenario.viewport ?? protocol.viewport, deviceScaleFactor: scenario.deviceScaleFactor ?? protocol.deviceScaleFactor, serviceWorkers: "block" });
        try {
          await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
          const page = await context.newPage();
          const errors = [];
          page.on("pageerror", error => errors.push(error.message));
          page.on("console", message => { if (message.type() === "error" && /THREE|WebGL|shader|GPU/i.test(message.text())) errors.push(message.text()); });
          await page.addInitScript(seed => { let state = seed; Math.random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; }; }, protocol.seed);
          await page.goto(`${origin}/${variant}/`, { waitUntil: "load" });
          await page.waitForFunction(() => window.__aquariumPerf?.ready, null, { timeout: 20000 });
          const capabilities = await page.evaluate(() => window.__aquariumPerf.probe.environment);
          if (!capabilities.timer || /swiftshader|llvmpipe|softpipe|software renderer/i.test(capabilities.gpu)) {
            throw new Error("A hardware WebGL2 GPU and EXT_disjoint_timer_query_webgl2 are required; software/CPU-only timing cannot pass this gate.");
          }
          const actualEnvironment = { ...capabilities, browser: browser.version(), platform: process.platform, angle };
          if (!environment) { environment = actualEnvironment; onEnvironment(environment); }
          else if (JSON.stringify(environment) !== JSON.stringify(actualEnvironment)) throw new Error("GPU/browser changed during paired measurements.");
          await page.evaluate(value => window.__aquariumPerf.configure(value), { prefill: entries(scenario.prefill ?? 0), entries: entries(scenario.groups), ageSteps: scenario.ageSteps ?? 0 });
          const count = await page.evaluate(() => window.__aquariumPerf.count);
          if (count !== scenario.expectedCount) throw new Error(`Wrong workload for ${scenario.name}: expected ${scenario.expectedCount} fih, got ${count}.`);
          await waitFrames(page, protocol.warmupFrames);
          await page.evaluate(() => window.__aquariumPerf.probe.start());
          await waitFrames(page, protocol.sampleFrames);
          await page.evaluate(() => window.__aquariumPerf.probe.stop());
          await page.waitForFunction(() => window.__aquariumPerf.probe.pending === 0, null, { polling: "raf", timeout: 15000 });
          const samples = await page.evaluate(() => window.__aquariumPerf.probe.collect());
          if (errors.length) throw new Error(`Browser/shader error: ${errors.join("\n")}`);
          if (samples.drawGPU.length !== samples.drawCPU.length || samples.simulationGPU.length !== samples.drawGPU.length) {
            throw new Error("Incomplete GPU timing queries or missing simulation steps.");
          }
          (variant === "candidate" ? runs : referenceRuns).push({ scenario: scenario.name, repetition, samples });
          console.log(`  ${scenario.name} ${variant}: run ${repetition + 1}/${protocol.repetitions} (${samples.drawGPU.length} frames)`);
        } finally { await context.close(); }
        }
      }
    }
    return { environment, runs, referenceRuns, buildDirectory: output, requestedFiles: requested.candidate };
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
