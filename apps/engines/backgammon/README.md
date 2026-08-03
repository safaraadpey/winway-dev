# Backgammon Engine (placeholder)

This directory is reserved for a future **Backgammon** game engine under the multi-engine platform.

## Status

**Placeholder only.** No runtime, package, Dockerfile, or business logic yet.

## Intended deploy shape (future)

| Item | Planned value |
|------|----------------|
| Railway service | `backgammon-engine` |
| Root Directory | `apps/engines/backgammon` |
| Contract | Must implement the lifecycle in `docs/architecture/p4-3-engine-contract.md` |

## Do not

- Import from `apps/web` or other engines’ internals
- Share wallet/settlement logic via ad-hoc copies — use DB contracts / future shared packages when introduced

See `docs/architecture/p4-3-multi-engine-foundation.md`.
