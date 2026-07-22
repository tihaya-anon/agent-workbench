import {
  createLoggerFromEnv,
  type EnvironmentLoggerOptions,
} from "@agent-workbench/observability";

const LOGGER_OPTIONS: EnvironmentLoggerOptions = {
  defaultServiceName: "agent-workbench-api",
  ...(process.env.npm_package_version === undefined
    ? {}
    : { serviceVersion: process.env.npm_package_version }),
};

export const logger = createLoggerFromEnv(LOGGER_OPTIONS);
