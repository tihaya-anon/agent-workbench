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

const protocolError = () => new Error("Agent Run stream violates protocol");

const decodeAgentRunEvent = (line: string) => {
  const parsedEvent = agentRunEventLineSchema.safeParse(`${line}\n`);
  if (!parsedEvent.success) throw protocolError();
  return parsedEvent.data;
};

const readAgentRunEvents = async function* (body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (value) pending += decoder.decode(value, { stream: true });
      if (done) {
        pending += decoder.decode();
        break;
      }

      let delimiter = pending.indexOf("\n");
      while (delimiter >= 0) {
        const line = pending.slice(0, delimiter);
        pending = pending.slice(delimiter + 1);
        yield decodeAgentRunEvent(line);
        delimiter = pending.indexOf("\n");
      }
    }

    if (pending.length > 0) throw protocolError();
  } finally {
    reader.releaseLock();
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

    let agentRunId = "";
    let started = false;
    let terminalEvent: AgentRunEvent | undefined;
    let text = "";

    for await (const event of readAgentRunEvents(response.body)) {
      if (terminalEvent) throw protocolError();

      if (!started) {
        agentRunId = getAgentRunId(event, responseAgentRunId);
        started = true;
        continue;
      }

      if (event.type === "message.delta") {
        text += event.text;
        yield { content: [{ type: "text", text }], metadata: { custom: { agentRunId } } };
        continue;
      }

      if (
        event.type === "run.completed" ||
        event.type === "run.failed" ||
        event.type === "run.cancelled"
      ) {
        terminalEvent = event;
        continue;
      }

      throw protocolError();
    }

    if (!started || !terminalEvent) throw protocolError();

    if (terminalEvent.type === "run.completed") {
      yield {
        content: [{ type: "text", text }],
        metadata: { custom: { agentRunId } },
        status: { type: "complete", reason: "stop" },
      };
      return;
    }

    throw new Error("Agent Run did not complete successfully");
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
