import {
  AgentRunExecutionError,
  type AgentRunExecutor,
  type AgentRunExecutorContext,
} from "@teach-everything/agent";
import {
  agentRunWorkerEventLineSchema,
  encodeAgentRunWorkerCommandLine,
  type AgentRunExecutorEvent,
  type AgentRunRequest,
  type AgentRunWorkerEvent,
} from "@teach-everything/shared";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import type { PythonWorkerDiscoveryConfig } from "./python-worker-discovery";

type PythonWorkerProcessOptions = {
  readonly command: readonly [string, ...string[]];
  readonly cwd: string;
  readonly environment: Readonly<Record<string, string>>;
};

type SpawnPythonWorkerProcess = (
  options: PythonWorkerProcessOptions,
) => ChildProcessWithoutNullStreams;

export type CreatePythonWorkerAgentRunExecutorOptions = {
  readonly discovery: PythonWorkerDiscoveryConfig;
  readonly spawnWorkerProcess?: SpawnPythonWorkerProcess;
};

const defaultSpawnWorkerProcess: SpawnPythonWorkerProcess = ({ command, cwd, environment }) => {
  const [file, ...args] = command;

  return spawn(file, args, {
    cwd,
    env: {
      ...process.env,
      ...environment,
    },
  });
};

const waitForExit = (workerProcess: ChildProcessWithoutNullStreams) =>
  new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    workerProcess.once("error", reject);
    workerProcess.once("exit", (code, signal) => resolve({ code, signal }));
  });

const workerEventToExecutorEvent = (
  event: AgentRunWorkerEvent,
): AgentRunExecutorEvent | undefined => {
  if (event.type === "run.started" || event.type === "progress.update") return undefined;

  return event;
};

const writeWorkerCommand = (
  workerProcess: ChildProcessWithoutNullStreams,
  command: Parameters<typeof encodeAgentRunWorkerCommandLine>[0],
) => {
  workerProcess.stdin.write(encodeAgentRunWorkerCommandLine(command));
};

export const createPythonWorkerAgentRunExecutor = ({
  discovery,
  spawnWorkerProcess = defaultSpawnWorkerProcess,
}: CreatePythonWorkerAgentRunExecutorOptions): AgentRunExecutor => ({
  execute: async function* executePythonWorker(
    input: AgentRunRequest,
    signal: AbortSignal,
    context: AgentRunExecutorContext,
  ): AsyncIterable<AgentRunExecutorEvent> {
    const workerProcess = spawnWorkerProcess({
      command: discovery.command,
      cwd: discovery.workerRepoPath,
      environment: discovery.environment,
    });
    const exit = waitForExit(workerProcess);
    let terminal = false;
    let cancellationRequested = false;

    const requestCancellation = () => {
      if (cancellationRequested) return;
      cancellationRequested = true;
      writeWorkerCommand(workerProcess, {
        version: 1,
        type: "run.cancel",
        agentRunId: context.agentRunId,
      });
      workerProcess.stdin.end();
    };

    signal.addEventListener("abort", requestCancellation, { once: true });

    try {
      writeWorkerCommand(workerProcess, {
        version: 1,
        type: "run.start",
        agentRunId: context.agentRunId,
        behaviorVersion: context.agentBehaviorVersion,
        input,
        runtimeProfile: context.runtimeProfile,
      });

      const workerEvents = createInterface({
        crlfDelay: Infinity,
        input: workerProcess.stdout,
      });

      for await (const line of workerEvents) {
        const parsedEvent = agentRunWorkerEventLineSchema.safeParse(line);
        if (!parsedEvent.success) {
          workerProcess.kill();
          throw new AgentRunExecutionError("internal");
        }

        const executorEvent = workerEventToExecutorEvent(parsedEvent.data);
        if (executorEvent === undefined) continue;

        if (
          executorEvent.type === "run.completed" ||
          executorEvent.type === "run.failed" ||
          executorEvent.type === "run.cancelled"
        ) {
          terminal = true;
          workerProcess.stdin.end();
        }

        yield executorEvent;
        if (terminal) return;
      }

      const exitResult = await exit;
      if (!terminal || exitResult.code !== 0) {
        throw new AgentRunExecutionError(
          cancellationRequested ? "cancellation_failed" : "internal",
        );
      }
    } finally {
      signal.removeEventListener("abort", requestCancellation);
      if (!terminal && !workerProcess.killed) workerProcess.kill();
    }
  },
});
