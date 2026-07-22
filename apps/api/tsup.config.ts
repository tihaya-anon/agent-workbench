import { defineConfig } from "tsup";

export default defineConfig({
  clean: true,
  entry: ["src/index.ts", "src/instrumentation.ts"],
  format: ["esm"],
  noExternal: ["@agent-workbench/observability", "@agent-workbench/shared"],
  sourcemap: true,
});
