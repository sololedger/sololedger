# SoloLedger Project State

Last updated: 2026-09-26

## Repository State

- Worktree: `C:\Users\Familjedator\Desktop\Sololedger Multi User App\sololedger_multi_user`
- Branch: `main`
- Git remote/origin verified as `https://github.com/sololedger/sololedger.git`
- Pre-cutover base verified before checkpoint:
  `HEAD == origin/main == 72c8ccdcf8021294c9de3f6fb6da7de30b89d90a`
  (`Document migration tooling handoff`).
- This checkpoint records the local migration cutover work. No live Supabase
  writes, migration repair, deploy, or Jira changes were performed for this
  cutover.
- `supabase/.temp/` may exist as generated Supabase CLI state only. Verified generated files in this case: `cli-latest`, `linked-project.json`. Do not read/display secrets and do not add this directory to Git.

## External Connections

- Jira cloud ID: `42c6216d-73c5-4777-a644-c41ef9bc6a1a`
- Jira project: `KAN` / `Sololedger`, project ID `10001`
- Jira KAN-19 verified 2026-09-26: Story, status `In Progress`, assignee empty.
- Live Supabase read-only verification 2026-09-26 confirms exact `2645` is P1=true, P2=true, P3=false.

## Current Objective

- Local migration cutover/reconstruction for the historical manually-applied SQL
  era is now the active task.
- KAN-19 `VAT V2-4 - VAT-aware booking RPC` remains active/in progress, not complete.
- KAN-19 persistence implementation is present locally as the pending candidate
  migration and remains not live.
- Exact-2645 VAT account-classification prerequisite is live and verified.
- VAT V2 persistence migration/table/RPC/source are NOT live.
- No live VAT V2 test transaction has been created.
- Immediate blocker: live Supabase migration-history metadata still requires
  explicit Pontus-approved repair before applying the VAT V2 persistence
  migration live.

## KAN-19 Persistence Candidate

- Candidate migration: `supabase/migrations/20260926174535_add_vat_v2_reverse_charge_booking.sql`
- Candidate migration SHA-256: `8E8EE40F152BB0DEF07F52796F422FBCA57C5CB4E808C3BB3C46F849B0A1E81E`
- Adds `transactions.source = 'vat_v2'` only when applied live.
- Adds `public.vat_audit_snapshots` only when applied live.
- Adds `book_vat_v2_eu_service_reverse_charge_atomic(jsonb)` only when applied live.
- Supported candidate path remains ONLY `EU_SERVICE_REVERSE_CHARGE`, `25%`, full deduction.
- Candidate server-derived journal:
  - Dr `4535` base
  - Dr `2645` calculated input VAT
  - Cr `2614` calculated output VAT
  - Cr supplied valid payment/payable account base
- Candidate VAT report semantics: field `21` = base, field `30` = output VAT, field `48` = deductible calculated input VAT.
- Candidate audit/security boundary: authenticated client has SELECT-only snapshot access; mutation remains server/RPC-side; client-supplied trusted `journal_rows` or `audit_snapshot` is rejected.
- Candidate correction boundary: generic correction of `source='vat_v2'` is intentionally blocked pending a VAT V2-aware correction flow.
- Existing VAT V1 booking/correction behavior remains unchanged by verified regression.

## KAN-19 Verification

- KAN-19 persistence production-derived local PostgreSQL rollback regression passed.
- KAN-19 exact-2645 classifier rollback regression passed on 2026-09-26 against
  the production-derived local `sololedger_kan17c_test` database using
  process-local `PGPASSFILE`.
- KAN-17C VAT close account-classification rollback regression passed on
  2026-09-26 against the same local database.
- KAN-19 persistence checks passed: `npm run test:domain`, `npm run typecheck`, touched-file lint, `git diff --check`.
- KAN-19 persistence final review verdict: `KAN-19 PERSISTENCE FINAL REVIEW PASSED`.
- KAN-19 persistence final review findings: 0 CRITICAL, 0 HIGH, 0 MEDIUM, LOW = true two-session concurrency still not empirically proven.
- Production-derived local PostgreSQL DB strategy remains the preferred safe DB/RPC regression environment.
- PostgreSQL 17 client exists at `C:\Program Files\PostgreSQL\17\bin\psql.exe`; `psql` not being on PATH does not mean local PostgreSQL testing is unavailable.
- Never read/display/copy/hash pgpass contents; `PGPASSFILE` should remain process/session-local.

## Live Migration State

