# SoloLedger Project State

Last updated: 2026-09-27

## Repository State

- Worktree: `C:\Users\Familjedator\Desktop\Sololedger Multi User App\sololedger_multi_user`
- Branch: `main`
- Git remote/origin verified as `https://github.com/sololedger/sololedger.git`
- Pre-cutover base verified before checkpoint:
  `HEAD == origin/main == 72c8ccdcf8021294c9de3f6fb6da7de30b89d90a`
  (`Document migration tooling handoff`).
- Migration-history reconciliation checkpoint is committed and pushed. Live
  metadata repair and VAT V2 persistence apply were completed on 2026-09-26.
  No deploy or Jira changes were performed.
- `supabase/.temp/` may exist as generated Supabase CLI state only. Verified generated files in this case: `cli-latest`, `linked-project.json`. Do not read/display secrets and do not add this directory to Git.

## External Connections

- Jira cloud ID: `42c6216d-73c5-4777-a644-c41ef9bc6a1a`
- Jira project: `KAN` / `Sololedger`, project ID `10001`
- Jira KAN-19 verified 2026-09-26: Story, status `In Progress`, assignee empty.
- Live Supabase read-only verification 2026-09-26 confirms exact `2645` is P1=true, P2=true, P3=false.
- Vercel production context verified 2026-09-27: CLI user `sololedger`,
  team `sololedger1` (`Pontus' projects`), project `sololedger`, production
  domain `https://sololedger.vercel.app`, GitHub linkage
  `sololedger/sololedger` on `main`.
- This checkout currently has no `.vercel/project.json`. Do not guess Vercel
  target from CLI context; verify authenticated account/team/project before
  deployment operations. The unrelated `nolare` session exposed projects such
  as `min-bokforing` and `wc2026tips`; those are NOT SoloLedger targets.
- Observed evidence indicates SoloLedger production deployment is handled
  through GitHub/Vercel integration. Do not introduce a separate manual CLI
  deployment path without a specific reason.

## Current Objective

- KAN-19 `VAT V2-4 - VAT-aware booking RPC` persistence boundary is LIVE.
- Exact-2645 VAT account-classification prerequisite is live and verified.
- VAT V2 persistence migration/table/RPC/source are live.
- KAN-19 VAT Profile Runtime app code and required DB migration are live in
  production and IRL verified.
- KAN-19 VAT V2 transaction fact collection/preflight is implemented locally
  for the narrow supported EU service reverse-charge path; checkpoint pending.
- VAT V2 runtime booking route is not recorded as complete here.
- No live VAT V2 business transaction was created during verification.
- Next KAN-19 work should build on the live persistence boundary without
  recreating the migration-history cutover.

## KAN-19 VAT Profile Runtime Slice

- Live migration:
  `supabase/migrations/20260927070224_add_vat_profile_runtime_fields.sql`.
- Candidate persisted profile fields:
  `domestic_sales_vat_treatment`, `foreign_purchase_reporting`,
  `default_deduction_entitlement`.
- `default_deduction_percent` is deliberately deferred; partial deduction is
  still not persisted or exposed by this slice.
- Live verification confirmed all 6 existing profiles remained explicit
  `unknown` by default for all three new fields; no VAT registration,
  foreign-purchase reporting, domestic sales treatment, or deduction entitlement
  was inferred.
- Central domain validation remains authoritative. The UI only prevents the
  already-invalid central domain state where `foreign_purchase_reporting =
  required` without `vat_status = registered`.
- Migration `20260927070224` is LIVE. The database is now schema-compatible
  with the committed profile runtime code.
- Production deployment observed at commit
  `7573e2ffe097da023b7cbf39d0f38f2f6f1822a6`.
- Production ProfileSettings loads against the new live columns. IRL test
  passed for `default_deduction_entitlement`: `unknown` -> `full` -> save ->
  reload -> `full`, then `full` -> `unknown` -> save -> reload -> `unknown`.
  The test account was restored to `unknown`; no real production company VAT
  facts were changed. This verifies the profile runtime slice, not every
  possible profile combination.
- No VAT V2 booking/runtime route was added by this slice.
- Live apply verification confirmed remote/local migration ledger alignment,
  zero pending migrations on post-apply dry-run, and no product transaction,
  journal, or VAT audit snapshot rows created by the migration.
## KAN-19 VAT V2 Transaction Preflight Slice

- Local slice adds transaction-specific VAT V2 fact collection and preflight
  only; no VAT V2 booking, JournalPlan execution, migration, live data change,
  deployment, or Jira change was performed.
- READY means the already-supported persistence treatment only:
  `EU_SERVICE_REVERSE_CHARGE`, `25%`, full deduction, and a positive explicit
  acquisition base amount. Unsupported or unknown facts remain blocked.
