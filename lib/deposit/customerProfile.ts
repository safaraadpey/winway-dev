/**
 * Resolve HamiPay customerName / customerPhone from deposit identity profile.
 * Wallet SoR is separate; these fields are provider metadata only.
 *
 * full_name + phone are first-write locked on user_profiles.
 */

export type DepositCustomerProfile = {
  customerName: string;
  customerPhone: string;
  source: {
    name: "full_name" | "client" | "nickname" | "username" | "email" | "fallback" | "synthetic";
    phone: "profile" | "client" | "none" | "synthetic";
  };
};

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

export function normalizeFullName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const name = String(raw).trim().replace(/\s+/g, " ");
  if (name.length < 3 || name.length > 120) return null;
  return name;
}

/**
 * Prefer locked DB full_name. Client value only when DB is empty (first write).
 */
export function resolveDepositCustomerName(input: {
  storedFullName?: string | null;
  clientFullName?: string | null;
  nickname?: string | null;
  username?: string | null;
  email?: string | null;
}): { name: string | null; source: DepositCustomerProfile["source"]["name"] } {
  const stored = normalizeFullName(input.storedFullName);
  if (stored) return { name: stored, source: "full_name" };

  const client = normalizeFullName(input.clientFullName);
  if (client) return { name: client, source: "client" };

  return { name: null, source: "fallback" };
}

/**
 * Prefer locked DB phone. Client value only when DB is empty (first write).
 */
export function resolveDepositCustomerPhone(input: {
  storedPhone?: string | null;
  clientPhone?: string | null;
}): {
  phone: string | null;
  source: DepositCustomerProfile["source"]["phone"];
} {
  const stored = normalizeIranMobile(input.storedPhone);
  if (stored) return { phone: stored, source: "profile" };

  const client = normalizeIranMobile(input.clientPhone);
  if (client) return { phone: client, source: "client" };

  return { phone: null, source: "none" };
}

export type ResolvedDepositIdentity = {
  name: string | null;
  phone: string | null;
  nameSource: DepositCustomerProfile["source"]["name"];
  phoneSource: DepositCustomerProfile["source"]["phone"];
  identityMode: "synthetic" | "manual";
  needsPersist: boolean;
};

/**
 * Resolve HamiPay customer identity for deposit create.
 * Synthetic mode: ignore client; use locked profile or generate stable synthetic.
 */
export function resolveDepositCustomerIdentity(input: {
  userId: string;
  syntheticEnabled: boolean;
  storedFullName?: string | null;
  storedPhone?: string | null;
  clientFullName?: string | null;
  clientPhone?: string | null;
  generateSynthetic?: (userId: string) => { fullName: string; phone: string };
}): ResolvedDepositIdentity {
  const identityMode = input.syntheticEnabled ? "synthetic" : "manual";

  if (input.syntheticEnabled) {
    const storedName = normalizeFullName(input.storedFullName);
    const storedPhone = normalizeIranMobile(input.storedPhone);
    if (storedName && storedPhone) {
      return {
        name: storedName,
        phone: storedPhone,
        nameSource: "full_name",
        phoneSource: "profile",
        identityMode,
        needsPersist: false,
      };
    }

    const generated =
      input.generateSynthetic?.(input.userId) ??
      (() => {
        throw new Error("synthetic_identity_generator_missing");
      })();

    return {
      name: generated.fullName,
      phone: generated.phone,
      nameSource: "synthetic",
      phoneSource: "synthetic",
      identityMode,
      needsPersist: true,
    };
  }

  const resolvedName = resolveDepositCustomerName({
    storedFullName: input.storedFullName,
    clientFullName: input.clientFullName,
  });
  const resolvedPhone = resolveDepositCustomerPhone({
    storedPhone: input.storedPhone,
    clientPhone: input.clientPhone,
  });

  return {
    name: resolvedName.name,
    phone: resolvedPhone.phone,
    nameSource: resolvedName.source,
    phoneSource: resolvedPhone.source,
    identityMode,
    needsPersist:
      resolvedName.source === "client" || resolvedPhone.source === "client",
  };
}
