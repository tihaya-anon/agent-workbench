import { startNodeTelemetry } from "@agent-workbench/observability";

// Import this before starting the Hono server so auto-instrumentation can patch modules early.
export const telemetry = startNodeTelemetry({
  defaultServiceName: "agent-workbench-api",
  onError: (error) => {
    process.stderr.write(`OpenTelemetry startup failed: ${String(error)}\n`);
  },
});
