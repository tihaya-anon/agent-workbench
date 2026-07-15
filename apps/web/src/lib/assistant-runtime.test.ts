import type { ChatModelRunOptions, ChatModelRunResult, ThreadMessage } from "@assistant-ui/react";
import { describe, expect, it, vi } from "vitest";
import { createAgentRunModel } from "./assistant-runtime";

describe("createAgentRunModel", () => {
  it("streams cumulative assistant text and retains the Agent Run Identifier", async () => {
    // Given
    const encoder = new TextEncoder();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode('{"version":1,"type":"run.started","agentRunId":"ar_test_'),
            );
            controller.enqueue(
              encoder.encode(
                '02"}\n{"version":1,"type":"message.delta","text":"Lexical "}\n{"version":1,"type":"message.delta","text":"scope."}\n{"version":1,"type":"run.completed"}\n',
              ),
            );
            controller.close();
          },
        }),
        {
          headers: {
            "Content-Type": "application/x-ndjson",
            "X-Agent-Run-Id": "ar_test_02",
          },
        },
      ),
    );
    const adapter = createAgentRunModel(fetcher);
    const cancellation = new AbortController();
    const messages = [
      {
        id: "message_01",
        createdAt: new Date(0),
        role: "user" as const,
        content: [{ type: "text" as const, text: "Explain lexical scope." }],
        attachments: [],
        metadata: { custom: {} },
      },
    ] satisfies ThreadMessage[];
    const options = {
      messages,
      runConfig: {},
      abortSignal: cancellation.signal,
      context: {},
      unstable_getMessage: () => messages[0]!,
    } satisfies ChatModelRunOptions;

    // When
    const result = adapter.run(options);
    if (!(Symbol.asyncIterator in result)) {
      throw new Error("Expected the Agent Run adapter to stream updates");
    }
    const updates: ChatModelRunResult[] = [];
    for await (const update of result) {
      updates.push(update);
    }

    // Then
    expect(fetcher).toHaveBeenCalledWith(
      "/api/agent-runs",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ message: "Explain lexical scope." }),
        signal: cancellation.signal,
      }),
    );
    expect(updates).toEqual([
      {
        content: [{ type: "text", text: "Lexical " }],
        metadata: { custom: { agentRunId: "ar_test_02" } },
      },
      {
        content: [{ type: "text", text: "Lexical scope." }],
        metadata: { custom: { agentRunId: "ar_test_02" } },
      },
      {
        content: [{ type: "text", text: "Lexical scope." }],
        metadata: { custom: { agentRunId: "ar_test_02" } },
        status: { type: "complete", reason: "stop" },
      },
    ]);
  });
});
