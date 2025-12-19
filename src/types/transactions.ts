// Types for admin/agent/super transaction management (manual deposits/withdrawals)

export type TransactionAction = "deposit" | "withdraw";

// Two-sided transfer (panel cashdesk) request type
export interface BulkTransferRequest {
  userIds: string[];
  amount: number; // integer (IRR)
  action: TransactionAction; // deposit/withdraw UI action
  currency?: "IRR";
  description?: string;
}

export interface BulkAdjustRequest {
  userIds: string[];
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


