# SoloLedger Project State

Last updated: 2026-09-19

## Repository State

- Worktree: `C:\Users\Familjedator\Desktop\Sololedger Multi User App\sololedger_multi_user`
- Branch: `main`
- Git remote/origin previously verified as `https://github.com/sololedger/sololedger.git`
- Latest pushed checkpoint commit: `d3427f9957f74c0515c57c1e1bccbc160737451d KAN-7 add atomic VAT period closing`
- Local `main` and `origin/main` were verified pointing to the same commit before this handoff documentation update.
- Working tree was clean before this handoff documentation update.
- Current uncommitted work should be handoff documentation only: `PROJECT_STATE.md` and, if changed, `PROJECT_ARCHIVE.md`.
- No deploy, live DB write, Jira Done transition, KAN-8 work, or other Jira issue work has been performed after the KAN-7 checkpoint.

## External Connections

- Supabase project ref `wbaxmuvudpnkvuliicuy` is accessible.
- Vercel team slug `sololedger1` was verified as accessible, but Vercel project slug `sololedger` was not verified through the plugin.
- Jira cloud ID: `42c6216d-73c5-4777-a644-c41ef9bc6a1a`
- Jira project: `KAN` / `Sololedger`, project ID `10001`
- Jira statuses: `To Do` (`10004`), `In Progress` (`10005`), `In Review` (`10006`), `Done` (`10007`)
- Jira users verified: Pontus Åkerhage `712020:01a218e5-6b15-4692-8096-c26687dca3f8`; Codex `712020:3ed8efb7-32c8-4b70-a72e-b7764cdb7802`

## Current Objective

- Current task: prepare handoff after the completed KAN-7 checkpoint.
- No active implementation is in progress.
- KAN-7 `3B.5 close_vat_period_atomic foundation`: `In Review`, assigned to Pontus.
- KAN-6 `3B.5 Import SIE VAT guard`: `In Review`, assigned to Pontus.
- KAN-5 `3B.5 Undo SIE VAT guard`: `In Review`, currently no assignee in Jira.
- Pontus final IRL/review remains before KAN-5, KAN-6, or KAN-7 should move to `Done`.

## KAN-7 Verification Snapshot

- Migration file: `supabase/migrations/20260918_add_close_vat_period_atomic.sql`
- Migration SHA-256: `07EA138C427D07AAAF2E073E9CC3092B60C9A0042CBA56F6FBA605D7EA00B269`
- Test file: `supabase/tests/kan7_close_vat_period_atomic_candidate.sql`
- Final test file SHA-256 after permanent `\ir` rename: `14FB0A6C52B26947B28BDCBBC583A96457EBA2C53270BCDED4E7139BCA50840E`
- Independent adversarial review: READY FOR TEST SCRIPT, BLOCKER 0.
- Rollback DB tests against live: 18/18 PASS.
- Rollback postflight: POSTFLIGHT CLEAN.
- Permanent post-install read-only verification: POST-INSTALL VERIFIED.
- Live normalized `pg_get_functiondef(public.close_vat_period_atomic(uuid))` matches the migration function definition exactly.
- Test-user `47d6e49f-a595-4292-9529-78ba731bd9de` had `ver_nr_sequences.last_ver_nr = 22` after rollback/post-install verification.
- No KAN-7 fixtures or unexpected schema/data changes were found after rollback/post-install checks.
- True two-session concurrency remains DEFERRED / NOT EMPIRICALLY TESTED.

## Active VAT Context

- Implemented VAT write guards: KAN-5 `undo_sie_import_atomic`, KAN-6 `import_sie_batch`, KAN-7 `close_vat_period_atomic`, and earlier guarded write RPCs `book_transaction_atomic`, `book_periodized_transaction_atomic`, and `create_correction_transaction_atomic`.
- KAN-7 closing scope is exact `261x`, `262x`, `263x`, and `2641`; `265x` activity blocks normal auto-close/manual review but is not included in `closing_amount`.
- `closing_amount = -sum(debit-credit)` over relevant VAT account balances, and net is booked to `2650` only when net is nonzero.
- `declared_at` is not set by KAN-7; KAN-8 handles declared VAT period state.
- UI integration caveat: before exposing VAT close to users, `vat_closing` must be treated as a system booking in `TransactionTable`/app flows so ordinary edit/delete/correction controls are not offered for VAT closing transactions.

## Next Safe Step

- Review this handoff documentation diff.
- If approved, commit and push only handoff documentation:
  - `PROJECT_STATE.md`
  - `PROJECT_ARCHIVE.md` if it changed
- Suggested handoff commit message: `Update handoff after KAN-7 checkpoint`
- After handoff is committed/pushed and clean, Pontus should choose the next issue explicitly.
- Do not deploy, run migrations, perform live DB writes, move Jira issues to `Done`, start KAN-8, or work on any other Jira task without explicit approval.
