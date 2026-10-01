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
  intentionally left untouched by the External Audit #1 closeout. They remain
  the original audit snapshot, not the live closeout record.

## External Connections

- Jira cloud ID: `42c6216d-73c5-4777-a644-c41ef9bc6a1a`
- Jira project: `KAN` / `Sololedger`, project ID `10001`
- KAN-20 and KAN-26 are `Done`; KAN-27 VAT settlement is production-accepted;
  KAN-30/F8, KAN-31/F5+F10, KAN-32/F9, and KAN-33 query completeness are
  production IRL verified.
- External Audit #1 Jira status verified on 2026-10-01:
  KAN-29/KAN-30/KAN-31/KAN-32/KAN-33 are `Done`; KAN-34 and KAN-35 remain
  future backlog in `To Do`.
- Jira workflow principle going forward:
  `To Do -> In Progress -> In Review -> Done`. Move an issue to
  `In Progress` when active work begins and to `In Review` when implementation
  is complete and final verification is underway.
- Live Supabase migration head: `20261001120000`.

## Current Objective

- External Audit #1 is closed. No known audit finding remains open without an
  explicit non-blocking disposition.
- KAN-34 exists separately for the parked future UX feature:
  `Komplettera momsuppgifter för tvetydiga legacy/SIE-bokningar`; it is not an
  audit blocker.
- KAN-35 exists separately as a low-priority UI follow-up:
  `UI transaction history completeness beyond PostgREST row limits`; it is not
  a source for economic report calculations.

## Verification State

- External Audit #1 final status:
  F1-F6 fixed/verified by KAN-29/P0 remediation; F7 documented as false
  positive/closed; F8 fixed/verified by KAN-30; F5 and F10 fixed/verified by
  KAN-31; F9 fixed/verified by KAN-32; query-completeness risk fixed/verified
  by KAN-33.
- Production sanity for final audit closeout: `HEAD == origin/main` was
  verified before the final documentation commit, production returned HTTP 200
  from `https://sololedger.vercel.app`, and relevant migrations are registered
  remotely through `20261001120000`.
- KAN-33 implementation commit:
  `d3dd79943572f3760607e04914907faa835d417f`.
- KAN-33 migration:
  `supabase/migrations/20261001120000_kan33_account_balance_rpcs.sql`.
- Migration SHA-256:
  `995578DB38841CC4CA031573C9F62182D96B1DDDA6BAB804885C41D93CA73A76`.
- Migration is live in Supabase production project `wbaxmuvudpnkvuliicuy` as
  version `20261001120000`.
- KAN-33 added complete-safe read paths for VAT report, dashboard VAT
  overview, account balances/result/NE through read-only aggregation RPCs,
  SIE export, and available VAT years.
- Code/product view mapping verified: there are no separate result/balance
  report UI views beyond the existing Ekonomiöversikt, NE-bilaga, Momsrapport,
  and SIE export paths. `useAccountingData` feeds Ekonomiöversikt balances,
  NE-bilaga data, and UI transaction history; SIE export calls
  `getBalanceSheetBalances` directly.
- Automated evidence: >1000-row fetch-all, VAT report, SIE export, and local
  account-balance RPC regressions passed, including complete sums and
  multi-user isolation.
- Production DB verification after apply: migration registered exactly once;
  `get_period_account_balances(date,date)` and
  `get_cumulative_account_balances(date)` exist; both are `SECURITY INVOKER`;
  `anon`/`PUBLIC` lack execute; `authenticated` has execute; RLS policy and
  pre-existing public-function fingerprints remained unchanged.
- Production IRL on Pontan AB after F5: Ekonomiöversikten, NE-bilagan,
  Momsrapport, and SIE-export 2026 loaded/worked normally with no new observed
  errors or empty economic views. Exact amounts were not manually validated in
  IRL; completeness and sums are covered by automated KAN-33 regressions.
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
  migrations through `20261001120000`.
- Current head:
  `20261001120000_kan33_account_balance_rpcs.sql`.
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

- External Audit #1 is closed. Wait for Pontus to select the next work item.
- Payment-account discoverability for the VAT tax-account movement flow remains
  a separate follow-up candidate; it is not part of KAN-31.
