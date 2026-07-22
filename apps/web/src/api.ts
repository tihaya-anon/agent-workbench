import { hc } from "hono/client";
import type { AppType } from "@agent-workbench/api";

export const api = hc<AppType>("/");
