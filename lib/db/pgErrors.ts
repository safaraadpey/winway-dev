export function isPgPoolExhaustedError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const message = "message" in err ? String((err as { message?: unknown }).message) : "";
  const code = "code" in err ? String((err as { code?: unknown }).code) : "";
  return (
    message.includes("EMAXCONNSESSION") ||
    message.includes("max clients reached") ||
    code === "XX000"
  );
}

export function toUserDatabaseBusyMessage(err: unknown): string {
  if (isPgPoolExhaustedError(err)) {
    return "اتصال پایگاه داده موقتاً پر است. چند ثانیه بعد دوباره تلاش کنید.";
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return "خطای غیرمنتظره رخ داد.";
}
