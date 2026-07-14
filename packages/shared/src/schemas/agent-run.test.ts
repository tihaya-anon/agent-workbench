import { describe, expect, it } from "vitest";
import {
  agentRunErrorClassificationSchema,
  agentRunEventLineSchema,
  agentRunEventSchema,
  agentRunExecutorEventSchema,
  agentRunOutcomeSchema,
  agentRunRequestSchema,
  encodeAgentRunEventLine,
} from "../index";

describe("agentRunRequestSchema", () => {
  it("accepts one non-empty user message without changing its content", () => {
    // Given
    const request = { message: "  Explain closures with an example.  " };

    // When
    const result = agentRunRequestSchema.safeParse(request);

    // Then
    expect(result).toMatchObject({ success: true, data: request });
  });

  it.each([
    undefined,
    null,
    {},
    { message: "" },
    { message: " \n\t " },
    { message: 42 },
    { message: "Hello", secondMessage: "Not allowed" },
  ])("rejects an empty or malformed Agent Run request: %j", (request) => {
    // Given
    const malformedRequest: unknown = request;

    // When
    const result = agentRunRequestSchema.safeParse(malformedRequest);

    // Then
    expect(result.success).toBe(false);
  });
});

describe("Agent Run closed vocabularies", () => {
  it.each(["succeeded", "failed", "cancelled"])("accepts the %s outcome", (outcome) => {
    // Given
    const candidate: unknown = outcome;

    // When
    const result = agentRunOutcomeSchema.safeParse(candidate);

    // Then
    expect(result).toMatchObject({ success: true, data: outcome });
  });

  it("rejects an outcome outside the v1 vocabulary", () => {
    // Given
    const candidate = "completed";

    // When
    const result = agentRunOutcomeSchema.safeParse(candidate);

    // Then
    expect(result.success).toBe(false);
  });

  it.each(["validation", "provider", "tool", "timeout", "cancellation_failed", "internal"])(
    "accepts the %s error classification",
    (classification) => {
      // Given
      const candidate: unknown = classification;

      // When
      const result = agentRunErrorClassificationSchema.safeParse(candidate);

      // Then
      expect(result).toMatchObject({ success: true, data: classification });
    },
  );

  it("rejects an error classification outside the v1 vocabulary", () => {
    // Given
    const candidate = "network";

    // When
    const result = agentRunErrorClassificationSchema.safeParse(candidate);

    // Then
    expect(result.success).toBe(false);
  });
});

describe("agentRunEventSchema", () => {
  it.each([
    { version: 1, type: "run.started", agentRunId: "ar_01" },
    { version: 1, type: "message.delta", text: "A closure" },
    { version: 1, type: "run.completed" },
    { version: 1, type: "run.failed", errorClassification: "provider" },
    { version: 1, type: "run.cancelled" },
  ])("accepts the v1 $type event", (event) => {
    // Given
    const candidate: unknown = event;

    // When
    const result = agentRunEventSchema.safeParse(candidate);

    // Then
    expect(result).toMatchObject({ success: true, data: event });
  });

  it.each([
    { version: 2, type: "run.completed" },
    { version: 1, type: "tool.started", toolName: "search" },
    { version: 1, type: "run.started" },
    { version: 1, type: "run.started", agentRunId: "" },
    { version: 1, type: "message.delta", text: 42 },
    { version: 1, type: "run.failed", errorClassification: "network" },
    { version: 1, type: "run.completed", exception: "private details" },
  ])("rejects an unknown or malformed event: %j", (event) => {
    // Given
    const candidate: unknown = event;

    // When
    const result = agentRunEventSchema.safeParse(candidate);

    // Then
    expect(result.success).toBe(false);
  });
});

describe("Agent Run NDJSON lines", () => {
  it("decodes one complete v1 event", () => {
    // Given
    const line = '{"version":1,"type":"message.delta","text":"part one"}';

    // When
    const result = agentRunEventLineSchema.safeParse(line);

    // Then
    expect(result).toEqual({
      success: true,
      data: { version: 1, type: "message.delta", text: "part one" },
    });
  });

  it("encodes embedded line breaks inside one complete NDJSON event line", () => {
    // Given
    const event = { version: 1, type: "message.delta", text: "part one\npart two" } as const;

    // When
    const line = encodeAgentRunEventLine(event);

    // Then
    expect(line).toBe('{"version":1,"type":"message.delta","text":"part one\\npart two"}\n');
  });

  it.each(["\n", "\r\n"])(
    "decodes an encoded event line with the %j NDJSON delimiter",
    (delimiter) => {
      // Given
      const event = { version: 1, type: "run.completed" } as const;
      const line = encodeAgentRunEventLine(event).replace(/\n$/u, delimiter);

      // When
      const result = agentRunEventLineSchema.safeParse(line);

      // Then
      expect(result).toEqual({ success: true, data: event });
    },
  );

  it.each([
    "",
    "not json",
    '{"version":1,"type":"run.completed"}\n{"version":1,"type":"run.cancelled"}',
    '{"version":1,"type":"run.completed"}\n\n',
    '{"version":1,"type":"run.completed"}\r',
    '{"version":2,"type":"run.completed"}',
  ])("rejects a malformed NDJSON event line: %j", (line) => {
    // Given
    const candidate: unknown = line;

    // When
    const result = agentRunEventLineSchema.safeParse(candidate);

    // Then
    expect(result.success).toBe(false);
  });
});

describe("agentRunExecutorEventSchema", () => {
  it.each([
    { version: 1, type: "message.delta", text: "A closure" },
    { version: 1, type: "run.completed" },
    { version: 1, type: "run.failed", errorClassification: "tool" },
    { version: 1, type: "run.cancelled" },
  ])("accepts the safe executor $type event", (event) => {
    // Given
    const candidate: unknown = event;

    // When
    const result = agentRunExecutorEventSchema.safeParse(candidate);

    // Then
    expect(result).toMatchObject({ success: true, data: event });
  });

  it.each([
    { version: 1, type: "run.started", agentRunId: "executor-owned-id" },
    { version: 1, type: "model.tokens", tokens: 12 },
    { version: 1, type: "run.failed", errorClassification: "provider", error: "secret" },
  ])("rejects an executor-private or transport-owned event: %j", (event) => {
    // Given
    const candidate: unknown = event;

    // When
    const result = agentRunExecutorEventSchema.safeParse(candidate);

    // Then
    expect(result.success).toBe(false);
  });
});
