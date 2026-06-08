import NodeWebSocket from "ws";
import type { WebSocketLikeConstructor } from "@supabase/realtime-js";

/**
 * Node.js WebSocket transport for Supabase Realtime.
 *
 * Supabase's RealtimeClient accepts a WebSocketLikeConstructor (not the DOM
 * WebSocket type). Node `ws` is API-compatible at runtime; handler event types
 * differ only in TypeScript (ErrorEvent vs Event), so we isolate that boundary here.
 */
export const nodeWebSocketTransport: WebSocketLikeConstructor =
  NodeWebSocket as WebSocketLikeConstructor;
