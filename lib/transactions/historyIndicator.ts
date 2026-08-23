import type { TransactionHistoryItem } from "@/src/types/transactions";

export interface TransactionHistoryIndicator {
  /** Inline background color — avoids Tailwind purge on dynamic classes in lib/. */
  color: string;
  label: string;
  legendKey: string;
}

const PANEL_AGENT: TransactionHistoryIndicator = {
  color: "#2dd4bf",
  label: "پنل ایجنت",
  legendKey: "panel_agent",
};

const PANEL_SUPER: TransactionHistoryIndicator = {
  color: "#c084fc",
  label: "پنل سوپر",
  legendKey: "panel_super",
};

const PANEL_ADMIN: TransactionHistoryIndicator = {
  color: "#fbbf24",
  label: "پنل ادمین",
  legendKey: "panel_admin",
};

const PANEL_ADMIN_FINANCE: TransactionHistoryIndicator = {
  color: "#60a5fa",
  label: "پنل مالی",
  legendKey: "panel_admin_finance",
};

const PANEL_ADMIN_OTHER: TransactionHistoryIndicator = {
  color: "#818cf8",
  label: "پنل ادمین (زیرنقش)",
  legendKey: "panel_admin_other",
};

const GATEWAY_DEPOSIT: TransactionHistoryIndicator = {
  color: "#38bdf8",
  label: "واریز درگاه",
  legendKey: "gateway_deposit",
};

const TETHER_DEPOSIT: TransactionHistoryIndicator = {
  color: "#4ade80",
  label: "واریز تتر",
  legendKey: "tether_deposit",
};

const RIAL_WITHDRAWAL: TransactionHistoryIndicator = {
  color: "#f87171",
  label: "برداشت ریالی",
  legendKey: "rial_withdrawal",
};

const TETHER_WITHDRAWAL: TransactionHistoryIndicator = {
  color: "#facc15",
  label: "برداشت تتر",
  legendKey: "tether_withdrawal",
};

const DEFAULT_PANEL: TransactionHistoryIndicator = {
  color: "#9ca3af",
  label: "پنل",
  legendKey: "panel_unknown",
};

function getPanelIndicator(
  tx: TransactionHistoryItem
): TransactionHistoryIndicator {
  if (tx.actorRole === "agent") return PANEL_AGENT;
  if (tx.actorRole === "super") return PANEL_SUPER;
  if (tx.actorRole === "admin") {
    const sub = tx.actorAdminSubRole;
    if (!sub || sub === "manager") return PANEL_ADMIN;
    if (sub === "finance") return PANEL_ADMIN_FINANCE;
    return PANEL_ADMIN_OTHER;
  }
  return DEFAULT_PANEL;
}

export function getTransactionHistoryIndicator(
  tx: TransactionHistoryItem
): TransactionHistoryIndicator {
  switch (tx.type) {
    case "gateway_deposit":
      return GATEWAY_DEPOSIT;
    case "crypto_deposit":
      return TETHER_DEPOSIT;
    case "withdrawal_request":
      return RIAL_WITHDRAWAL;
    case "crypto_withdrawal":
      return TETHER_WITHDRAWAL;
    case "deposit":
    case "withdraw":
      return getPanelIndicator(tx);
    default:
      return DEFAULT_PANEL;
  }
}

/** Unique legend entries for the history tab filter area. */
export const TRANSACTION_HISTORY_LEGEND: TransactionHistoryIndicator[] = [
  PANEL_AGENT,
  PANEL_SUPER,
  PANEL_ADMIN,
  PANEL_ADMIN_FINANCE,
  GATEWAY_DEPOSIT,
  TETHER_DEPOSIT,
  RIAL_WITHDRAWAL,
  TETHER_WITHDRAWAL,
];
