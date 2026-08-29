import type {
  PlayerPopupContentApiData,
  PlayerPopupContentBlock,
  PlayerPopupContentBlockType,
  PlayerPopupContentDisplayMode,
  PlayerPopupContentPresentation,
  PlayerPopupTextBlock,
  PlayerPopupWinnerEntry,
} from "@/lib/player-popup-content/types";
import { DEFAULT_PLAYER_POPUP_CONTENT_DISPLAY_MODE } from "@/lib/player-popup-content/types";

const BLOCK_TYPES = new Set<PlayerPopupContentBlockType>([
  "text",
  "winners",
  "countdown",
  "banner",
  "cta",
]);

const TEXT_TONES = new Set(["default", "accent", "warning"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseBoundaryMs(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const parsed = Date.parse(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function parseFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function parseOrder(value: unknown): number {
  return parseFiniteNumber(value) ?? 0;
}

function parseOptionalPriority(value: unknown): number | undefined {
  const parsed = parseFiniteNumber(value);
  return parsed == null ? undefined : parsed;
}

function parseOptionalPositiveInt(value: unknown): number | undefined {
  const parsed = parseFiniteNumber(value);
  if (parsed == null || parsed <= 0) {
    return undefined;
  }
  return Math.floor(parsed);
}

function parseDisplayMode(value: unknown): PlayerPopupContentDisplayMode {
  return value === "carousel" ? "carousel" : DEFAULT_PLAYER_POPUP_CONTENT_DISPLAY_MODE;
}

function parseOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parsePresentation(raw: Record<string, unknown>): PlayerPopupContentPresentation {
  return {
    displayMode: parseDisplayMode(raw.displayMode),
    durationMs: parseOptionalPositiveInt(raw.durationMs),
    rotationGroup: parseOptionalString(raw.rotationGroup),
  };
}

function parseWinnerEntry(raw: unknown): PlayerPopupWinnerEntry | null {
  if (!isRecord(raw)) {
    return null;
  }
  const name = parseOptionalString(raw.name);
  if (!name) {
    return null;
  }
  const prizeAmount = parseFiniteNumber(raw.prizeAmount);
  return {
    name,
    prizeLabel: parseOptionalString(raw.prizeLabel),
    prizeAmount: prizeAmount ?? undefined,
  };
}

function sanitizeBlock(raw: unknown): PlayerPopupContentBlock | null {
  if (!isRecord(raw)) {
    return null;
  }

  const type = raw.type;
  if (typeof type !== "string" || !BLOCK_TYPES.has(type as PlayerPopupContentBlockType)) {
    return null;
  }

  const id = parseOptionalString(raw.id);
  if (!id) {
    return null;
  }

  const base = {
    id,
    type: type as PlayerPopupContentBlockType,
    order: parseOrder(raw.order),
    priority: parseOptionalPriority(raw.priority),
    activeFrom: parseOptionalString(raw.activeFrom),
    activeUntil: parseOptionalString(raw.activeUntil),
  };

  switch (type) {
    case "text": {
      const text = parseOptionalString(raw.text);
      if (!text) {
        return null;
      }
      const tone = raw.tone;
      const block: PlayerPopupTextBlock = {
        ...base,
        type: "text",
        text,
        tone:
          typeof tone === "string" && TEXT_TONES.has(tone)
            ? (tone as PlayerPopupTextBlock["tone"])
            : undefined,
      };
      return block;
    }
    case "winners": {
      const winnersRaw = Array.isArray(raw.winners) ? raw.winners : [];
      const winners = winnersRaw
        .map(parseWinnerEntry)
        .filter((entry): entry is PlayerPopupWinnerEntry => entry != null);
      if (winners.length === 0) {
        return null;
      }
      return {
        ...base,
        type: "winners",
        title: parseOptionalString(raw.title),
        prizeLabel: parseOptionalString(raw.prizeLabel),
        winners,
      };
    }
    case "countdown": {
      const endsAt = parseOptionalString(raw.endsAt);
      if (!endsAt) {
        return null;
      }
      return {
        ...base,
        type: "countdown",
        title: parseOptionalString(raw.title),
        body: parseOptionalString(raw.body),
        endsAt,
        expiredLabel: parseOptionalString(raw.expiredLabel),
      };
    }
    case "banner": {
      const title = parseOptionalString(raw.title);
      const body = parseOptionalString(raw.body);
      const imageUrl = parseOptionalString(raw.imageUrl);
      if (!title && !body && !imageUrl) {
        return null;
      }
      return {
        ...base,
        type: "banner",
        title,
        body,
        imageUrl,
      };
    }
    case "cta": {
      const label = parseOptionalString(raw.label);
      if (!label) {
        return null;
      }
      return {
        ...base,
        type: "cta",
        label,
        href: parseOptionalString(raw.href),
        actionId: parseOptionalString(raw.actionId),
      };
    }
    default:
      return null;
  }
}

export function sanitizePlayerPopupContentBlocks(
  blocks: unknown
): PlayerPopupContentBlock[] {
  if (!Array.isArray(blocks)) {
    return [];
  }

  const seenIds = new Set<string>();
  const sanitized: PlayerPopupContentBlock[] = [];

  for (const item of blocks) {
    const block = sanitizeBlock(item);
    if (!block || seenIds.has(block.id)) {
      continue;
    }
    seenIds.add(block.id);
    sanitized.push(block);
  }

  return sanitized;
}

export function isPlayerPopupContentBlockActive(
  block: PlayerPopupContentBlock,
  nowMs = Date.now()
): boolean {
  const activeFromMs = parseBoundaryMs(block.activeFrom);
  if (activeFromMs != null && nowMs < activeFromMs) {
    return false;
  }

  const activeUntilMs = parseBoundaryMs(block.activeUntil);
  if (activeUntilMs != null && nowMs >= activeUntilMs) {
    return false;
  }

  return true;
}

export function comparePlayerPopupContentBlocks(
  left: PlayerPopupContentBlock,
  right: PlayerPopupContentBlock
): number {
  if (left.order !== right.order) {
    return left.order - right.order;
  }

  const leftPriority = left.priority ?? 0;
  const rightPriority = right.priority ?? 0;
  if (leftPriority !== rightPriority) {
    return rightPriority - leftPriority;
  }

  return left.id.localeCompare(right.id);
}

export function getActivePlayerPopupContentBlocks(
  blocks: unknown,
  nowMs = Date.now()
): PlayerPopupContentBlock[] {
  return sanitizePlayerPopupContentBlocks(blocks)
    .filter((block) => isPlayerPopupContentBlockActive(block, nowMs))
    .sort(comparePlayerPopupContentBlocks);
}

/** Parses future API `data` payload; returns null when shape is unusable. */
export function parsePlayerPopupContentApiData(
  data: unknown
): PlayerPopupContentApiData | null {
  if (!isRecord(data)) {
    return null;
  }

  const presentation = parsePresentation(data);
  const blocks = sanitizePlayerPopupContentBlocks(data.blocks);

  return {
    ...presentation,
    blocks,
    displayMode: presentation.displayMode ?? DEFAULT_PLAYER_POPUP_CONTENT_DISPLAY_MODE,
  };
}

export function normalizePlayerPopupContentSnapshot(input: {
  surface: string;
  blocks?: unknown;
  displayMode?: unknown;
  durationMs?: unknown;
  rotationGroup?: unknown;
  loading?: boolean;
  error?: string | null;
}) {
  const presentation = parsePresentation({
    displayMode: input.displayMode,
    durationMs: input.durationMs,
    rotationGroup: input.rotationGroup,
  });

  return {
    surface: input.surface,
    blocks: sanitizePlayerPopupContentBlocks(input.blocks),
    displayMode: presentation.displayMode ?? DEFAULT_PLAYER_POPUP_CONTENT_DISPLAY_MODE,
    durationMs: presentation.durationMs,
    rotationGroup: presentation.rotationGroup,
    loading: input.loading ?? false,
    error: input.error ?? null,
  };
}
