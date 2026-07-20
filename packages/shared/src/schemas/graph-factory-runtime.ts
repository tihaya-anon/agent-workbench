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
    z.number().finite(),
    z.string(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

export const graphFactoryRuntimeRequestSchema = z
  .object({
    graphFactoryIdentity: nonEmptyGraphFactorySelectorSchema,
    graphFactoryVersion: nonEmptyGraphFactorySelectorSchema,
    trialParameters: jsonValueSchema,
  })
  .strict();

export type GraphFactoryRuntimeRequest = z.infer<typeof graphFactoryRuntimeRequestSchema>;
