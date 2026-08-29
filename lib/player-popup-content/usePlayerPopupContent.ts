"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  normalizePlayerPopupContentSnapshot,
  parsePlayerPopupContentApiData,
} from "@/lib/player-popup-content/normalize";
import type {
  PlayerPopupContentSnapshot,
  PlayerPopupContentSurface,
} from "@/lib/player-popup-content/types";
import { DEFAULT_PLAYER_POPUP_CONTENT_DISPLAY_MODE } from "@/lib/player-popup-content/types";

type ContentStore = Partial<
  Record<PlayerPopupContentSurface, PlayerPopupContentSnapshot>
>;

const EMPTY_SNAPSHOT = (
  surface: PlayerPopupContentSurface
): PlayerPopupContentSnapshot => ({
  surface,
  blocks: [],
  displayMode: DEFAULT_PLAYER_POPUP_CONTENT_DISPLAY_MODE,
  loading: false,
  error: null,
});

const contentStore: ContentStore = {};
const listeners = new Set<() => void>();

function emitContentChange() {
  for (const listener of listeners) {
    listener();
  }
}

function subscribeContent(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getContentSnapshot(): ContentStore {
  return contentStore;
}

/**
 * Hydrates a surface from normalized client/admin data.
 * Blocks are sanitized before entering the store.
 */
export function setPlayerPopupContentSnapshot(
  surface: PlayerPopupContentSurface,
  snapshot: Omit<PlayerPopupContentSnapshot, "surface">
) {
  contentStore[surface] = normalizePlayerPopupContentSnapshot({
    surface,
    ...snapshot,
  });
  emitContentChange();
}

/**
 * Future GET /api/player/popup-content — pass `payload.data` here.
 */
export function applyPlayerPopupContentApiData(
  surface: PlayerPopupContentSurface,
  data: unknown
): boolean {
  const parsed = parsePlayerPopupContentApiData(data);
  if (!parsed) {
    return false;
  }

  setPlayerPopupContentSnapshot(surface, {
    blocks: parsed.blocks,
    displayMode: parsed.displayMode ?? DEFAULT_PLAYER_POPUP_CONTENT_DISPLAY_MODE,
    durationMs: parsed.durationMs,
    rotationGroup: parsed.rotationGroup,
    loading: false,
    error: null,
  });
  return true;
}

export function usePlayerPopupContent(surface: PlayerPopupContentSurface) {
  const store = useSyncExternalStore(
    subscribeContent,
    getContentSnapshot,
    getContentSnapshot
  );

  const snapshot = useMemo(
    () => store[surface] ?? EMPTY_SNAPSHOT(surface),
    [store, surface]
  );

  const refresh = useCallback(async () => {
    // Reserved for GET /api/player/popup-content?surface=...
    setPlayerPopupContentSnapshot(surface, {
      blocks: [],
      displayMode: DEFAULT_PLAYER_POPUP_CONTENT_DISPLAY_MODE,
      loading: false,
      error: null,
    });
  }, [surface]);

  return {
    ...snapshot,
    refresh,
  };
}
