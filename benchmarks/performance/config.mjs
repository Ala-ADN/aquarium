export const protocol = {
  version: 3,
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
  seed: 173,
  stepSeconds: 1 / 60,
  repetitions: 3,
  warmupFrames: 60,
  sampleFrames: 60,
  scenarios: [
    { name: "background-30", groups: 0, expectedCount: 30 },
    { name: "full-1000", groups: 100, expectedCount: 1000 },
    { name: "sparse-40", groups: 1, prefill: 100, expectedCount: 40 },
    { name: "settled-1000", groups: 100, ageSteps: 3600, expectedCount: 1000 },
    { name: "mobile-1000", groups: 100, expectedCount: 1000, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 },
  ],
};

// Relative + absolute floors accommodate measurement noise without allowing
// small simulation costs to grow by whole milliseconds unnoticed.
export const limits = {
  simulationGPU: { relative: .15, absoluteMs: .01, p95Relative: .25, p95AbsoluteMs: .025 },
  drawGPU: { relative: .15, absoluteMs: .025, p95Relative: .25, p95AbsoluteMs: .1 },
  // Host contention changes dispatch timing even when GPU work is unchanged.
  // Keep it visible, and enforce actual execution time and frame pacing.
  simulationCPU: { reportOnly: true },
  drawCPU: { reportOnly: true },
  frameCPU: { reportOnly: true },
  frameInterval: { relative: .15, absoluteMs: 2, p95Relative: .15, p95AbsoluteMs: 2 },
};
