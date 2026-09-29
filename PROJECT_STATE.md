# SoloLedger Project State

Last updated: 2026-09-29

## Repository State

- Worktree: `C:\Users\Familjedator\Desktop\Sololedger Multi User App\sololedger_multi_user`
- Branch: `main`
- Git remote/origin verified as `https://github.com/sololedger/sololedger.git`
- Migration-history reconciliation checkpoint is committed and pushed; live
  metadata repair and VAT V2 persistence apply were completed on 2026-09-26.
- `supabase/.temp/` may exist as generated Supabase CLI state only. Verified generated files in this case: `cli-latest`, `linked-project.json`. Do not read/display secrets and do not add this directory to Git.

## External Connections

- Jira cloud ID: `42c6216d-73c5-4777-a644-c41ef9bc6a1a`
- Jira project: `KAN` / `Sololedger`, project ID `10001`
- Jira KAN-20 transitioned/read 2026-09-28: Story, status `Done`.
- Jira KAN-26 created and transitioned 2026-09-28: Story
  `VAT lifecycle – declaration confirmation and report readiness`, status
  `Done`.
- Live Supabase read-only verification 2026-09-26 confirms exact `2645` is P1=true, P2=true, P3=false.
- Vercel production context verified 2026-09-27: team `sololedger1`, project
  `sololedger`, domain `https://sololedger.vercel.app`, GitHub
  `sololedger/sololedger` on `main`.
- This checkout has no `.vercel/project.json`; verify account/team/project
  before deployment operations.

## Current Objective

- VAT lifecycle Slice 1 is complete, production-accepted, and recorded in
  Jira `KAN-26` (`Done`).
- Production implementation commit:
  `e5253d09625d2ce61d2b671f38a49a2dcb70e518`.
- Live migration:
  `supabase/migrations/20260928193000_add_vat_declaration_submission_date.sql`.
- Live declaration RPC is `declare_vat_period_atomic(uuid,date)`.
- Old uuid-only `declare_vat_period_atomic(uuid)` RPC is removed.
- `vat_periods.skv_submitted_on` exists.
- Closed/declared SoloLedger VAT periods auto-load VAT reports safely.
- Declaration means confirmation of external submission to Skatteverket;
  SoloLedger does not submit to Skatteverket.
- Declaration creates no transaction and no journal entries.
- TESTNAMN AB Q1 2026 declaration IRL acceptance passed on 2026-09-28:
  status `declared`, `skv_submitted_on` `2026-09-28`, `VER-15` unchanged,
  `2650` credit `4000` remains, and no `2012` settlement activity exists.
- `DECLARED != SETTLED` is verified.
- KAN-27 VAT settlement is now production-accepted. Next VAT lifecycle work is
  the separate tax-account money-movement slice, not part of KAN-27.

## KAN-19 VAT Profile Runtime Slice

- Live migration:
  `supabase/migrations/20260927070224_add_vat_profile_runtime_fields.sql`.
- Adds runtime profile fields for domestic sales treatment, foreign-purchase
  reporting, and default deduction entitlement; partial deduction percent
  remains deferred.
- Live/IRL verification passed on 2026-09-27; existing profiles remained
  explicit `unknown` by default, ProfileSettings reload behavior was verified,
  and no VAT V2 booking/runtime route was added by this slice.

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

## KAN-19 Payment Account Role Model Slice

- Live slice adds `company_payment_account_roles`: semantic payment role to
  explicit company/user account number. A row means explicitly configured; no
  row means unconfigured.
- Existing `accounts` remains the legacy category/preset model; no role
  metadata was added there.
- Current roles: `business_payment_account`, `owner_private_payment`.
- System recommendations may suggest `1930` / `2018`, but recommendation is
  not company configuration and not universal company truth.
- Live migration:
  `supabase/migrations/20260927151231_add_payment_account_roles.sql`.
- Live ACL hardening migration:
  `supabase/migrations/20260927174627_harden_payment_account_roles_acl.sql`.
