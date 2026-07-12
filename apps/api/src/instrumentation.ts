import { startNodeTelemetry } from "@teach-everything/observability";

export const telemetry = startNodeTelemetry({
  defaultServiceName: "teach-everything-api",
  onError: (error) => {
    process.stderr.write(`OpenTelemetry startup failed: ${String(error)}\n`);
  },
});
