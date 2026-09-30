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
- Do not modify Jira until explicit leader approval.
- Live Supabase migration head: `20260930120000`.

## Current Objective

- External Audit #1 P0 Batch 2 is production deployed and IRL verified.
- P0 status: `IRL VERIFIED`.
- Checkpoint/deployed commit:
  `0d8a4c891b418f8195a9f9cd2863fbf4e28048e2`.
- Production P0 migration is LIVE and verified:
  `supabase/migrations/20260930120000_audit1_p0_vat_lifecycle_semantics.sql`
- P0 migration SHA-256:
  `B321142E53B4906B1ED448254799907C5415C9C78683D5AB4C4F021B5371B1DF`
- Production deployment is tied to the exact checkpoint commit.
- Jira remains unchanged and is a separate explicit approval gate.
- RC-D was not started and must not start without explicit approval.
- Prior VAT lifecycle Slice 3 tax-account money movement implementation remains
  production-accepted and durable.
- Slice 3 production migration remains LIVE and verified:
  `supabase/migrations/20260929183000_add_tax_account_movement.sql`
- Slice 3 migration SHA-256:
  `E32E1C0E55CEA8BF6A44A23367C1AC469CB97491327D24CB3F8025684EF5C679`
- Slice 3 live DB verification verdict:
  `LIVE DB APPLY VERIFIED - SAFE TO PROCEED TO APP CHECKPOINT`
- The Slice 3 migration created zero `tax_account_movements`, zero
  `tax_account_movement` transactions, and zero related journal entries.
- Production IRL UI/accounting acceptance passed for TESTNAMN AB on
  2026-09-30. Accepted proof: `VER-17` source `tax_account_movement`,
  Dr `2012` 4000.00 / Cr `1930` 4000.00, exactly one linked
  `tax_account_movements` row, no duplicate/retry artifact.
- KAN-27 remains separate: `VER-16` source `vat_settlement`,
  Dr `2650` 4000.00 / Cr `2012` 4000.00. Combined `VER-16` + `VER-17`
  nets account `2012` to zero for the Q1 lifecycle chain.

## Slice 3 Durable Architecture

- New controlled transaction source: `tax_account_movement`.
- New immutable metadata table: `public.tax_account_movements`.
- New RPC:
  `record_tax_account_movement_atomic(text,date,numeric,uuid,uuid)`.
- Movement kinds are:
  `business_to_tax_account`, `owner_private_to_tax_account`,
  `tax_account_to_business`, and `tax_account_to_owner_private`.
- Business funding uses configured semantic payment role
  `business_payment_account`; private funding uses
  `owner_private_payment`; tax-account-to-private withdrawal derives fixed
  counter account `2013`.
- The database supports nullable `vat_period_id` for future unlinked
  tax-account movements, while the current UI is VAT-focused first.
- Durable DB idempotency is enforced by `(user_id, idempotency_key)` and the
  frontend stores retry/session intent for indeterminate submit outcomes.
- Generic edit and generic correction are blocked for `tax_account_movement`;
  ordinary VAT guard activity is false.
- `tax_account_movements` grants/RLS are intended: authenticated can read only
  own rows and cannot directly insert/update/delete metadata; service role has
  intended table access.

## Verification State

- External Audit #1 P0 Batch 2 verification passed:
  F1/F2/F3/F4/F6 scoped regressions, RC-A existing Q1 lifecycle/report
  production smoke, RC-C configured `1930` VAT V2 payment-source production UI
  path, and RC-B production negative IRL.
- RC-B production negative IRL used declared Q2 2026, event date
  `2026-06-30` exactly at period end, and attempted settlement `1.00`; the
  settlement was correctly rejected.
- RC-B post-attempt DB verification: registered `0.00`, remaining `1640.00`,
  event count `0`. No cleanup was required because the rejected operation
  produced no settlement event.
- Deferred/non-P0 findings remain deferred; this acceptance does not mark
  F5/F8/F9/F10 or RC-D complete.
- Local isolated PostgreSQL 17 rollback regression passed for the final Slice 3
  migration before production apply.
- Live post-apply verification passed for migration history, source constraint,
  taxonomy, table constraints/indexes, RLS/grants, triggers, RPC definition,
  generic guards, zero side effects, and existing KAN-27 sanity.
- Existing Q1 `VER-15`/`VER-16` VAT lifecycle data was checked read-only after
  migration and no mutation was observed.
- Final app checkpoint passed: `git diff --check`, `npm run typecheck`,
  focused tax-account movement UI tests, and `npm run test:domain`.
- Full repo `npm run lint` still has pre-existing unrelated debt; do not fix
  unrelated lint debt as part of Slice 3.
- Existing Dashboard Bank card remains hard-coded to `1930`; this is out of
  scope for Slice 3.

## Live Migration State

- Active live migrations include the reconciled CLI baseline and all active
  migrations through `20260930120000`.
- Current head:
  `20260930120000_audit1_p0_vat_lifecycle_semantics.sql`.
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

- Jira update/transition for the accepted P0 work remains a separate explicit
  approval gate.
- Do not modify Jira until explicit leader approval and current issue/status
  verification.
- Do not start RC-D without explicit approval.
- Do not deploy manually, perform production accounting actions, or start
  unrelated follow-up work without explicit approval.