- Live ACL now removes `anon`/`PUBLIC` table privileges and leaves
  authenticated CRUD plus owner-only RLS for client access.
- Production default table privileges can grant broad ACL to newly created
  public tables. Client-facing table migrations must explicitly verify/revoke
  unintended `anon`/`authenticated` privileges. Broader default-privilege
  cleanup/review is deferred.
- VAT V2 payment-source UI/configuration wiring is live in production.
- Runtime guard still treats payment-role recommendations as suggestions only;
  explicit company/user payment role configuration remains required.

## KAN-19 Persistence Candidate

- Candidate migration: `supabase/migrations/20260926174535_add_vat_v2_reverse_charge_booking.sql`
- Live migration adds `transactions.source = 'vat_v2'`,
  `public.vat_audit_snapshots`, and
  `book_vat_v2_eu_service_reverse_charge_atomic(jsonb)`.
- Supported persistence path remains only `EU_SERVICE_REVERSE_CHARGE`, `25%`,
  full deduction. Generic correction of `source='vat_v2'` remains blocked
  pending a VAT V2-aware correction flow.
- Server-derived journal remains Dr `4535`, Dr `2645`, Cr `2614`, and Cr the
  supplied valid payment/payable account.
- Existing VAT V1 booking/correction behavior remains unchanged by verified
  regression.

## KAN-19 Verification

- KAN-19 transaction preflight slice checks passed locally:
  `npm run test:domain`, `npm run typecheck`, slice-owned/touched ESLint, and
  `git diff --check`; all-touched ESLint still reports unrelated historical
  `src/app/page.tsx` lint debt.
- KAN-19 payment-account role model checks passed locally: `npm run
  test:domain`, `npm run typecheck`, slice-owned/touched ESLint, `git diff
  --check`, and isolated PostgreSQL migration/RLS rollback verification.
- KAN-19 payment-account role ACL hardening was applied live and verified.
- KAN-19 payment-source UX/configuration hardening checks passed locally:
  `npm run test:domain`, `npm run typecheck`, targeted ESLint, and
  `git diff --check`; no live write, migration, deploy, or booking wiring.
- KAN-19 VAT V2 runtime wiring local checks passed for new slice-owned code:
  `npm run test:domain`, `npm run typecheck`, targeted clean ESLint subset, and
  `git diff --check`. Full touched-file ESLint still includes pre-existing
  `src/app/page.tsx` debt and existing `TransactionTable` broad-typing debt.
- KAN-19 form-blocker fix is live in production at
  `779d4bceeef738ae323ffad366a8f55bbee488db`; VAT V2 mode hides irrelevant
  V1 category/VAT/amount fields while preserving date, description, attachment,
  explicit acquisition base, and ordinary V1 behavior when VAT V2 is off.
- Production IRL `VER-14` verified source `vat_v2`, treatment
  `EU_SERVICE_REVERSE_CHARGE`, base `228`, 25%, full deduction, payment account
  `1930`; journal was Dr `4535` 228, Dr `2645` 57, Cr `2614` 57, Cr `1930`
  228 and balanced at 285/285.
- For the IRL booking, TESTNAMN AB had a Q3 2026 VAT period present with
  status `open`, created through the normal Momsrapport path; this test did
  not prove behavior when no matching VAT period row exists.
- `VER-14` has exactly one VAT audit snapshot with schema
  `vat-audit-snapshot-v1`, journal plan `vat-journal-plan-v1`, rule
  `vat-v2-kan18-first-slice`, facts `vat-facts-v1`, fields 21/30/48 matching
  the persisted journal.
- KAN-20 concrete follow-up: after `VER-14`, production Momsrapport displayed
  VAT V2 taxable base `228` under ruta 05 while output VAT `57` and deductible
  input VAT `57` were reflected; authoritative audit fields are 21/30/48, so
  the pre-KAN-20 production report UI is not snapshot-aware for the acquisition
  base.
