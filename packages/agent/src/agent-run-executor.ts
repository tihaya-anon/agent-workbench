import type {
  AgentBehaviorVersion,
  AgentRunErrorClassification,
  AgentRunExecutorEvent,
  AgentRunRequest,
  DevelopmentAgentBehaviorVersion,
  RuntimeProfile,
} from "@agent-workbench/shared";

export class AgentRunExecutionError extends Error {
  readonly errorClassification: AgentRunErrorClassification;

  constructor(errorClassification: AgentRunErrorClassification, options?: ErrorOptions) {
    super("Agent Run execution failed", options);
    this.name = "AgentRunExecutionError";
    this.errorClassification = errorClassification;
  }
}

export type AgentRunExecutorContext = {
  readonly agentBehaviorVersion: AgentBehaviorVersion | DevelopmentAgentBehaviorVersion;
  readonly agentRunId: string;
  readonly runtimeProfile: RuntimeProfile;
};

// Executors expose streamable domain events instead of UI-specific response shapes.
export interface AgentRunExecutor {
  execute(
    input: AgentRunRequest,
    signal: AbortSignal,
    context: AgentRunExecutorContext,
  ): AsyncIterable<AgentRunExecutorEvent>;
}
