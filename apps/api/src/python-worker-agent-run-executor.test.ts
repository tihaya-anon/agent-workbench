import type { AgentRunExecutorContext } from "@teach-everything/agent";
import type { AgentRunExecutorEvent } from "@teach-everything/shared";
import { runtimeProfileSchema } from "@teach-everything/shared";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import developmentProfileDocument from "../../../profiles/runtime-development.json";
import { describe, expect, it } from "vitest";
import { createPythonWorkerAgentRunExecutor } from "./python-worker-agent-run-executor";

const input = { message: "Explain closures." };

const context: AgentRunExecutorContext = {
  agentBehaviorVersion: { graph: "graph:python-worker-test", sourceRevision: "unknown" },
  agentRunId: "ar_python_worker",
  runtimeProfile: runtimeProfileSchema.parse(developmentProfileDocument),
};

const createTemporaryWorkerScript = (script: string) => {
  const directory = mkdtempSync(join(tmpdir(), "python-worker-adapter-"));
  const scriptPath = join(directory, "worker.mjs");
  writeFileSync(scriptPath, script);

  return { directory, scriptPath };
};

const createExecutorForScript = (script: string) => {
  const { directory, scriptPath } = createTemporaryWorkerScript(script);

  return createPythonWorkerAgentRunExecutor({
    discovery: {
      command: [process.execPath, scriptPath],
      environment: { PYTHONPATH: "" },
      workerRepoPath: directory,
    },
  });
};

const collectEvents = async (events: AsyncIterable<AgentRunExecutorEvent>) => {
  const collected: AgentRunExecutorEvent[] = [];
  for await (const event of events) {
    collected.push(event);
  }

  return collected;
};

describe("createPythonWorkerAgentRunExecutor", () => {
  it("relays worker message and terminal events while suppressing worker-only events", async () => {
    // Given
    const executor = createExecutorForScript(`
      import { createInterface } from "node:readline";
      const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
      for await (const line of lines) {
        const command = JSON.parse(line);
        if (command.type !== "run.start") continue;
        console.log(JSON.stringify({ version: 1, type: "run.started", agentRunId: command.agentRunId }));
        console.log(JSON.stringify({ version: 1, type: "progress.update", scope: "run", label: "smoke-graph", status: "started" }));
        console.log(JSON.stringify({ version: 1, type: "message.delta", text: command.input.message }));
        console.log(JSON.stringify({ version: 1, type: "run.completed" }));
      }
    `);

    // When
    const events = await collectEvents(
      executor.execute(input, new AbortController().signal, context),
    );

    // Then
    expect(events).toEqual([
      { version: 1, type: "message.delta", text: "Explain closures." },
      { version: 1, type: "run.completed" },
    ]);
  });

  it("rejects malformed worker events", async () => {
    // Given
    const executor = createExecutorForScript(`
      console.log(JSON.stringify({ version: 1, type: "raw.langgraph.chunk" }));
    `);

    // When
    const collectMalformedEvents = () =>
      collectEvents(executor.execute(input, new AbortController().signal, context));

    // Then
    await expect(collectMalformedEvents()).rejects.toThrow("Agent Run execution failed");
  });

  it("maps a worker crash before terminal output to an execution failure", async () => {
    // Given
    const executor = createExecutorForScript("process.exit(1);");

    // When
    const collectCrashedEvents = () =>
      collectEvents(executor.execute(input, new AbortController().signal, context));

    // Then
    await expect(collectCrashedEvents()).rejects.toThrow("Agent Run execution failed");
  });

  it("propagates cancellation to the worker and yields the cancellation terminal event", async () => {
    // Given
    const cancellation = new AbortController();
    const executor = createExecutorForScript(`
      import { createInterface } from "node:readline";
      const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
      for await (const line of lines) {
        const command = JSON.parse(line);
        if (command.type === "run.cancel") {
          console.log(JSON.stringify({ version: 1, type: "run.cancelled" }));
        }
      }
    `);

    // When
    const iterator = executor.execute(input, cancellation.signal, context)[Symbol.asyncIterator]();
    const nextEvent = iterator.next();
    cancellation.abort();

    // Then
    await expect(nextEvent).resolves.toEqual({
      done: false,
      value: { version: 1, type: "run.cancelled" },
    });
    await iterator.return?.();
  });
});
