import { execFileSync } from "node:child_process";
import { chmodSync, existsSync } from "node:fs";
import { resolve } from "node:path";

if (existsSync(".githooks/pre-commit") && existsSync(".git")) {
  let current = "";
  try {
    current = execFileSync("git", ["config", "--local", "--get", "core.hooksPath"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch (error) {
    if (error.status !== 1) throw error;
  }
  if (current && resolve(current) !== resolve(".githooks")) {
    throw new Error(`Existing core.hooksPath=${current}; integrate .githooks/pre-commit before installing this hook.`);
  }
  chmodSync(".githooks/pre-commit", 0o755);
  execFileSync("git", ["config", "--local", "core.hooksPath", ".githooks"]);
  console.log("Installed aquarium performance pre-commit hook.");
}
