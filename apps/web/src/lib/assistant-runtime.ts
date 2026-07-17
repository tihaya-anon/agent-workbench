import {
  useLocalRuntime,
  type ChatModelAdapter,
  type ChatModelRunResult,
  type ThreadMessage,
} from "@assistant-ui/react";
import { startAgentRunStream, type StartAgentRunStream } from "./agent-run-client";
import { consumeAgentRunStream, type AgentRunStreamUpdate } from "./agent-run-stream-consumer";

const getLatestUserText = (messages: readonly ThreadMessage[]) => {
  let userMessage: ThreadMessage | undefined;

  // assistant-ui sends the full thread; Agent Run v1 only accepts the latest user turn.
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

const toAssistantTextUpdate = (
  update: Extract<AgentRunStreamUpdate, { type: "message" | "completed" }>,
): ChatModelRunResult => {
  if (update.type === "completed") {
    return {
      content: [{ type: "text", text: update.text }],
      metadata: { custom: { agentRunId: update.agentRunId } },
      status: { type: "complete", reason: "stop" },
    };
  }

  return {
    content: [{ type: "text", text: update.text }],
    metadata: { custom: { agentRunId: update.agentRunId } },
  };
};

export const createAgentRunModel = (
  startRun: StartAgentRunStream = startAgentRunStream,
): ChatModelAdapter => ({
  async *run({ messages, abortSignal }): AsyncGenerator<ChatModelRunResult, void> {
    // Bridge assistant-ui's model adapter protocol to the backend's streaming Agent Run API.
    const startedRun = await startRun({
      message: getLatestUserText(messages).trim(),
      signal: abortSignal,
    });

    for await (const update of consumeAgentRunStream(startedRun)) {
      if (update.type === "message" || update.type === "completed") {
        yield toAssistantTextUpdate(update);
        continue;
      }

      throw new Error("Agent Run did not complete successfully");
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