- Live exact-2645 migration is applied as `20260926132107_add_2645_vat_account_classification.sql`.
- Initial exact-2645 live apply used Supabase MCP `apply_migration`, which generated remote version `20260926114550`; official Supabase migration repair later reconciled this so `20260926132107` is applied and `20260926114550` is no longer applied.
- Do not use MCP `apply_migration` for timestamped repo migrations where repo/live version identity matters.
- Normal official `supabase db push` is currently blocked until historical migration ledger reconciliation is complete.

## Migration-History Cutover

- Current blocker is not caused by the local PostgreSQL test database.
- It is a migration-history identity mismatch between repo migration versions and the Supabase remote migration ledger.
- Historical provenance from Pontus: legacy SQL files from approximately `20260824`
  through `20260920` were generated as SQL, applied manually in Supabase SQL
  Editor, and saved in Git. They were not applied through Supabase CLI.
- Legacy date-only SQL files are archived under
  `supabase/migration_archive/pre_20260925000000_legacy_date_only/`.
- Active CLI cutover baseline:
  `supabase/migrations/20260925000000_pre_kan17_cli_baseline.sql`.
- Disposable local PostgreSQL replay on 2026-09-26 passed after a Supabase
  compatibility prelude: baseline, live remote-aligned tail through
  `20260926132107`, and pending `20260926174535` all applied cleanly.
- Reconstructed pre-VAT-V2 state verified locally: `vat_periods`,
  `close_vat_period_atomic`, `declare_vat_period_atomic`,
  `vat_account_classification`, and `vat_concurrency_account` exist;
  `vat_audit_snapshots` and
  `book_vat_v2_eu_service_reverse_charge_atomic(jsonb)` are absent until the
  pending VAT V2 migration is applied.
- Exact local `2645` classification after replay is `(true,true,false)`;
  prefixed `26410` remains `(false,false,false)`.
- Cutover checks passed: `npm run test:domain`, `npm run typecheck`,
  `git diff --check`, KAN-17C SQL regression, KAN-19 exact-2645 SQL
  regression, and modeled future ledger shows only `20260926174535` pending
  after `20260925000000` metadata repair.
- The active migration chain after the baseline starts at:
  - `20260925050113_20260925_add_vat_account_classification.sql`
  - `20260925070346_20260925_delegate_vat_concurrency_account.sql`
  - `20260925124023`
  - `20260926132107`
- Pending candidate remains `20260926174535_add_vat_v2_reverse_charge_booking.sql`.
- Future approved live repair target is metadata-only alignment for
  `20260925000000`; after repair, official CLI dry-run should show only
  `20260926174535` pending.
- Do not use `--include-all` as a shortcut.
- Do not execute historical migrations against production merely to make migration history align.
- Do not run the cutover baseline against existing production.

## Active VAT V2 Context

- KAN-14 `VAT V2 - Utlandshandel / utländska inköp`: Epic, current Jira status previously verified as `To Do`.
- KAN-15 `VAT V2 recon/design: utländska inköp och utlandsmoms`: Done.
- KAN-16 `VAT V2-1 - Domain/profile model`: implemented and remains the domain/profile foundation.
- KAN-17 `VAT V2-2 - Central VAT account roles`: foundation completed/frozen through KAN-17C; do not reopen unless new evidence proves incompatibility.
- KAN-18 `VAT V2-3 - VAT treatment decision engine`: Done.
- KAN-19 `VAT V2-4 - VAT-aware booking RPC`: active/in progress.

## Open VAT V2 Questions

- EXTERNAL ACCOUNTING VERIFICATION REQUIRED: exact journal treatment for self-calculated reverse-charge VAT with no deduction, including BAS/account mapping, cost/acquisition-value handling, and K1/NE implications.
- EXTERNAL VERIFICATION REQUIRED: initial/partial VAT period when `vatReportingFrom` occurs inside a normal month/quarter/year period.
- EXTERNAL VERIFICATION REQUIRED: historical Adobe Ireland invoices with supplier-charged 25% VAT, including tax base, reverse-charge calculation, correction/refund handling, and VAT return correction.

## Next Safe Step

- Do not apply the KAN-19 VAT V2 persistence migration live yet.
- Do not deploy, repair migrations, run production `db push`, apply VAT V2 live,
  or change Jira without explicit Pontus approval.
- Next goal after this checkpoint: explicitly approve the metadata-only live
  repair for `20260925000000`, then immediately run migration list and
  `db push --skip-vault --dry-run`, stop, and inspect the result. Do not apply
  VAT V2 in that same step.
