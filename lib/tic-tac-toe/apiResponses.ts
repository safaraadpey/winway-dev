import { NextResponse } from "next/server";
import {
  TicTacToeAuthError,
  ticTacToeErrorResponse,
} from "@/lib/tic-tac-toe/guards";
import { TicTacToeRepositoryError } from "@/lib/tic-tac-toe/repository";
import { isPgPoolExhaustedError, toUserDatabaseBusyMessage } from "@/lib/db/pgErrors";

export function ticTacToeOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true, data }, { status });
}

export function ticTacToeFail(
  error: string,
  message: string,
  status: number
): NextResponse {
  return NextResponse.json({ ok: false, error, message }, { status });
}

export function handleTicTacToeRouteError(err: unknown): NextResponse {
  if (err instanceof TicTacToeAuthError) {
    return ticTacToeErrorResponse(err);
  }
  if (err instanceof TicTacToeRepositoryError) {
    return ticTacToeFail(err.code, err.message, err.status);
  }

  console.error("[TicTacToe] unexpected route error:", err);
  if (isPgPoolExhaustedError(err)) {
    return ticTacToeFail(
      "db_busy",
      toUserDatabaseBusyMessage(err),
      503
    );
  }
  return ticTacToeFail(
    "unexpected_error",
    toUserDatabaseBusyMessage(err),
    500
  );
}
