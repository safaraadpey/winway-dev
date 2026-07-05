/**
 * Command API server.
 *
 * A small dependency-free HTTP gateway exposing the engine's business commands
 * (see docs/migration/api-migration-plan.md). The Next.js app routes
 * business-logic calls here instead of calling Supabase RPCs from the browser.
 *
 * Includes /health so a single port can serve both liveness and commands.
 */

import http from "node:http";
import type { SupabaseAdmin } from "../db/supabase-admin.js";
import type { Logger } from "../metrics/logger.js";
import { bearerToken, verifyUser } from "./auth.js";
import { applyCors } from "./cors.js";
import {
  getGameRoomView,
  getLobby,
  getRoomState,
  joinOrCreateRoom,
  type CommandResult,
} from "./commands.js";

export interface ApiServerContext {
  supabase: SupabaseAdmin;
  log: Logger;
  pingRedis?: () => Promise<boolean>;
}

function send(res: http.ServerResponse, result: CommandResult): void {
  if (!res.headersSent) {
    res.writeHead(result.status, { "Content-Type": "application/json" });
  }
  res.end(JSON.stringify(result.body));
}

async function readJson(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw) as Record<string, unknown>);
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

export function startApiServer(port: number, ctx: ApiServerContext): http.Server {
  const { supabase, log } = ctx;

  const server = http.createServer((req, res) => {
    void handle(req, res).catch((err) => {
      log.error("api handler error", {
        url: req.url,
        error: err instanceof Error ? err.message : String(err),
      });
      send(res, { status: 500, body: { error: "internal error" } });
    });
  });

  async function handle(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;
    const method = req.method ?? "GET";

    if (applyCors(req, res)) {
      return;
    }

    if (path === "/health") {
      const redisOk = ctx.pingRedis ? await ctx.pingRedis() : null;
      const okState = redisOk === null || redisOk === true;
      return send(res, {
        status: okState ? 200 : 503,
        body: {
          ok: okState,
          service: "game-engine",
          redis: redisOk === null ? "disabled" : redisOk ? "up" : "down",
        },
      });
    }

    // All /v1 commands require a verified Supabase JWT.
    if (path.startsWith("/v1/")) {
      const token = bearerToken(req.headers.authorization);
      if (!token) return send(res, { status: 401, body: { error: "missing bearer token" } });
      const user = await verifyUser(supabase, token);
      if (!user) return send(res, { status: 401, body: { error: "invalid token" } });

      if (method === "POST" && path === "/v1/rooms/join") {
        const body = await readJson(req);
        return send(res, await joinOrCreateRoom(supabase, user, body));
      }

      const stateMatch = /^\/v1\/rooms\/([^/]+)\/state$/.exec(path);
      if (method === "GET" && stateMatch) {
        return send(res, await getRoomState(supabase, user, stateMatch[1]));
      }

      if (method === "GET" && path === "/v1/lobby") {
        return send(res, await getLobby(supabase, user));
      }

      if (method === "GET" && path === "/v1/gameroom") {
        return send(
          res,
          await getGameRoomView(supabase, user, {
            roomId: url.searchParams.get("roomId"),
            templateId: url.searchParams.get("templateId"),
          })
        );
      }

      return send(res, { status: 404, body: { error: "unknown command" } });
    }

    send(res, { status: 404, body: { error: "not found" } });
  }

  server.listen(port, () => log.info("command api listening", { port }));
  return server;
}
