// Types for admin/agent/super transaction management (manual deposits/withdrawals)

export type TransactionAction = "deposit" | "withdraw";

/** Per-item result for Strategy B bulk money ops (P6.4). */
export interface BulkMoneyItemResult {
  userId: string;
  success: boolean;
  transferId?: string;
  transactionId?: unknown;
  clientRequestId?: string;
  idempotencyKey?: string;
  replayed?: boolean;
  error?: string;
  code?: string;
}

export interface BulkMoneyResponse {
  ok: boolean;
  partial: boolean;
  successCount: number;
  failureCount: number;
  results: BulkMoneyItemResult[];
  message?: string;
}

// Two-sided transfer (panel cashdesk) request type
export interface BulkTransferRequest {
  userIds: string[];
  /**
   * Required for retry safety. One id per userId (parallel arrays).
   * If omitted in the service layer, fresh UUIDs are generated for this attempt only.
   */
  clientRequestIds?: string[];
  amount: number; // integer (IRR)
  action: TransactionAction; // deposit/withdraw UI action
  currency?: "IRR";
  description?: string;
}

export interface BulkAdjustRequest {
  userIds: string[];
  /**
   * Required for retry safety. One key per userId (parallel arrays).
   * If omitted in the service layer, fresh UUIDs are generated for this attempt only.
   */
  idempotencyKeys?: string[];
  amount: number;
  action: TransactionAction;
  currency?: string; // e.g. "IRR"
  description?: string;
}

// Types for transaction history
export type DateFilter = "day" | "week" | "month";

export interface TransactionHistoryItem {
  id: string;
  fromUserId: string;
  fromUsername: string;
  fromShortId: string;
  toUserId: string;
  toUsername: string;
  toShortId: string;
  amount: number;
  type: TransactionAction;
  createdAt: string; // ISO date string
  description?: string;
}

export interface TransactionHistoryResult {
  transactions: TransactionHistoryItem[];
  totalCount: number;
}


