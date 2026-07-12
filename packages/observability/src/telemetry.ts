import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";

export type NodeTelemetryOptions = {
  defaultServiceName: string;
  environment?: NodeJS.ProcessEnv;
  onError?: (error: unknown) => void;
};

export interface NodeTelemetry {
  enabled: boolean;
  shutdown(): Promise<void>;
}

export const startNodeTelemetry = (options: NodeTelemetryOptions): NodeTelemetry => {
  const environment = options.environment ?? process.env;
  const enabled = environment.OTEL_SDK_DISABLED?.toLowerCase() === "false";
  if (!enabled) {
    return {
      enabled: false,
      shutdown: () => Promise.resolve(),
    };
  }

  let sdk: NodeSDK;
  try {
    sdk = new NodeSDK({
      serviceName: environment.OTEL_SERVICE_NAME ?? options.defaultServiceName,
      instrumentations: [getNodeAutoInstrumentations()],
      metricReaders: [
        new PeriodicExportingMetricReader({
          exporter: new OTLPMetricExporter(),
        }),
      ],
      traceExporter: new OTLPTraceExporter(),
    });
    sdk.start();
  } catch (error) {
    try {
      options.onError?.(error);
    } catch {
      // Telemetry diagnostics must not prevent the application from starting.
    }

    return {
      enabled: false,
      shutdown: () => Promise.resolve(),
    };
  }
  let shutdownPromise: Promise<void> | undefined;

  return {
    enabled: true,
    shutdown: () => {
      shutdownPromise ??= sdk.shutdown();
      return shutdownPromise;
    },
  };
};
