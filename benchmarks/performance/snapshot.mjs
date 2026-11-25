import { execFile } from "node:child_process";
import { mkdir, readFile, symlink } from "node:fs/promises";
import { join, sep } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
export async function changedStagedFiles(root) {
  const { stdout } = await exec("git", ["diff", "--cached", "--name-only", "-z"], { cwd: root });
  return stdout.split("\0").filter(Boolean);
}

export function affectsPerformance(files) {
  // These scenarios never play a video. Benchmarking playback-only changes
  // cannot assess their cost and adds a full GPU run to unrelated commits.
  // Keep this list narrow: shared UI/styles and unknown files still trigger it.
  const playbackOnly = file => file === "src/ui/media-player.ts" ||
    file === "src/ui/media-player.css" || file.startsWith("src/media/") ||
    file.startsWith("public/media/") || file.startsWith("src/asset/vlc/");
  return files.some(file => !file.startsWith("tests/") && !file.startsWith("docs/") &&
    !file.startsWith(".github/") && !file.endsWith(".md") && !playbackOnly(file));
}

export async function stageSnapshot(root, destination) {
  await mkdir(destination, { recursive: true });
  await exec("git", ["checkout-index", "--all", `--prefix=${destination.split(sep).join("/")}/`], { cwd: root });
  const stagedLock = await readFile(join(destination, "pnpm-lock.yaml"), "utf8");
  const installedLock = await readFile(join(root, "node_modules/.pnpm/lock.yaml"), "utf8");
  if (stagedLock !== installedLock) {
    throw new Error("Staged pnpm-lock.yaml does not match installed dependencies. Install and stage dependency changes together before measuring.");
  }
  await symlink(join(root, "node_modules"), join(destination, "node_modules"), "junction");
}
