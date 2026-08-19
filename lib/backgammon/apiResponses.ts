import { NextResponse } from "next/server";
import {
  BackgammonAuthError,
  backgammonErrorResponse,
} from "@/lib/backgammon/guards";
import {
  BackgammonRepositoryError,
  StaleStateError,
} from "@/lib/backgammon/repository";

export function backgammonOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true, data }, { status });
}

export function backgammonFail(
  error: string,
  message: string,
  status: number
): NextResponse {
  return NextResponse.json({ ok: false, error, message }, { status });
}

export function handleBackgammonRouteError(err: unknown): NextResponse {
  if (err instanceof BackgammonAuthError) {
    return backgammonErrorResponse(err);
  }
  if (err instanceof StaleStateError) {
    return backgammonFail(
      "stale_state",
      "Game state changed. Refresh and retry.",
      409
    );
  }
  if (err instanceof BackgammonRepositoryError) {
    return backgammonFail(err.code, err.message, err.status);
  }

  console.error("[Backgammon] unexpected route error:", err);
  return backgammonFail(
    "unexpected_error",
    err instanceof Error ? err.message : "unexpected error",
    500
  );
}
