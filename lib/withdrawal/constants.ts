/** Roles that may list/review assigned rial withdrawal requests. */
export const RIAL_WITHDRAWAL_REVIEW_ROLES = ["agent", "admin", "super"] as const;

export function canReviewRialWithdrawals(
  role: string | null | undefined
): boolean {
  return (
    role === "agent" || role === "admin" || role === "super"
  );
}

/** Minimum rial withdrawal amount in toman. */
export const MIN_RIAL_WITHDRAWAL_AMOUNT = 400_000;

/** Maximum digits for rial withdrawal card number input. */
export const MAX_RIAL_WITHDRAWAL_CARD_DIGITS = 16;
