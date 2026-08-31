import { createHash } from "node:crypto";

/** Stable hash for versioned archive rows. */
export function sourceRowHash(row: Record<string, unknown>): string {
  const normalized = stableStringify(row);
  return createHash("sha256").update(normalized).digest("hex");
}

export function numbersSequenceHash(numbers: number[]): string {
  return createHash("sha256")
    .update(numbers.join(","))
    .digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}
