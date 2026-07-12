# Observability Contract

All Node.js runtimes use `@teach-everything/observability`. Business modules should use its
`Logger` interface and framework-native instrumentation callbacks instead of calling `console`,
managing span lifecycles, or configuring exporters.

## Log Record

JSON logs follow the OpenTelemetry log data model vocabulary:

```json
{
  "timestamp": "2026-07-12T10:00:00.000Z",
  "observedTimestamp": "2026-07-12T10:00:00.000Z",
  "severityNumber": 9,
  "severityText": "INFO",
  "body": "Agent invocation completed",
  "resource": {
    "service.name": "teach-everything-api",
    "service.version": "0.1.0",
    "deployment.environment.name": "production"
  },
  "attributes": {
    "agent.input.prompt_length": 42
  },
  "eventName": "agent.invocation.completed",
  "traceId": "467120c34158d2a0cbb25d99b83c5c65",
  "spanId": "70b94631573a54a7",
  "traceFlags": 1
}
```

The logger adds trace correlation fields from the active OpenTelemetry span. Plain-text logs carry
the same information as sorted `key=value` fields.

Errors use the OpenTelemetry exception attribute names:

- `exception.type`
- `exception.message`
- `exception.stacktrace`

Do not log prompts, model responses, credentials, authorization headers, or tool payloads by
default. Record bounded metadata such as lengths, counts, identifiers, model names, and durations.

## Configuration

| Variable            | Values                       | Default                |
| ------------------- | ---------------------------- | ---------------------- |
| `LOG_LEVEL`         | `trace` through `fatal`      | `info`                 |
| `LOG_SINKS`         | `stdout`, `file`, or both    | `stdout`               |
| `LOG_FORMAT`        | `json` or `plaintext`        | `json`                 |
| `LOG_STDOUT_FORMAT` | `json` or `plaintext`        | `LOG_FORMAT`           |
| `LOG_FILE_FORMAT`   | `json` or `plaintext`        | `LOG_FORMAT`           |
| `LOG_FILE_PATH`     | Writable local file path     | `logs/application.log` |
| `OTEL_SERVICE_NAME` | OpenTelemetry service name   | Runtime-specific       |
| `OTEL_SDK_DISABLED` | `false` enables trace export | Disabled unless false  |

The file sink creates parent directories and appends records. Call `flush()` before a process handoff
and `shutdown()` during process termination.

## Trace Naming

Use stable, low-cardinality span names. LangChain and LangGraph runs use
`langchain.<kind>.<run_name>`, for example `langchain.chain.generate`. Put request-specific values in
attributes, never in the span name. Prefer official OpenTelemetry semantic convention keys when they
exist; prefix project-specific attributes with the owning domain.

`createLangChainTelemetryCallback` maps graph, node, LLM, tool, and retriever lifecycle events to
OpenTelemetry spans and low-cardinality metrics. It records `langchain.run.duration` for visible runs
and `gen_ai.client.token.usage` when LangChain exposes model usage metadata. Bind the callback once
through LangGraph `withConfig({ callbacks })`; node functions must not manage those spans or metrics
themselves. Hidden framework runs and high-cardinality checkpoint metadata are not exported.

Register conditional routers as named LangChain runnables rather than plain functions when their
execution should be traced. LangGraph 1.4.x marks its internal plain-function branch wrapper as
non-traceable, while a caller-provided runnable participates in the normal callback hierarchy.

Instrumentation is fail-open. A missing tracer provider produces no-op spans, callback failures do
not fail graph execution, and SDK startup failure disables telemetry without preventing the
application from starting.

OTLP is the transport seam. Deployments may route traces to Grafana Tempo, metrics to Prometheus,
and structured logs to Loki through an OpenTelemetry Collector without changing business modules.

## Lifecycle

The process entry point owns startup and shutdown:

1. Load instrumentation before application modules.
2. Start the HTTP server or worker.
3. Stop accepting work on `SIGINT` or `SIGTERM`.
4. Shut down OpenTelemetry exporters.
5. Flush and close log sinks.
