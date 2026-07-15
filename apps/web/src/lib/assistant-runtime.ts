import { agentRunEventLineSchema, type AgentRunEvent } from "@teach-everything/shared";
import {
  useLocalRuntime,
  type ChatModelAdapter,
  type ChatModelRunResult,
  type ThreadMessage,
} from "@assistant-ui/react";

const getLatestUserText = (messages: readonly ThreadMessage[]) => {
  let userMessage: ThreadMessage | undefined;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user") {
      userMessage = message;
      break;
    }
  }

  return (
    userMessage?.content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join(" ") ?? ""
  );
};

const readAgentRunEvents = async function* (body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = "";

  while (true) {
    const { done, value } = await reader.read();
    pending += decoder.decode(value, { stream: !done });

    let delimiter = pending.indexOf("\n");
    while (delimiter >= 0) {
      const line = pending.slice(0, delimiter);
      pending = pending.slice(delimiter + 1);
      yield agentRunEventLineSchema.parse(`${line}\n`);
      delimiter = pending.indexOf("\n");
    }

    if (done) break;
  }

  if (pending.length > 0) {
    yield agentRunEventLineSchema.parse(pending);
  }
};

const getAgentRunId = (event: AgentRunEvent, responseAgentRunId: string) => {
  if (event.type !== "run.started" || event.agentRunId !== responseAgentRunId) {
    throw new Error("Agent Run stream did not start with the response identifier");
  }

  return event.agentRunId;
};

export const createAgentRunModel = (fetcher: typeof fetch = fetch): ChatModelAdapter => ({
  async *run({ messages, abortSignal }): AsyncGenerator<ChatModelRunResult, void> {
    const response = await fetcher("/api/agent-runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: getLatestUserText(messages).trim() }),
      signal: abortSignal,
    });

    if (!response.ok) {
      throw new Error("Agent Run request failed");
    }

    const responseAgentRunId = response.headers.get("X-Agent-Run-Id");
    if (!responseAgentRunId || !response.body) {
      throw new Error("Agent Run response is missing its stream identifier or body");
    }

    let agentRunId: string | undefined;
    let text = "";

    for await (const event of readAgentRunEvents(response.body)) {
      agentRunId ??= getAgentRunId(event, responseAgentRunId);

      if (event.type === "message.delta") {
        text += event.text;
        yield { content: [{ type: "text", text }], metadata: { custom: { agentRunId } } };
      }

      if (event.type === "run.completed") {
        yield {
          content: [{ type: "text", text }],
          metadata: { custom: { agentRunId } },
          status: { type: "complete", reason: "stop" },
        };
        return;
      }

      if (event.type === "run.failed" || event.type === "run.cancelled") {
        throw new Error("Agent Run did not complete successfully");
      }
    }
  },
});

const agentRunModel = createAgentRunModel();

export const useAgentRunAssistantRuntime = () =>
  useLocalRuntime(agentRunModel, {
    adapters: {
      suggestion: {
        async generate() {
          return [
            { prompt: "Explain the runtime boundary" },
            { prompt: "Show me the frontend stack" },
            { prompt: "Help me learn a new concept" },
          ];
        },
      },
    },
  });
