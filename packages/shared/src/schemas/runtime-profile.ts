import { z } from "zod";

export const RUNTIME_PROFILE_SCHEMA_VERSION = 1 as const;

const unresolvedAgentBehaviorVersionValues = ["none", "unknown", "unresolved"] as const;
const unresolvedAgentBehaviorVersionValueSet = new Set<string>(
  unresolvedAgentBehaviorVersionValues,
);

const nonEmptyRuntimeIdentitySchema = z
  .string()
  .refine((value) => value.trim().length > 0, { message: "Dimension must not be empty" });

const sourceRevisionSchema = z
  .string()
  .regex(/^[0-9a-f]{40}$/u, { message: "Source Revision must be a 40-character Git SHA" });

const agentBehaviorVersionDimensionSchema = nonEmptyRuntimeIdentitySchema.refine(
  (value) => !unresolvedAgentBehaviorVersionValueSet.has(value.trim().toLowerCase()),
  { message: "Dimension must resolve to a concrete identity" },
);

const agentBehaviorVersionShape = {
  graph: nonEmptyRuntimeIdentitySchema,
  state: nonEmptyRuntimeIdentitySchema,
  action: nonEmptyRuntimeIdentitySchema,
  prompt: nonEmptyRuntimeIdentitySchema,
  tool: nonEmptyRuntimeIdentitySchema,
  model: nonEmptyRuntimeIdentitySchema,
  trialParameter: nonEmptyRuntimeIdentitySchema,
  sourceRevision: sourceRevisionSchema,
} as const;

export const agentBehaviorVersionSchema = z.object(agentBehaviorVersionShape).strict();

export const strictAgentBehaviorVersionSchema = z
  .object({
    graph: agentBehaviorVersionDimensionSchema,
    state: agentBehaviorVersionDimensionSchema,
    action: agentBehaviorVersionDimensionSchema,
    prompt: agentBehaviorVersionDimensionSchema,
    tool: agentBehaviorVersionDimensionSchema,
    model: agentBehaviorVersionDimensionSchema,
    trialParameter: agentBehaviorVersionDimensionSchema,
    sourceRevision: sourceRevisionSchema,
  })
  .strict();

export const developmentAgentBehaviorVersionSchema = z
  .object({
    graph: nonEmptyRuntimeIdentitySchema.optional(),
    state: nonEmptyRuntimeIdentitySchema.optional(),
    action: nonEmptyRuntimeIdentitySchema.optional(),
    prompt: nonEmptyRuntimeIdentitySchema.optional(),
    tool: nonEmptyRuntimeIdentitySchema.optional(),
    model: nonEmptyRuntimeIdentitySchema.optional(),
    trialParameter: nonEmptyRuntimeIdentitySchema.optional(),
    sourceRevision: nonEmptyRuntimeIdentitySchema.optional(),
  })
  .strict();

const strictAgentBehaviorVersionPolicySchema = z
  .object({
    policy: z.literal("strict"),
    requireCompleteDimensions: z.literal(true),
    rejectUnresolvedDimensions: z.literal(true),
    allowIncompleteAdHocRuns: z.literal(false),
  })
  .strict();

const developmentAgentBehaviorVersionPolicySchema = z
  .object({
    policy: z.literal("development"),
    requireCompleteDimensions: z.literal(false),
    rejectUnresolvedDimensions: z.literal(false),
    allowIncompleteAdHocRuns: z.literal(true),
    incompleteAdHocRuns: z
      .object({
        comparable: z.literal(false),
        promotable: z.literal(false),
      })
      .strict(),
  })
  .strict();

export const runtimeProfileSchema = z
  .object({
    schemaVersion: z.literal(RUNTIME_PROFILE_SCHEMA_VERSION),
    profileId: nonEmptyRuntimeIdentitySchema,
    runtimePolicy: z
      .object({
        agentBehaviorVersion: z.discriminatedUnion("policy", [
          strictAgentBehaviorVersionPolicySchema,
          developmentAgentBehaviorVersionPolicySchema,
        ]),
        sourceRevision: z
          .object({
            requireCleanForPublishedGraphVersions: z.boolean(),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

export type AgentBehaviorVersion = z.infer<typeof agentBehaviorVersionSchema>;
export type StrictAgentBehaviorVersion = z.infer<typeof strictAgentBehaviorVersionSchema>;
export type DevelopmentAgentBehaviorVersion = z.infer<typeof developmentAgentBehaviorVersionSchema>;
export type RuntimeProfile = z.infer<typeof runtimeProfileSchema>;
export type RuntimeProfileAgentBehaviorVersionPolicy =
  RuntimeProfile["runtimePolicy"]["agentBehaviorVersion"];
export type RuntimeProfileSourceRevisionPolicy = RuntimeProfile["runtimePolicy"]["sourceRevision"];

export const agentBehaviorVersionSchemaForRuntimeProfile = (runtimeProfile: RuntimeProfile) =>
  runtimeProfile.runtimePolicy.agentBehaviorVersion.policy === "strict"
    ? strictAgentBehaviorVersionSchema
    : developmentAgentBehaviorVersionSchema;

export const validateAgentBehaviorVersionForRuntimeProfile = (
  runtimeProfile: RuntimeProfile,
  behaviorVersion: unknown,
) => agentBehaviorVersionSchemaForRuntimeProfile(runtimeProfile).safeParse(behaviorVersion);
