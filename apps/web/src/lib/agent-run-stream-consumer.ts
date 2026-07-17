import {
  agentRunEventLineSchema,
  type AgentRunErrorClassification,
  type AgentRunEvent,
} from "@teach-everything/shared";

export type ConsumeAgentRunStreamOptions = {
  agentRunId: string;
  body: ReadableStream<Uint8Array>;
};

export type AgentRunStreamUpdate =
  | { agentRunId: string; text: string; type: "message" }
  | { agentRunId: string; text: string; type: "completed" }
  | {
      agentRunId: string;
      errorClassification: AgentRunErrorClassification;
      text: string;
      type: "failed";
    }
  | { agentRunId: string; text: string; type: "cancelled" };

export class AgentRunStreamProtocolError extends Error {
  constructor() {
    super("Agent Run stream violates protocol");
    this.name = "AgentRunStreamProtocolError";
  }
}

const protocolError = () => new AgentRunStreamProtocolError();

const decodeAgentRunEvent = (line: string) => {
  const parsedEvent = agentRunEventLineSchema.safeParse(`${line}\n`);
  if (!parsedEvent.success) throw protocolError();
  return parsedEvent.data;
};

const readAgentRunEvents = async function* (
  body: ReadableStream<Uint8Array>,
): AsyncIterable<AgentRunEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  // Chunks do not align with NDJSON records, so keep partial lines between reads.
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

const requireStartedEvent = (event: AgentRunEvent, agentRunId: string) => {
  // The first event binds the body stream to the ID returned in the response header.
  if (event.type !== "run.started" || event.agentRunId !== agentRunId) {
    throw protocolError();
  }
};

export const consumeAgentRunStream = async function* ({
  agentRunId,
  body,
}: ConsumeAgentRunStreamOptions): AsyncIterable<AgentRunStreamUpdate> {
  let started = false;
  let terminated = false;
  let text = "";

  for await (const event of readAgentRunEvents(body)) {
    // Anything after a terminal event means the server violated the stream contract.
    if (terminated) throw protocolError();

    if (!started) {
      requireStartedEvent(event, agentRunId);
      started = true;
      continue;
    }

    if (event.type === "message.delta") {
      text += event.text;
      yield { agentRunId, text, type: "message" };
      continue;
    }

    if (event.type === "run.completed") {
      terminated = true;
      yield { agentRunId, text, type: "completed" };
      continue;
    }

    if (event.type === "run.failed") {
      terminated = true;
      yield { agentRunId, errorClassification: event.errorClassification, text, type: "failed" };
      continue;
    }

    if (event.type === "run.cancelled") {
      terminated = true;
      yield { agentRunId, text, type: "cancelled" };
      continue;
    }

    throw protocolError();
  }

  if (!started || !terminated) throw protocolError();
};
