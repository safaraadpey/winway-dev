export type WithdrawalRequestStatus =
  | "pending"
  | "processing"
  | "approved"
  | "rejected"
  | "cancelled";

export type WithdrawalKind = "rial" | "crypto";

export type CryptoNetwork = "BEP20" | "TRC20" | "TRX";

export interface WithdrawalRequestItem {
  id: string;
  kind: WithdrawalKind;
  playerId: string;
  agentId?: string | null;
  amount: number;
  cardNumber?: string | null;
  shebaNumber?: string | null;
  fullName?: string | null;
  status: WithdrawalRequestStatus;
  statusLabel: string;
  rejectReason?: string | null;
  reviewNote?: string | null;
  createdAt: string;
  reviewedAt?: string | null;
  playerUsername?: string | null;
  network?: CryptoNetwork | null;
  cryptoSymbol?: "USDT" | "TRX" | null;
  cryptoAmount?: number | null;
  walletAddress?: string | null;
  requestedToman?: number | null;
  /** Distinct normal games in rolling 7-day window (fn_player_stats weekly). */
  playerWeekGamesPlayed?: number;
  /** Sum of paid normal-room winnings in rolling 7-day window. */
  playerWeekTotalWinnings?: number;
}

export interface CreateWithdrawalRequestBody {
  amount: number;
  cardNumber: string;
  shebaNumber: string;
  fullName: string;
  clientRequestId: string;
}

export interface CreateCryptoWithdrawalRequestBody {
  network: CryptoNetwork;
  cryptoAmount: number;
  cryptoSymbol: "USDT" | "TRX";
  lockedToman: number;
  requestedToman: number;
  walletAddress: string;
  clientRequestId: string;
  quotedAt: string;
}

export interface CryptoWithdrawQuoteResponse {
  ok: boolean;
  network: CryptoNetwork;
  cryptoSymbol: "USDT" | "TRX";
  cryptoAmount: number;
  lockedToman: number;
  requestedToman: number;
  quotedAt: string;
  rates: {
    usdtTomanPrice: number;
    trxUsdPrice: number;
    fetchedAt: string;
  };
}

export type CryptoWithdrawQuotesBatchResponse = {
  ok: boolean;
  requestedToman: number;
  quotedAt: string;
  rates: CryptoWithdrawQuoteResponse["rates"];
  quotes: Record<CryptoNetwork, Omit<CryptoWithdrawQuoteResponse, "ok" | "rates">>;
};

export interface AdminWithdrawalReviewBody {
  requestId: string;
  action: "approve" | "reject";
  reason?: string;
  kind?: WithdrawalKind;
}

export interface AdminWithdrawalMarkProcessingBody {
  requestId: string;
  kind?: WithdrawalKind;
}

export function getWithdrawalStatusLabel(
  status: WithdrawalRequestStatus
): string {
  switch (status) {
    case "pending":
      return "در حال بررسی";
    case "processing":
      return "در حال پرداخت";
    case "approved":
      return "تأیید شده";
    case "rejected":
      return "رد شده";
    case "cancelled":
      return "لغو شده";
    default:
      return status;
  }
}

export function getNetworkLabel(network: CryptoNetwork): string {
  switch (network) {
    case "BEP20":
      return "BEP-20";
    case "TRC20":
      return "TRC-20";
    case "TRX":
      return "TRX";
    default:
      return network;
  }
}
