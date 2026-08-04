# @dingmoney/deposit-core

Server-only crypto deposit runtime shared by:

- Next.js API routes (`app/api/crypto/*`, cron helpers)
- Railway worker `@dingmoney/crypto-deposit-worker`

**Do not import from client/browser components.** Uses service-role Supabase, Postgres, and Upstash.

Source of truth for scan/credit/notify lives here — not duplicated in the worker.