- KAN-20 local implementation checkpoint: Momsrapport now reads hybrid VAT
  report fields through `vatReportService` and renders SKV fields
  05/10/11/12/21/30/48/49. Legacy/V1 remains journal/account based; native
  VAT V2 is based on validated `vat_audit_snapshots`.
- Current supported native VAT V2 report mapping is field 21 acquisition base,
  field 30 output VAT, and field 48 deductible input VAT. Native VAT V2 rows are
  excluded from legacy aggregation, and missing/malformed/duplicate/unsupported
  native VAT V2 audit data fails closed instead of falling back to V1 inference.
- KAN-20 local automated checks passed on 2026-09-28: VAT report aggregation,
  service, and presentation tests; `npm run test:domain`; `npm run typecheck`;
  targeted ESLint; `git diff --check`; and `npm run build`. No DB/RPC/RLS
  migration is required.
- KAN-20 production IRL acceptance passed on 2026-09-28 for TESTNAMN AB Q3
  2026 after repeated recalculation/period switching. Observed report values:
  field 05 = 0, 10 = 0, 11 = 0, 12 = 0, 21 = 228, 30 = 57, 48 = 2057,
  and 49 = +2000/fordran.
- In that production acceptance, `VER-14` contributed field 05 = 0, 10 = 0,
  21 = 228, 30 = 57, field 48 included 57 exactly once, and the reverse-charge
  net effect was 0. The remaining 2000 kr in field 48 came from other activity
  and was not independently audited as part of KAN-20.
- KAN-20 final wording-only polish: user-facing Momsrapport copy no longer
  exposes internal terms like VAT V2, audit snapshot, or authoritative report
  fields; the reverse-charge section is phrased as ordinary Swedish user copy.
- KAN-20 Jira closeout: KAN-20 is `Done` as of 2026-09-28.
- TESTNAMN AB Q1 2026 VAT lifecycle Slice 1 production acceptance passed under
  KAN-26 after Pontus closed and declared the period in production. Q1 is
  `declared` with `skv_submitted_on` `2026-09-28`; declaration created `0`
  transactions and `0` journal entries.
- Verified production `VER-15` remains unchanged: date `2026-03-31`, source
  `vat_closing`, description `Momsavslut 2026-01-01 - 2026-03-31`, journal
  Dr `2611` 5000, Cr `2641` 1000, Cr `2650` 4000, balanced 5000/5000.
- KAN-27 production IRL acceptance passed on 2026-09-29 for TESTNAMN AB Q1
  2026. The period remains SoloLedger-sourced and declared with
  `closing_amount` 4000.00, `skv_submitted_on` `2026-09-28`, and unchanged
  `closing_transaction_id`. Settlement state is exactly one event, settled
  4000.00, remaining 0.00.
- KAN-27 created `VER-16` dated `2026-09-29`, source `vat_settlement`,
  description `Momsavräkning skattekonto 2026-01-01 - 2026-03-31`, booked
  true, with exactly Dr `2650` 4000.00 and Cr `2012` 4000.00. The linked
  `tax_account_events` row is `vat_debit`, event date `2026-09-29`, amount
  4000.00. Duplicate/idempotency verification stayed at one event, one
  settlement transaction, total settled 4000.00.
- Q1 VAT report remained unchanged by settlement: field 05 = 20000,
  field 10 = 5000, field 48 = 1000, field 49 = 4000 payable.
- Known KAN-19 limitations: client duplicate-submit protection only, no
  server idempotency/dedupe guarantee, attachment upload and DB booking are not
  cross-system atomic, no attachment in IRL test, VAT V2 report UI is KAN-20.
- KAN-19 persistence final review passed with 0 CRITICAL, 0 HIGH, 0 MEDIUM
  findings; only residual LOW risk was lack of true two-session concurrency
  proof.
- Production-derived local PostgreSQL DB `sololedger_kan17c_test` remains the
  preferred safe DB/RPC regression environment.
