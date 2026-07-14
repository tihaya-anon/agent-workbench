import { context, metrics, SpanStatusCode, trace, type Attributes } from "@opentelemetry/api";
import { createAgentGraph } from "@teach-everything/agent";
import { Hono } from "hono";
import { logger } from "./logger";

// PROTOTYPE: Agent Run Diagnosis harness. Remove after its PGL findings are captured.
// Question: can one metadata-only Agent Run explain its trace, logs, timing, tokens, and outcome?

const scenarios = [
  "success",
  "slow-operation",
  "validation-failure",
  "provider-failure",
  "tool-failure",
  "confirmed-cancellation",
] as const;

type Scenario = (typeof scenarios)[number];
type Outcome = "succeeded" | "failed" | "cancelled";

const tracer = trace.getTracer("@teach-everything/api/prototype-agent-run-diagnosis");
const meter = metrics.getMeter("@teach-everything/api/prototype-agent-run-diagnosis");
const runDuration = meter.createHistogram("agent.run.duration", {
  description: "Duration of a prototype Agent Run",
  unit: "s",
});
const tokenUsage = meter.createHistogram("gen_ai.client.token.usage", {
  description: "Metadata-only token counts emitted by the prototype Agent Run",
  unit: "{token}",
});

const isScenario = (value: unknown): value is Scenario =>
  typeof value === "string" && scenarios.some((scenario) => scenario === value);

const createAgentRunId = () => crypto.randomUUID();

const wait = (milliseconds: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("The prototype operation was cancelled", "AbortError"));
      return;
    }
    const timeout = setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(new DOMException("The prototype operation was cancelled", "AbortError"));
      },
      { once: true },
    );
  });

const scenarioErrorClassification = (scenario: Scenario) => {
  if (scenario === "validation-failure") return "validation";
  if (scenario === "provider-failure") return "provider";
  if (scenario === "tool-failure") return "tool";
  return undefined;
};

const diagnosticAttributes = (agentRunId: string, scenario: Scenario): Attributes => ({
  "agent.run.id": agentRunId,
  "agent.run.scenario": scenario,
  "agent.run.fixture": true,
});

const executeFixtureOperation = async (
  scenario: Scenario,
  signal: AbortSignal,
  attributes: Attributes,
) => {
  await tracer.startActiveSpan(
    scenario === "tool-failure" ? "agent.tool.fixture" : "agent.model.fixture",
    {
      attributes: {
        ...attributes,
        "agent.operation.name": scenario,
        "agent.operation.kind": scenario === "tool-failure" ? "tool" : "model",
      },
    },
    async (span) => {
      try {
        if (scenario === "slow-operation") await wait(1_250, signal);
        if (scenario === "confirmed-cancellation") await wait(250, signal);
        if (scenario === "provider-failure") throw new Error("Prototype provider failure");
        if (scenario === "tool-failure") throw new Error("Prototype tool failure");

        span.setAttributes({
          "gen_ai.provider.name": "prototype-provider",
          "gen_ai.request.model": "prototype-model",
          "gen_ai.usage.input_tokens": 12,
          "gen_ai.usage.output_tokens": 8,
        });
        tokenUsage.record(12, {
          "gen_ai.token.type": "input",
          "gen_ai.provider.name": "prototype-provider",
        });
        tokenUsage.record(8, {
          "gen_ai.token.type": "output",
          "gen_ai.provider.name": "prototype-provider",
        });
      } catch (error) {
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw error;
      } finally {
        span.end();
      }
    },
  );
};

const executeScenario = async (scenario: Scenario, signal: AbortSignal, attributes: Attributes) => {
  const graph = createAgentGraph(async () => {
    if (scenario === "validation-failure") throw new RangeError("Prototype validation failure");
    await executeFixtureOperation(scenario, signal, attributes);
    return { answer: "Fixture output intentionally excluded from telemetry." };
  });

  await graph.invoke({ prompt: "fixture" });
};

const encodeEvent = (event: Record<string, unknown>) =>
  `${JSON.stringify({ version: 1, ...event })}\n`;

export const createPrototypeAgentRunDiagnosisApp = () => {
  const prototypeApp = new Hono();

  prototypeApp.post("/api/prototype/agent-run-diagnosis", async (c) => {
    const body: unknown = await c.req.json().catch(() => undefined);
    const scenario =
      typeof body === "object" && body !== null
        ? (body as { scenario?: unknown }).scenario
        : undefined;
    if (!isScenario(scenario)) {
      return c.json({ message: `scenario must be one of: ${scenarios.join(", ")}` }, 400);
    }

    const agentRunId = createAgentRunId();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        const send = (event: Record<string, unknown>) =>
          controller.enqueue(encoder.encode(encodeEvent(event)));
        const cancellation = new AbortController();
        const abortRun = () => cancellation.abort();
        c.req.raw.signal.addEventListener("abort", abortRun, { once: true });
        if (scenario === "confirmed-cancellation") setTimeout(abortRun, 100);

        send({ type: "run.started", agent_run_id: agentRunId, scenario });

        void (async () => {
          const startedAt = performance.now();
          const attributes = diagnosticAttributes(agentRunId, scenario);
          let outcome: Outcome = "succeeded";
          let errorClassification: string | undefined;

          await tracer.startActiveSpan("agent.run", { attributes }, async (span) => {
            const runLogger = logger.child({
              "agent.run.id": agentRunId,
              "agent.run.scenario": scenario,
            });
            runLogger.info("Prototype Agent Run started", { eventName: "agent.run.started" });

            try {
              await context.with(trace.setSpan(context.active(), span), () =>
                executeScenario(scenario, cancellation.signal, attributes),
              );
              runLogger.info("Prototype Agent Run completed", {
                eventName: "agent.run.completed",
                attributes: { "agent.run.outcome": "succeeded" },
              });
            } catch (error) {
              if (error instanceof DOMException && error.name === "AbortError") {
                outcome = "cancelled";
                runLogger.info("Prototype Agent Run cancellation confirmed", {
                  eventName: "agent.run.cancelled",
                  attributes: {
                    "agent.run.outcome": "cancelled",
                    "agent.run.cancellation.confirmed": true,
                  },
                });
              } else {
                outcome = "failed";
                errorClassification = scenarioErrorClassification(scenario) ?? "internal";
                span.setStatus({ code: SpanStatusCode.ERROR });
                runLogger.error("Prototype Agent Run failed", {
                  eventName: "agent.run.failed",
                  attributes: {
                    "agent.run.outcome": "failed",
                    "error.type": errorClassification,
                  },
                });
              }
            } finally {
              const durationSeconds = (performance.now() - startedAt) / 1_000;
              span.setAttributes({
                "agent.run.outcome": outcome,
                ...(errorClassification === undefined ? {} : { "error.type": errorClassification }),
              });
              runDuration.record(durationSeconds, {
                "agent.run.outcome": outcome,
                "agent.run.scenario": scenario,
                ...(errorClassification === undefined ? {} : { "error.type": errorClassification }),
              });
              span.end();
              c.req.raw.signal.removeEventListener("abort", abortRun);
            }
          });

          send({
            type: `run.${outcome === "succeeded" ? "completed" : outcome}`,
            agent_run_id: agentRunId,
            ...(errorClassification === undefined
              ? {}
              : { error_classification: errorClassification }),
          });
          controller.close();
        })().catch((error: unknown) => controller.error(error));
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Agent-Run-Id": agentRunId,
      },
    });
  });

  return prototypeApp;
};
