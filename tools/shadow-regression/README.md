# Shadow Regression Harness

Reusable automated validation for **Platform Shadow Mode** (P5.4+).

Bingo remains source of truth. Platform is write-only. This harness never enables Platform reads in production apps.

## Quick start

```bash
# Requires DATABASE_URL (direct Postgres — platform schema is not PostgREST-exposed)
# Optional: load from .env.local
npm run test:shadow
```

Environment:

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | Postgres connection (ssl) |
| `SHADOW_REGRESSION_ENGINE` | No | Default `bingo` |
| `SHADOW_REGRESSION_FILTER` | No | Comma-separated scenario ids |
| `SHADOW_REGRESSION_KEEP_ROOMS` | No | `1` to skip cleanup |
| `SHADOW_REGRESSION_DRAIN_WAIT_MS` | No | Default `15000` |

Reports write to `tools/shadow-regression/reports/latest.json` and `latest.md`.

## Layout

```text
tools/shadow-regression/
  README.md
  src/
    run.mjs                 # CLI entry
    config.mjs
    db.mjs
    framework/
      registry.mjs          # multi-engine scenario registry
      runner.mjs
      types.mjs
    validate/
      shadowParity.mjs      # Bingo room ↔ Platform session checks
    report/
      generate.mjs
    engines/
      bingo/
        driver.mjs          # synthetic lifecycle + shadow ops
        scenarios.mjs       # 15+ scenarios
```

## Adding another engine (Backgammon, …)

1. Create `src/engines/<name>/scenarios.mjs` exporting `{ engine, scenarios }`.
2. Register in `src/framework/registry.mjs`.
3. Reuse `validate/shadowParity.mjs` with engine-specific mappers if needed.

## Safety

- Does **not** modify wallet/settle RPC code.
- Does **not** change Platform architecture.
- Creates tagged synthetic Bingo rooms on DEV and drives lifecycle updates that already fire the P5.4 shadow trigger.
- Optional cleanup cancels harness rooms after the run.
