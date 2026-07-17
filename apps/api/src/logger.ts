import {
  createLoggerFromEnv,
  type EnvironmentLoggerOptions,
} from "@teach-everything/observability";

const loggerOptions: EnvironmentLoggerOptions = {
  defaultServiceName: "teach-everything-api",
};

if (process.env.npm_package_version !== undefined) {
  loggerOptions.serviceVersion = process.env.npm_package_version;
}

export const logger = createLoggerFromEnv(loggerOptions);
