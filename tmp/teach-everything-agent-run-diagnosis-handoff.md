# Handoff: Agent Run Diagnosis Prototype

## Goal

Use a throwaway prototype to validate that the local PGL stack can present a useful Agent Run Diagnosis before product graph behavior or durable metrics policy is implemented.

## Completed Design Work

The design conversation is committed as `811c176 docs(observability): define agent run diagnosis`.

Read these rather than recreating their contents:

- Domain vocabulary: `/home/yxluo/workspace/personal/teach-everything/CONTEXT.md`
- Architecture decisions: `/home/yxluo/workspace/personal/teach-everything/docs/adr/`
- Streaming-transport research: `/home/yxluo/workspace/personal/teach-everything/docs/research/agent-run-streaming-transport.md`
- Dashboard source-of-truth contract: `/home/yxluo/workspace/personal/teach-everything/ops/observability/dashboards/README.md`

## Agreed Boundaries

- The first workflow is Agent Run Diagnosis: find one selected Agent Run and inspect its trace, logs, timings, token metadata, operations, and outcome.
- An Agent Run is only a dedicated user-initiated streaming agent endpoint; login and ordinary HTTP requests are not Agent Runs.
- Each run has an opaque `agent_run_id`, available early to the client, attached to traces and logs, and never used as a metric label.
- Telemetry is metadata-only. Never export user/model content, tool arguments/results, or authorization data to PGL.
- The preferred transport is `POST /api/agent-runs` with `fetch` consuming versioned NDJSON. Return `X-Agent-Run-Id` and a first `run.started` event. Pre-stream failures use HTTP; post-stream failures are terminal in-band events.
- A stream abort requests cancellation. Record `cancelled` only after graph/provider/tool work confirms it stopped; otherwise record a bounded failure classification. No silent detached work.
- The Telemetry Harness is development-only and deterministic. It must not define a product graph, prompts, tools, or state.
- Harness scenarios: success, slow operation, validation failure, provider failure, tool failure, and confirmed cancellation.
- The dashboard definition belongs in this repository under `ops/observability/dashboards/`; the sibling PGL repository owns runtime/deployment/data sources.
- The first dashboard is one run-focused view: summary, Tempo trace, slow/failed operations, and correlated Loki logs. Do not add aggregate Prometheus panels, recording rules, alerting, SLOs, or a permanent metrics policy.

## Existing Code And Stack Facts

- The API currently exposes only `GET /api/health`; it has no Agent Run endpoint.
- `packages/agent/src/graph.ts` has a generic `createAgentGraph(generateNode)` plus OTel LangGraph callback instrumentation, but there is no product graph.
- `packages/observability/` emits traces/metrics and structured logs. The logger defaults to JSON stdout outside `NODE_ENV=development`.
- PGL lives at `/home/yxluo/workspace/personal/prometheus-grafana-loki`. It includes Prometheus, Loki, Tempo, Grafana, and Alloy. Alloy receives OTLP at `http://alloy:4318` for containers on its external `observability` network and discovers Docker stdout logs.
- To make the Loki panel work, the harness API should run in a container on that network with JSON stdout and matching `OTEL_SERVICE_NAME`/Compose service name `teach-everything-api`.
- The harness container should use explicit `TELEMETRY_HARNESS_ENABLED=true`; do not overload `NODE_ENV` as its feature switch. Expected telemetry environment: `NODE_ENV=production`, `LOG_SINKS=stdout`, `LOG_STDOUT_FORMAT=json`, `OTEL_SDK_DISABLED=false`, `OTEL_SERVICE_NAME=teach-everything-api`, `OTEL_EXPORTER_OTLP_ENDPOINT=http://alloy:4318`, and `OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf`.

## Prototype Success Criteria

- PGL receives the harness traces, metrics, and Docker stdout logs.
- Grafana can locate an `agent_run_id`, open the trace, and navigate to correlated logs.
- The selected scenarios visibly explain success, slow behavior, failures, and cancellation.
- Findings identify which telemetry fields/panels are actually useful and which production contract questions remain.

## Worktree Notes

- `.agents/` and `skills-lock.json` are pre-existing untracked files; do not stage or remove them.
- The design documentation is already committed; start prototype changes separately and keep them explicitly throwaway.

## Suggested Skills

1. `/prototype` first, to build and inspect the throwaway PGL integration.
2. `/domain-modeling` if the prototype reveals an unresolved Agent Run term or changes an ADR-level decision.
3. `/handoff` after the prototype to carry findings back to a design/spec session.
4. After validation, `/to-spec`, then `/to-tickets`; use `/implement` for each resulting ticket.
