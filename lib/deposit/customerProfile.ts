/**
 * Resolve HamiPay customerName / customerPhone from player profile.
 * Wallet SoR is separate; these fields are provider metadata only.
 *
 * Phone is NEVER collected from the player. Each user gets one stable
 * synthetic MCI / Irancell mobile derived from userId (and persisted).
 */

import { createHash } from "crypto";

export type DepositCustomerProfile = {
  customerName: string;
  customerPhone: string;
  source: {
    name: "nickname" | "username" | "email" | "client" | "fallback";
    phone: "assigned" | "generated";
  };
};

/** Hamrah-e Avval (MCI) + Irancell prefixes — 4-digit including leading 0. */
const IRAN_MOBILE_PREFIXES = [
  // MCI / همراه اول
  "0910",
  "0911",
  "0912",
  "0913",
  "0914",
  "0915",
  "0916",
  "0917",
  "0918",
  "0919",
  "0990",
  "0991",
  "0992",
  "0993",
  "0994",
  // Irancell / ایرانسل
  "0901",
  "0902",
  "0903",
  "0905",
  "0930",
  "0933",
  "0935",
  "0936",
  "0937",
  "0938",
  "0939",
] as const;

function hashToUint32(seed: string): number {
  const hex = createHash("sha256").update(seed).digest("hex").slice(0, 8);
  return Number.parseInt(hex, 16) >>> 0;
}

/**
 * Stable synthetic Iranian mobile for a user (09xxxxxxxxx).
 * Same userId → same number; mixes MCI + Irancell prefixes.
 */
export function generateAssignedIranMobile(userId: string): string {
  const seed = `dingmoney:hamipay:phone:v1:${userId}`;
  const h1 = hashToUint32(seed);
  const h2 = hashToUint32(`${seed}:tail`);
  const prefix =
    IRAN_MOBILE_PREFIXES[h1 % IRAN_MOBILE_PREFIXES.length] ?? "0912";
  const subscriber = String(h2 % 10_000_000).padStart(7, "0");
  return `${prefix}${subscriber}`;
}

/** Normalize Iranian mobile to 09xxxxxxxxx (11 digits) when possible. */
export function normalizeIranMobile(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = String(raw).replace(/\D/g, "");
  if (!digits) return null;

  if (digits.startsWith("0098")) digits = digits.slice(4);
  else if (digits.startsWith("98") && digits.length >= 12) digits = digits.slice(2);

  if (digits.startsWith("9") && digits.length === 10) digits = `0${digits}`;

  if (/^09\d{9}$/.test(digits)) return digits;
  return null;
}

export function resolveDepositCustomerName(input: {
  clientName?: string | null;
  nickname?: string | null;
  username?: string | null;
  email?: string | null;
}): { name: string; source: DepositCustomerProfile["source"]["name"] } {
  const nickname = (input.nickname || "").trim();
  if (nickname.length >= 2) {
    return { name: nickname.slice(0, 120), source: "nickname" };
  }
  const username = (input.username || "").trim();
  if (username.length >= 2) {
    return { name: username.slice(0, 120), source: "username" };
  }
  const emailLocal = (input.email || "").split("@")[0]?.trim() || "";
  if (emailLocal.length >= 2) {
    return { name: emailLocal.slice(0, 120), source: "email" };
  }
  return { name: "DingMoney User", source: "fallback" };
}

/**
 * Resolve phone for HamiPay: reuse persisted assigned number, else generate
 * a stable MCI/Irancell number from userId (never from client form).
 */
export function resolveDepositCustomerPhone(input: {
  userId: string;
  assignedPhone?: string | null;
}): {
  phone: string;
  source: DepositCustomerProfile["source"]["phone"];
} {
  const existing = normalizeIranMobile(input.assignedPhone);
  if (existing) return { phone: existing, source: "assigned" };

  return {
    phone: generateAssignedIranMobile(input.userId),
    source: "generated",
  };
}
