/**
 * Stable per-user synthetic HamiPay customer identity (fullName + phone).
 * Derived from userId + salt — same user always gets the same profile.
 */
import { createHash } from "crypto";
import {
  normalizeFullName,
  normalizeIranMobile,
} from "@/lib/deposit/customerProfile";
import {
  SYNTHETIC_FIRST_NAMES,
  SYNTHETIC_LAST_NAMES,
} from "@/lib/deposit/syntheticCustomerIdentityNames";

const FIRST_NAMES = SYNTHETIC_FIRST_NAMES;
const LAST_NAMES = SYNTHETIC_LAST_NAMES;

export type SyntheticCustomerIdentity = {
  fullName: string;
  phone: string;
};

export function getSyntheticIdentitySalt(): string {
  const fromEnv = process.env.DEPOSIT_SYNTHETIC_IDENTITY_SALT?.trim();
  return fromEnv || "dingmoney-deposit-synthetic-v1";
}

function hashUserId(userId: string, salt: string): Buffer {
  return createHash("sha256").update(`${salt}:${userId}`).digest();
}

/**
 * Deterministic synthetic identity for a user. Output always passes
 * normalizeFullName / normalizeIranMobile checks.
 */
export function generateStableSyntheticCustomerIdentity(
  userId: string,
  salt = getSyntheticIdentitySalt()
): SyntheticCustomerIdentity {
  const hash = hashUserId(userId, salt);
  const firstName = FIRST_NAMES[hash[0] % FIRST_NAMES.length]!;
  const lastName = LAST_NAMES[hash[1] % LAST_NAMES.length]!;
  const fullName = `${firstName} ${lastName}`;

  let digits = "";
  for (let i = 0; i < 9; i++) {
    digits += String(hash[(2 + i) % hash.length]! % 10);
  }
  if (digits[0] === "0") {
    digits = `1${digits.slice(1)}`;
  }
  const phone = `09${digits}`;

  const normalizedName = normalizeFullName(fullName);
  const normalizedPhone = normalizeIranMobile(phone);
  if (!normalizedName || !normalizedPhone) {
    throw new Error("synthetic_identity_generation_failed");
  }

  return {
    fullName: normalizedName,
    phone: normalizedPhone,
  };
}
