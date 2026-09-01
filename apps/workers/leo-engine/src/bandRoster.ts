export const LEO_BAND_SHUFFLE_INTERVAL_MS = 90 * 60 * 1000;
export const LEO_BAND_MAX_ACTIVE_PLAYERS_LIMIT = 500;

export type BandRosterState = {
  selectedUserIds: string[];
  selectedAtMs: number;
  shuffleGeneration: number;
};

export type ResolveBandRosterInput = {
  eligibleUserIds: string[];
  maxActivePlayers: number;
  shuffleEnabled: boolean;
  existing: BandRosterState | null;
  nowMs: number;
};

export type ResolveBandRosterResult = {
  roster: BandRosterState;
  changed: boolean;
  droppedUserIds: string[];
  addedUserIds: string[];
};

function uniqueSorted(ids: string[]): string[] {
  return Array.from(new Set(ids.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function shuffleCopy<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const tmp = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = tmp;
  }
  return copy;
}

export function pickCappedUserIds(
  eligibleUserIds: string[],
  maxActivePlayers: number,
  previousUserIds: string[],
  shuffle: boolean,
  random: () => number = Math.random
): string[] {
  const eligible = uniqueSorted(eligibleUserIds);
  const cap =
    !Number.isInteger(maxActivePlayers) || maxActivePlayers <= 0
      ? eligible.length
      : Math.min(maxActivePlayers, eligible.length);

  if (cap <= 0) return [];
  if (cap >= eligible.length) return eligible;

  if (!shuffle) {
    return eligible.slice(0, cap);
  }

  const previous = new Set(previousUserIds);
  const fresh = shuffleCopy(
    eligible.filter((id) => !previous.has(id)),
    random
  );
  const returning = shuffleCopy(
    eligible.filter((id) => previous.has(id)),
    random
  );

  if (fresh.length >= cap) return fresh.slice(0, cap);
  return [...fresh, ...returning].slice(0, cap);
}

export function resolveBandRoster(
  input: ResolveBandRosterInput,
  random: () => number = Math.random
): ResolveBandRosterResult {
  const eligible = uniqueSorted(input.eligibleUserIds);
  const capRaw = Math.max(0, Math.floor(Number(input.maxActivePlayers) || 0));
  const cap = capRaw <= 0 ? eligible.length : Math.min(capRaw, eligible.length);
  const previousIds = input.existing?.selectedUserIds ?? [];
  const stillSelected = previousIds.filter((id) => eligible.includes(id));
  const shuffleDue =
    input.shuffleEnabled &&
    capRaw > 0 &&
    Boolean(input.existing) &&
    input.nowMs - (input.existing?.selectedAtMs ?? 0) >= LEO_BAND_SHUFFLE_INTERVAL_MS;

  let nextIds: string[];
  if (cap === 0) {
    nextIds = [];
  } else if (!input.existing || shuffleDue) {
    nextIds = pickCappedUserIds(
      eligible,
      capRaw,
      shuffleDue ? previousIds : [],
      input.shuffleEnabled,
      random
    );
  } else if (stillSelected.length === cap) {
    nextIds = stillSelected;
  } else {
    const keep = stillSelected.slice(0, cap);
    const extras = eligible.filter((id) => !keep.includes(id)).slice(0, Math.max(0, cap - keep.length));
    nextIds = [...keep, ...extras];
  }

  const nextSet = new Set(nextIds);
  const prevSet = new Set(previousIds);
  const droppedUserIds = previousIds.filter((id) => !nextSet.has(id));
  const addedUserIds = nextIds.filter((id) => !prevSet.has(id));
  const changed =
    droppedUserIds.length > 0 ||
    addedUserIds.length > 0 ||
    nextIds.length !== previousIds.length ||
    shuffleDue;

  return {
    roster: {
      selectedUserIds: nextIds,
      selectedAtMs: changed ? input.nowMs : (input.existing?.selectedAtMs ?? input.nowMs),
      shuffleGeneration:
        (input.existing?.shuffleGeneration ?? 0) + (shuffleDue ? 1 : 0),
    },
    changed,
    droppedUserIds,
    addedUserIds,
  };
}
