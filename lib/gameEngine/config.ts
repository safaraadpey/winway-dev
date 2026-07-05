/**
 * Feature flags for routing hot player paths through the Railway Game Engine API.
 */

export function isGameEngineEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_USE_GAME_ENGINE === "true" &&
    Boolean(getGameEngineBaseUrl())
  );
}

export function getGameEngineBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_GAME_ENGINE_URL?.trim() ?? "";
  if (!raw) return "";
  return raw.replace(/\/+$/, "");
}
