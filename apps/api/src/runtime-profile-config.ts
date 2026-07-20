import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { runtimeProfileSchema, type RuntimeProfile } from "@teach-everything/shared";
import developmentProfileDocument from "../../../profiles/runtime-development.json";
import publishedProfileDocument from "../../../profiles/runtime-published.json";

export type RuntimeProfileStartupEnvironment = {
  readonly NODE_ENV?: string;
  readonly RUNTIME_PROFILE_PATH?: string;
};

const parseRuntimeProfileDocument = (profileDocument: unknown): RuntimeProfile =>
  runtimeProfileSchema.parse(profileDocument);

const readRuntimeProfileFile = (profilePath: string, cwd: string): unknown =>
  JSON.parse(readFileSync(resolve(cwd, profilePath), "utf8"));

export const loadRuntimeProfileForStartup = (
  environment: RuntimeProfileStartupEnvironment = process.env,
  cwd = process.cwd(),
): RuntimeProfile => {
  if (environment.RUNTIME_PROFILE_PATH !== undefined) {
    return parseRuntimeProfileDocument(
      readRuntimeProfileFile(environment.RUNTIME_PROFILE_PATH, cwd),
    );
  }

  if (environment.NODE_ENV?.toLowerCase() === "production") {
    return parseRuntimeProfileDocument(publishedProfileDocument);
  }

  return parseRuntimeProfileDocument(developmentProfileDocument);
};
