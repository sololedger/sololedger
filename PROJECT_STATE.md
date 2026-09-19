# SoloLedger Project State

Last updated: 2026-09-19

## Repository State

- Worktree: `C:\Users\Familjedator\Desktop\Sololedger Multi User App\sololedger_multi_user`
- Branch: `main`
- Git remote/origin verified as `https://github.com/sololedger/sololedger.git`
- Latest pushed checkpoint commit: `bb52c917f380dfb16512aa7924782ed475258b1c KAN-12 protect VAT closing system transactions`.
- Current uncommitted checkpoint candidate: KAN-12 / 7B.2-7B.4 app integration for SoloLedger-managed VAT period close.
- Expected dirty files for this checkpoint:
  - `src/hooks/useAccountingData.ts`
  - `src/app/page.tsx`
  - `src/components/Momsrapport.tsx`
  - `src/components/TransactionTable.tsx`
  - `src/lib/accountingService.ts`
  - `PROJECT_STATE.md`
- No deploy, Jira transition, commit, push, DB write, migration, or KAN-8 work has been performed during 7B.2-7B.4 finalization.

## External Connections

- Supabase project ref `wbaxmuvudpnkvuliicuy` is accessible.
- Vercel team slug `sololedger1` was verified as accessible, but Vercel project slug `sololedger` was not verified through the plugin.
- Jira cloud ID: `42c6216d-73c5-4777-a644-c41ef9bc6a1a`
- Jira project: `KAN` / `Sololedger`, project ID `10001`
- Jira statuses: `To Do` (`10004`), `In Progress` (`10005`), `In Review` (`10006`), `Done` (`10007`)
- Jira users verified: Pontus Åkerhage `712020:01a218e5-6b15-4692-8096-c26687dca3f8`; Codex `712020:3ed8efb7-32c8-4b70-a72e-b7764cdb7802`

## Current Objective

- Current task: finalize checkpoint for KAN-12 / 7B.2-7B.4 app integration and UI refresh semantics.
- KAN-12 `KAN-7B - Appintegration och integritetsskydd för momsperiodsstängning`: `In Progress`.
- KAN-12 / 7B.1 DB-integrity guard is already checkpointed in commit `bb52c917f380dfb16512aa7924782ed475258b1c` and installed live.
- KAN-7 `3B.5 close_vat_period_atomic foundation`: `In Review`, assigned to Pontus.
- KAN-6 `3B.5 Import SIE VAT guard`: `In Review`, assigned to Pontus.
- KAN-5 `3B.5 Undo SIE VAT guard`: `In Review`, currently no assignee in Jira.
- Pontus final IRL/review remains before KAN-5, KAN-6, KAN-7, or KAN-12 should move to `Done`.

## KAN-12 / 7B.2-7B.4 Candidate Snapshot

- 7B.2 system-source UI protection:
  - `source='vat_closing'` is presented as `Momsavslut` / `Systembokning`.
  - Technical `transactions.amount` is not shown as a normal business amount for VAT closing transactions.
  - Edit, correction/delete, and attachment/file actions are hidden for VAT closing rows.
  - `page.tsx` handlers have defense-in-depth guards before edit/file-upload/update/correction side effects.
- 7B.3 VAT periods read model:
  - `accountingService.ts` adds typed `VatPeriod`, `ensureVatPeriods(throughDate)`, and read-only `getVatPeriods(startDate,endDate)`.
  - `Momsrapport.tsx` uses real `vat_periods` for period dates/status/source.
  - No hardcoded Q1/Q2/Q3/Q4/full-year period is presented as a DB-verified VAT period.
  - Future year selection skips `ensureVatPeriods()`.
  - Years available only through `vat_periods` are selectable even without journal rows.
  - Breakdown rendering is guarded by selected `vat_period.id` and context key so stale results cannot appear under a different period.
