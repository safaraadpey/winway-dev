/**
 * Provably-fair draw verification payload — matches game_core.fn_manage_room_live_actions
 * and apps/game-engine/src/core/rng.ts (SHA256 ordering, not HMAC/clientSeed/nonce).
 */

import { createHash } from "node:crypto";

/** serverSeed field = encode(room_seed bytea, 'hex') lowercase (64 chars, 32 bytes). */
export const SERVER_SEED_ENCODING =
  "hex_lowercase_64_chars_represents_32_bytea" as const;

/**
 * fn_generate_room_seed: encode(digest(v_seed bytea, 'sha256'), 'hex')
 * NOT sha256(utf8(serverSeed)) — the commit hashes raw bytes, not the hex text.
 */
export const SERVER_SEED_HASH_ALGORITHM =
  "sha256(bytes_from_hex(serverSeed)) -> hex_lowercase_64_chars" as const;

/** Documented anti-pattern — must NOT be used to verify room_seed_hash. */
export const SERVER_SEED_HASH_REJECTED_ALGORITHM =
  "sha256(utf8(serverSeed))" as const;

export function computeServerSeedHashFromHex(serverSeedHex: string): string {
  return createHash("sha256")
    .update(Buffer.from(serverSeedHex, "hex"))
    .digest("hex")
    .toLowerCase();
}

/** Postgres ORDER BY digest(...) ASC; rng.ts: key < best.key on 64-char hex */
export const ORDERING_KEY_COMPARISON =
  "string_compare(codepoint_order, normalized_lowercase_hex_64)_ascending_minimum" as const;

/** digest(encode(seed,'hex') || ':' || n::text, 'sha256') — UTF-8 bytes of that text */
export const ORDERING_KEY_INPUT_ENCODING =
  "utf8_text_concat:lowercase_hex(seed_bytes)+ascii_colon+decimal_candidate_string" as const;

export type DrawVerificationSpec = {
  roomId: string;
  serverSeed: string;
  serverSeedEncoding: typeof SERVER_SEED_ENCODING;
  serverSeedHash: string;
  serverSeedHashAlgorithm: typeof SERVER_SEED_HASH_ALGORITHM;
  serverSeedHashRejectedAlgorithm: typeof SERVER_SEED_HASH_REJECTED_ALGORITHM;
  rng: "SHA256_ORDERING";
  numberRange: [1, 90];
  uniqueNumbers: true;
  drawCount: number;
  drawnNumbers: number[];
  orderingKeyFormat: "sha256(hex(serverSeed)+':'+candidateNumber)";
  orderingKeyInputEncoding: typeof ORDERING_KEY_INPUT_ENCODING;
  orderingKeyComparison: typeof ORDERING_KEY_COMPARISON;
  selectionMethod: "pick_undrawn_candidate_with_minimum_ordering_key";
};

export function normalizeRoomSeedHex(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (s.startsWith("\\x")) return s.slice(2).toLowerCase();
  if (s.startsWith("0x")) return s.slice(2).toLowerCase();
  return s.toLowerCase();
}

export function buildDrawVerificationSpec(params: {
  roomId: string;
  serverSeedRaw: string | null;
  serverSeedHash: string | null;
  drawnNumbers: number[];
}): DrawVerificationSpec | null {
  const serverSeed = normalizeRoomSeedHex(params.serverSeedRaw);
  const serverSeedHash = (params.serverSeedHash || "").trim().toLowerCase();
  if (!serverSeed || !serverSeedHash) return null;
  if (!/^[0-9a-f]{64}$/.test(serverSeed)) return null;
  if (!/^[0-9a-f]{64}$/.test(serverSeedHash)) return null;

  const computedHash = computeServerSeedHashFromHex(serverSeed);
  if (computedHash !== serverSeedHash) return null;

  return {
    roomId: params.roomId,
    serverSeed,
    serverSeedEncoding: SERVER_SEED_ENCODING,
    serverSeedHash,
    serverSeedHashAlgorithm: SERVER_SEED_HASH_ALGORITHM,
    serverSeedHashRejectedAlgorithm: SERVER_SEED_HASH_REJECTED_ALGORITHM,
    rng: "SHA256_ORDERING",
    numberRange: [1, 90],
    uniqueNumbers: true,
    drawCount: params.drawnNumbers.length,
    drawnNumbers: params.drawnNumbers,
    orderingKeyFormat: "sha256(hex(serverSeed)+':'+candidateNumber)",
    orderingKeyInputEncoding: ORDERING_KEY_INPUT_ENCODING,
    orderingKeyComparison: ORDERING_KEY_COMPARISON,
    selectionMethod: "pick_undrawn_candidate_with_minimum_ordering_key",
  };
}
