# P4.4 — Service Identity (`bingo-engine`)

> Rename **service identity** from `game-engine` → `bingo-engine` where it labels the running Bingo process.  
> Env vars, folder paths, SQL, and historical migration filenames are **unchanged**.

---

## Changed

| Location | Old | New |
|----------|-----|-----|
| `GET /health` JSON `service` | `game-engine` | `bingo-engine` |
| HTTP API `/health` body (when API server owns port) | `game-engine` | `bingo-engine` |
| Startup log | `game-engine starting` | `bingo-engine starting` |
| Idle / fatal log tags | `[game-engine]` / `game-engine running…` | `bingo-engine` |
| npm package name | `@dingmoney/game-engine` | `@dingmoney/bingo-engine` |
| Engine README banner | Bingo Engine | Bingo Engine (`bingo-engine`) |
| Contract docs (P4.3/P4.4) | noted old health string | `bingo-engine` |

Files:

- `apps/engines/bingo/src/health/server.ts`
- `apps/engines/bingo/src/http/server.ts`
- `apps/engines/bingo/src/index.ts`
- `apps/engines/bingo/package.json` (+ lock name)
- `apps/engines/bingo/README.md`

---

## Intentionally not renamed

| Kind | Examples |
|------|----------|
| Environment variables | `GAME_ENGINE_*`, `NEXT_PUBLIC_GAME_ENGINE_*`, `GAME_RUNTIME` |
| Folder paths | `apps/engines/bingo` (already correct) |
| Ops script filenames | `scripts/sync-game-engine-env.ps1`, `scripts/game-engine-cron-*.sql` |
| Redis key prefixes | `ding:game-engine` (data plane; changing would break coordination) |
| Historical docs / migrations | SQL comments, old audit narratives |
| Database objects | RPCs, tables |
| Railway **service name** | May remain as configured in dashboard; document expected health identity separately |

---

## Expected health response (after this build is running)

```json
{
  "ok": true,
  "service": "bingo-engine",
  "redis": "disabled"
}
```

(`redis` may be `"up"` when Redis is configured.)

**Note:** Deployed Railway instances keep the previous identity until a new deploy of this code. Local/rebuild validation confirms the new string.

---

## Rollback

Revert the files listed under **Changed** to restore `game-engine` / `@dingmoney/game-engine`.
