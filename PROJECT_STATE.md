# SoloLedger Project State

Last updated: 2026-09-26

## Repository State

- Worktree: `C:\Users\Familjedator\Desktop\Sololedger Multi User App\sololedger_multi_user`
- Branch: `main`
- Git remote/origin verified as `https://github.com/sololedger/sololedger.git`
- Current base verified: `HEAD == origin/main == d2d2e4febe2d1368e013e1b47109fbdf8f3d4eb9`
- Latest committed subject: `KAN-19 add VAT V2 persistence boundary`
- Working tree has no tracked source changes after the KAN-19 persistence checkpoint.
- `supabase/.temp/` may exist as generated Supabase CLI state only. Verified generated files in this case: `cli-latest`, `linked-project.json`. Do not read/display secrets and do not add this directory to Git.

## External Connections

- Jira cloud ID: `42c6216d-73c5-4777-a644-c41ef9bc6a1a`
- Jira project: `KAN` / `Sololedger`, project ID `10001`
- Jira KAN-19 verified 2026-09-26: Story, status `In Progress`, assignee empty.
- Live Supabase read-only verification 2026-09-26 confirms exact `2645` is P1=true, P2=true, P3=false.

## Current Objective

- KAN-19 `VAT V2-4 - VAT-aware booking RPC` remains active/in progress, not complete.
- KAN-19 persistence implementation is checkpointed at `d2d2e4febe2d1368e013e1b47109fbdf8f3d4eb9`.
- Exact-2645 VAT account-classification prerequisite is live and verified.
- VAT V2 persistence migration/table/RPC/source are NOT live.
- No live VAT V2 test transaction has been created.
- Immediate blocker: Supabase migration-history reconciliation is required before applying the VAT V2 persistence migration live.

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

## Migration-History Blocker

- Current blocker is not caused by the local PostgreSQL test database.
- It is a migration-history identity mismatch between repo migration versions and the Supabase remote migration ledger.
- Verified remote-to-local mappings with SQL equivalence:
  - Remote `20260925050113`, name `20260925_add_vat_account_classification`, corresponds to local `20260925_add_vat_account_classification.sql`.
  - Remote `20260925070346`, name `20260925_delegate_vat_concurrency_account`, corresponds to local `20260925_delegate_vat_concurrency_account.sql`.
- Later versions currently align:
  - `20260925124023`
  - `20260926132107`
- There are older date-only local migration files and duplicate date prefixes whose relationship to the remote migration ledger has not been fully reconciled.
- Do not guess a repair/baseline strategy.
- Do not use `--include-all` as a shortcut.
- Do not execute historical migrations against production merely to make migration history align.
- A dedicated reconciliation/baseline analysis is required before the VAT V2 persistence migration is applied live.

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
- Do not commit/push, deploy, repair migrations, run `db push`, or change Jira without explicit Pontus approval.
- Next goal: dedicated migration-history reconciliation/baseline analysis and checkpoint.
- After reconciliation, official CLI dry-run should be able to identify ONLY `20260926174535` as pending before live apply.
