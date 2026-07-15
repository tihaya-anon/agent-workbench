import type { AgentRunExecutor } from "@teach-everything/agent";
import {
  agentRunRequestSchema,
  encodeAgentRunEventLine,
  healthResponseSchema,
} from "@teach-everything/shared";
import { Hono } from "hono";
import { logger } from "./logger";

export interface CreateAppOptions {
  agentRunExecutor?: AgentRunExecutor;
  createAgentRunId?: () => string;
}

const createAgentRunStream = (
  executor: AgentRunExecutor,
  agentRunId: string,
  input: ReturnType<typeof agentRunRequestSchema.parse>,
  signal: AbortSignal,
) => {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(
        encoder.encode(encodeAgentRunEventLine({ version: 1, type: "run.started", agentRunId })),
      );

      try {
        for await (const event of executor.execute(input, signal)) {
          controller.enqueue(encoder.encode(encodeAgentRunEventLine(event)));
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
};

export const createApp = ({
  agentRunExecutor,
  createAgentRunId = crypto.randomUUID,
}: CreateAppOptions = {}) => {
  const baseApp = new Hono();

  baseApp.use("*", async (c, next) => {
    const startedAt = performance.now();

    await next();

    logger.info("HTTP request completed", {
      eventName: "http.server.request.completed",
      attributes: {
        "http.request.method": c.req.method,
        "http.response.status_code": c.res.status,
        "url.path": new URL(c.req.url).pathname,
        "server.request.duration_ms": performance.now() - startedAt,
      },
    });
  });

  baseApp.onError((error, c) => {
    logger.error("HTTP request failed", {
      error,
      eventName: "http.server.request.failed",
      attributes: {
        "http.request.method": c.req.method,
        "http.response.status_code": 500,
        "url.path": new URL(c.req.url).pathname,
      },
    });

    return c.json({ success: false, message: "Internal server error" }, 500);
  });

  const appWithHealthRoute = baseApp.get("/api/health", (c) => {
    const response = healthResponseSchema.parse({
      success: true,
      message: "API is running",
      timestamp: new Date().toISOString(),
    });

    return c.json(response);
  });

  if (agentRunExecutor) {
    appWithHealthRoute.post("/api/agent-runs", async (c) => {
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json({ success: false, message: "Invalid Agent Run request" }, 400);
      }

      const parsedRequest = agentRunRequestSchema.safeParse(body);
      if (!parsedRequest.success) {
        return c.json({ success: false, message: "Invalid Agent Run request" }, 400);
      }

      const agentRunId = createAgentRunId();
      return new Response(
        createAgentRunStream(agentRunExecutor, agentRunId, parsedRequest.data, c.req.raw.signal),
        {
          headers: {
            "Content-Type": "application/x-ndjson; charset=utf-8",
            "X-Agent-Run-Id": agentRunId,
          },
        },
      );
    });
  }

  return appWithHealthRoute;
};

export const app = createApp();

export type AppType = typeof app;
