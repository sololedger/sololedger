# SoloLedger Project State

Last updated: 2026-09-20

## Repository State

- Worktree: `C:\Users\Familjedator\Desktop\Sololedger Multi User App\sololedger_multi_user`
- Branch: `main`
- Git remote/origin verified as `https://github.com/sololedger/sololedger.git`
- Latest pushed checkpoint commit: `050bf5189c852595105a23e199e9e10d99d446b7 KAN-8 add VAT declaration state transition`.
- Local `HEAD` and `origin/main` were verified pointing to `050bf5189c852595105a23e199e9e10d99d446b7` before this handoff documentation update.
- Working tree was clean before this handoff documentation update.
- Current uncommitted handoff changes:
  - `PROJECT_STATE.md`
  - `PROJECT_ARCHIVE.md`
- No deploy, DB write, app-code change, Jira change, commit, or push has been performed during this handoff preparation.

## External Connections

- Supabase project ref `wbaxmuvudpnkvuliicuy` is accessible.
- Vercel team slug `sololedger1` was verified as accessible, but Vercel project slug `sololedger` was not verified through the plugin.
- Jira cloud ID: `42c6216d-73c5-4777-a644-c41ef9bc6a1a`
- Jira project: `KAN` / `Sololedger`, project ID `10001`
- Jira statuses: `To Do` (`10004`), `In Progress` (`10005`), `In Review` (`10006`), `Done` (`10007`)
- Jira users verified: Pontus Åkerhage `712020:01a218e5-6b15-4692-8096-c26687dca3f8`; Codex `712020:3ed8efb7-32c8-4b70-a72e-b7764cdb7802`

## Current Objective

- Current task: handoff after KAN-8 checkpoint completion.
- KAN-8 `3B.6 declared VAT period`: `In Review`; assignee currently empty in Jira.
- KAN-8 Jira comment `10200` documents commit `050bf5189c852595105a23e199e9e10d99d446b7`, verification, and remaining isolated declaration UI/E2E limitation.
- KAN-12 `KAN-7B - Appintegration och integritetsskydd för momsperiodsstängning`: `In Review`; assignee currently empty in Jira.
- KAN-7 `3B.5 close_vat_period_atomic foundation`: `In Review`, assigned to Pontus.
- KAN-6 `3B.5 Import SIE VAT guard`: `In Review`, assigned to Pontus.
- KAN-5 `3B.5 Undo SIE VAT guard`: `In Review`, currently no assignee in Jira.
- Pontus final IRL/review remains before KAN-5, KAN-6, KAN-7, KAN-8, or KAN-12 should move to `Done`.

## KAN-8 Checkpoint Summary

- Permanent migration installed live: `supabase/migrations/20260920_add_declare_vat_period_atomic.sql`.
- Migration SHA-256: `AD801D49671D80AABD3D4B0AB6A64EDB077187C04ABBB7807AC06BCEEAD09E4C`.
- Rollback test file: `supabase/tests/kan8_declare_vat_period_atomic_candidate.sql`.
- Rollback test SHA-256: `E0C228C6DDA496C118EAA2A29FC5FA26E4D5C2C0302D2117DB8EA8E11C71A6CC`.
- Live `public.declare_vat_period_atomic(uuid)` implements SoloLedger `closed -> declared` only.
- Declaration is status/audit metadata: no transactions, no journal entries, no ver-nr consumption, no payment/refund, no 1630/1930, no VAT recalculation, and no `closed_years` blocking.
- Already-declared SoloLedger periods are idempotent success and preserve existing `declared_at`/`updated_at`.
- App integration adds `declareVatPeriod(periodId)` and exposes declaration only for `source='sololedger'` plus `status='closed'`.
- Declaration uses separate in-flight state, Close/Declare mutual exclusion, no optimistic UI transition, metadata-only VAT-period reload, and stale async-context guard before declaration reload state writes.
- Existing close flow, `getMomsBreakdown()`, result engine/NE, SIE, year-lock logic, and VAT guards remain unchanged.

## Verification Snapshot

- KAN-8 DB rollback matrix against live: 76 assertions PASS; explicit ROLLBACK; post-rollback clean.
- KAN-8 post-install read-only verification: live function definition matched the migration, grants verified, and no accounting/data mutation from installation.
- KAN-8 app verification from checkpointed working tree:
  - `npm run typecheck`: PASS.
  - `npm run test:domain`: PASS, 81/81 tests.
  - Targeted ESLint on changed app files: only existing HEAD-baseline debt.
  - `git diff --check`: PASS, CRLF warnings only.
  - `npm run build`: PASS after approved network access for Next/Google Fonts.
- Full declaration UI/E2E against an isolated staging/test environment remains pending. No functional declaration was run against ordinary/live user data.

## Active VAT Context

- Implemented VAT/system write guards: KAN-5 `undo_sie_import_atomic`, KAN-6 `import_sie_batch`, KAN-7 `close_vat_period_atomic`, KAN-8 `declare_vat_period_atomic`, KAN-12 / 7B.1 `vat_closing` protection in `create_correction_transaction_atomic` and `update_transaction_safe`, and earlier guarded write RPCs `book_transaction_atomic`, `book_periodized_transaction_atomic`, and `create_correction_transaction_atomic`.
- KAN-7 closing scope is exact `261x`, `262x`, `263x`, and `2641`; `265x` activity blocks normal auto-close/manual review but is not included in `closing_amount`.
- `closing_amount = -sum(debit-credit)` over relevant VAT account balances, and net is booked to `2650` only when net is nonzero.
- `declared_at` is set only by KAN-8 declaration, not by close.

## Next Safe Step

- Commit/push this handoff documentation only after explicit approval.
- Proposed handoff commit message: `Update handoff after KAN-8 checkpoint`
- Then Pontus can IRL-test KAN-8 in review.
- Remaining known verification limitation: full declaration UI/E2E must be run only against an explicitly isolated staging/test environment with disposable data.
- Do not deploy, run migrations, perform live DB writes, move Jira issues, or work on any other Jira task without explicit approval.
