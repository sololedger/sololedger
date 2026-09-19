# SoloLedger Project State

Last updated: 2026-09-19

## Repository State

- Worktree: `C:\Users\Familjedator\Desktop\Sololedger Multi User App\sololedger_multi_user`
- Branch: `main`
- Git remote/origin previously verified as `https://github.com/sololedger/sololedger.git`
- Latest pushed checkpoint commit: `f5ed2df90a355fa1e2c5cc162407dfb486ec9da0 Update handoff after KAN-7 checkpoint`.
- Local `main` and `origin/main` were verified pointing to the same commit before the KAN-12 / 7B.1 checkpoint finalization.
- Current uncommitted KAN-12 / 7B.1 checkpoint files:
  - `supabase/migrations/20260919_guard_vat_closing_system_transactions.sql`
  - `supabase/tests/kan7b_vat_closing_system_guard_candidate.sql`
  - `PROJECT_STATE.md`
- No deploy, Jira transition, commit, push, app-code work, KAN-8 work, or broader KAN-12 app integration work has been performed during 7B.1 finalization.

## External Connections

- Supabase project ref `wbaxmuvudpnkvuliicuy` is accessible.
- Vercel team slug `sololedger1` was verified as accessible, but Vercel project slug `sololedger` was not verified through the plugin.
- Jira cloud ID: `42c6216d-73c5-4777-a644-c41ef9bc6a1a`
- Jira project: `KAN` / `Sololedger`, project ID `10001`
- Jira statuses: `To Do` (`10004`), `In Progress` (`10005`), `In Review` (`10006`), `Done` (`10007`)
- Jira users verified: Pontus Åkerhage `712020:01a218e5-6b15-4692-8096-c26687dca3f8`; Codex `712020:3ed8efb7-32c8-4b70-a72e-b7764cdb7802`

## Current Objective

- Current task: finalize checkpoint for KAN-12 / 7B.1 DB-integrity guard.
- KAN-12 `KAN-7B – Appintegration och integritetsskydd för momsperiodsstängning`: `In Progress`; 7B.1 DB-integrity guard is complete, app integration remains.
- Jira comment `10134` documents that 7B.1 is verified and installed live; KAN-12 was not moved to `In Review`.
- KAN-7 `3B.5 close_vat_period_atomic foundation`: `In Review`, assigned to Pontus.
- KAN-6 `3B.5 Import SIE VAT guard`: `In Review`, assigned to Pontus.
- KAN-5 `3B.5 Undo SIE VAT guard`: `In Review`, currently no assignee in Jira.
- Pontus final IRL/review remains before KAN-5, KAN-6, or KAN-7 should move to `Done`.

## KAN-12 / 7B.1 Verification Snapshot

- Migration file: `supabase/migrations/20260919_guard_vat_closing_system_transactions.sql`
- Migration SHA-256: `C29C46FB3CB382987F21936D374AC2704F09E1923D0C1B7CC0A926CC043217CE`
- Rollback test file: `supabase/tests/kan7b_vat_closing_system_guard_candidate.sql`
- Test file SHA-256: `15BE1A464E621DF44043F6DA5E27C8B4FB0533CF09A7E9C0C843E3BDBE834A2D`
- Rollback DB test against live: 55 assertions PASS, explicit ROLLBACK, clean postflight.
- Permanent migration installed live with `ON_ERROR_STOP=1` and no errors.
- Post-install read-only verification: POST-INSTALL VERIFIED. Live normalized `pg_get_functiondef()` for `create_correction_transaction_atomic(uuid)` and `update_transaction_safe(uuid,jsonb)` matches the migration definitions exactly.
- Grants/security verified: both RPCs are `SECURITY DEFINER`, `search_path=public`, executable by `authenticated`, `service_role`, and `postgres`, not executable by `anon` or `PUBLIC`; `authenticated` still lacks direct `INSERT`/`UPDATE`/`DELETE` on `transactions` and `journal_entries`.
- Test-user `47d6e49f-a595-4292-9529-78ba731bd9de` remained at `ver_nr_sequences.last_ver_nr = 22`; no KAN-12 fixtures remained after rollback/post-install checks.
- DB behavior: `create_correction_transaction_atomic` blocks `source='vat_closing'` in pre-scan and authoritative post-row-lock paths before `get_next_ver_nr()`; `update_transaction_safe` blocks all updates to `source='vat_closing'`, including `file_url`.
- Existing correction, periodization, and VAT concurrency behavior was preserved.

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

- Implemented VAT/system write guards: KAN-5 `undo_sie_import_atomic`, KAN-6 `import_sie_batch`, KAN-7 `close_vat_period_atomic`, KAN-12 / 7B.1 `vat_closing` protection in `create_correction_transaction_atomic` and `update_transaction_safe`, and earlier guarded write RPCs `book_transaction_atomic`, `book_periodized_transaction_atomic`, and `create_correction_transaction_atomic`.
- KAN-7 closing scope is exact `261x`, `262x`, `263x`, and `2641`; `265x` activity blocks normal auto-close/manual review but is not included in `closing_amount`.
- `closing_amount = -sum(debit-credit)` over relevant VAT account balances, and net is booked to `2650` only when net is nonzero.
- `declared_at` is not set by KAN-7; KAN-8 handles declared VAT period state.
- UI integration caveat: KAN-12 app integration still needs to expose `close_vat_period_atomic`, load/use `vat_periods` in Momsrapport, handle refresh/state after close, and present `vat_closing` as a system booking in TransactionTable/app flows.

## Next Safe Step

- Review the KAN-12 / 7B.1 checkpoint diff.
- If approved, commit locally with:
  - `supabase/migrations/20260919_guard_vat_closing_system_transactions.sql`
  - `supabase/tests/kan7b_vat_closing_system_guard_candidate.sql`
  - `PROJECT_STATE.md`
- Proposed commit message: `KAN-12 protect VAT closing system transactions`
- Push only after explicit approval.
- After checkpoint, continue KAN-12 app integration when Pontus approves the next step; do not start KAN-8.
- Do not deploy, run migrations, perform live DB writes, move Jira issues, start KAN-8, or work on any other Jira task without explicit approval.