- VAT V2 OFF keeps the ordinary V1 transaction submit path. VAT V2 ON stops at
  preflight and cannot call V1 booking or VAT V2 persistence.
- `src/app/page.tsx` still has pre-existing unrelated ESLint debt; the
  slice-owned/touched VAT V2 files lint clean.

## KAN-19 Persistence Candidate

- Candidate migration: `supabase/migrations/20260926174535_add_vat_v2_reverse_charge_booking.sql`
- Candidate migration SHA-256: `8E8EE40F152BB0DEF07F52796F422FBCA57C5CB4E808C3BB3C46F849B0A1E81E`
- Live migration adds `transactions.source = 'vat_v2'`.
- Live migration adds `public.vat_audit_snapshots`.
- Live migration adds `book_vat_v2_eu_service_reverse_charge_atomic(jsonb)`.
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
- KAN-19 transaction preflight slice checks passed locally:
  `npm run test:domain`, `npm run typecheck`, slice-owned/touched ESLint, and
  `git diff --check`; all-touched ESLint still reports unrelated historical
  `src/app/page.tsx` lint debt.
- Live KAN-19 apply verification passed on 2026-09-26:
  `20260926174535_add_vat_v2_reverse_charge_booking.sql` applied via official
  Supabase CLI `db push --skip-vault`; post-apply `db push --skip-vault
  --dry-run` reports no pending migrations.
- Product-data safety check after live apply: `transactions` count remained
  `164`, `journal_entries` count remained `439`, `vat_periods` count remained
  `3`, `source='vat_v2'` transaction count is `0`, and
  `vat_audit_snapshots` row count is `0`.
- Live schema verification passed: `transactions.source` permits `vat_v2`;
  `public.vat_audit_snapshots` exists with RLS, SELECT policy, constraints,
  grants, trigger-backed transaction/source/user linkage, and transaction
  uniqueness; VAT V2 RPC exists as SECURITY DEFINER with public search path and
  authenticated execute boundary; generic correction guard is installed; exact
  `2645` remains P1=true, P2=true, P3=false; existing VAT V1 RPCs remain
  present.
- KAN-19 persistence final review verdict: `KAN-19 PERSISTENCE FINAL REVIEW PASSED`.
- KAN-19 persistence final review findings: 0 CRITICAL, 0 HIGH, 0 MEDIUM, LOW = true two-session concurrency still not empirically proven.
- Production-derived local PostgreSQL DB strategy remains the preferred safe DB/RPC regression environment.
- Production-derived local PostgreSQL DB: `sololedger_kan17c_test`.
- PostgreSQL 17 client exists at `C:\Program Files\PostgreSQL\17\bin\psql.exe`; `psql` not being on PATH does not mean local PostgreSQL testing is unavailable.
- Authorized local credential file for isolated local PostgreSQL verification:
  `C:\SoloLedger\LocalTest\pgpass.conf`.
- Never read/display/copy/hash pgpass contents; use that file only via
  process/session-local `PGPASSFILE`.

## Live Migration State

- Live exact-2645 migration is applied as `20260926132107_add_2645_vat_account_classification.sql`.
- Live VAT V2 persistence migration is applied as
  `20260926174535_add_vat_v2_reverse_charge_booking.sql`.
- KAN-19 VAT Profile Runtime migration
  `20260927070224_add_vat_profile_runtime_fields.sql` is applied live.
- Live remote migration ledger is fully aligned with local active migrations:
  `20260925000000`, `20260925050113`, `20260925070346`, `20260925124023`,
  `20260926132107`, `20260926174535`, `20260927070224`.
- Official Supabase CLI dry-run after latest live apply reports no pending
  migrations.
- Future production DB migrations should use the now-reconciled official
  Supabase CLI workflow.
- Initial exact-2645 live apply used Supabase MCP `apply_migration`, which generated remote version `20260926114550`; official Supabase migration repair later reconciled this so `20260926132107` is applied and `20260926114550` is no longer applied.
- Do not use MCP `apply_migration` for timestamped repo migrations where repo/live version identity matters.
- Historical migration ledger reconciliation is complete.

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
- VAT V2 persistence candidate `20260926174535_add_vat_v2_reverse_charge_booking.sql`
  has been applied live.
- Metadata-only alignment for `20260925000000` is complete; the baseline
  metadata version is applied remotely without executing the baseline SQL
  against production.
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

- Do not deploy, add migrations, create real VAT V2 business transactions, or
  change Jira without explicit Pontus approval.
- Next implementation step under separate approval: payment/payable account UX
  and runtime routing into the existing VAT V2 persistence chain. Do not start
  it without explicit Pontus approval.
