export type PlayerPopupContentSurface = string;

export type PlayerPopupContentBlockType =
  | "text"
  | "winners"
  | "countdown"
  | "banner"
  | "cta";

export type PlayerPopupContentDisplayMode = "stack" | "carousel";

/** Shared presentation settings for a surface feed (stack or future carousel). */
export type PlayerPopupContentPresentation = {
  displayMode?: PlayerPopupContentDisplayMode;
  /** When false, consumer modals must hide dismiss controls (e.g. tournament break wait). */
  dismissible?: boolean;
  /** Future carousel: milliseconds each block stays visible before rotating. */
  durationMs?: number;
  /** Future carousel: only blocks in this group participate in rotation. */
  rotationGroup?: string;
};

type PlayerPopupContentBlockBase = {
  id: string;
  type: PlayerPopupContentBlockType;
  /** Lower values render earlier in stack mode. */
  order: number;
  /**
   * Reserved for future conflict resolution when multiple blocks compete.
   * Higher values win ties; does not replace `order` for layout sequencing.
   */
  priority?: number;
  /** ISO-8601 inclusive start. Invalid values are ignored. */
  activeFrom?: string;
  /** ISO-8601 exclusive end. Invalid values are ignored. */
  activeUntil?: string;
};

export type PlayerPopupTextBlock = PlayerPopupContentBlockBase & {
  type: "text";
  text: string;
  tone?: "default" | "accent" | "warning";
};

export type PlayerPopupWinnerEntry = {
  name: string;
  prizeLabel?: string;
  prizeAmount?: number;
};

export type PlayerPopupWinnersBlock = PlayerPopupContentBlockBase & {
  type: "winners";
  title?: string;
  /** Shown in the block header (e.g. currency label for prize amounts). */
  prizeLabel?: string;
  winners: PlayerPopupWinnerEntry[];
};

export type PlayerPopupCountdownBlock = PlayerPopupContentBlockBase & {
  type: "countdown";
  title?: string;
  /** Optional helper copy shown below the timer row. */
  body?: string;
  /** ISO-8601 or epoch-ms compatible timestamp. */
  endsAt: string;
  expiredLabel?: string;
};

export type PlayerPopupBannerBlock = PlayerPopupContentBlockBase & {
  type: "banner";
  title?: string;
  body?: string;
  imageUrl?: string;
};

export type PlayerPopupCtaBlock = PlayerPopupContentBlockBase & {
  type: "cta";
  label: string;
  href?: string;
  /** Reserved for future in-app actions from admin config. */
  actionId?: string;
};

export type PlayerPopupContentBlock =
  | PlayerPopupTextBlock
  | PlayerPopupWinnersBlock
  | PlayerPopupCountdownBlock
  | PlayerPopupBannerBlock
  | PlayerPopupCtaBlock;

export type PlayerPopupContentConfig = PlayerPopupContentPresentation & {
  surface: PlayerPopupContentSurface;
  blocks: PlayerPopupContentBlock[];
};

/** Client/runtime snapshot for a surface (hook store + future API hydration). */
export type PlayerPopupContentSnapshot = PlayerPopupContentPresentation & {
  surface: PlayerPopupContentSurface;
  blocks: PlayerPopupContentBlock[];
  displayMode: PlayerPopupContentDisplayMode;
  loading: boolean;
  error: string | null;
};

/**
 * Future GET /api/player/popup-content?surface=... — `data` payload shape.
 * Hook/store can consume this directly after normalization.
 */
export type PlayerPopupContentApiData = PlayerPopupContentPresentation & {
  blocks: PlayerPopupContentBlock[];
  displayMode?: PlayerPopupContentDisplayMode;
};

/** Optional feed passed from consumers (e.g. mini-game modal host) into the slot. */
export type PlayerPopupContentFeed = PlayerPopupContentPresentation & {
  blocks?: PlayerPopupContentBlock[];
};

export const DEFAULT_PLAYER_POPUP_CONTENT_DISPLAY_MODE: PlayerPopupContentDisplayMode =
  "stack";
