import type {
  AgentRunErrorClassification,
  AgentRunExecutorEvent,
  AgentRunRequest,
} from "@teach-everything/shared";

export class AgentRunExecutionError extends Error {
  readonly errorClassification: AgentRunErrorClassification;

  constructor(errorClassification: AgentRunErrorClassification, options?: ErrorOptions) {
    super("Agent Run execution failed", options);
    this.name = "AgentRunExecutionError";
    this.errorClassification = errorClassification;
  }
}

export interface AgentRunExecutor {
  execute(input: AgentRunRequest, signal: AbortSignal): AsyncIterable<AgentRunExecutorEvent>;
}
