# SoloLedger Project State

Last updated: 2026-09-30

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
- KAN-30/F8 closeout is explicitly authorized for Jira update/transition in
  this pass only.
- Live Supabase migration head: `20260930163000`.

## Current Objective

- KAN-30 / F8 is production IRL verified.
- Root cause: stale `delete_user_data_atomic` omitted modern VAT/lifecycle
  tables, so real users with tax-account lifecycle rows could not be fully
  deleted.
- Implementation commit:
  `076a6fa45dae2edd4881f85c92b760351d0529d2`.
- Live migration:
  `supabase/migrations/20260930163000_kan30_delete_user_data_vat_lifecycle.sql`.
- Migration SHA-256:
  `9494FC49991F572CBE8AB667A0285174130245FB1F03880AAB000AF66C7D110B`.
- Dry-run parity commit:
  `d3e9ea8d0e29116ab97cc6e6daab805febea58d7`.
- `delete-user` Edge Function is live as version `8` with `verify_jwt: true`.
- KAN-30/F8 durable evidence is archived in `PROJECT_ARCHIVE.md`.

## Verification State

- KAN-30 local SQL regressions and scoped app checks passed before production
  apply; dry-run parity checks passed before commit/push/deploy.
- Production dry-run matched the DB snapshot for the disposable strong F8
  fixture.
- Normal Admin permanent deletion succeeded.
- Post-delete verification: auth user absent; all 13 known application-table
  counts were `0`; former blocker rows and associated lifecycle transactions
  were absent; deletion-context table was globally clean; ACL/RLS/immutability
  state remained intact.
- External Audit #1 status after KAN-30: F1/F2/F3/F4/F6 fixed/verified,
  F7 false positive/closed, F8 fixed/production IRL verified.
- Remaining numbered Claude findings: F5 -> KAN-31, F9 -> KAN-32,
  F10 -> KAN-31. Separate query-completeness investigation -> KAN-33.
- Do not start KAN-31 without explicit leader gate.

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

- Complete the explicitly authorized KAN-30 Jira closeout in this pass, then
  stop.
- Next engineering work requires a fresh leader gate; expected next gate is
  KAN-31.
- Payment-account discoverability for the VAT tax-account movement flow is a
  separate follow-up candidate; do not implement it as part of KAN-30 closeout.
