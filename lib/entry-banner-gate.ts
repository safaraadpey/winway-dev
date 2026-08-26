"use client";

import { useLayoutEffect, useState } from "react";

type EntryBannerGate = {
  settled: boolean;
  blocking: boolean;
};

const listeners = new Set<(gate: EntryBannerGate) => void>();

let gate: EntryBannerGate = {
  settled: false,
  blocking: false,
};

export function getEntryBannerGate(): EntryBannerGate {
  return gate;
}

export function setEntryBannerGate(next: EntryBannerGate) {
  if (gate.settled === next.settled && gate.blocking === next.blocking) return;
  gate = next;
  listeners.forEach((listener) => listener(gate));
}

export function useEntryBannerGate(): EntryBannerGate {
  const [value, setValue] = useState<EntryBannerGate>(getEntryBannerGate);

  useLayoutEffect(() => {
    setValue(getEntryBannerGate());
    const listener = (next: EntryBannerGate) => setValue(next);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return value;
}
