import { z } from "zod";
import {
  agentRunCancelledEventSchema,
  agentRunCompletedEventSchema,
  agentRunFailedEventSchema,
  agentRunMessageDeltaEventSchema,
  agentRunRequestSchema,
  agentRunStartedEventSchema,
} from "./agent-run";
import {
  developmentAgentBehaviorVersionSchema,
  runtimeProfileSchema,
  strictAgentBehaviorVersionSchema,
  validateAgentBehaviorVersionForRuntimeProfile,
} from "./runtime-profile";

export const AGENT_RUN_WORKER_PROTOCOL_VERSION = 1 as const;

const nonEmptyWorkerIdentitySchema = z
  .string()
  .refine((value) => value.trim().length > 0, { message: "Identifier must not be empty" });

export const agentRunWorkerBehaviorVersionSchema = z.union([
  strictAgentBehaviorVersionSchema,
  developmentAgentBehaviorVersionSchema,
]);

const validateStartCommandRuntimePolicy = (
  command: z.infer<typeof agentRunWorkerStartCommandShapeSchema>,
  context: z.RefinementCtx,
) => {
  const behaviorVersionResult = validateAgentBehaviorVersionForRuntimeProfile(
    command.runtimeProfile,
    command.behaviorVersion,
  );
  if (behaviorVersionResult.success) return;

  context.addIssue({
    code: "custom",
    message: "Agent Behavior Version does not satisfy Runtime Profile",
    path: ["behaviorVersion"],
  });
};

const agentRunWorkerStartCommandShapeSchema = z
  .object({
    version: z.literal(AGENT_RUN_WORKER_PROTOCOL_VERSION),
    type: z.literal("run.start"),
    agentRunId: nonEmptyWorkerIdentitySchema,
    input: agentRunRequestSchema,
    runtimeProfile: runtimeProfileSchema,
    behaviorVersion: agentRunWorkerBehaviorVersionSchema,
  })
  .strict();

export const agentRunWorkerStartCommandSchema = agentRunWorkerStartCommandShapeSchema.superRefine(
  validateStartCommandRuntimePolicy,
);

export const agentRunWorkerCancelCommandSchema = z
  .object({
    version: z.literal(AGENT_RUN_WORKER_PROTOCOL_VERSION),
    type: z.literal("run.cancel"),
    agentRunId: nonEmptyWorkerIdentitySchema,
  })
  .strict();

export const agentRunWorkerCommandSchema = z
  .discriminatedUnion("type", [
    agentRunWorkerStartCommandShapeSchema,
    agentRunWorkerCancelCommandSchema,
  ])
  .superRefine((command, context) => {
    if (command.type === "run.start") validateStartCommandRuntimePolicy(command, context);
  });

export const agentRunWorkerProgressStatusSchema = z.enum([
  "started",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

export const agentRunWorkerProgressScopeSchema = z.enum(["run", "task"]);

export const agentRunWorkerProgressEventSchema = z
  .object({
    version: z.literal(AGENT_RUN_WORKER_PROTOCOL_VERSION),
    type: z.literal("progress.update"),
    scope: agentRunWorkerProgressScopeSchema,
    label: nonEmptyWorkerIdentitySchema,
    status: agentRunWorkerProgressStatusSchema.optional(),
    message: z.string().optional(),
  })
  .strict();

export const agentRunWorkerEventSchema = z.discriminatedUnion("type", [
  agentRunStartedEventSchema,
  agentRunMessageDeltaEventSchema,
  agentRunWorkerProgressEventSchema,
  agentRunCompletedEventSchema,
  agentRunFailedEventSchema,
  agentRunCancelledEventSchema,
]);

const parseNdjsonRecord = (line: unknown) => {
  if (typeof line !== "string") {
    return undefined;
  }

  const record = line.endsWith("\r\n")
    ? line.slice(0, -2)
    : line.endsWith("\n")
      ? line.slice(0, -1)
      : line;
  if (record.length === 0 || /[\r\n]/u.test(record)) {
    return undefined;
  }

  try {
    return JSON.parse(record) as unknown;
  } catch {
    return undefined;
  }
};

export const agentRunWorkerCommandLineSchema = z.preprocess(
  parseNdjsonRecord,
  agentRunWorkerCommandSchema,
);

export const agentRunWorkerEventLineSchema = z.preprocess(
  parseNdjsonRecord,
  agentRunWorkerEventSchema,
);

export type AgentRunWorkerBehaviorVersion = z.infer<typeof agentRunWorkerBehaviorVersionSchema>;
export type AgentRunWorkerStartCommand = z.infer<typeof agentRunWorkerStartCommandSchema>;
export type AgentRunWorkerCancelCommand = z.infer<typeof agentRunWorkerCancelCommandSchema>;
export type AgentRunWorkerCommand = z.infer<typeof agentRunWorkerCommandSchema>;
export type AgentRunWorkerProgressStatus = z.infer<typeof agentRunWorkerProgressStatusSchema>;
export type AgentRunWorkerProgressScope = z.infer<typeof agentRunWorkerProgressScopeSchema>;
export type AgentRunWorkerProgressEvent = z.infer<typeof agentRunWorkerProgressEventSchema>;
export type AgentRunWorkerEvent = z.infer<typeof agentRunWorkerEventSchema>;

export const encodeAgentRunWorkerCommandLine = (command: AgentRunWorkerCommand) =>
  `${JSON.stringify(agentRunWorkerCommandSchema.parse(command))}\n`;

export const encodeAgentRunWorkerEventLine = (event: AgentRunWorkerEvent) =>
  `${JSON.stringify(agentRunWorkerEventSchema.parse(event))}\n`;
