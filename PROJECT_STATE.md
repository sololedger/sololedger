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
- The canonical external-audit package files `SOLOLEDGER_AUDIT_*.md` are
  intentionally left untouched by the KAN-31 closeout.

## External Connections

- Jira cloud ID: `42c6216d-73c5-4777-a644-c41ef9bc6a1a`
- Jira project: `KAN` / `Sololedger`, project ID `10001`
- KAN-20 and KAN-26 are `Done`; KAN-27 VAT settlement is production-accepted;
  KAN-30/F8 is production IRL verified and archived.
- KAN-31/F5+F10 is production IRL verified and closing in Jira.
- Live Supabase migration head: `20261001060000`.

## Current Objective

- Close KAN-31 documentation/Jira only. Do not start KAN-32 in this task.
- KAN-31 is complete from implementation through production IRL replay:
  F5, F10-A, and F10-B are fixed and verified.
- Remaining audit work after KAN-31: F9 plus the separate KAN-33
  query-completeness investigation.

## Verification State

- KAN-31 main implementation commit:
  `ea08d9b8c98b254b73dd933f4fd6dcab9ebc25f1`.
- KAN-31 ACL fix commit:
  `37230c6a5e4c65395e87f5bded0011f6f7104c23`.
- Main migration live: `20260930190000`.
- ACL migration live: `20261001060000`.
- `delete-user` Edge Function v9 is live with `verify_jwt: true` and includes
  `vat_v2_booking_idempotency` in dry-run counting.
- Production IRL: first VAT V2 booking became VER-18.
- Controlled replay returned the same VER-18 with `idempotent_replay: true`.
- Post-replay production verification still showed exactly 1 matching
  transaction, 1 VAT audit snapshot, 1 idempotency row, and 4 journal rows.
- No duplicate booking or new verification was created.

## Live Migration State

- Active live migrations include the reconciled CLI baseline and all active
  migrations through `20261001060000`.
- Current head:
  `20261001060000_kan31_vat_v2_idempotency_acl_fix.sql`.
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

- After KAN-31 closeout, wait for the KAN-32 leader gate before starting F9.
- Keep KAN-33 as a separate investigation.
- Payment-account discoverability for the VAT tax-account movement flow remains
  a separate follow-up candidate; it is not part of KAN-31.
