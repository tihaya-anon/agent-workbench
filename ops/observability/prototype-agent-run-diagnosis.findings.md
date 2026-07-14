# PROTOTYPE: Agent Run Diagnosis Findings

Question: can the local PGL stack explain one metadata-only Agent Run through its trace, logs, timings, token metadata, operations, and outcome?

## Verdict

Yes for a selected run. `agent.run.id` located the root `agent.run` trace in Tempo and the same identifier selected JSON Docker stdout logs in Loki. Grafana accepted the dashboard definition and its Tempo and Loki query shapes. Prometheus received run-duration and token-usage histograms without an Agent Run Identifier label.

The rendered dashboard requires a non-streaming Tempo datasource. The local prototype registers `tempo-agent-run-diagnosis` with `streamingEnabled.search=false`; this datasource is PGL runtime configuration, not a Teach Everything dashboard definition.

## Useful Evidence

- `agent.run.id` on the root span and structured log attributes is the canonical lookup key.
- `traceId` in the JSON log lets Grafana's provisioned Loki derived field open the Tempo trace.
- `agent.run.outcome` and bounded `error.type` explain terminal failures without exporting exception text.
- A long child operation makes the slow-run cause visible in TraceQL.
- `gen_ai.provider.name`, model name, and input/output token counts are useful metadata on successful fixture operations.
- Loki's JSON parser exposes the structured identifier as `attributes_agent_run_id`; the dashboard selector is `{service_name="teach-everything-api"} | json | attributes_agent_run_id="$agent_run_id"`.
- Raw `traceql` targets preserve the Agent Run Identifier query; `traceqlSearch` instead generates its query from its filter model and ignores the raw `query` field.

## Validated Boundary

The initial implementation emitted exception messages and stack traces through `recordException` and logger error serialization. That violates metadata-only Diagnostic Telemetry. The prototype removes exception payloads from LangChain spans and from the harness failure log, retaining only span error status and bounded classifications.

## Open Product Questions

- The deterministic `validation-failure` run starts streaming and ends in-band, while the transport decision says failures before streaming use HTTP. Product validation must define whether it occurs before an Agent Run exists, or whether it is a post-start graph validation failure eligible for diagnosis.
- The confirmed-cancellation fixture aborts controlled work deterministically. It does not prove that a real client stream disconnect is observed by the server and propagated to every provider and tool without detached work.
- LangGraph callback spans share the Agent Run trace, but only the root span and explicitly annotated fixture operation carry `agent.run.id`. Production needs an explicit propagation decision if TraceQL must select arbitrary child spans directly by the identifier.
- The dashboard is intentionally run-focused. Aggregate Prometheus panels, recording rules, alerts, SLOs, and a durable metrics policy remain out of scope.
- PGL's provisioned `tempo` datasource enables TraceQL search streaming. In Grafana 13, that leaves normal dashboard panels pending because the local stream does not reach a terminal event. PGL must either disable that feature for the Tempo datasource or provision a dedicated non-streaming datasource with UID `tempo-agent-run-diagnosis` before this prototype dashboard is used after a clean stack reset.

## Reproduction

With the sibling PGL stack running, start the harness with:

```bash
pnpm prototype:agent-run-diagnosis
```

Send a scenario to `POST http://127.0.0.1:3001/api/prototype/agent-run-diagnosis` with one of `success`, `slow-operation`, `validation-failure`, `provider-failure`, `tool-failure`, or `confirmed-cancellation`. Use the response's `X-Agent-Run-Id` in the imported `PROTOTYPE - Agent Run Diagnosis` Grafana dashboard.
