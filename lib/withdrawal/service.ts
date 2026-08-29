import type { Pool } from "pg";
import type {
  CryptoNetwork,
  WithdrawalKind,
  WithdrawalRequestItem,
  WithdrawalRequestStatus,
} from "@/src/types/withdrawal";
import { getWithdrawalStatusLabel } from "@/src/types/withdrawal";

type DbWithdrawalRow = {
  id: string;
  kind?: WithdrawalKind | null;
  player_id: string;
  agent_id: string | null;
  amount: string | number;
  card_number: string | null;
  sheba_number?: string | null;
  full_name: string | null;
  status: WithdrawalRequestStatus;
  reject_reason: string | null;
  review_note?: string | null;
  created_at: string | Date;
  reviewed_at: string | Date | null;
  player_username?: string | null;
  network?: string | null;
  crypto_symbol?: string | null;
  crypto_amount?: string | number | null;
  wallet_address?: string | null;
  requested_toman?: string | number | null;
};

const SELECT_FIELDS = `
  wr.id,
  wr.kind,
  wr.player_id,
  wr.agent_id,
  wr.amount,
  wr.card_number,
  wr.sheba_number,
  wr.full_name,
  wr.status,
  wr.reject_reason,
  wr.review_note,
  wr.created_at,
  wr.reviewed_at,
  wr.network,
  wr.crypto_symbol,
  wr.crypto_amount,
  wr.wallet_address,
  wr.requested_toman
`;

function mapRow(row: DbWithdrawalRow): WithdrawalRequestItem {
  return {
    id: row.id,
    kind: (row.kind ?? "rial") as WithdrawalKind,
    playerId: row.player_id,
    agentId: row.agent_id,
    amount: Number(row.amount) || 0,
    cardNumber: row.card_number,
    shebaNumber: row.sheba_number ?? null,
    fullName: row.full_name,
    status: row.status,
    statusLabel: getWithdrawalStatusLabel(row.status),
    rejectReason: row.reject_reason,
    reviewNote: row.review_note ?? null,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
    reviewedAt: row.reviewed_at
      ? row.reviewed_at instanceof Date
        ? row.reviewed_at.toISOString()
        : String(row.reviewed_at)
      : null,
    playerUsername: row.player_username ?? null,
    network: (row.network as CryptoNetwork | null) ?? null,
    cryptoSymbol: (row.crypto_symbol as "USDT" | "TRX" | null) ?? null,
    cryptoAmount:
      row.crypto_amount != null ? Number(row.crypto_amount) || 0 : null,
    walletAddress: row.wallet_address,
    requestedToman:
      row.requested_toman != null ? Number(row.requested_toman) || 0 : null,
  };
}

function mapWithdrawalError(message: string): { code: string; message: string } {
  const msg = (message || "").toLowerCase();
  if (msg.includes("insufficient_funds") || msg.includes("insufficient free balance")) {
    return { code: "insufficient_funds", message: "موجودی کافی نیست." };
  }
  if (msg.includes("no_agent_assigned")) {
    return {
      code: "no_agent_assigned",
      message: "ایجنت بالادستی برای حساب شما ثبت نشده است.",
    };
  }
  if (msg.includes("invalid_card_number")) {
    return { code: "invalid_card_number", message: "شماره کارت نامعتبر است." };
  }
  if (msg.includes("invalid_sheba_number")) {
    return {
      code: "invalid_sheba_number",
      message: "شماره شبا نامعتبر است. باید IR و ۲۴ رقم باشد.",
    };
  }
  if (msg.includes("invalid_full_name")) {
    return {
      code: "invalid_full_name",
      message: "نام و نام خانوادگی باید بین ۳ تا ۱۲۰ کاراکتر باشد.",
    };
  }
  if (msg.includes("invalid_network")) {
    return { code: "invalid_network", message: "شبکه نامعتبر است." };
  }
  if (msg.includes("invalid_wallet_address")) {
    return { code: "invalid_wallet_address", message: "آدرس کیف پول نامعتبر است." };
  }
  if (msg.includes("invalid_kind")) {
    return { code: "invalid_kind", message: "نوع درخواست نامعتبر است." };
  }
  if (msg.includes("forbidden")) {
    return { code: "forbidden", message: "دسترسی مجاز نیست." };
  }
  if (msg.includes("request_not_found")) {
    return { code: "not_found", message: "درخواست برداشت یافت نشد." };
  }
  if (msg.includes("invalid_status")) {
    return {
      code: "invalid_status",
      message: "این درخواست در وضعیت فعلی قابل انجام نیست.",
    };
  }
  return { code: "withdrawal_failed", message: message || "عملیات ناموفق بود." };
}

