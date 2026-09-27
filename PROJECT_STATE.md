# SoloLedger Project State

Last updated: 2026-09-27

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
- Jira KAN-19 verified 2026-09-26: Story, status `In Progress`, assignee empty.
- Live Supabase read-only verification 2026-09-26 confirms exact `2645` is P1=true, P2=true, P3=false.
- Vercel production context verified 2026-09-27: team `sololedger1`, project
  `sololedger`, domain `https://sololedger.vercel.app`, GitHub
  `sololedger/sololedger` on `main`.
- This checkout has no `.vercel/project.json`; verify account/team/project
  before deployment operations.

## Current Objective

- KAN-19 persistence boundary, exact-2645 prerequisite, VAT V2 RPC/table/source,
  and VAT Profile Runtime are live and verified.
- KAN-19 VAT V2 transaction fact collection/preflight is implemented locally
  for the narrow supported EU service reverse-charge path.
- KAN-19 payment-account role model and ACL hardening are live and verified.
- Current local KAN-19 slice implements VAT V2 payment-source UX/configuration
  gating only; no VAT V2 runtime booking is wired yet.
- VAT V2 runtime booking route is not recorded as complete here.
- No live VAT V2 business transaction was created during verification.
- Next KAN-19 work should build on the live persistence boundary without
  recreating the migration-history cutover.

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
- VAT V2 payment-source UI/configuration wiring is local-only in the current
  slice. Final runtime booking into the VAT V2 persistence chain remains next.

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
  payment-account role ACL hardening `20260927174627`.
- Live remote migration ledger is fully aligned with local active migrations:
  `20260925000000`, `20260925050113`, `20260925070346`, `20260925124023`,
  `20260926132107`, `20260926174535`, `20260927070224`, `20260927151231`,
  `20260927174627`.
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
- KAN-19 `VAT V2-4 - VAT-aware booking RPC` is active/in progress.

## Open VAT V2 Questions

- External verification remains required for no-deduction reverse-charge VAT,
  initial/partial VAT periods, and historical Adobe Ireland supplier-charged
  VAT handling.

## Next Safe Step

- Do not deploy, add migrations, create real VAT V2 business transactions, or
  change Jira without explicit Pontus approval.
- Next implementation step under separate approval: wire VAT V2 runtime booking
  through the existing persistence chain after payment-source UX review. Do not
  start it without explicit Pontus approval.
