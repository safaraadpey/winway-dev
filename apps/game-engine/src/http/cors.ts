/**
 * CORS helpers for browser → Game Engine direct calls.
 */

import type { IncomingMessage, ServerResponse } from "node:http";

function parseAllowedOrigins(): string[] | "*" {
  const raw = process.env.GAME_ENGINE_CORS_ORIGINS?.trim();
  if (!raw || raw === "*") return "*";
  return raw.split(",").map((o) => o.trim()).filter(Boolean);
}

const ALLOWED_ORIGINS = parseAllowedOrigins();

export function applyCors(req: IncomingMessage, res: ServerResponse): boolean {
  const origin = req.headers.origin;
  const allowed =
    ALLOWED_ORIGINS === "*" ||
    (origin && Array.isArray(ALLOWED_ORIGINS) && ALLOWED_ORIGINS.includes(origin));

  if (origin && allowed) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  } else if (ALLOWED_ORIGINS === "*") {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    res.writeHead(allowed ? 204 : 403);
    res.end();
    return true;
  }

  return false;
}
