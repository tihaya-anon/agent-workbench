import { z } from "zod";

export type JsonValue =
  null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };

const nonEmptyGraphFactorySelectorSchema = z
  .string()
  .refine((value) => value.trim().length > 0, { message: "Selector must not be empty" });

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number(),
    z.string(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

/**
 * @deprecated Python owns experiment execution. This request shape is archived with the deprecated
 * TypeScript Graph Factory runtime and is not part of the Agent Run worker protocol.
 */
export const graphFactoryRuntimeRequestSchema = z
  .object({
    graphFactoryIdentity: nonEmptyGraphFactorySelectorSchema,
    graphFactoryVersion: nonEmptyGraphFactorySelectorSchema,
    trialParameters: jsonValueSchema,
  })
  .strict();

/**
 * @deprecated Python owns experiment execution. This request shape is archived with the deprecated
 * TypeScript Graph Factory runtime and is not part of the Agent Run worker protocol.
 */
export type GraphFactoryRuntimeRequest = z.infer<typeof graphFactoryRuntimeRequestSchema>;
