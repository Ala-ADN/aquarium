import { defineConfig, loadEnv } from "vite";
import { readFirebaseConfig } from "./src/fih/firebase-config";

export default defineConfig(({ command, mode }) => {
  // Fail the build for partial/unsafe cloud configuration; empty config is local-only.
  readFirebaseConfig({ ...loadEnv(mode, process.cwd(), "VITE_"), ...process.env }, command === "serve");
  return { base: "./" };
});
