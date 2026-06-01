import http from "node:http";
import type { Logger } from "../metrics/logger.js";

export interface HealthContext {
  pingRedis?: () => Promise<boolean>;
}

export function startHealthServer(
  port: number,
  log: Logger,
  health: HealthContext = {}
): void {
  const server = http.createServer(async (_req, res) => {
    if (_req.url === "/health") {
      const redisOk = health.pingRedis ? await health.pingRedis() : null;
      const ok = redisOk === null || redisOk === true;
      res.writeHead(ok ? 200 : 503, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok,
          service: "game-engine",
          redis: redisOk === null ? "disabled" : redisOk ? "up" : "down",
        })
      );
      return;
    }
    res.writeHead(404);
    res.end();
  });

  server.listen(port, () => {
    log.info("health server listening", { port });
  });
}