- 7B.4 Close flow:
  - `accountingService.ts` adds typed `closeVatPeriod(periodId)` over live `close_vat_period_atomic`.
  - Close is exposed only for eligible open SoloLedger-managed periods, requires confirmation, and does not optimistic-close the UI.
  - Normal close, no-activity close, and already-closed success responses are handled.
  - Known server blockers are mapped to Swedish user-facing messages.
  - Double close is blocked through the whole close/refresh phase.
  - After successful DB close, central accounting refresh and `vat_periods` reload are attempted separately.
  - Successful DB close is never described as failed merely because refresh failed; refresh-warning text asks the user to reload when needed.
- Live RPC definitions are used unchanged; no DB/RPC/migration changes are part of 7B.2-7B.4.
- `getMomsBreakdown()` implementation is unchanged and remains the calculation engine.
- KAN-8 declaration/payment/refund/1630 work has not been started.

## KAN-12 Verification Snapshot

- 7B.1 DB-integrity guard:
  - Migration file: `supabase/migrations/20260919_guard_vat_closing_system_transactions.sql`
  - Migration SHA-256: `C29C46FB3CB382987F21936D374AC2704F09E1923D0C1B7CC0A926CC043217CE`
  - Rollback test file: `supabase/tests/kan7b_vat_closing_system_guard_candidate.sql`
  - Test file SHA-256: `15BE1A464E621DF44043F6DA5E27C8B4FB0533CF09A7E9C0C843E3BDBE834A2D`
  - Rollback DB test against live: 55 assertions PASS, explicit ROLLBACK, clean postflight.
  - Permanent migration installed live with `ON_ERROR_STOP=1` and no errors.
  - Post-install read-only verification: POST-INSTALL VERIFIED.
  - DB behavior: `create_correction_transaction_atomic` blocks `source='vat_closing'` in pre-scan and authoritative post-row-lock paths; `update_transaction_safe` blocks all updates to `source='vat_closing'`, including `file_url`.
- 7B.2-7B.4 app checkpoint verification from current working tree:
  - `npm run typecheck`: PASS.
  - `npm run test:domain`: PASS, 81/81 tests.
  - Targeted ESLint on changed files: no new lint debt versus HEAD baseline; existing lint debt remains.
  - `git diff --check`: PASS, CRLF warnings only.
  - `npm run build`: PASS after approved network access for Next/Google Fonts.
- Full close UI/E2E against an isolated staging/test environment remains pending. No destructive close test was run against ordinary/live user data.

## Active VAT Context

- Implemented VAT/system write guards: KAN-5 `undo_sie_import_atomic`, KAN-6 `import_sie_batch`, KAN-7 `close_vat_period_atomic`, KAN-12 / 7B.1 `vat_closing` protection in `create_correction_transaction_atomic` and `update_transaction_safe`, and earlier guarded write RPCs `book_transaction_atomic`, `book_periodized_transaction_atomic`, and `create_correction_transaction_atomic`.
- KAN-7 closing scope is exact `261x`, `262x`, `263x`, and `2641`; `265x` activity blocks normal auto-close/manual review but is not included in `closing_amount`.
- `closing_amount = -sum(debit-credit)` over relevant VAT account balances, and net is booked to `2650` only when net is nonzero.
- `declared_at` is not set by KAN-7 or KAN-12; KAN-8 handles declared VAT period state.

## Next Safe Step

- Review the KAN-12 / 7B.2-7B.4 checkpoint diff.
- If approved, commit locally with:
  - `PROJECT_STATE.md`
  - `src/hooks/useAccountingData.ts`
  - `src/app/page.tsx`
  - `src/components/Momsrapport.tsx`
  - `src/components/TransactionTable.tsx`
  - `src/lib/accountingService.ts`
- Proposed commit message: `KAN-12 add VAT period close app integration`
- Push only after explicit approval.
- After checkpoint, Jira comment can document that 7B.2-7B.4 are implemented and verified, while isolated destructive close UI/E2E remains pending for staging/test data.
- Do not deploy, run migrations, perform live DB writes, move Jira issues, start KAN-8, or work on any other Jira task without explicit approval.
