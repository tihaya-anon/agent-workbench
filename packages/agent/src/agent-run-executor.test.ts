import { agentRunRequestSchema, type AgentRunExecutorEvent } from "@teach-everything/shared";
import { describe, expect, it } from "vitest";
import type { AgentRunExecutor } from "./index";

describe("AgentRunExecutor", () => {
  it("receives validated input and cancellation while yielding safe application events", async () => {
    // Given
    const input = agentRunRequestSchema.parse({ message: "Explain lexical scope." });
    const cancellation = new AbortController();
    const received: { input?: unknown; signal?: AbortSignal } = {};
    const executor: AgentRunExecutor = {
      async *execute(receivedInput, signal) {
        received.input = receivedInput;
        received.signal = signal;
        yield { version: 1, type: "message.delta", text: "Lexical scope" };
        yield { version: 1, type: "run.completed" };
      },
    };

    // When
    const events: AgentRunExecutorEvent[] = [];
    for await (const event of executor.execute(input, cancellation.signal)) {
      events.push(event);
    }

    // Then
    expect(received).toEqual({ input, signal: cancellation.signal });
    expect(events).toEqual([
      { version: 1, type: "message.delta", text: "Lexical scope" },
      { version: 1, type: "run.completed" },
    ]);
  });
});