export async function createWithdrawalRequest(
  pool: Pool,
  params: {
    playerId: string;
    amount: number;
    cardNumber: string;
    shebaNumber: string;
    fullName: string;
    clientRequestId: string;
  }
): Promise<{ requestId: string; status: WithdrawalRequestStatus; replayed: boolean }> {
  try {
    const result = await pool.query<{
      request_id: string;
      status: WithdrawalRequestStatus;
      replayed: boolean;
    }>(
      `SELECT request_id, status, replayed
       FROM public.fn_withdrawal_request_create($1, $2, $3, $4, $5, $6)`,
      [
        params.playerId,
        params.amount,
        params.cardNumber,
        params.fullName,
        params.clientRequestId,
        params.shebaNumber,
      ]
    );

    const row = result.rows[0];
    if (!row) throw new Error("withdrawal_create_empty");

    return {
      requestId: row.request_id,
      status: row.status,
      replayed: row.replayed,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const mapped = mapWithdrawalError(message);
    const error = new Error(mapped.message) as Error & { code?: string };
    error.code = mapped.code;
    throw error;
  }
}

export async function createCryptoWithdrawalRequest(
  pool: Pool,
  params: {
    playerId: string;
    lockedToman: number;
    requestedToman: number;
    network: CryptoNetwork;
    cryptoSymbol: "USDT" | "TRX";
    cryptoAmount: number;
    walletAddress: string;
    clientRequestId: string;
  }
): Promise<{ requestId: string; status: WithdrawalRequestStatus; replayed: boolean }> {
  try {
    const result = await pool.query<{
      request_id: string;
      status: WithdrawalRequestStatus;
      replayed: boolean;
    }>(
      `SELECT request_id, status, replayed
       FROM public.fn_withdrawal_request_create_crypto($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        params.playerId,
        params.lockedToman,
        params.requestedToman,
        params.network,
        params.cryptoSymbol,
        params.cryptoAmount,
        params.walletAddress,
        params.clientRequestId,
      ]
    );

    const row = result.rows[0];
    if (!row) throw new Error("withdrawal_create_empty");

    return {
      requestId: row.request_id,
      status: row.status,
      replayed: row.replayed,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const mapped = mapWithdrawalError(message);
    const error = new Error(mapped.message) as Error & { code?: string };
    error.code = mapped.code;
    throw error;
  }
}

export async function listPlayerWithdrawalRequests(
  pool: Pool,
  playerId: string,
  limit = 20
): Promise<WithdrawalRequestItem[]> {
  const result = await pool.query<DbWithdrawalRow>(
    `SELECT ${SELECT_FIELDS}
     FROM public.withdrawal_requests wr
     WHERE wr.player_id = $1
     ORDER BY wr.created_at DESC
     LIMIT $2`,
    [playerId, limit]
  );

  return result.rows.map(mapRow);
}

export async function getPlayerWalletFreeBalance(
  pool: Pool,
  playerId: string
): Promise<number> {
  const result = await pool.query<{ balance: string | number }>(
    `SELECT COALESCE(w.balance, 0) AS balance
     FROM public.wallets w
     WHERE w.user_id = $1
       AND w.currency = 'IRR'
     LIMIT 1`,
    [playerId]
  );
  return Number(result.rows[0]?.balance ?? 0) || 0;
}

export async function getWithdrawalRequestKind(
  pool: Pool,
  requestId: string
): Promise<WithdrawalKind | null> {
  const result = await pool.query<{ kind: WithdrawalKind }>(
    `SELECT kind FROM public.withdrawal_requests WHERE id = $1 LIMIT 1`,
    [requestId]
  );
  return result.rows[0]?.kind ?? null;
}

export async function listPendingWithdrawalsForActor(
  pool: Pool,
  actorId: string,
  actorRole: string,
  kind: WithdrawalKind = "rial",
  adminSubRole: string | null = null
): Promise<WithdrawalRequestItem[]> {
  if (kind === "crypto") {
    if (actorRole !== "admin") return [];

    const result = await pool.query<DbWithdrawalRow>(
      `SELECT ${SELECT_FIELDS},
              u.username AS player_username
       FROM public.withdrawal_requests wr
       JOIN public.users u ON u.id = wr.player_id
       WHERE wr.status IN ('pending', 'processing')
         AND wr.kind = 'crypto'
       ORDER BY wr.created_at ASC
       LIMIT 200`
    );
    return result.rows.map(mapRow);
  }

  if (actorRole !== "agent" && actorRole !== "admin" && actorRole !== "super") {
    return [];
  }

  const isManagerAdmin = actorRole === "admin" && adminSubRole === null;

  const result = await pool.query<DbWithdrawalRow>(
    isManagerAdmin
      ? `SELECT ${SELECT_FIELDS},
                u.username AS player_username
         FROM public.withdrawal_requests wr
         JOIN public.users u ON u.id = wr.player_id
         WHERE wr.status IN ('pending', 'processing')
           AND coalesce(wr.kind, 'rial') = 'rial'
           AND (
             wr.agent_id = $1
             OR wr.agent_id = public.fn_adminzero_user_id()
           )
         ORDER BY wr.created_at ASC
         LIMIT 200`
      : `SELECT ${SELECT_FIELDS},
                u.username AS player_username
         FROM public.withdrawal_requests wr
         JOIN public.users u ON u.id = wr.player_id
         WHERE wr.status IN ('pending', 'processing')
           AND coalesce(wr.kind, 'rial') = 'rial'
           AND wr.agent_id = $1
         ORDER BY wr.created_at ASC
         LIMIT 200`,
    [actorId]
  );
  return result.rows.map(mapRow);
}

export async function reviewWithdrawalRequest(
  pool: Pool,
  params: {
    requestId: string;
    actorId: string;
    action: "approve" | "reject";
    reason?: string;
    kind?: WithdrawalKind;
  }
): Promise<{ requestId: string; status: WithdrawalRequestStatus; replayed: boolean }> {
  try {
    const kind =
      params.kind ??
      (await getWithdrawalRequestKind(pool, params.requestId)) ??
      "rial";

    if (params.action === "approve") {
      const fn =
        kind === "crypto"
          ? "public.fn_withdrawal_request_approve_crypto"
          : "public.fn_withdrawal_request_approve";

      const result = await pool.query<{
        request_id: string;
        status: WithdrawalRequestStatus;
        replayed: boolean;
      }>(`SELECT request_id, status, replayed FROM ${fn}($1, $2, $3)`, [
        params.requestId,
        params.actorId,
        params.reason ?? null,
      ]);
      const row = result.rows[0];
      if (!row) throw new Error("withdrawal_approve_empty");
      return {
        requestId: row.request_id,
        status: row.status,
        replayed: row.replayed,
      };
    }

    const result = await pool.query<{
      request_id: string;
      status: WithdrawalRequestStatus;
      replayed: boolean;
    }>(
      `SELECT request_id, status, replayed
       FROM public.fn_withdrawal_request_reject($1, $2, $3)`,
      [params.requestId, params.actorId, params.reason ?? null]
    );
    const row = result.rows[0];
    if (!row) throw new Error("withdrawal_reject_empty");
    return {
      requestId: row.request_id,
      status: row.status,
      replayed: row.replayed,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const mapped = mapWithdrawalError(message);
    const error = new Error(mapped.message) as Error & { code?: string };
    error.code = mapped.code;
    throw error;
  }
}

export async function cancelWithdrawalRequest(
  pool: Pool,
  params: { requestId: string; playerId: string }
): Promise<{ requestId: string; status: WithdrawalRequestStatus; replayed: boolean }> {
  try {
    const result = await pool.query<{
      request_id: string;
      status: WithdrawalRequestStatus;
      replayed: boolean;
    }>(
      `SELECT request_id, status, replayed
       FROM public.fn_withdrawal_request_cancel($1, $2)`,
      [params.requestId, params.playerId]
    );
    const row = result.rows[0];
    if (!row) throw new Error("withdrawal_cancel_empty");
    return {
      requestId: row.request_id,
      status: row.status,
      replayed: row.replayed,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const mapped = mapWithdrawalError(message);
    const error = new Error(mapped.message) as Error & { code?: string };
    error.code = mapped.code;
    throw error;
  }
}

export async function markWithdrawalProcessing(
  pool: Pool,
  params: { requestId: string; actorId: string }
): Promise<{ requestId: string; status: WithdrawalRequestStatus; replayed: boolean }> {
  try {
    const result = await pool.query<{
      request_id: string;
      status: WithdrawalRequestStatus;
      replayed: boolean;
    }>(
      `SELECT request_id, status, replayed
       FROM public.fn_withdrawal_request_mark_processing($1, $2)`,
      [params.requestId, params.actorId]
    );
    const row = result.rows[0];
    if (!row) throw new Error("withdrawal_mark_processing_empty");
    return {
      requestId: row.request_id,
      status: row.status,
      replayed: row.replayed,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const mapped = mapWithdrawalError(message);
    const error = new Error(mapped.message) as Error & { code?: string };
    error.code = mapped.code;
    throw error;
  }
}
