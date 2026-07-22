# Agent Run Diagnosis Acceptance

Status: verified current-stage recipe for the OpenInference-era Agent Run Diagnosis contract. The
previous beginning product-stage evidence from 2026-07-16 is archived at
`ops/observability/archive/agent-run-diagnosis.acceptance-2026-07-16.md`; its matching runner is
archived at `ops/observability/archive/agent-run-diagnosis.acceptance-2026-07-16.ts`.

This acceptance path uses the application executor seam in `createApp` to generate controlled Agent
Run traces, logs, and metrics. Production startup still does not register a fixture executor.

## Current Contract

The current dashboard and telemetry use OpenInference semantic convention fields where possible:

| Concern              | Current field or metric                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------ |
| Agent Run root span  | `agent.run`                                                                                |
| Agent Run identifier | `session.id`                                                                               |
| Agent Run outcome    | `metadata.agent_run.outcome`                                                               |
| Error classification | `error.type`                                                                               |
| Operation kind       | `openinference.span.kind`                                                                  |
| Graph node           | `graph.node.name`                                                                          |
| Tool name            | `tool.name`                                                                                |
| LLM provider/model   | `llm.provider`, `llm.model_name`                                                           |
| Token counts         | `llm.token_count.prompt`, `llm.token_count.completion`                                     |
| Finish reason        | `llm.finish_reason`                                                                        |
| Root duration metric | OTel `agent.run.duration`, exposed to Prometheus as `agent_run_duration_seconds_*`         |
| Run duration metric  | OTel `langchain.run.duration`, exposed to Prometheus as `langchain_run_duration_seconds_*` |
| Token usage metric   | OTel `gen_ai.client.token.usage`, exposed to Prometheus with collector-specific suffixes   |

## Local Stack

Start a clean PGL stack from the sibling checkout:

```bash
cd ../prometheus-grafana-loki
docker compose down -v
docker compose up -d
./scripts/smoke-test.sh
cd ../agent-workbench
```

Load the current Agent Run Diagnosis dashboard into Grafana without editing datasource references:

```bash
node -e 'const fs=require("node:fs"); const dashboard=JSON.parse(fs.readFileSync("ops/observability/dashboards/agent-run-diagnosis.dashboard.json","utf8")); fetch("http://127.0.0.1:3000/api/dashboards/db", { method: "POST", headers: { "content-type": "application/json", authorization: `Basic ${Buffer.from("admin:admin").toString("base64")}` }, body: JSON.stringify({ dashboard, overwrite: true }) }).then(async (response) => { console.log(response.status, await response.text()); if (!response.ok) process.exit(1); });'
```

## Controlled Runs

Run the acceptance executor in a container attached to PGL's `observability` network so Alloy
collects Agent Workbench JSON stdout logs and receives OTLP telemetry:

```bash
pnpm observability:agent-run-diagnosis:acceptance
```

The package entry runs `ops/observability/acceptance/run-agent-run-diagnosis.sh`, which wraps:

```bash
docker run --rm --name agent-workbench-agent-run-diagnosis-acceptance \
  --label com.docker.compose.service=agent-workbench-api \
  --network observability \
  -v "$PWD":/workspace \
  -w /workspace \
  -e NODE_ENV=production \
  -e OTEL_SDK_DISABLED=false \
  -e OTEL_SERVICE_NAME=agent-workbench-api \
  -e OTEL_EXPORTER_OTLP_ENDPOINT=http://alloy:4318 \
  -e LOG_SINKS=stdout \
  -e LOG_STDOUT_FORMAT=json \
  -e AGENT_RUN_DIAGNOSIS_ACCEPTANCE_PREFIX=ar_current_acceptance \
  node:22.23.1-slim \
  node --import tsx ops/observability/acceptance/agent-run-diagnosis.ts
```

Expected scenarios:

| Scenario              | Expected Agent Run outcome          | Notes                                                              |
| --------------------- | ----------------------------------- | ------------------------------------------------------------------ |
| `succeeded`           | `succeeded`                         | Emits graph, model, tool, run-duration, and token-usage telemetry. |
| `slow`                | `succeeded`                         | Emits a child tool operation lasting longer than one second.       |
| `failed`              | `failed` with `tool`                | Emits a failed child tool operation.                               |
| `cancelled`           | `cancelled`                         | Confirms executor cleanup after client cancellation.               |
| `cancellation-failed` | `failed` with `cancellation_failed` | Leaves cleanup unconfirmed past the ten-second deadline.           |

## Trace And Log Checks

Use the generated Agent Run IDs from the runner output. For the default prefix they are:

- `ar_current_acceptance_01`: succeeded
- `ar_current_acceptance_02`: slow operation
- `ar_current_acceptance_03`: failed with `tool`
- `ar_current_acceptance_04`: confirmed cancelled
- `ar_current_acceptance_05`: unconfirmed cancellation failed with `cancellation_failed`

Current TraceQL checks:

```traceql
{ span:name = "agent.run" && span."session.id" = "ar_current_acceptance_01" } | select(span:name, trace:id, span:duration, span."metadata.agent_run.outcome", span."error.type")
```

```traceql
{ span:name = "agent.run" && span."session.id" = "ar_current_acceptance_02" } >> { span."openinference.span.kind" =~ "LLM|TOOL" && span:duration > 1s } | select(span:name, trace:id, span:duration, span:status, span."openinference.span.kind", span."graph.node.name", span."tool.name", span."llm.provider", span."llm.model_name", span."llm.token_count.prompt", span."llm.token_count.completion", span."llm.finish_reason")
```

```traceql
{ span:name = "agent.run" && span."session.id" = "ar_current_acceptance_03" } >> { span."openinference.span.kind" =~ "LLM|TOOL" && span:status = error } | select(span:name, trace:id, span:duration, span:status, span."openinference.span.kind", span."graph.node.name", span."tool.name")
```

