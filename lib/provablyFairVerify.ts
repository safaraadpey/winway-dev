/**
 * Client-safe provably-fair draw verification (Web Crypto).
 * Mirrors apps/game-engine/src/core/rng.ts and provablyFairDrawSpec.ts.
 */

export type DrawVerificationInput = {
  serverSeed: string;
  serverSeedHash: string;
  drawnNumbers: number[];
  roomId?: string;
  drawCount?: number;
};

function normalizeRoomSeedHex(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (s.startsWith("\\x")) return s.slice(2).toLowerCase();
  if (s.startsWith("0x")) return s.slice(2).toLowerCase();
  return s.toLowerCase();
}

export type VerificationCheck = {
  id: string;
  label: string;
  passed: boolean;
  detail?: string;
};

export type DrawVerificationOutcome = {
  ok: boolean;
  checks: VerificationCheck[];
  reproducedDraws: number[];
  computedHash: string | null;
  firstMismatchIndex: number | null;
  parseError: string | null;
};

async function sha256HexUtf8(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256HexBytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function computeServerSeedHashBrowser(serverSeedHex: string): Promise<string> {
  const bytes = new Uint8Array(serverSeedHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(serverSeedHex.slice(i * 2, i * 2 + 2), 16);
  }
  return sha256HexBytes(bytes);
}

async function orderingKey(seedHex: string, candidate: number): Promise<string> {
  return sha256HexUtf8(`${seedHex}:${candidate}`);
}

async function pickNextNumber(
  seedHex: string,
  alreadyDrawn: Set<number>
): Promise<number | null> {
  let best: { n: number; key: string } | null = null;

  for (let n = 1; n <= 90; n++) {
    if (alreadyDrawn.has(n)) continue;
    const key = await orderingKey(seedHex, n);
    if (best === null || key < best.key) {
      best = { n, key };
    }
  }

  return best ? best.n : null;
}

export async function reproduceDrawSequence(
  serverSeedHex: string,
  drawCount: number
): Promise<number[]> {
  const drawn: number[] = [];
  const seen = new Set<number>();

  for (let i = 0; i < drawCount; i++) {
    const next = await pickNextNumber(serverSeedHex, seen);
    if (next === null) break;
    drawn.push(next);
    seen.add(next);
  }

  return drawn;
}

export function parseDrawVerificationJson(raw: string): {
  input: DrawVerificationInput | null;
  error: string | null;
} {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { input: null, error: "لطفاً JSON را وارد کنید." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { input: null, error: "فرمت JSON نامعتبر است." };
  }

  if (!parsed || typeof parsed !== "object") {
    return { input: null, error: "JSON باید یک شیء باشد." };
  }

  const obj = parsed as Record<string, unknown>;
  const serverSeed = obj.serverSeed;
  const serverSeedHash = obj.serverSeedHash;
  const drawnNumbers = obj.drawnNumbers;

  if (typeof serverSeed !== "string" || !serverSeed.trim()) {
    return { input: null, error: "فیلد serverSeed الزامی است." };
  }
  if (typeof serverSeedHash !== "string" || !serverSeedHash.trim()) {
    return { input: null, error: "فیلد serverSeedHash الزامی است." };
  }
  if (!Array.isArray(drawnNumbers)) {
    return { input: null, error: "فیلد drawnNumbers باید آرایه باشد." };
  }

  const numbers = drawnNumbers.map((n) => Number(n));
  if (numbers.some((n) => !Number.isInteger(n) || n < 1 || n > 90)) {
    return { input: null, error: "اعداد drawnNumbers باید بین ۱ تا ۹۰ باشند." };
  }

  const unique = new Set(numbers);
  if (unique.size !== numbers.length) {
    return { input: null, error: "drawnNumbers نباید عدد تکراری داشته باشد." };
  }

  const drawCountRaw = obj.drawCount;
  const drawCount =
    drawCountRaw == null ? numbers.length : Number(drawCountRaw);

  return {
    input: {
      roomId: typeof obj.roomId === "string" ? obj.roomId : undefined,
      serverSeed: serverSeed.trim(),
      serverSeedHash: serverSeedHash.trim(),
      drawnNumbers: numbers,
      drawCount: Number.isFinite(drawCount) ? drawCount : numbers.length,
    },
    error: null,
  };
}

export async function verifyDrawPayload(
  input: DrawVerificationInput
): Promise<DrawVerificationOutcome> {
  const checks: VerificationCheck[] = [];
  const normalizedSeed = normalizeRoomSeedHex(input.serverSeed);
  const normalizedHash = input.serverSeedHash.trim().toLowerCase();

  checks.push({
    id: "seed-format",
    label: "فرمت serverSeed (hex lowercase، ۶۴ کاراکتر)",
    passed: Boolean(normalizedSeed && /^[0-9a-f]{64}$/.test(normalizedSeed)),
    detail: normalizedSeed
      ? undefined
      : "serverSeed باید ۳۲ بایت به‌صورت hex باشد.",
  });

  checks.push({
    id: "hash-format",
    label: "فرمت serverSeedHash (hex lowercase، ۶۴ کاراکتر)",
    passed: /^[0-9a-f]{64}$/.test(normalizedHash),
  });

  let computedHash: string | null = null;
  if (normalizedSeed && /^[0-9a-f]{64}$/.test(normalizedSeed)) {
    computedHash = await computeServerSeedHashBrowser(normalizedSeed);

    checks.push({
      id: "hash-match",
      label: "تطابق commit: sha256(bytes_from_hex(serverSeed))",
      passed: computedHash === normalizedHash,
      detail:
        computedHash === normalizedHash
          ? undefined
          : `محاسبه‌شده: ${computedHash.slice(0, 8)}… — اعلام‌شده: ${normalizedHash.slice(0, 8)}…`,
    });

    checks.push({
      id: "hash-not-utf8",
      label: "رد الگوریتم اشتباه sha256(utf8(serverSeed))",
      passed: (await sha256HexUtf8(normalizedSeed)) !== normalizedHash,
      detail: "هش commit روی بایت‌های decode‌شده است، نه متن hex.",
    });
  } else {
    checks.push({
      id: "hash-match",
      label: "تطابق commit: sha256(bytes_from_hex(serverSeed))",
      passed: false,
      detail: "به‌دلیل فرمت نادرست serverSeed قابل محاسبه نیست.",
    });
  }

  const expectedCount = input.drawCount ?? input.drawnNumbers.length;
  checks.push({
    id: "draw-count",
    label: "تطابق drawCount با طول drawnNumbers",
    passed: expectedCount === input.drawnNumbers.length,
    detail:
      expectedCount === input.drawnNumbers.length
        ? `${input.drawnNumbers.length} قرعه`
        : `drawCount=${expectedCount} ولی drawnNumbers.length=${input.drawnNumbers.length}`,
  });

  let reproducedDraws: number[] = [];
  let firstMismatchIndex: number | null = null;

  if (normalizedSeed && /^[0-9a-f]{64}$/.test(normalizedSeed)) {
    reproducedDraws = await reproduceDrawSequence(
      normalizedSeed,
      input.drawnNumbers.length
    );

    for (let i = 0; i < input.drawnNumbers.length; i++) {
      if (reproducedDraws[i] !== input.drawnNumbers[i]) {
        firstMismatchIndex = i;
        break;
      }
    }

    const sequenceOk =
      reproducedDraws.length === input.drawnNumbers.length &&
      firstMismatchIndex === null;

    checks.push({
      id: "draw-sequence",
      label: "بازتولید ترتیب قرعه‌ها با SHA256_ORDERING",
      passed: sequenceOk,
      detail: sequenceOk
        ? "همه اعداد با الگوریتم سرور یکسان هستند."
        : firstMismatchIndex != null
          ? `اولین اختلاف در قرعه ${firstMismatchIndex + 1}: انتظار ${reproducedDraws[firstMismatchIndex] ?? "—"}، دریافت ${input.drawnNumbers[firstMismatchIndex]}`
          : `تعداد بازتولید (${reproducedDraws.length}) با اعلام‌شده (${input.drawnNumbers.length}) فرق دارد.`,
    });
  } else {
    checks.push({
      id: "draw-sequence",
      label: "بازتولید ترتیب قرعه‌ها با SHA256_ORDERING",
      passed: false,
      detail: "به‌دلیل فرمت نادرست serverSeed قابل محاسبه نیست.",
    });
  }

  const ok = checks.every((c) => c.passed);

  return {
    ok,
    checks,
    reproducedDraws,
    computedHash,
    firstMismatchIndex,
    parseError: null,
  };
}
