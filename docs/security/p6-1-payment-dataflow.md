# P6.1 — Payment Data Flow

> **READ ONLY** · Current vs target (payment phase)  
> No implementation — diagrams only.

---

## 1. Current money data flow (live)

```mermaid
flowchart TB
  subgraph Untrusted
    U[User / Attacker]
    A[Admin / Agent UI]
  end

  subgraph Edge
    API[Next.js Admin / Player APIs]
    ENG[Bingo Engine Railway]
  end

  subgraph AuthZ
    JWT[Supabase JWT]
    SR[service_role]
  end

  subgraph SoR["PostgreSQL SoR"]
    RPC[DEFINER money RPCs]
    AD[fn_wallet_apply_delta]
    W[(wallets)]
    L[(transactions ledger)]
    G[tickets / rooms / tournament]
  end

  U -->|join / cancel JWT| API
  U -->|join JWT or engine| ENG
  A -->|adjust / transfer JWT| API

  API --> JWT
  API -->|adjust| SR
  ENG --> SR
  JWT -->|join / transfer / tournament hold| RPC
  SR --> RPC
  RPC --> AD
  AD --> W
  AD --> L
  RPC --> G
  G -->|settle / commission / win| AD
```

**Notes**

- No Gateway / Blockchain in the path today.
- “Deposit” today is **cashdesk credit** (Admin → API → apply_delta), not a paid invoice.
- Game join spends wallet → hold → later capture at settlement or release on cancel.

---

## 2. Target payment-phase data flow (required shape)

```mermaid
flowchart TB
  U[User]
  GW[Fiat Gateway / USDT-TRON]
  API[Payment API - untrusted ingress]
  V[Verification zone]
  INV[(Invoices / deposit intents)]
  AD[fn_wallet_apply_delta]
  L[(transactions ledger)]
  W[(wallets)]
  JOIN[Game Join / Tournament Entry]

  U -->|pay| GW
  GW -->|webhook / chain event| API
  API -->|raw payload| V
  V -->|load + lock invoice| INV
  V -->|signature / TX / amount / expiry OK| AD
  AD --> L
  AD --> W
  W -->|hold on entry| JOIN

  V -.->|reject| X[No credit]
```

**Ordering rule (non-negotiable)**

```
User → Gateway/Chain → API → Verification → Ledger → Wallet → Game Join
```

Never: Wallet credit before Verification.  
Never: Join using unverified pending deposit as spendable (or clearly separate pending bucket).

---

## 3. Sequence — future fiat deposit (happy path)

```mermaid
sequenceDiagram
  participant U as User
  participant App as App
  participant GW as Gateway
  participant API as Webhook API
  participant V as Verifier
  participant DB as Postgres

  U->>App: Request deposit
  App->>DB: Create invoice pending unique id
  App->>U: Redirect / payment instructions
  U->>GW: Pay exact amount
  GW->>API: Callback signed
  API->>V: Verify signature + merchant
  V->>DB: Lock invoice FOR UPDATE
  V->>V: Match amount currency user expiry status
  V->>DB: apply_delta credit idempotent key=payment_id
  V->>DB: invoice=confirmed
  Note over DB: Ledger row then wallet balance same TX
```

---

## 4. Sequence — future USDT deposit (happy path)

```mermaid
sequenceDiagram
  participant U as User
  participant App as App
  participant CH as TRON/USDT
  participant W as Watcher
  participant V as Verifier
  participant DB as Postgres

  U->>App: Request USDT deposit
  App->>DB: Invoice + unique address/memo
  U->>CH: Transfer USDT
  CH->>W: Observe TX
  W->>V: Candidate TXID
  V->>CH: Confirm depth ≥ N, token, to, amount
  V->>DB: Lock invoice; credit once; mark confirmed
```

---

## 5. Sequence — join spend (current, still valid after deposits)

```mermaid
sequenceDiagram
  participant U as User
  participant RPC as Join RPC
  participant AD as apply_delta
  participant W as wallets
  participant L as transactions

  U->>RPC: join card_count
  RPC->>RPC: load price from template
  RPC->>AD: -price join_hold
  AD->>W: FOR UPDATE debit + lock
  AD->>L: insert join_hold
  RPC->>RPC: insert ticket + commission pending
```

---

## 6. Abuse flows to block (illustrative)

| Abuse | Broken step |
|-------|-------------|
| Forged callback | Skip Verification signature |
| Replay callback | Skip idempotent payment_id unique |
| Wrong amount | Skip invoice amount bind |
| Credit expired invoice | Skip status/expiry check |
| Double cashdesk POST | Skip idempotency on adjust |
| Free join | Skip wallet hold / use client price |

---

P6_1_FINANCIAL_THREAT_MODEL_COMPLETE
