"use client";

import { useLayoutEffect, useState } from "react";

type EntryBannerGate = {
  settled: boolean;
  blocking: boolean;
};

type GateStore = {
  state: EntryBannerGate;
  listeners: Set<(state: EntryBannerGate) => void>;
};

const INITIAL_GATE: EntryBannerGate = {
  settled: false,
  blocking: false,
};

declare global {
  interface Window {
    __wwEntryBannerGate?: GateStore;
  }
}

function getStore(): GateStore | null {
  if (typeof window === "undefined") return null;
  if (!window.__wwEntryBannerGate) {
    window.__wwEntryBannerGate = {
      state: { ...INITIAL_GATE },
      listeners: new Set(),
    };
  }
  return window.__wwEntryBannerGate;
}

export function getEntryBannerGate(): EntryBannerGate {
  return getStore()?.state ?? INITIAL_GATE;
}

export function setEntryBannerGate(next: EntryBannerGate) {
  const store = getStore();
  if (!store) return;
  if (
    store.state.settled === next.settled &&
    store.state.blocking === next.blocking
  ) {
    return;
  }
  store.state = next;
  store.listeners.forEach((listener) => listener(store.state));
}

export function useEntryBannerGate(): EntryBannerGate {
  const [value, setValue] = useState<EntryBannerGate>(getEntryBannerGate);

  useLayoutEffect(() => {
    const store = getStore();
    if (!store) return;
    setValue(store.state);
    const listener = (next: EntryBannerGate) => setValue(next);
    store.listeners.add(listener);
    return () => {
      store.listeners.delete(listener);
    };
  }, []);

  return value;
}
