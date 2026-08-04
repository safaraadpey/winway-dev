/**
 * HD address derivation from account-level XPUB (BIP-44 external chain 0/index).
 */
import { HDKey } from "@scure/bip32";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import bs58 from "bs58";

const XPUB_PREFIXES = ["xpub", "ypub", "zpub"] as const;

export function assertValidXpub(xpub: string, label: string): void {
  const trimmed = xpub.trim();
  if (!trimmed) {
    throw new Error(`${label}_required`);
  }
  const prefix = trimmed.slice(0, 4);
  if (!XPUB_PREFIXES.some((p) => trimmed.startsWith(p))) {
    throw new Error(`${label}_invalid_prefix`);
  }
  try {
    HDKey.fromExtendedKey(trimmed);
  } catch {
    throw new Error(`${label}_invalid`);
  }
}

function deriveCompressedPubKey(xpub: string, index: number): Uint8Array {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error("invalid_derivation_index");
  }
  const account = HDKey.fromExtendedKey(xpub.trim());
  const child = account.deriveChild(0).deriveChild(index);
  if (!child.publicKey) {
    throw new Error("derivation_failed");
  }
  return child.publicKey;
}

function pubkeyToEthHex(compressedPubKey: Uint8Array): string {
  const point = secp256k1.Point.fromBytes(compressedPubKey);
  const uncompressed = point.toBytes(false);
  const hash = keccak_256(uncompressed.slice(1));
  return Buffer.from(hash.slice(-20)).toString("hex");
}

function base58CheckEncode(payload: Uint8Array): string {
  const checksum = sha256(sha256(payload)).slice(0, 4);
  const full = new Uint8Array(payload.length + 4);
  full.set(payload);
  full.set(checksum, payload.length);
  return bs58.encode(full);
}

/** EVM / BEP-20 address (0x + 40 hex, checksummed lowercase for storage consistency). */
export function deriveBep20AddressFromXpub(
  bep20Xpub: string,
  index: number
): string {
  assertValidXpub(bep20Xpub, "bep20_xpub");
  const hex = pubkeyToEthHex(deriveCompressedPubKey(bep20Xpub, index));
  return `0x${hex}`.toLowerCase();
}

/** TRON TRC-20 base58 address (starts with T). */
export function deriveTrc20AddressFromXpub(
  trc20Xpub: string,
  index: number
): string {
  assertValidXpub(trc20Xpub, "trc20_xpub");
  const ethHex = pubkeyToEthHex(deriveCompressedPubKey(trc20Xpub, index));
  const payload = Buffer.concat([
    Buffer.from([0x41]),
    Buffer.from(ethHex, "hex"),
  ]);
  return base58CheckEncode(payload);
}

export function deriveUserCryptoAddresses(
  bep20Xpub: string,
  trc20Xpub: string,
  index: number
): { bep20Address: string; trc20Address: string } {
  return {
    bep20Address: deriveBep20AddressFromXpub(bep20Xpub, index),
    trc20Address: deriveTrc20AddressFromXpub(trc20Xpub, index),
  };
}
