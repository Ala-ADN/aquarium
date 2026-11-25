import { afterEach, describe, expect, it, vi } from "vitest";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { compareBaseline, quantile, summarize } from "../benchmarks/performance/policy.mjs";
import { affectsPerformance, changedStagedFiles, stageSnapshot } from "../benchmarks/performance/snapshot.mjs";
import { instrumentMain } from "../benchmarks/performance/runner.mjs";
import { limits, protocol } from "../benchmarks/performance/config.mjs";
import { archiveHash, saveReference, unpackReference } from "../benchmarks/performance/reference.mjs";
import { gzipSync } from "node:zlib";

const exec = promisify(execFile);
const temporary: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); for (const directory of temporary.splice(0)) await rm(directory, { recursive: true, force: true }); });

const environment = { gpu: "hardware GPU", browser: "pinned browser" };
const scenarios = () => Object.fromEntries(protocol.scenarios.map(scenario => [scenario.name,
  Object.fromEntries(Object.keys(limits).map(metric => [metric, { median: metric === "frameInterval" ? 16.67 : .25, p95: metric === "frameInterval" ? 17 : .5 }]))]));
const baseline = () => ({ schemaVersion: 1, environment, protocol, scenarios: scenarios() });
const result = () => ({ environment, scenarios: scenarios() });

describe("performance regression policy", () => {
  it("accepts timing noise without updating the baseline", () => {
    const reference = baseline();
    const original = JSON.stringify(reference);
    const current = result();
    current.scenarios["full-1000"].drawGPU.median *= 1.05;
    expect(compareBaseline(reference, current, protocol, limits)).toEqual([]);
    expect(JSON.stringify(reference)).toBe(original);
  });
  it.each(["drawGPU", "simulationGPU", "frameInterval"])("blocks a material %s regression", metric => {
    const current = result();
    current.scenarios["full-1000"][metric].median *= 2;
    expect(compareBaseline(baseline(), current, protocol, limits)).toContainEqual(expect.objectContaining({ scenario: "full-1000", metric, statistic: "median" }));
  });
  it("catches worse frame tails when the median stays unchanged", () => {
    const current = result();
    current.scenarios["full-1000"].drawGPU.p95 *= 2;
    expect(compareBaseline(baseline(), current, protocol, limits)).toContainEqual(expect.objectContaining({ metric: "drawGPU", statistic: "p95" }));
  });
  it("keeps noisy CPU dispatch as diagnostics when GPU execution and frame pacing are unchanged", () => {
    const current = result();
    for (const metric of ["simulationCPU", "drawCPU", "frameCPU"]) {
      current.scenarios["full-1000"][metric].median *= 10;
      current.scenarios["full-1000"][metric].p95 *= 10;
    }
    expect(compareBaseline(baseline(), current, protocol, limits)).toEqual([]);
  });
  it("rejects mismatched hardware, changed protocols, missing metrics, and invalid measurements", () => {
    expect(() => compareBaseline(baseline(), { ...result(), environment: { gpu: "software GPU" } }, protocol, limits)).toThrow("environment");
    expect(() => compareBaseline({ ...baseline(), protocol: {} }, result(), protocol, limits)).toThrow("baseline");
    const current = result();
    delete current.scenarios["full-1000"].drawGPU;
    expect(() => compareBaseline(baseline(), current, protocol, limits)).toThrow("Invalid");
    expect(() => quantile([], .5)).toThrow();
    expect(() => quantile([1, NaN], .5)).toThrow();
    expect(() => compareBaseline(baseline(), result(), protocol, { ...limits, drawGPU: {} })).toThrow("Invalid performance tolerance");
    expect(() => compareBaseline(baseline(), result(), protocol, { ...limits, drawGPU: { reportOnly: true } })).toThrow("required performance limit");
  });
  it("requires every repeated workload and uses median run statistics to resist one noisy run", () => {
    const small = { ...protocol, repetitions: 3, sampleFrames: 3, scenarios: [protocol.scenarios[0]] };
    const runs = [1, 100, 1].map(value => ({ scenario: small.scenarios[0].name,
      samples: Object.fromEntries(Object.keys(limits).map(metric => [metric, [value, value, value]])) }));
    expect(summarize(runs, small, limits)[small.scenarios[0].name].drawGPU.median).toBe(1);
    expect(() => summarize(runs.slice(0, 2), small, limits)).toThrow("Incomplete");
    runs[0].samples.drawGPU = [];
    expect(() => summarize(runs, small, limits)).toThrow("Missing timing");
  });
});

