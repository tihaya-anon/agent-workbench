import { describe, expect, it } from "vitest";
import developmentProfileDocument from "../../../../profiles/runtime-development.json";
import publishedProfileDocument from "../../../../profiles/runtime-published.json";
import {
  agentRunWorkerCommandLineSchema,
  agentRunWorkerCommandSchema,
  agentRunWorkerEventLineSchema,
  agentRunWorkerEventSchema,
  agentRunWorkerProgressEventSchema,
  agentRunWorkerStartCommandSchema,
  encodeAgentRunWorkerCommandLine,
  encodeAgentRunWorkerEventLine,
  runtimeProfileSchema,
} from "../index";

const developmentRuntimeProfile = runtimeProfileSchema.parse(developmentProfileDocument);
const publishedRuntimeProfile = runtimeProfileSchema.parse(publishedProfileDocument);

const completeBehaviorVersion = {
  graph: "graph:default-agent:v1",
  state: "state:lesson-session:v1",
  action: "action:tutor-response:v1",
  prompt: "prompt:socratic:v3",
  tool: "tool:retrieval:v2",
  model: "model:openai:gpt-5:2026-07-20",
  trialParameter: "trial-parameter:baseline:v1",
  sourceRevision: "0123456789abcdef0123456789abcdef01234567",
} as const;

describe("agentRunWorkerCommandSchema", () => {
  it("accepts a start command with complete behavior identity under the published Runtime Profile", () => {
    // Given
    const command = {
      version: 1,
      type: "run.start",
      agentRunId: "ar_worker_01",
      input: { message: "Explain lexical scope." },
      runtimeProfile: publishedRuntimeProfile,
      behaviorVersion: completeBehaviorVersion,
    } as const;

    // When
    const result = agentRunWorkerCommandSchema.safeParse(command);

    // Then
    expect(result).toMatchObject({ success: true, data: command });
  });

  it("accepts an incomplete ad hoc start command under the development Runtime Profile", () => {
    // Given
    const command = {
      version: 1,
      type: "run.start",
      agentRunId: "ar_worker_dev",
      input: { message: "Draft a local test response." },
      runtimeProfile: developmentRuntimeProfile,
      behaviorVersion: {
        graph: "graph:local",
      },
    } as const;

    // When
    const result = agentRunWorkerStartCommandSchema.safeParse(command);

    // Then
    expect(result).toMatchObject({ success: true, data: command });
  });

  it("rejects incomplete behavior identity under the published Runtime Profile", () => {
    // Given
    const command = {
      version: 1,
      type: "run.start",
      agentRunId: "ar_worker_invalid",
      input: { message: "Explain closures." },
      runtimeProfile: publishedRuntimeProfile,
      behaviorVersion: {
        graph: "graph:local",
      },
    } as const;

    // When
    const result = agentRunWorkerCommandSchema.safeParse(command);

    // Then
    expect(result.success).toBe(false);
  });

  it.each([
    { version: 1, type: "run.cancel", agentRunId: "ar_worker_01" },
    { version: 1, type: "run.start", agentRunId: "", input: { message: "Hi" } },
    {
      version: 1,
      type: "run.start",
      agentRunId: "ar_worker_01",
      input: { message: "" },
      runtimeProfile: developmentRuntimeProfile,
      behaviorVersion: {},
    },
    {
      version: 1,
      type: "run.cancel",
      agentRunId: "ar_worker_01",
      reason: "client-aborted",
    },
  ])("validates the worker command surface: %j", (command) => {
    // Given
    const candidate: unknown = command;

    // When
    const result = agentRunWorkerCommandSchema.safeParse(candidate);

    // Then
    expect(result.success).toBe(command.type === "run.cancel" && "reason" in command === false);
  });
});

describe("agentRunWorkerEventSchema", () => {
  it.each([
    { version: 1, type: "run.started", agentRunId: "ar_worker_01" },
    { version: 1, type: "message.delta", text: "A closure keeps bindings." },
    {
      version: 1,
      type: "progress.update",
      scope: "task",
      label: "retrieve-context",
      status: "running",
      message: "Retrieving context",
    },
    { version: 1, type: "run.completed" },
    { version: 1, type: "run.failed", errorClassification: "validation" },
    { version: 1, type: "run.cancelled" },
  ])("accepts the v1 worker $type event", (event) => {
    // Given
    const candidate: unknown = event;

    // When
    const result = agentRunWorkerEventSchema.safeParse(candidate);

    // Then
    expect(result).toMatchObject({ success: true, data: event });
  });

  it.each([
    { version: 2, type: "progress.update", scope: "task", label: "retrieve-context" },
    { version: 1, type: "progress.update", scope: "langgraph-node", label: "retrieve-context" },
    { version: 1, type: "progress.update", scope: "task", label: "" },
    {
      version: 1,
      type: "progress.update",
      scope: "task",
      label: "retrieve-context",
      rawChunk: { node: "private" },
    },
  ])("rejects an unknown or malformed worker progress event: %j", (event) => {
    // Given
    const candidate: unknown = event;

    // When
    const result = agentRunWorkerProgressEventSchema.safeParse(candidate);

    // Then
    expect(result.success).toBe(false);
  });
});

describe("Agent Run worker NDJSON lines", () => {
  it("encodes and decodes one start command line", () => {
    // Given
    const command = {
      version: 1,
      type: "run.start",
      agentRunId: "ar_worker_01",
      input: { message: "Explain recursion." },
      runtimeProfile: publishedRuntimeProfile,
      behaviorVersion: completeBehaviorVersion,
    } as const;

    // When
    const line = encodeAgentRunWorkerCommandLine(command);
    const result = agentRunWorkerCommandLineSchema.safeParse(line);

    // Then
    expect(result).toMatchObject({ success: true, data: command });
  });

  it("encodes and decodes one worker event line", () => {
    // Given
    const event = {
      version: 1,
      type: "progress.update",
      scope: "run",
      label: "graph-execution",
      status: "started",
    } as const;

    // When
    const line = encodeAgentRunWorkerEventLine(event);
    const result = agentRunWorkerEventLineSchema.safeParse(line);

    // Then
    expect(result).toMatchObject({ success: true, data: event });
  });

  it.each([
    "",
    "not json",
    '{"version":1,"type":"run.cancel","agentRunId":"ar_01"}\n{"version":1,"type":"run.cancel","agentRunId":"ar_02"}',
    '{"version":1,"type":"run.completed","raw":"private"}',
  ])("rejects a malformed worker protocol line: %j", (line) => {
    // Given
    const candidate: unknown = line;

    // When
    const commandResult = agentRunWorkerCommandLineSchema.safeParse(candidate);
    const eventResult = agentRunWorkerEventLineSchema.safeParse(candidate);

    // Then
    expect(commandResult.success).toBe(false);
    expect(eventResult.success).toBe(false);
  });
});
