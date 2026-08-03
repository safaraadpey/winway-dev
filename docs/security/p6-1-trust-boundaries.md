# P6.1 — Trust Boundaries

> **READ ONLY** · Pre–payment integration  
> Companion to `p6-1-financial-threat-model.md`

---

## 1. Boundary map

```
┌─────────────────────────────────────────────────────────────────┐
│  UNTRUSTED                                                      │
│  Browser / PWA / attacker / stolen device                       │
└─────────────┬───────────────────────────────────────────────────┘
              │ HTTPS + Bearer JWT (or stolen JWT)
              ▼
┌─────────────────────────────────────────────────────────────────┐
│  EDGE / APP (Next.js on Vercel)                                 │
│  Trust decision: verify JWT, role, basic validation             │
│  MUST NOT: be sole authority for money amounts from client      │
└─────────────┬───────────────────────────────────────────────────┘
              │ service_role OR user JWT RPC
              ▼
┌─────────────────────────────────────────────────────────────────┐
│  SUPABASE AUTH                                                  │
│  Issues/validates JWT; role metadata in public.users            │
└─────────────┬───────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────┐
│  POSTGRESQL (SoR)                                               │
│  wallets · transactions · tickets · rooms · tournament_*        │
│  Trust decision: DEFINER RPC + ACL (who can EXECUTE)            │
│  Money primitive: game_finance.fn_wallet_apply_delta            │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  GAME ENGINE (Railway)                                          │
│  Holds SUPABASE_SERVICE_ROLE_KEY                                │
│  Trust: equivalent to full DB money power                       │
└─────────────┬───────────────────────────────────────────────────┘
              │ settle / join / janitor
              ▼
         PostgreSQL SoR

┌─────────────────────────────────────────────────────────────────┐
│  FUTURE: PAYMENT GATEWAY / BLOCKCHAIN                           │
│  Completely UNTRUSTED until cryptographic / RPC verification    │
└─────────────┬───────────────────────────────────────────────────┘
              │ webhook / indexer
              ▼
         Verification service (new trust zone)
              ▼
         PostgreSQL SoR (ledger then wallet)
```

---

## 2. Trust zones

| Zone | Trusted for | Not trusted for |
|------|-------------|-----------------|
| **Player client** | UX intents (card count, template id) | Price, balance, win amounts, deposit confirmation |
| **Admin/agent client** | Cashdesk UI intents | Unbounded mint without server policy |
| **Next.js API** | AuthZ gates, orchestration | Long-term secret storage beyond env |
| **User JWT RPC** | Acts as `auth.uid()` | Calling apply_delta directly (revoked) |
| **service_role** | Full bypass RLS; money RPCs | Must never ship to browser |
| **Postgres DEFINER** | Atomic money + game rules | Safe only if EXECUTE locked |
| **Railway engine** | Settlement authority | Same blast radius as service_role leak |
| **Payment gateway (future)** | Payment intent signals | Final credit without local verify |
| **Blockchain (future)** | Public data | Validity until confirmations + address binding |

---

## 3. Money-moving operations (who crosses which boundary)

| Operation | Initiator zone | Crosses into SoR via | Notes |
|-----------|----------------|----------------------|-------|
| Cashdesk deposit/withdraw | Admin API | service_role → apply_delta | No hierarchy on adjust |
| Panel transfer | Admin API | **user JWT** → transfer_panel | Hierarchy in SQL; dual-write |
| Join hold | Player / Engine | JWT or service_role parent → hold → apply_delta | Price from DB |
| Join refund | Player API | service_role cancel + release | Bind to owner |
| Room settle | Engine | service_role → finish_room_and_settle | Status gate |
| Tournament hold/release/payout | Player / admin SQL | JWT / DEFINER | |
| Fiat/USDT credit | **Future** | Must be server-only verify → apply_delta | Not built |
| Player withdrawal | **N/A** | — | Disabled by product |

---

## 4. Critical trust decisions (must not invert)

1. **Client never sets money delta** for join/settle/deposit confirmation.  
2. **apply_delta EXECUTE** remains postgres + service_role only (P2.3).  
3. **Webhook body is hostile** until signature + invoice binding succeed.  
4. **service_role key leak = game over** — treat like master wallet key.  
5. **Ledger write and balance write** must be one DB transaction.  
6. **Idempotency** is part of the trust model for any external payment id.  
7. **Admin adjust** is a mint authority — constrain like a treasury.

---

## 5. Boundary failures already observed in audits

| Failure mode | Boundary broken | Status |
|--------------|-----------------|--------|
| apply_delta executable by anon/authenticated (pre-P2.3) | SoR open to internet | Remediated P2.3 (verify stays locked) |
| Adjust API + service_role without hierarchy | Admin zone too wide | **Open** |
| Transfer dual-write vs apply_delta | SoR consistency | **Open** |
| Cancel with `p_user` + service_role | Confused deputy risk | Monitor / harden |
| No payment webhook boundary | N/A yet | Design before build |

---

## 6. Recommended trust posture before real deposits

| Requirement | Meaning |
|-------------|---------|
| New **Payment Verification** zone | Only component that may call credit after external payment |
| Invoice table as binding contract | user_id, amount, currency, expiry, status, external_id UNIQUE |
| Cashdesk ≠ Gateway credit | Separate `source_kind` / permissions |
| No credit path that skips `transactions` | Preserve wallet ≡ ledger |
| Engine cannot invent deposit credits | Settle game only; deposits elsewhere |

---

P6_1_FINANCIAL_THREAT_MODEL_COMPLETE
