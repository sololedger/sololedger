# SoloLedger Project State

Last updated: 2026-09-18

## Repository State

- Worktree: `C:\Users\Familjedator\Desktop\Sololedger Multi User App\sololedger_multi_user`
- Branch: `main`
- Git remote/origin previously verified as `https://github.com/sololedger/sololedger.git`
- Latest pushed checkpoint commit: `2efdfa1 KAN-5 add undo SIE VAT concurrency guard`
- Local `main` is synced with `origin/main`.
- Working tree contains the uncommitted KAN-6 checkpoint files listed in Next Safe Step.
- No commit, push, deploy, Jira Done transition, or KAN-7 work has been performed for this checkpoint.

## External Connections

- Supabase project ref `wbaxmuvudpnkvuliicuy` is accessible.
- Vercel team slug `sololedger1` was verified as accessible, but Vercel project slug `sololedger` was not verified through the plugin.
- Jira cloud ID: `42c6216d-73c5-4777-a644-c41ef9bc6a1a`
- Jira project: `KAN` / `Sololedger`, project ID `10001`
- Jira statuses: `To Do` (`10004`), `In Progress` (`10005`), `In Review` (`10006`), `Done` (`10007`)
- Jira users verified: Pontus Åkerhage `712020:01a218e5-6b15-4692-8096-c26687dca3f8`; Codex `712020:3ed8efb7-32c8-4b70-a72e-b7764cdb7802`

## Current Objective

- Current checkpoint being finalized: KAN-6 `3B.5 Import SIE VAT guard`.
- KAN-6 Jira status: `In Review`, assigned to Pontus.
- KAN-6 permanent migration is installed in live Supabase and verified read-only after installation.
- Pontus final IRL/review remains before KAN-6 should be moved to `Done`.
- KAN-5 remains `In Review`; Pontus final IRL/review remains before KAN-5 should be moved to `Done`.

## KAN-6 Verification Snapshot

- Migration file: `supabase/migrations/20260918_add_vat_guard_to_import_sie_batch.sql`
- Migration SHA-256: `096E0825DFF11B7744C8024AF1BD64E0108AD720C54A0D1554C1913FD06BF611`
- Live `public.import_sie_batch(jsonb)` post-install md5: `13ce699a75462ce1e97cc52755a79376`; length: `18408`.
- Live definition matches the migration function definition exactly after normalization.
- Functional/regression rollback DB tests against live: 14/14 PASS.
- Atomicity/negative cases: PASS.
- Outer rollback and fixture cleanup: PASS.
- Empirically executed rollback test artifact before final `\ir` rename-reference SHA-256: `E807AB1BAFC6C19F19BE2DE50881A5B8B8564C0794F22036A50218EB841EFCC6`.
- Final test file only changes the `\ir` reference to the permanent migration filename.
- KAN-6 concurrency is DEFERRED / NOT EMPIRICALLY TESTED.
- KAN-5 concurrency is still DEFERRED / NOT EMPIRICALLY TESTED.

## Verified / Implemented VAT Context

- Already implemented and tested guards: `book_transaction_atomic`, `book_periodized_transaction_atomic`, `create_correction_transaction_atomic`, and `undo_sie_import_atomic`.
- `import_sie_batch` now has the KAN-6 VAT pre-scan, VAT advisory locks, SoloLedger VAT-period state guard, duplicate check after VAT guard, and protected `get_next_ver_nr` ordering.
- Repo migration `20260917_add_vat_concurrency_helpers.sql` defines VAT sync scope as `261x`, `262x`, `263x`, exact `2641`, and `265x`.
- Closing balance scope is `261x`, `262x`, `263x`, exact `2641`; `265x` is synchronization/state safety scope, not closing balance scope.
- VAT locks are transaction-level PostgreSQL advisory locks per calendar month, independent of VAT period type.
- Multi-month VAT locks are taken in chronological calendar order.
- Global lock order: all VAT advisory locks -> other advisory locks -> row locks -> protected reads/writes.
- VAT period blocking applies to `source = 'sololedger'` and status `closed` or `declared`; `imported_history` does not block.
- Authoritative closed state must not be inferred from 265x activity.

## Decided Design Not Yet Implemented

- KAN-7 `close_vat_period_atomic()` should be atomic, create a real `transactions` row with `source = 'vat_closing'` and journal rows when closing activity exists, use `period_end` as verification date, and base period membership/balances on `journal_entries.date`.
- `close_vat_period_atomic()` must set `status = 'closed'`, set `closing_amount`, set `closing_transaction_id` when a closing verification exists, and must not set `declared_at`.
- Special VAT close cases remain as previously decided: no activity means no artificial verification; exact net 0 with activity creates a real closing verification; already-zeroed relevant balances with activity blocks for manual review.
- KAN-8 handles declared VAT period state: `open -> closed -> declared`.
- After the VAT track reaches a safe checkpoint, return to Kontoplan guidance for enskild firma users.

## Next Safe Step

- Review the KAN-6 checkpoint diff.
- If approved, commit only:
  - `supabase/migrations/20260918_add_vat_guard_to_import_sie_batch.sql`
  - `supabase/tests/kan6_import_sie_vat_guard_candidate.sql`
  - `PROJECT_STATE.md`
  - `PROJECT_ARCHIVE.md`
- Suggested commit message: `KAN-6 add import SIE VAT guard`
- Do not deploy, run migrations, push, move Jira to Done, start KAN-7, or work on any other Jira task without explicit approval.
