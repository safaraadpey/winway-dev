import { NextResponse } from "next/server";
import { hasFeature } from "@/lib/featureFlags/evaluator";

export class FeatureDisabledError extends Error {
  constructor(public featureKey: string) {
    super(`Feature disabled: ${featureKey}`);
    this.name = "FeatureDisabledError";
  }
}

export async function assertFeature(
  userId: string,
  featureKey: string
): Promise<void> {
  const enabled = await hasFeature(userId, featureKey);
  if (!enabled) {
    console.log("[Feature] access denied", { userId, featureKey });
    throw new FeatureDisabledError(featureKey);
  }
}

export function featureDisabledResponse(featureKey: string): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      error: "feature_disabled",
      message: `Feature '${featureKey}' is not enabled for this user.`,
      featureKey,
    },
    { status: 403 }
  );
}
