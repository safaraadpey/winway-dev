/** Opaque invite token alphabet (no 0/O/1/I). */
export const WATCH_INVITE_TOKEN_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const WATCH_INVITE_TOKEN_LENGTH = 6;

export const WATCH_GUEST_COOKIE_NAME = "ww_watch_guest";
/** Guest watch lock — short-lived; cleared on explicit exit or expiry. */
export const WATCH_GUEST_COOKIE_MAX_AGE_SEC = 60 * 60 * 24; // 24 hours

/** Primary scope — attached to /watch/* navigation. */
export const WATCH_GUEST_COOKIE_PATH = "/watch";
/** Same payload at path=/ so middleware can guard /player/* without redirecting /. */
export const WATCH_GUEST_COOKIE_LOCK_PATH = "/";
