import { isDeepStrictEqual } from "node:util";

export function quantile(values, fraction) {
  if (!values.length || values.some(value => !Number.isFinite(value) || value < 0)) {
    throw new Error("Performance samples must be finite, nonnegative, and nonempty.");
  }
  return [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * fraction)];
}

export function summarize(runs, protocol, limits) {
  return Object.fromEntries(protocol.scenarios.map(scenario => {
    const selected = runs.filter(run => run.scenario === scenario.name);
    if (selected.length !== protocol.repetitions) throw new Error(`Incomplete scenario: ${scenario.name}`);
    return [scenario.name, Object.fromEntries(Object.keys(limits).map(metric => {
      for (const run of selected) {
        const minimum = protocol.sampleFrames - (metric === "frameInterval" ? 1 : 0);
        if (!run.samples[metric] || run.samples[metric].length < minimum) {
          throw new Error(`Missing timing samples: ${scenario.name}/${metric}`);
        }
      }
      return [metric, {
        median: quantile(selected.map(run => quantile(run.samples[metric], .5)), .5),
        p95: quantile(selected.map(run => quantile(run.samples[metric], .95)), .5),
      }];
    }))];
  }));
}

export function compareBaseline(baseline, current, protocol, limits) {
  if (baseline?.schemaVersion !== 1 || !isDeepStrictEqual(baseline.protocol, protocol)) {
    throw new Error("Missing or incompatible performance baseline. Run pnpm perf:baseline and review the baseline change.");
  }
  if (!isDeepStrictEqual(baseline.environment, current.environment)) {
    throw new Error("GPU/browser environment differs from the baseline. Use the recorded hardware/browser, or explicitly record and review a new baseline.");
  }
  for (const metric of ["drawGPU", "simulationGPU", "frameInterval"]) {
    if (!limits[metric] || limits[metric].reportOnly === true) throw new Error(`Missing required performance limit: ${metric}`);
  }
  const failures = [];
  for (const scenario of protocol.scenarios) {
    for (const [metric, tolerance] of Object.entries(limits)) {
      if (tolerance.reportOnly === true) continue;
      for (const key of ["relative", "absoluteMs", "p95Relative", "p95AbsoluteMs"]) {
        if (!Number.isFinite(tolerance[key]) || tolerance[key] < 0) throw new Error(`Invalid performance tolerance: ${metric}/${key}`);
      }
      for (const statistic of ["median", "p95"]) {
        const previous = baseline.scenarios?.[scenario.name]?.[metric]?.[statistic];
        const actual = current.scenarios?.[scenario.name]?.[metric]?.[statistic];
        if (!Number.isFinite(previous) || previous <= 0 || !Number.isFinite(actual) || actual < 0) {
          throw new Error(`Invalid baseline or result: ${scenario.name}/${metric}/${statistic}`);
        }
        const relative = statistic === "median" ? tolerance.relative : tolerance.p95Relative;
        const absolute = statistic === "median" ? tolerance.absoluteMs : tolerance.p95AbsoluteMs;
        const maximum = previous + Math.max(previous * relative, absolute);
        if (actual > maximum) failures.push({ scenario: scenario.name, metric, statistic, previous, actual, maximum });
      }
    }
  }
  return failures;
}
