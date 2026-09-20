# SoloLedger Project State

Last updated: 2026-09-20

## Repository State

- Worktree: `C:\Users\Familjedator\Desktop\Sololedger Multi User App\sololedger_multi_user`
- Branch: `main`
- Git remote/origin verified as `https://github.com/sololedger/sololedger.git`
- Latest pushed checkpoint commit: `8311ee4f2955133fea2ca2def70cf9b91a7fb063 KAN-12 add VAT period close app integration`.
- Local `HEAD` and `origin/main` were verified pointing to `8311ee4f2955133fea2ca2def70cf9b91a7fb063` during handoff preparation.
- Working tree was clean before this handoff documentation update.
- Current uncommitted handoff change:
  - `PROJECT_STATE.md`
- No deploy, DB write, migration, app-code change, Jira change, commit, push, or KAN-8 work has been performed during this handoff preparation.

## External Connections

- Supabase project ref `wbaxmuvudpnkvuliicuy` is accessible.
- Vercel team slug `sololedger1` was verified as accessible, but Vercel project slug `sololedger` was not verified through the plugin.
- Jira cloud ID: `42c6216d-73c5-4777-a644-c41ef9bc6a1a`
- Jira project: `KAN` / `Sololedger`, project ID `10001`
- Jira statuses: `To Do` (`10004`), `In Progress` (`10005`), `In Review` (`10006`), `Done` (`10007`)
- Jira users verified: Pontus Åkerhage `712020:01a218e5-6b15-4692-8096-c26687dca3f8`; Codex `712020:3ed8efb7-32c8-4b70-a72e-b7764cdb7802`

## Current Objective

- Current task: handoff after KAN-12 / 7B.1-7B.4 checkpoint completion.
- KAN-12 `KAN-7B - Appintegration och integritetsskydd för momsperiodsstängning`: `In Review`; assignee currently empty in Jira.
- KAN-12 Jira comment `10167` documents commit `8311ee4f2955133fea2ca2def70cf9b91a7fb063`, verification, and the remaining isolated close UI/E2E limitation.
- KAN-7 `3B.5 close_vat_period_atomic foundation`: `In Review`, assigned to Pontus.
- KAN-6 `3B.5 Import SIE VAT guard`: `In Review`, assigned to Pontus.
- KAN-5 `3B.5 Undo SIE VAT guard`: `In Review`, currently no assignee in Jira.
- Pontus final IRL/review remains before KAN-5, KAN-6, KAN-7, or KAN-12 should move to `Done`.

## KAN-12 Checkpoint Summary

- 7B.1 DB-integrity guard is complete, installed live, and checkpointed in commit `bb52c917f380dfb16512aa7924782ed475258b1c`.
- 7B.1 behavior:
  - `create_correction_transaction_atomic` blocks `source='vat_closing'` in pre-scan and authoritative post-row-lock paths.
  - `update_transaction_safe` blocks all updates to `source='vat_closing'`, including `file_url`.
  - Rollback DB test against live: 55 assertions PASS, explicit ROLLBACK, clean postflight.
  - Permanent migration installed live and post-install read-only verification passed.
- 7B.2 system-source UI protection is complete:
  - `source='vat_closing'` is presented as `Momsavslut` / `Systembokning`.
  - Technical `transactions.amount` is not shown as a normal business amount for VAT closing transactions.
  - Edit, correction/delete, and attachment/file actions are hidden for VAT closing rows.
  - `page.tsx` handlers have defense-in-depth guards before edit/file-upload/update/correction side effects.
- 7B.3 VAT periods read model is complete:
  - `accountingService.ts` adds typed `VatPeriod`, `ensureVatPeriods(throughDate)`, and read-only `getVatPeriods(startDate,endDate)`.
  - `Momsrapport.tsx` uses real `vat_periods` for period dates/status/source.
  - No hardcoded Q1/Q2/Q3/Q4/full-year period is presented as a DB-verified VAT period.
  - Future year selection skips `ensureVatPeriods()`.
  - Years available only through `vat_periods` are selectable even without journal rows.
  - Breakdown rendering is guarded by selected `vat_period.id` and context key.
- 7B.4 Close flow is complete:
  - `accountingService.ts` adds typed `closeVatPeriod(periodId)` over live `close_vat_period_atomic`.
  - Close is exposed only for eligible open SoloLedger-managed periods, requires confirmation, and does not optimistic-close the UI.
  - Normal close, no-activity close, already-closed success, known server blockers, double-close prevention, central accounting refresh, `vat_periods` reload, and refresh-failure warnings are handled.
- Live RPC definitions are used unchanged by 7B.2-7B.4; no DB/RPC/migration changes are part of the app checkpoint.
- `getMomsBreakdown()` implementation is unchanged and remains the calculation engine.
- KAN-8 declaration/payment/refund/1630 work has not been started.

## Verification Snapshot

- KAN-12 / 7B.2-7B.4 app checkpoint verification from the checkpointed working tree:
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

- Commit/push this handoff documentation only after explicit approval.
- Proposed handoff commit message: `Update handoff after KAN-12 checkpoint`
- Then Pontus can IRL-test KAN-12 in review.
- Remaining known verification limitation: full close UI/E2E must be run only against an explicitly isolated staging/test environment with disposable data.
- Do not deploy, run migrations, perform live DB writes, move Jira issues, start KAN-8, or work on any other Jira task without explicit approval.