describe("staged performance inputs", () => {
  async function fixture() {
    for (const variable of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES"]) vi.stubEnv(variable, undefined);
    const root = await mkdtemp(join(tmpdir(), "aquarium staged test "));
    temporary.push(root);
    await exec("git", ["init", "--quiet"], { cwd: root });
    await mkdir(join(root, "src"));
    await mkdir(join(root, "node_modules/.pnpm"), { recursive: true });
    await writeFile(join(root, ".gitignore"), "node_modules\n");
    await writeFile(join(root, "pnpm-lock.yaml"), "installed lockfile\n");
    await writeFile(join(root, "node_modules/.pnpm/lock.yaml"), "installed lockfile\n");
    await writeFile(join(root, "src/main.ts"), "staged slower code\n");
    await exec("git", ["add", "."], { cwd: root });
    return root;
  }
  it("checks the index despite an unstaged faster replacement, without changing the index", async () => {
    const root = await fixture();
    const index = await readFile(join(root, ".git/index"));
    await writeFile(join(root, "src/main.ts"), "unstaged faster code\n");
    await writeFile(join(root, "src/untracked.ts"), "must not enter commit benchmark\n");
    const snapshot = join(root, "snapshot");
    await stageSnapshot(root, snapshot);
    expect(await readFile(join(snapshot, "src/main.ts"), "utf8")).toBe("staged slower code\n");
    await expect(readFile(join(snapshot, "src/untracked.ts"))).rejects.toThrow();
    expect(await readFile(join(root, ".git/index"))).toEqual(index);
    expect(await changedStagedFiles(root)).toContain("src/main.ts");
  });
  it("blocks measurements using dependencies different from the staged lockfile", async () => {
    const root = await fixture();
    await writeFile(join(root, "node_modules/.pnpm/lock.yaml"), "different installed lock\n");
    await expect(stageSnapshot(root, join(root, "snapshot"))).rejects.toThrow("does not match installed dependencies");
  });
  it("skips docs and test-only commits, but checks shaders, assets, dependencies, and the gate itself", () => {
    expect(affectsPerformance(["README.md", "docs/design.md", "tests/example.test.ts"])).toBe(false);
    for (const file of ["src/main.ts", "src/water/fragment.glsl", "public/fih.svg", "pnpm-lock.yaml", ".githooks/pre-commit", "benchmarks/performance/config.mjs"]) expect(affectsPerformance([file])).toBe(true);
  });
});

describe("temporary benchmark instrumentation", () => {
  it("measures the real draw and simulation calls once and fails if the application contract changes", async () => {
    const source = await readFile(new URL("../src/main.ts", import.meta.url), "utf8");
    const measured = instrumentMain(source, protocol);
    expect(measured.split("__perf.measure('simulation', __perfStep)")).toHaveLength(2);
    expect(measured.split("__perf.measure('draw'")).toHaveLength(2);
    expect(measured).toContain("const firebaseConfig = null;");
    expect(() => instrumentMain(source.replace("gpuSim.compute();", "renamedCompute();"), protocol)).toThrow("anchor changed");
    expect(source).not.toContain("__aquariumPerf");
  });
});

describe("frozen reference build", () => {
  it("preserves only requested assets and verifies the recorded archive hash", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aquarium-reference-"));
    temporary.push(directory);
    const build = join(directory, "build");
    await mkdir(join(build, "assets"), { recursive: true });
    await writeFile(join(build, "index.html"), "reference index");
    await writeFile(join(build, "assets/app.js"), "frozen code");
    await writeFile(join(build, "unused.mp4"), "do not capture unloaded videos");
    const archive = join(directory, "reference.json.gz");
    const hash = await saveReference(build, new Set(["index.html", "assets/app.js"]), archive);
    const output = join(directory, "output");
    await unpackReference(archive, hash, output);
    expect(await readFile(join(output, "assets/app.js"), "utf8")).toBe("frozen code");
    await expect(readFile(join(output, "unused.mp4"))).rejects.toThrow();
    await expect(unpackReference(archive, "incorrect hash", join(directory, "invalid"))).rejects.toThrow("hash mismatch");
  });
  it("rejects reference paths outside the extraction directory", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aquarium-reference-"));
    temporary.push(directory);
    const bytes = gzipSync(JSON.stringify({ "index.html": "aW5kZXg=", "../escaped": "ZXNjYXBl" }));
    const archive = join(directory, "reference.json.gz");
    await writeFile(archive, bytes);
    await expect(unpackReference(archive, archiveHash(bytes), join(directory, "output"))).rejects.toThrow("Invalid path");
    await expect(readFile(join(directory, "escaped"))).rejects.toThrow();
  });
});
