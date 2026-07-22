import {
  agentRunRequestSchema,
  runtimeProfileSchema,
  type AgentRunExecutorEvent,
} from "@agent-workbench/shared";
import { describe, expect, it } from "vitest";
import developmentProfileDocument from "../../../profiles/runtime-development.json";
import type { AgentRunExecutor, AgentRunExecutorContext } from "./index";

describe("AgentRunExecutor", () => {
  it("receives validated input and cancellation while yielding safe application events", async () => {
    // Given
    const input = agentRunRequestSchema.parse({ message: "Explain lexical scope." });
    const cancellation = new AbortController();
    const context: AgentRunExecutorContext = {
      agentBehaviorVersion: { graph: "graph:local" },
      agentRunId: "ar_executor",
      runtimeProfile: runtimeProfileSchema.parse(developmentProfileDocument),
    };
    const received: { context?: unknown; input?: unknown; signal?: AbortSignal } = {};
    const executor: AgentRunExecutor = {
      async *execute(receivedInput, signal, receivedContext) {
        received.input = receivedInput;
        received.signal = signal;
        received.context = receivedContext;
        yield { version: 1, type: "message.delta", text: "Lexical scope" };
        yield { version: 1, type: "run.completed" };
      },
    };

    // When
    const events: AgentRunExecutorEvent[] = [];
    for await (const event of executor.execute(input, cancellation.signal, context)) {
      events.push(event);
    }

    // Then
    expect(received).toEqual({ context, input, signal: cancellation.signal });
    expect(events).toEqual([
      { version: 1, type: "message.delta", text: "Lexical scope" },
      { version: 1, type: "run.completed" },
    ]);
  });
});
