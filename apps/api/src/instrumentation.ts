import { startNodeTelemetry } from "@teach-everything/observability";

// Import this before starting the Hono server so auto-instrumentation can patch modules early.
export const telemetry = startNodeTelemetry({
  defaultServiceName: "teach-everything-api",
  onError: (error) => {
    process.stderr.write(`OpenTelemetry startup failed: ${String(error)}\n`);
  },
});
