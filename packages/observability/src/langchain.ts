import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import {
  SpanStatusCode,
  context,
  metrics,
  trace,
  type Attributes,
  type Context,
  type Histogram,
  type Span,
  type Tracer,
} from "@opentelemetry/api";

export type LangChainTelemetryOptions = {
  instrumentationName: string;
  instrumentationVersion?: string;
  onError?: (error: unknown) => void;
};

export type LangChainTelemetryCallback = BaseCallbackHandler & {
  runInActiveContext<T>(runId: string | undefined, operation: () => T): T;
};

type ActiveRun = {
  context: Context;
  metricAttributes?: Attributes;
  span?: Span;
  startedAt?: number;
};

type RunKind = "chain" | "llm" | "retriever" | "tool";

const commonRunAttributes = (
  kind: RunKind,
  name: string | undefined,
  metadata: Record<string, unknown> | undefined,
): Attributes => ({
  "langchain.run.kind": kind,
  "langchain.run.name": name ?? "anonymous",
  ...(typeof metadata?.ls_provider === "string"
    ? { "gen_ai.provider.name": metadata.ls_provider }
    : {}),
  ...(typeof metadata?.ls_model_name === "string"
    ? { "gen_ai.request.model": metadata.ls_model_name }
    : {}),
});

const runAttributes = (
  kind: RunKind,
  name: string | undefined,
  runId: string,
  parentRunId: string | undefined,
  tags: string[] | undefined,
  metadata: Record<string, unknown> | undefined,
): Attributes => ({
  ...commonRunAttributes(kind, name, metadata),
  "langchain.run.id": runId,
  ...(parentRunId === undefined ? {} : { "langchain.run.parent_id": parentRunId }),
  ...(tags === undefined || tags.length === 0 ? {} : { "langchain.run.tags": tags }),
  ...(typeof metadata?.langgraph_node === "string"
    ? { "langgraph.node.name": metadata.langgraph_node }
    : {}),
  ...(typeof metadata?.langgraph_step === "number"
    ? { "langgraph.step": metadata.langgraph_step }
    : {}),
});