```traceql
{ span:name = "agent.run" && span."session.id" = "ar_current_acceptance_05" } | select(span:name, trace:id, span:duration, span."metadata.agent_run.outcome", span."error.type")
```

Current Loki check:

```logql
{service_name="agent-workbench-api"} | json | __error__="" | traceId != "" | attributes_session_id != "" | attributes_session_id="ar_current_acceptance_01"
```

## Metric Checks

Prometheus metric names are derived from OTel instrument names by the collector/exporter path. First
discover the exact exposed names:

```bash
curl -sS "http://127.0.0.1:9090/api/v1/label/__name__/values" \
  | jq -r '.data[] | select(test("agent_run_duration|langchain_run_duration|gen_ai_client_token_usage"))'
```

Expected metric families:

- `agent_run_duration_seconds_*`
- `langchain_run_duration_seconds_*`
- `gen_ai_client_token_usage_*`

Inspect the actual labels before writing follow-up PromQL:

```bash
curl -sS "http://127.0.0.1:9090/api/v1/query?query=agent_run_duration_seconds_count%7Bjob%3D%22agent-workbench-api%22%7D" | jq .
curl -sS "http://127.0.0.1:9090/api/v1/query?query=langchain_run_duration_seconds_count%7Bjob%3D%22agent-workbench-api%22%7D" | jq .
```

For token usage, use the discovered metric name. A common current shape is:

```bash
curl -sS "http://127.0.0.1:9090/api/v1/query?query=gen_ai_client_token_usage_count%7Bjob%3D%22agent-workbench-api%22%7D" | jq .
```

Verify these outcomes:

- Agent Run duration exists for `succeeded`, `cancelled`, `failed/error.type=tool`, and
  `failed/error.type=cancellation_failed`.
- LangChain run duration exists for graph/model/tool operations.
- Token usage exists for input and output token types with provider/model metadata.
- No per-run identifier is exported as a Prometheus label:

```bash
curl -sS "http://127.0.0.1:9090/api/v1/label/session_id/values" | jq .
curl -sS "http://127.0.0.1:9090/api/v1/label/agent_run_id/values" | jq .
```

Both label-value responses should be empty or absent from the metric label set for these telemetry
families.

## Observed Results

Date: 2026-07-18

PGL stack:

- `./scripts/smoke-test.sh` passed for Grafana, Prometheus, Loki, Tempo, and Alloy.
- Grafana dashboard UID `agent-run-diagnosis` existed at
  `/d/agent-run-diagnosis/agent-run-diagnosis`.
- The loaded dashboard used the current query contract: `session.id`,
  `metadata.agent_run.outcome`, `openinference.span.kind`, and `attributes_session_id`.
- Grafana API reported the dashboard under the GitHub-sync folder
  `tihaya-anon/agent-workbench`. The API record had `provisioned=false` because this local Grafana
  database had previously been overwritten through the dashboard import endpoint, but the dashboard
  content matched the current generated contract.

Controlled Agent Run IDs:

- `ar_current_acceptance_01`: succeeded; trace `423167f9761868eb107e6a488bde0bdb`.
- `ar_current_acceptance_02`: slow operation; trace `5173fec61faaea47ebe9fd4a76f29105`.
- `ar_current_acceptance_03`: failed with `tool`; trace `969b1e4f288fe4ab47425df2064004d3`.
- `ar_current_acceptance_04`: confirmed cancelled; trace
  `e56307598b29291bbd2003a658e40cdd`.
- `ar_current_acceptance_05`: unconfirmed cancellation failed with `cancellation_failed`; trace
  `61d9d2db298e313d2adfa4c5c6c0c58b`.

Runner validation:

- The containerized acceptance runner exited successfully.
- It validated the expected stream event sequences for all five controlled scenarios.
- The runner exported OTLP telemetry to Alloy through `OTEL_EXPORTER_OTLP_ENDPOINT=http://alloy:4318`.

Tempo and Loki checks:

- TraceQL for `ar_current_acceptance_01` found root span `agent.run` with
  `session.id=ar_current_acceptance_01`.
- Tempo returned trace `423167f9761868eb107e6a488bde0bdb` with four spans for service
  `agent-workbench-api`.
- Loki range query for `ar_current_acceptance_01` returned exactly the two lifecycle records
  `agent.run.accepted` and `agent.run.completed`, both with trace ID
  `423167f9761868eb107e6a488bde0bdb`.

Prometheus metric checks:

- `agent_run_duration_seconds_count{job="agent-workbench-api"}` was present with:
  - `metadata_agent_run_outcome="succeeded"` count `2`
  - `metadata_agent_run_outcome="cancelled"` count `1`
  - `metadata_agent_run_outcome="failed", error_type="tool"` count `1`
  - `metadata_agent_run_outcome="failed", error_type="cancellation_failed"` count `1`
- `langchain_run_duration_seconds_count{job="agent-workbench-api"}` was present for:
  - `openinference_span_kind="LLM"` with provider/model and operation labels
  - `openinference_span_kind="TOOL"` for `AcceptanceLookupTool`, `AcceptanceSlowTool`, and
    `AcceptanceFailingTool`
  - `openinference_span_kind="CHAIN"` with `metadata_langchain_run_status` values `ok` and `error`
- `gen_ai_client_token_usage_count{job="agent-workbench-api"}` was present with:
  - `llm_provider="acceptance-provider"`
  - `llm_model_name="acceptance-model-response"`
  - `metadata_llm_token_type="input"` count `1`
  - `metadata_llm_token_type="output"` count `1`
- `GET /api/v1/label/session_id/values` returned an empty list.
- `GET /api/v1/label/agent_run_id/values` returned an empty list.