- PostgreSQL 17 client exists at `C:\Program Files\PostgreSQL\17\bin\psql.exe`.
- Authorized local credential file for isolated local PostgreSQL verification:
  `C:\SoloLedger\LocalTest\pgpass.conf`.
- Never read/display/copy/hash pgpass contents; use that file only via
  process/session-local `PGPASSFILE`.

## Live Migration State

- Live applied KAN-19 migrations: exact-2645 classification
  `20260926132107`, VAT V2 persistence `20260926174535`, and VAT Profile
  Runtime `20260927070224`, payment-account roles `20260927151231`, and
  payment-account role ACL hardening `20260927174627`. VAT lifecycle Slice 1
  live migration `20260928193000` adds declaration submission date support.
- KAN-27 DB foundation migration
  `20260929143000_add_vat_settlement_foundation.sql` is live and verified.
  It adds the `tax_account_events` foundation and
  `record_vat_settlement_atomic`; the migration itself created no settlement
  or accounting data. Q1/`VER-15` remained unchanged after migration.
- Live remote migration ledger is fully aligned with local active migrations:
  `20260925000000`, `20260925050113`, `20260925070346`, `20260925124023`,
  `20260926132107`, `20260926174535`, `20260927070224`, `20260927151231`,
  `20260927174627`, `20260928193000`, `20260929143000`.
- Future production DB migrations should use the now-reconciled official
  Supabase CLI workflow.
- Do not use MCP `apply_migration` for timestamped repo migrations where repo/live version identity matters.
- Historical migration ledger reconciliation is complete.

## Migration-History Cutover

- Historical migration ledger reconciliation is complete. Legacy date-only SQL
  is archived under `supabase/migration_archive/pre_20260925000000_legacy_date_only/`.
- Active CLI cutover baseline:
  `supabase/migrations/20260925000000_pre_kan17_cli_baseline.sql`.
- Metadata-only alignment for `20260925000000` is complete; the baseline
  version was recorded remotely without executing baseline SQL against
  production.
- Do not use `--include-all` as a shortcut.
- Do not execute historical migrations against production merely to make migration history align.
- Do not run the cutover baseline against existing production.

## Active VAT V2 Context

- KAN-14 is the VAT V2 epic. KAN-15 through KAN-18 provide the completed
  recon/domain/account-role/treatment foundations.
- KAN-17 remains frozen through KAN-17C unless new evidence proves
  incompatibility.
- KAN-20 `VAT V2 momsrapport / authoritative report fields` is implemented
  and production-accepted for the controlled scope. Jira is `Done`.
- KAN-26 `VAT lifecycle – declaration confirmation and report readiness` is
  implemented, production-accepted, and Jira `Done`.
- KAN-27 DB foundation and app integration are live and production-accepted.
  Settlement UI read state uses `vat_periods.closing_amount` plus
  `tax_account_events`; money state uses integer öre. The frontend write path
  only calls `record_vat_settlement_atomic`; indeterminate submit outcomes
  reuse the same in-memory idempotency key for unchanged retry. Known
  accepted limitation: browser reload/unmount after an indeterminate result
  loses that in-memory key.
- KAN-27 UI handles payable/refund/partial/full settlement and history.
  `vat_settlement` is system-managed in transaction UI; generic edit and
  correction are unavailable. Slice 3 bank/private tax-account money movement
  is not implemented. KAN-27 is accepted/complete.
- External Copilot audit remains deferred until the agreed VAT V2
  feature-complete checkpoint.
- Separate future work: TransactionTable search/filtering for growing ordinary
  and system-generated transaction history.
- Separate future work: whole-app user-facing Swedish language review for sole
  traders without accounting expertise.

## Open VAT V2 Questions

- External verification remains required for no-deduction reverse-charge VAT,
  initial/partial VAT periods, and historical Adobe Ireland supplier-charged
  VAT handling.

## Next Safe Step

- Next VAT lifecycle work is the separate tax-account money-movement slice.
  Do not deploy manually, add migrations, modify accounting behavior, or start
  that slice without explicit approval.
