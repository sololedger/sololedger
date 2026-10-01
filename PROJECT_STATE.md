# SoloLedger Project State

Last updated: 2026-10-01

## Repository State

- Worktree: `C:\Users\Familjedator\Desktop\Sololedger Multi User App\sololedger_multi_user`
- Branch: `main`
- Git remote/origin: `https://github.com/sololedger/sololedger.git`
- Production path: GitHub `sololedger/sololedger` `main` -> Vercel team
  `sololedger1`, project `sololedger`, domain `https://sololedger.vercel.app`.
- This checkout has no `.vercel/project.json`; do not use a manual Vercel CLI
  deployment path without re-verifying team/project context and explicit
  approval.
- `supabase/.temp/` may exist as generated Supabase CLI state only. Verified
  generated files in this checkpoint include `cli-latest`, `gotrue-version`,
  `linked-project.json`, `pooler-url`, `postgres-version`, `project-ref`,
  `rest-version`, `storage-migration`, and `storage-version`. Do not
  read/display secrets and do not add this directory to Git.

## External Connections

- Jira cloud ID: `42c6216d-73c5-4777-a644-c41ef9bc6a1a`
- Jira project: `KAN` / `Sololedger`, project ID `10001`
- KAN-20 and KAN-26 are `Done`; KAN-27 VAT settlement is production-accepted.
- KAN-30/F8 is production IRL verified and archived; current local/pre-production
  work is KAN-31 freeze, checkpoint, and read-only production preflight.
- Live Supabase migration head: `20260930163000`.

## Current Objective

- KAN-31 local RC-D implementation is frozen for checkpoint and read-only
  production preflight; no live Supabase writes, deploy, Jira mutation, or
  migration apply has been performed.
- Local migration prepared:
  `supabase/migrations/20260930190000_kan31_idempotency_replay.sql`.
- Scope implemented locally: durable VAT V2 booking idempotency ledger,
  replay-before-mutable-guard semantics for VAT settlement and tax-account
  movement exact retries, settlement retry-key session persistence, VAT V2 RPC
  idempotency-key payload, VAT V2 session-scoped retry identity recovery, and
  admin deletion/dry-run count coverage for the new user-owned ledger.
- KAN-31 rollback proof:
  `supabase/tests/kan31_idempotency_replay_green_candidate.sql`.

## Verification State

- KAN-31 local checks passed on 2026-10-01 against the isolated local
  `sololedger_kan17c_test` PostgreSQL DB with explicit rollback:
  KAN-31 green replay regression, KAN-30 deletion lifecycle regression, KAN-27
  settlement regression, tax-account movement regression, payment-account role
  SQL policy regression, and External Audit #1 Batch 1 SQL regression.
- App/domain checks passed: VAT settlement UI/service, tax-account movement
  UI/service, VAT V2 runtime booking, payment-account roles, admin delete
  dry-run, External Audit #1 Batch 1 TypeScript regression,
  `npm run test:domain`, and `npm run typecheck`.
- `git diff --check` passed.
- Changed-file ESLint was attempted. Helper/test lint for the newly changed
  pure TS files passed, but full changed-file lint remains blocked by existing
  unrelated lint errors in `src/app/page.tsx` and
  `supabase/functions/delete-user/index.ts`.

## Live Migration State

- Active live migrations include the reconciled CLI baseline and all active
  migrations through `20260930163000`.
- Current head:
  `20260930163000_kan30_delete_user_data_vat_lifecycle.sql`.
- Future production DB migrations should use the official Supabase CLI flow
  preserving repo migration versions.
- Do not use MCP `apply_migration` for timestamped repo migrations where
  repo/live version identity matters.
- Do not use `--include-all`, repair history casually, or execute archived
  legacy migrations against production.

## Local Test Environment

- Production-derived local PostgreSQL DB `sololedger_kan17c_test` remains the
  preferred safe DB/RPC regression environment.
- PostgreSQL 17 client exists at `C:\Program Files\PostgreSQL\17\bin\psql.exe`.
- Authorized local credential file for isolated local PostgreSQL verification:
  `C:\SoloLedger\LocalTest\pgpass.conf`.
- Never read/display/copy/hash pgpass contents; use that file only via
  process/session-local `PGPASSFILE`.

## Next Safe Step

- Complete the authorized KAN-31 commit/push and read-only production preflight.
- Migration apply, deploy, Jira mutation, and production writes require a later
  explicit leader gate.
- Payment-account discoverability for the VAT tax-account movement flow remains
  a separate follow-up candidate; it is not part of KAN-31.
