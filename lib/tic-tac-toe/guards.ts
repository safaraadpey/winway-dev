import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/supabaseServer";
import {
  assertFeature,
  FeatureDisabledError,
  featureDisabledResponse,
} from "@/lib/featureFlags/requireFeature";
import { TIC_TAC_TOE_FEATURE_KEY } from "@/lib/tic-tac-toe/constants";

export class TicTacToeAuthError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string
  ) {
    super(message);
    this.name = "TicTacToeAuthError";
  }
}

export async function requireTicTacToeContext(
  request: NextRequest
): Promise<{ userId: string }> {
  const user = await getUserFromRequest(request);
  if (!user) {
    throw new TicTacToeAuthError(
      "Authentication required.",
      401,
      "unauthorized"
    );
  }

  try {
    await assertFeature(user.id, TIC_TAC_TOE_FEATURE_KEY);
  } catch (err) {
    if (err instanceof FeatureDisabledError) {
      throw new TicTacToeAuthError(
        `Feature '${TIC_TAC_TOE_FEATURE_KEY}' is not enabled for this user.`,
        403,
        "feature_disabled"
      );
    }
    throw err;
  }

  return { userId: user.id };
}

export function ticTacToeErrorResponse(err: TicTacToeAuthError): NextResponse {
  return NextResponse.json(
    { ok: false, error: err.code, message: err.message },
    { status: err.status }
  );
}
