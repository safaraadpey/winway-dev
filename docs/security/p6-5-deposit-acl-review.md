# P6.5 — Deposit Domain ACL Review

## Tables (`deposit.*`)

| Object | RLS | anon | authenticated | service_role / postgres |
|--------|-----|------|---------------|-------------------------|
| intents | FORCE | none | none | ALL |
| attempts | FORCE | none | none | ALL |
| verifications | FORCE | none | none | ALL |
| credits | FORCE | none | none | ALL |
| events | FORCE | none | none | ALL |
| recon_reports | FORCE | none | none | ALL |

Schema usage: **revoked** from `PUBLIC`, `anon`, `authenticated`.

## Mutation guards

| Rule | Mechanism |
|------|-----------|
| Attempts / verifications / events append-only | BEFORE UPDATE/DELETE trigger |
| Posted credits immutable core fields | `deposit.trg_credits_guard` |
| Intent core immutable (user, amount, currency, channel, provider) | trigger |
| One pass verification per external payment | unique partial index |
| One posted credit per intent | UNIQUE intent_id + status machine |

## Functions

All `deposit.fn_*` and public wrappers:

- `REVOKE` from `PUBLIC` / `anon` / `authenticated`
- `GRANT EXECUTE` to `postgres`, `service_role` only (P6.5 foundation)

Client must **not** set status, foreign user_id, amount/currency after create, verification result, or credit result — only SECURITY DEFINER lifecycle functions mutate those fields.

## Feature flag gate

- `DEPOSIT_DOMAIN_ENABLED=false` → production ingress must refuse
- Test harness requires `DEPOSIT_DOMAIN_TEST_MODE=true` (or `NODE_ENV=test`)

## Residual risks (accepted for foundation)

| Risk | Note |
|------|------|
| `service_role` still broad | Split `deposit_worker` role later (P6.2) |
| No user JWT create/read RPC yet | Foundation is worker/postgres only |
| Fake adapter not for production | Flag + test mode |

## Validation

`npm run test:deposit-domain` includes authenticated SELECT denial.

P6_5_DEPOSIT_DOMAIN_FOUNDATION_READY_FOR_TEST
