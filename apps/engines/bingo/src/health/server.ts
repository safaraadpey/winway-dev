import http from "node:http";
import type { Logger } from "../metrics/logger.js";
import type { ReadinessSnapshot } from "../coordination/engineCoordination.js";

export interface HealthContext {
  pingRedis?: () => Promise<boolean>;
  readiness?: () => Promise<ReadinessSnapshot>;
}

export function startHealthServer(
  port: number,
  log: Logger,
  health: HealthContext = {}
): void {
  const server = http.createServer(async (req, res) => {
    if (req.url === "/health" || req.url === "/ready") {
      const redisOk = health.pingRedis ? await health.pingRedis() : null;
      const readiness = health.readiness ? await health.readiness() : null;
      const livenessOk = redisOk === null || redisOk === true;
      const readyOk =
        req.url === "/health"
          ? livenessOk
          : readiness
            ? readiness.ok && (readiness.redisOk === null || readiness.redisOk === true)
            : livenessOk;
      res.writeHead(readyOk ? 200 : 503, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: readyOk,
          service: "game-engine",
          endpoint: req.url,
          redis: redisOk === null ? "disabled" : redisOk ? "up" : "down",
          readiness,
        })
      );
      return;
    }
    res.writeHead(404);
    res.end();
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      log.warn("health server port already in use; draw-processor continues", {
        port,
        hint: "Stop the other game-engine instance or change GAME_ENGINE_HTTP_PORT",
      });
      return;
    }
    log.error("health server error", { port, error: err.message });
  });

  server.listen(port, () => {
    log.info("health server listening", { port });
  });
}
