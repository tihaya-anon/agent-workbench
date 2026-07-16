import { AgentRunExecutionError, type AgentRunExecutor } from "@teach-everything/agent";
import {
  type AgentRunErrorClassification,
  type AgentRunTelemetry,
  type AgentRunTelemetryScope,
  type AgentRunTerminalOutcome,
} from "@teach-everything/observability";
import {
  agentRunErrorClassificationSchema,
  agentRunExecutorEventSchema,
  agentRunRequestSchema,
  encodeAgentRunEventLine,
  isAgentRunValidationError,
  type AgentRunEvent,
  type AgentRunExecutorEvent,
  type AgentRunRequest,
} from "@teach-everything/shared";
import type { Context, Hono } from "hono";
import { validator } from "hono/validator";

const defaultCancellationConfirmationTimeoutMs = 10_000;

type TerminalAgentRunEvent = Extract<
  AgentRunEvent,
  { type: "run.completed" | "run.failed" | "run.cancelled" }
>;
type ExecutorNextResult =
  | {
      result: IteratorResult<AgentRunExecutorEvent>;
      type: "next";
    }
  | {
      error: unknown;
      type: "error";
    };

export type CreateAgentRunResponseOptions = {
  agentRunExecutor: AgentRunExecutor;
  agentRunId: string;
  input: AgentRunRequest;
  signal: AbortSignal;
  telemetryScope: AgentRunTelemetryScope;
};

export type RegisterAgentRunRoutesOptions = {
  agentRunExecutor: AgentRunExecutor;
  agentRunTelemetry: AgentRunTelemetry;
  createAgentRunId: () => string;
};

const getErrorClassification = (error: unknown) => {
  if (error instanceof AgentRunExecutionError) {
    const parsedClassification = agentRunErrorClassificationSchema.safeParse(
      error.errorClassification,
    );
    return parsedClassification.success ? parsedClassification.data : "internal";
  }
  if (isAgentRunValidationError(error)) return "validation";
  return "internal";
};

const isTerminalEvent = (event: AgentRunEvent): event is TerminalAgentRunEvent =>
  event.type === "run.completed" || event.type === "run.failed" || event.type === "run.cancelled";

const terminalTelemetryOutcome = (event: TerminalAgentRunEvent): AgentRunTerminalOutcome => {
  if (event.type === "run.failed") {
    return { outcome: "failed", errorClassification: event.errorClassification };
  }

  return { outcome: event.type === "run.completed" ? "succeeded" : "cancelled" };
};

const failureEvent = (errorClassification: AgentRunErrorClassification): TerminalAgentRunEvent => ({
  version: 1 as const,
  type: "run.failed" as const,
  errorClassification,
});

