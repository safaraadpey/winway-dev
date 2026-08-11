# Forward migrations (post-baseline)

Place **new** schema deltas here after the baseline cutover date (`2026-08-11`).

Naming: `YYYYMMDDHHMMSS_short_description.sql`

Apply **after** `sql/baseline/000_extensions.sql` and `sql/baseline/001_schema.sql`.

Do **not** put rebuild/bootstrap DDL here — that lives in `sql/baseline/`.

Historical files: `_legacy_archive/` (archived; not part of the apply chain).
