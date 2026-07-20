import { readFileSync } from "node:fs";

import {
  graphFactoryRuntimeRequestSchema,
  type GraphFactoryRuntimeRequest,
} from "@teach-everything/shared";

export const parseGraphFactoryRuntimeRequestJson = (
  requestJson: string,
): GraphFactoryRuntimeRequest => graphFactoryRuntimeRequestSchema.parse(JSON.parse(requestJson));

export const readGraphFactoryRuntimeRequestFromStdin = () =>
  parseGraphFactoryRuntimeRequestJson(readFileSync(0, "utf8"));