const createAgentRunStream = (
  executor: AgentRunExecutor,
  agentRunId: string,
  input: AgentRunRequest,
  requestSignal: AbortSignal,
  telemetryScope: AgentRunTelemetryScope,
) => {
  const encoder = new TextEncoder();
  let clientWritable = true;
  let completion: Promise<void> = Promise.resolve();
  let requestCancellation: () => void = () => {};

  return new ReadableStream<Uint8Array>({
    start: (controller) => {
      let terminal = false;
      let cancellationRequested = false;
      let cancellationDeadline: Promise<"deadline"> | undefined;
      let cancellationDeadlineTimeout: ReturnType<typeof setTimeout> | undefined;
      let cleanupConfirmation: Promise<"cleanup" | "cleanup_failed"> | undefined;
      let iterator: AsyncIterator<AgentRunExecutorEvent> | undefined;
      let resolveCancellationRequested: () => void = () => {};
      const cancellationRequestedPromise = new Promise<"cancellation-requested">((resolve) => {
        resolveCancellationRequested = () => resolve("cancellation-requested");
      });
      const executorCancellation = new AbortController();

      const send = (event: AgentRunEvent) => {
        if (!clientWritable) return;
        try {
          controller.enqueue(encoder.encode(encodeAgentRunEventLine(event)));
        } catch {
          clientWritable = false;
          requestCancellation();
        }
      };
      const close = () => {
        if (!clientWritable) return;
        try {
          controller.close();
        } catch {
          clientWritable = false;
        }
      };
      const clearCancellationDeadline = () => {
        if (cancellationDeadlineTimeout === undefined) return;
        clearTimeout(cancellationDeadlineTimeout);
        cancellationDeadlineTimeout = undefined;
      };
      const terminate = (event: TerminalAgentRunEvent) => {
        if (terminal) return;
        terminal = true;
        clearCancellationDeadline();
        telemetryScope.finish(terminalTelemetryOutcome(event));
        send(event);
        close();
      };
      const getCancellationDeadline = () => cancellationDeadline ?? Promise.resolve("deadline");
      const releaseIteratorSafely = async (
        runningIterator: AsyncIterator<AgentRunExecutorEvent>,
      ) => {
        try {
          await runningIterator.return?.();
        } catch {
          // Executor cleanup failures must not replace the terminal Agent Run outcome.
        }
      };
      const getCleanupConfirmation = () => {
        if (cleanupConfirmation !== undefined) return cleanupConfirmation;
        if (iterator?.return === undefined) return undefined;

        cleanupConfirmation = iterator.return().then(
          () => "cleanup" as const,
          () => "cleanup_failed" as const,
        );
        return cleanupConfirmation;
      };
      const raceCancellationConfirmation = (nextExecutorResult: Promise<ExecutorNextResult>) => {
        const cleanup = getCleanupConfirmation();
        return Promise.race(
          cleanup === undefined
            ? [nextExecutorResult, getCancellationDeadline()]
            : [nextExecutorResult, cleanup, getCancellationDeadline()],
        );
      };
      const requestExecutorCancellation = () => {
        if (terminal || cancellationRequested) return;
        cancellationRequested = true;
        telemetryScope.recordCancellationRequested();
        executorCancellation.abort();
        cancellationDeadline = new Promise((resolve) => {
          cancellationDeadlineTimeout = setTimeout(
            () => resolve("deadline"),
            defaultCancellationConfirmationTimeoutMs,
          );
        });
        void getCleanupConfirmation();
        resolveCancellationRequested();
      };
      const failCancellation = () => {
        terminate(failureEvent("cancellation_failed"));
      };
      const finishConfirmedCancellation = () => {
        terminate({ version: 1, type: "run.cancelled" });
      };
      const finishCancellationAfterCleanup = async () => {
        const cleanup = getCleanupConfirmation();
        if (cleanup === undefined) {
          finishConfirmedCancellation();
          return;
        }

        const cleanupResult = await Promise.race([cleanup, getCancellationDeadline()]);
        if (cleanupResult === "deadline" || cleanupResult === "cleanup_failed") {
          failCancellation();
          return;
        }

        finishConfirmedCancellation();
      };

      requestCancellation = requestExecutorCancellation;
      requestSignal.addEventListener("abort", requestExecutorCancellation, { once: true });

      completion = telemetryScope.runInContext(async () => {
        try {
          send({ version: 1, type: "run.started", agentRunId });
          if (requestSignal.aborted) requestExecutorCancellation();

          iterator = executor.execute(input, executorCancellation.signal)[Symbol.asyncIterator]();

          while (!terminal) {
            const nextExecutorResult: Promise<ExecutorNextResult> = iterator.next().then(
              (result) => ({ result, type: "next" as const }),
              (error: unknown) => ({ error, type: "error" as const }),
            );
            let executorResult = cancellationRequested
              ? await raceCancellationConfirmation(nextExecutorResult)
              : await Promise.race([nextExecutorResult, cancellationRequestedPromise]);

            if (executorResult === "cancellation-requested") {
              executorResult = await raceCancellationConfirmation(nextExecutorResult);
            }

            if (executorResult === "deadline") {
              failCancellation();
              return;
            }

            if (executorResult === "cleanup_failed") {
              failCancellation();
              return;
            }

            if (executorResult === "cleanup") {
              finishConfirmedCancellation();
              return;
            }

            if (cancellationRequested) {
              if (executorResult.type === "error" || executorResult.result.done === true) {
                await finishCancellationAfterCleanup();
                return;
              }

              const parsedEvent = agentRunExecutorEventSchema.safeParse(
                executorResult.result.value,
              );
              if (parsedEvent.success && isTerminalEvent(parsedEvent.data)) {
                await finishCancellationAfterCleanup();
                return;
              }

              continue;
            }

            if (executorResult.type === "error") {
              terminate(failureEvent(getErrorClassification(executorResult.error)));
              return;
            }

            if (executorResult.result.done === true) {
              terminate(failureEvent("internal"));
              return;
            }

            const executorEvent = executorResult.result.value;
            const parsedEvent = agentRunExecutorEventSchema.safeParse(executorEvent);
            if (!parsedEvent.success) {
              if (iterator !== undefined) void releaseIteratorSafely(iterator);
              terminate(failureEvent("internal"));
              return;
            }

            if (isTerminalEvent(parsedEvent.data)) {
              if (iterator !== undefined) void releaseIteratorSafely(iterator);
              terminate(parsedEvent.data);
              return;
            }

            send(parsedEvent.data);
          }
        } catch (error) {
          if (cancellationRequested) {
            terminate({ version: 1, type: "run.cancelled" });
            return;
          }

          terminate(failureEvent(getErrorClassification(error)));
        } finally {
          requestSignal.removeEventListener("abort", requestExecutorCancellation);
        }
      });
    },
    cancel: () => {
      clientWritable = false;
      requestCancellation();
      return completion;
    },
  });
};

export const invalidAgentRunRequestResponse = (c: Context) =>
  c.json({ success: false, message: "Invalid Agent Run request" }, 400);

export const validateAgentRunRequest = validator("json", (body, c) => {
  const parsedRequest = agentRunRequestSchema.safeParse(body);
  if (!parsedRequest.success) return invalidAgentRunRequestResponse(c);

  return parsedRequest.data;
});

export const createAgentRunResponse = ({
  agentRunExecutor,
  agentRunId,
  input,
  signal,
  telemetryScope,
}: CreateAgentRunResponseOptions) =>
  new Response(createAgentRunStream(agentRunExecutor, agentRunId, input, signal, telemetryScope), {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "X-Agent-Run-Id": agentRunId,
    },
  });

export const registerAgentRunRoutes = <App extends Hono>(
  app: App,
  { agentRunExecutor, agentRunTelemetry, createAgentRunId }: RegisterAgentRunRoutesOptions,
) =>
  app.post("/api/agent-runs", validateAgentRunRequest, (c) => {
    const agentRunId = createAgentRunId();
    const telemetryScope = agentRunTelemetry.start(agentRunId);

    return createAgentRunResponse({
      agentRunExecutor,
      agentRunId,
      input: c.req.valid("json"),
      signal: c.req.raw.signal,
      telemetryScope,
    });
  });
