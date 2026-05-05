import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node18",
  outDir: "dist",
  bundle: true,
  minify: true,
  sourcemap: false,
  clean: true,
  // Node built-ins — never bundle these
  external: ["fs", "path", "child_process", "url", "os", "node:fs", "node:path", "node:child_process", "node:url", "node:os"],
});
