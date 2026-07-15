import type { AgentRunExecutor } from "@teach-everything/agent";
import { agentRunEventLineSchema, healthResponseSchema } from "@teach-everything/shared";
import { describe, expect, it } from "vitest";
import { app, createApp } from "./app";

describe("GET /api/health", () => {
  it("returns a successful health response", async () => {
    // Given
    const request = new Request("http://localhost/api/health");

    // When
    const response = await app.request(request);
    const body: unknown = await response.json();

    // Then
    expect(response.status).toBe(200);
    expect(healthResponseSchema.safeParse(body).success).toBe(true);
  });
});

describe("POST /api/agent-runs", () => {
  it("streams a successful Agent Run with one identifier shared by the header and first event", async () => {
    // Given
    const received: { message?: string } = {};
    const executor: AgentRunExecutor = {
      async *execute(input) {
        received.message = input.message;
        yield { version: 1, type: "message.delta", text: "Closures retain their scope. " };
        yield { version: 1, type: "message.delta", text: "That is lexical scoping." };
        yield { version: 1, type: "run.completed" };
      },
    };
    const api = createApp({
      agentRunExecutor: executor,
      createAgentRunId: () => "ar_test_01",
    });
    const request = new Request("http://localhost/api/agent-runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Explain closures." }),
    });

    // When
    const response = await api.request(request);
    const lines = (await response.text())
      .trim()
      .split("\n")
      .map((line) => agentRunEventLineSchema.parse(line));

    // Then
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/x-ndjson");
    expect(response.headers.get("X-Agent-Run-Id")).toBe("ar_test_01");
    expect(received).toEqual({ message: "Explain closures." });
    expect(lines).toEqual([
      { version: 1, type: "run.started", agentRunId: "ar_test_01" },
      { version: 1, type: "message.delta", text: "Closures retain their scope. " },
      { version: 1, type: "message.delta", text: "That is lexical scoping." },
      { version: 1, type: "run.completed" },
    ]);
  });

  it.each(["{", JSON.stringify({ message: " \n " })])(
    "rejects invalid input before creating an Agent Run: %j",
    async (body) => {
      // Given
      const api = createApp({
        agentRunExecutor: {
          async *execute() {
            yield { version: 1, type: "run.completed" };
          },
        },
        createAgentRunId: () => "ar_must_not_exist",
      });
      const request = new Request("http://localhost/api/agent-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });

      // When
      const response = await api.request(request);
      const responseBody: unknown = await response.json();

      // Then
      expect(response.status).toBe(400);
      expect(response.headers.get("X-Agent-Run-Id")).toBeNull();
      expect(response.headers.get("Content-Type")).toContain("application/json");
      expect(responseBody).toEqual({ success: false, message: "Invalid Agent Run request" });
    },
  );

  it("does not expose the Agent Run route when no executor is configured", async () => {
    // Given
    const request = new Request("http://localhost/api/agent-runs", { method: "POST" });

    // When
    const response = await app.request(request);

    // Then
    expect(response.status).toBe(404);
  });
});
