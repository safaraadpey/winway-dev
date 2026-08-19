import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/supabaseServer";
import {
  assertFeature,
  FeatureDisabledError,
  featureDisabledResponse,
} from "@/lib/featureFlags/requireFeature";
import { BACKGAMMON_FEATURE_KEY } from "@/lib/backgammon/constants";

export class BackgammonAuthError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string
  ) {
    super(message);
    this.name = "BackgammonAuthError";
  }
}

export async function requireBackgammonContext(
  request: NextRequest
): Promise<{ userId: string }> {
  const user = await getUserFromRequest(request);
  if (!user) {
    throw new BackgammonAuthError(
      "Authentication required.",
      401,
      "unauthorized"
    );
  }

  try {
    await assertFeature(user.id, BACKGAMMON_FEATURE_KEY);
  } catch (err) {
    if (err instanceof FeatureDisabledError) {
      throw new BackgammonAuthError(
        `Feature '${BACKGAMMON_FEATURE_KEY}' is not enabled for this user.`,
        403,
        "feature_disabled"
      );
    }
    throw err;
  }

  return { userId: user.id };
}

export function backgammonErrorResponse(err: BackgammonAuthError): NextResponse {
  return NextResponse.json(
    { ok: false, error: err.code, message: err.message },
    { status: err.status }
  );
}

export type SessionParticipantRow = {
  user_id: string;
  seat_no: number;
  status: string;
};

export function assertMembership(
  participants: SessionParticipantRow[],
  userId: string
): SessionParticipantRow {
  const row = participants.find((p) => p.user_id === userId);
  if (!row) {
    throw new BackgammonAuthError(
      "You are not a participant in this game.",
      403,
      "not_a_participant"
    );
  }
  return row;
}

export function seatForUser(
  participants: SessionParticipantRow[],
  userId: string
): 0 | 1 {
  const row = assertMembership(participants, userId);
  if (row.seat_no !== 0 && row.seat_no !== 1) {
    throw new BackgammonAuthError("Invalid seat assignment.", 500, "invalid_seat");
  }
  return row.seat_no as 0 | 1;
}
