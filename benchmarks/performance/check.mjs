import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { protocol, limits } from "./config.mjs";
import { compareBaseline, summarize } from "./policy.mjs";
import { measureApplication } from "./runner.mjs";
import { saveReference, unpackReference } from "./reference.mjs";

const args = process.argv.slice(2);
function option(name, fallback) { const index = args.indexOf(name); return index < 0 ? fallback : args[index + 1]; }
const root = resolve(option("--root", process.cwd()));
const reports = resolve(option("--reports", join(root, ".performance-results")));
const recording = args.includes("--record");
const baselinePath = join(root, "benchmarks/performance/baseline.json");
const referencePath = join(root, "benchmarks/performance/reference.json.gz");
let temporary;
try {
  const baseline = recording ? null : JSON.parse(await readFile(baselinePath, "utf8"));
  if (baseline && (baseline.schemaVersion !== 1 || !isDeepStrictEqual(baseline.protocol, protocol))) {
    throw new Error("Performance baseline/protocol mismatch. Record and review a baseline with pnpm perf:baseline.");
  }
  temporary = await mkdtemp(join(tmpdir(), "aquarium-perf-"));
  const referenceDirectory = baseline ? join(temporary, "reference") : null;
  if (referenceDirectory) await unpackReference(referencePath, baseline.referenceHash, referenceDirectory);
  console.log(recording ? "Recording an explicit performance baseline…" : "Checking aquarium GPU performance…");
  const measured = await measureApplication(root, temporary, protocol, environment => {
    console.log(`GPU: ${environment.gpu} | Chromium ${environment.browser}`);
  }, referenceDirectory);
  const report = { schemaVersion: 1, measuredAt: new Date().toISOString(), protocol, environment: measured.environment, scenarios: summarize(measured.runs, protocol, limits), runs: measured.runs };
  if (baseline) {
    report.reference = { schemaVersion: 1, protocol, environment: measured.environment, scenarios: summarize(measured.referenceRuns, protocol, limits) };
    report.referenceRuns = measured.referenceRuns;
  }
  await mkdir(reports, { recursive: true });
  await writeFile(join(reports, "latest.json"), JSON.stringify(report, null, 2) + "\n");
  for (const [name, metrics] of Object.entries(report.scenarios)) {
    console.log(`${name}: GPU draw ${metrics.drawGPU.median.toFixed(3)} ms, simulation ${metrics.simulationGPU.median.toFixed(3)} ms, frame CPU ${metrics.frameCPU.median.toFixed(3)} ms`);
  }
  if (recording) {
    const referenceHash = await saveReference(measured.buildDirectory, measured.requestedFiles, referencePath);
    const { runs, ...snapshot } = { ...report, referenceHash };
    await writeFile(baselinePath, JSON.stringify(snapshot, null, 2) + "\n");
    console.log("Baseline and frozen build written. Review and stage baseline.json and reference.json.gz; checks never update them automatically.");
  } else {
    const failures = compareBaseline(report.reference, report, protocol, limits);
    for (const failure of failures) console.error(`REGRESSION ${failure.scenario}/${failure.metric}/${failure.statistic}: ${failure.actual.toFixed(3)} ms exceeds ${failure.maximum.toFixed(3)} ms (baseline ${failure.previous.toFixed(3)} ms)`);
    if (failures.length) throw new Error(`${failures.length} performance regression(s). Commit blocked. Raw measurements: ${join(reports, "latest.json")}`);
    console.log("Performance gate passed.");
  }
} catch (error) {
  console.error(`Performance gate failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (temporary) await rm(temporary, { recursive: true, force: true });
}
