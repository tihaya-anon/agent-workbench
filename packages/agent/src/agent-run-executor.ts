import type { AgentRunExecutorEvent, AgentRunRequest } from "@teach-everything/shared";

export interface AgentRunExecutor {
  execute(input: AgentRunRequest, signal: AbortSignal): AsyncIterable<AgentRunExecutorEvent>;
}
