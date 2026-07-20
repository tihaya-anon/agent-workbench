import { readFileSync } from "node:fs";

import {
  graphFactoryRuntimeRequestSchema,
  type GraphFactoryRuntimeRequest,
} from "@teach-everything/shared";

/**
 * @deprecated Python owns experiment execution. Keep only for archived TS graph-factory
 * compatibility.
 */
export const parseGraphFactoryRuntimeRequestJson = (
  requestJson: string,
): GraphFactoryRuntimeRequest => graphFactoryRuntimeRequestSchema.parse(JSON.parse(requestJson));

/**
 * @deprecated Python owns experiment execution. Keep only for archived TS graph-factory
 * compatibility.
 */
export const readGraphFactoryRuntimeRequestFromStdin = () =>
  parseGraphFactoryRuntimeRequestJson(readFileSync(0, "utf8"));