const metricAttributes = (
  kind: RunKind,
  name: string | undefined,
  metadata: Record<string, unknown> | undefined,
  attributes: Attributes,
): Attributes => ({
  ...commonRunAttributes(kind, name, metadata),
  ...(typeof attributes["gen_ai.operation.name"] === "string"
    ? { "gen_ai.operation.name": attributes["gen_ai.operation.name"] }
    : {}),
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const firstNumber = (record: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number") return value;
  }

  return undefined;
};

type LlmResultTelemetry = {
  attributes: Attributes;
  inputTokens?: number;
  outputTokens?: number;
};

const readLlmResultTelemetry = (output: unknown): LlmResultTelemetry => {
  if (!isRecord(output)) return { attributes: {} };

  const attributes: Attributes = {};
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  const finishReasons = new Set<string>();
  const llmOutput = isRecord(output.llmOutput) ? output.llmOutput : undefined;
  const tokenUsage =
    llmOutput !== undefined && isRecord(llmOutput.tokenUsage) ? llmOutput.tokenUsage : undefined;

  if (tokenUsage !== undefined) {
    inputTokens = firstNumber(tokenUsage, ["inputTokens", "input_tokens", "promptTokens"]);
    outputTokens = firstNumber(tokenUsage, ["outputTokens", "output_tokens", "completionTokens"]);
  }

  if (Array.isArray(output.generations)) {
    for (const generationGroup of output.generations) {
      if (!Array.isArray(generationGroup)) continue;

      for (const generation of generationGroup) {
        if (!isRecord(generation)) continue;
        const generationInfo = isRecord(generation.generationInfo)
          ? generation.generationInfo
          : undefined;
        const message = isRecord(generation.message) ? generation.message : undefined;
        const responseMetadata =
          message !== undefined && isRecord(message.response_metadata)
            ? message.response_metadata
            : undefined;
        const usageMetadata =
          message !== undefined && isRecord(message.usage_metadata)
            ? message.usage_metadata
            : undefined;
        const finishReason = generationInfo?.finish_reason ?? responseMetadata?.finish_reason;

        if (typeof finishReason === "string") finishReasons.add(finishReason);
        if (attributes["gen_ai.response.model"] === undefined) {
          const responseModel = responseMetadata?.model_name ?? responseMetadata?.model;
          if (typeof responseModel === "string") {
            attributes["gen_ai.response.model"] = responseModel;
          }
        }
        if (usageMetadata !== undefined) {
          inputTokens ??= firstNumber(usageMetadata, ["input_tokens", "inputTokens"]);
          outputTokens ??= firstNumber(usageMetadata, ["output_tokens", "outputTokens"]);
        }
      }
    }
  }

  if (inputTokens !== undefined) attributes["gen_ai.usage.input_tokens"] = inputTokens;
  if (outputTokens !== undefined) attributes["gen_ai.usage.output_tokens"] = outputTokens;
  if (finishReasons.size > 0) {
    attributes["gen_ai.response.finish_reasons"] = [...finishReasons];
  }

  return {
    attributes,
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(outputTokens === undefined ? {} : { outputTokens }),
  };
};

const spanName = (kind: RunKind, name: string | undefined) =>
  `langchain.${kind}.${name ?? "anonymous"}`;

const reportError = (onError: ((error: unknown) => void) | undefined, error: unknown) => {
  try {
    onError?.(error);
  } catch {
    // Observability diagnostics must never affect the instrumented operation.
  }
};

class NoopTelemetryCallbackHandler extends BaseCallbackHandler {
  name = "open-telemetry-noop";

  constructor() {
    super({ raiseError: false });
    this.awaitHandlers = true;
  }

  runInActiveContext<T>(_runId: string | undefined, operation: () => T): T {
    return operation();
  }
}

class OpenTelemetryCallbackHandler extends BaseCallbackHandler {
  name = "open-telemetry";

  private readonly activeRuns = new Map<string, ActiveRun>();
  private readonly runDuration: Histogram;
  private readonly tokenUsage: Histogram;
  private readonly tracer: Tracer;
  private readonly onError: (error: unknown) => void;

  constructor(options: LangChainTelemetryOptions) {
    super({ raiseError: false });
    this.awaitHandlers = true;
    this.tracer = trace.getTracer(options.instrumentationName, options.instrumentationVersion);
    const meter = metrics.getMeter(options.instrumentationName, options.instrumentationVersion);
    this.runDuration = meter.createHistogram("langchain.run.duration", {
      description: "Duration of LangChain and LangGraph runs",
      unit: "s",
    });
    this.tokenUsage = meter.createHistogram("gen_ai.client.token.usage", {
      description: "Number of input and output tokens used by a generative AI operation",
      unit: "{token}",
    });
    this.onError = options.onError ?? (() => undefined);
  }

  private safely(operation: () => void) {
    try {
      operation();
    } catch (error) {
      reportError(this.onError, error);
    }
  }

  runInActiveContext<T>(runId: string | undefined, operation: () => T): T {
    const runContext = runId === undefined ? undefined : this.activeRuns.get(runId)?.context;
    if (runContext === undefined) return operation();

    let invoked = false;
    let operationFailed = false;
    let operationError: unknown;
    let operationResult: T | undefined;

    try {
      context.with(runContext, () => {
        if (invoked) {
          if (operationFailed) throw operationError;
          return operationResult as T;
        }

        invoked = true;
        try {
          operationResult = operation();
          return operationResult;
        } catch (error) {
          operationFailed = true;
          operationError = error;
          throw error;
        }
      });
      if (!invoked) {
        reportError(this.onError, new Error("OpenTelemetry context manager skipped operation"));
        return operation();
      }
      if (operationFailed) throw operationError;

      return operationResult as T;
    } catch (error) {
      if (!invoked) {
        reportError(this.onError, error);
        return operation();
      }
      if (operationFailed) throw operationError;

      reportError(this.onError, error);
      return operationResult as T;
    }
  }

  private startRun(
    kind: RunKind,
    name: string | undefined,
    runId: string,
    parentRunId?: string,
    tags?: string[],
    metadata?: Record<string, unknown>,
    attributes: Attributes = {},
  ) {
    this.safely(() => {
      const parentContext =
        (parentRunId === undefined ? undefined : this.activeRuns.get(parentRunId)?.context) ??
        context.active();
      if (tags?.includes("langsmith:hidden") === true) {
        this.activeRuns.set(runId, { context: parentContext });
        return;
      }

      const span = this.tracer.startSpan(
        spanName(kind, name),
        {
          attributes: {
            ...runAttributes(kind, name, runId, parentRunId, tags, metadata),
            ...attributes,
          },
        },
        parentContext,
      );

      this.activeRuns.set(runId, {
        context: trace.setSpan(parentContext, span),
        metricAttributes: metricAttributes(kind, name, metadata, attributes),
        span,
        startedAt: performance.now(),
      });
    });
  }

  private recordDuration(run: ActiveRun, status: "error" | "ok") {
    if (run.metricAttributes === undefined || run.startedAt === undefined) return;

    const durationSeconds = (performance.now() - run.startedAt) / 1_000;
    this.safely(() =>
      this.runDuration.record(durationSeconds, {
        ...run.metricAttributes,
        "langchain.run.status": status,
      }),
    );
  }

  private endRun(runId: string, attributes: Attributes = {}) {
    const run = this.activeRuns.get(runId);
    this.activeRuns.delete(runId);
    if (run === undefined) return;

    if (run.span !== undefined) {
      const span = run.span;
      this.safely(() => span.setAttributes(attributes));
      this.safely(() => span.end());
    }
    this.recordDuration(run, "ok");
  }

  private failRun(error: unknown, runId: string) {
    const run = this.activeRuns.get(runId);
    this.activeRuns.delete(runId);
    if (run?.span === undefined) return;

    const span = run.span;
    this.safely(() => span.recordException(error instanceof Error ? error : String(error)));
    this.safely(() => span.setStatus({ code: SpanStatusCode.ERROR }));
    this.safely(() => span.end());
    this.recordDuration(run, "error");
  }

  private endLlmRun(output: unknown, runId: string) {
    const run = this.activeRuns.get(runId);
    const telemetry = readLlmResultTelemetry(output);

    if (run?.metricAttributes !== undefined) {
      if (telemetry.inputTokens !== undefined) {
        const inputTokens = telemetry.inputTokens;
        this.safely(() =>
          this.tokenUsage.record(inputTokens, {
            ...run.metricAttributes,
            "gen_ai.token.type": "input",
          }),
        );
      }
      if (telemetry.outputTokens !== undefined) {
        const outputTokens = telemetry.outputTokens;
        this.safely(() =>
          this.tokenUsage.record(outputTokens, {
            ...run.metricAttributes,
            "gen_ai.token.type": "output",
          }),
        );
      }
    }

    this.endRun(runId, telemetry.attributes);
  }

  handleChainStart(
    _chain: unknown,
    _inputs: unknown,
    runId: string,
    parentRunId?: string,
    tags?: string[],
    metadata?: Record<string, unknown>,
    _runType?: string,
    runName?: string,
  ) {
    this.startRun("chain", runName, runId, parentRunId, tags, metadata);
  }

  handleChainEnd(_outputs: unknown, runId: string) {
    this.endRun(runId);
  }

  handleChainError(error: unknown, runId: string) {
    this.failRun(error, runId);
  }

  handleLLMStart(
    _llm: unknown,
    _prompts: string[],
    runId: string,
    parentRunId?: string,
    _extraParams?: Record<string, unknown>,
    tags?: string[],
    metadata?: Record<string, unknown>,
    runName?: string,
  ) {
    this.startRun("llm", runName, runId, parentRunId, tags, metadata, {
      "gen_ai.operation.name": "text_completion",
    });
  }

  handleChatModelStart(
    _llm: unknown,
    _messages: unknown[][],
    runId: string,
    parentRunId?: string,
    _extraParams?: Record<string, unknown>,
    tags?: string[],
    metadata?: Record<string, unknown>,
    runName?: string,
  ) {
    this.startRun("llm", runName, runId, parentRunId, tags, metadata, {
      "gen_ai.operation.name": "chat",
    });
  }

  handleLLMEnd(output: unknown, runId: string) {
    this.endLlmRun(output, runId);
  }

  handleLLMError(error: unknown, runId: string) {
    this.failRun(error, runId);
  }

  handleToolStart(
    _tool: unknown,
    _input: string,
    runId: string,
    parentRunId?: string,
    tags?: string[],
    metadata?: Record<string, unknown>,
    runName?: string,
  ) {
    this.startRun("tool", runName, runId, parentRunId, tags, metadata);
  }

  handleToolEnd(_output: unknown, runId: string) {
    this.endRun(runId);
  }

  handleToolError(error: unknown, runId: string) {
    this.failRun(error, runId);
  }

  handleRetrieverStart(
    _retriever: unknown,
    _query: string,
    runId: string,
    parentRunId?: string,
    tags?: string[],
    metadata?: Record<string, unknown>,
    runName?: string,
  ) {
    this.startRun("retriever", runName, runId, parentRunId, tags, metadata);
  }

  handleRetrieverEnd(_documents: unknown[], runId: string) {
    this.endRun(runId);
  }

  handleRetrieverError(error: unknown, runId: string) {
    this.failRun(error, runId);
  }
}

export const createLangChainTelemetryCallback = (
  options: LangChainTelemetryOptions,
): LangChainTelemetryCallback => {
  try {
    return new OpenTelemetryCallbackHandler(options);
  } catch (error) {
    reportError(options.onError, error);
    return new NoopTelemetryCallbackHandler();
  }
};
