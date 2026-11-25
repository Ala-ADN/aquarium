import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { affectsPerformance, changedStagedFiles, stageSnapshot } from "./snapshot.mjs";

let temporary;
try {
  const { stdout } = await promisify(execFile)("git", ["rev-parse", "--show-toplevel"]);
  const root = stdout.trim();
  const files = await changedStagedFiles(root);
  if (!affectsPerformance(files)) {
    console.log("Performance gate: skipped (no staged aquarium GPU workload changes; video playback is not benchmarked).");
  } else {
    temporary = await mkdtemp(join(tmpdir(), "aquarium-staged-perf-"));
    const source = join(temporary, "source");
    await stageSnapshot(root, source);
    console.log("Performance gate: measuring the staged application.");
    const { spawn } = await import("node:child_process");
    const code = await new Promise((resolve, reject) => {
      // Run the staged harness too, not an unstaged replacement in the worktree.
      const child = spawn(process.execPath, [join(source, "benchmarks/performance/check.mjs"), "--root", source, "--reports", join(root, ".performance-results")], { cwd: source, stdio: "inherit", env: process.env });
      child.on("error", reject);
      child.on("exit", (status, signal) => resolve(signal ? 1 : status ?? 1));
    });
    process.exitCode = code;
  }
} catch (error) {
  console.error(`Performance gate blocked commit: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (temporary) await rm(temporary, { recursive: true, force: true });
}
