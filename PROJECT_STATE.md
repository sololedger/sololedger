# SoloLedger Project State

Last updated: 2026-09-18

## Repository State

- Worktree: `C:\Users\Familjedator\Desktop\Sololedger Multi User App\sololedger_multi_user`
- Branch: `main`
- Git remote/origin previously verified as `https://github.com/sololedger/sololedger.git`
- Latest pushed checkpoint commit: `2efdfa1 KAN-5 add undo SIE VAT concurrency guard`
- Local `main` is synced with `origin/main`.
- Working tree was clean before this handoff-state update.
- This handoff update should be committed and pushed before a new Codex session starts.

## External Connections

- Supabase project ref `wbaxmuvudpnkvuliicuy` is accessible.
- Vercel team slug `sololedger1` was verified as accessible, but Vercel project slug `sololedger` was not verified through the plugin.
- Jira cloud ID: `42c6216d-73c5-4777-a644-c41ef9bc6a1a`
- Jira project: `KAN` / `Sololedger`, project ID `10001`
- Jira statuses: `To Do` (`10004`), `In Progress` (`10005`), `In Review` (`10006`), `Done` (`10007`)
- Jira users verified: Pontus Åkerhage `712020:01a218e5-6b15-4692-8096-c26687dca3f8`; Codex `712020:3ed8efb7-32c8-4b70-a72e-b7764cdb7802`

## Current Objective

- Current completed checkpoint: KAN-5 `3B.5 Undo SIE VAT guard`.
- KAN-5 Jira status: `In Review`.
- KAN-5 was permanently installed in live Supabase, verified, committed, and pushed in `2efdfa1`.
- Pontus final IRL/review remains before KAN-5 should be moved to `Done`.
- Next engineering task after handoff, if Pontus approves starting it: KAN-6 `3B.5 Import SIE VAT guard`.
- Do not start KAN-6 without explicit instruction.

## KAN-5 Verification Snapshot

- Migration file: `supabase/migrations/20260917_add_vat_guard_to_undo_sie_import.sql`
- Migration SHA-256: `6176E76A30A9A38E010260542B299036B457FE1607C17BB2532D148C27EA3597`
- Live `public.undo_sie_import_atomic(uuid)` now contains the KAN-5 VAT pre-scan, transaction fingerprinting, VAT locks, deterministic row locks, authoritative VAT recompute, and SoloLedger closed/declared VAT-period guard.
- Functional rollback DB tests against live: 10/10 PASS.
- Post-test live verification: clean.
- Permanent post-install read-only verification: PASS.
- Concurrency A/B test designs were completed and reviewed, but not empirically run. Do not mark them PASS.
- Deferred concurrency reason: safe crash-proof two-session isolation cannot be guaranteed against live production with the current environment. Run A/B later in an isolated Supabase branch/test project.

## Verified / Implemented VAT Context

- Already implemented and tested guards: `book_transaction_atomic`, `book_periodized_transaction_atomic`, `create_correction_transaction_atomic`, and `undo_sie_import_atomic`.
- Repo migration `20260917_add_vat_concurrency_helpers.sql` defines VAT sync scope as `261x`, `262x`, `263x`, exact `2641`, and `265x`.
- Closing balance scope is `261x`, `262x`, `263x`, exact `2641`; `265x` is synchronization/state safety scope, not closing balance scope.
- VAT locks are transaction-level PostgreSQL advisory locks per calendar month, independent of VAT period type.
- Multi-month VAT locks are taken in chronological calendar order.
- Global lock order: all VAT advisory locks -> other advisory locks -> row locks -> protected reads/writes.
- VAT period blocking applies to `source = 'sololedger'` and status `closed` or `declared`; `imported_history` does not block.
- Authoritative closed state must not be inferred from 265x activity.

## Decided Design Not Yet Implemented

- KAN-6 `import_sie_batch` VAT guard should use two passes: read-only payload scan, collect all VAT-relevant calendar months, take VAT locks chronologically, check SoloLedger-managed VAT period state, then take the existing opening-balance advisory lock, then write.
- KAN-7 `close_vat_period_atomic()` should be atomic, create a real `transactions` row with `source = 'vat_closing'` and journal rows when closing activity exists, use `period_end` as verification date, and base period membership/balances on `journal_entries.date`.
- `close_vat_period_atomic()` must set `status = 'closed'`, set `closing_amount`, set `closing_transaction_id` when a closing verification exists, and must not set `declared_at`.
- Special VAT close cases remain as previously decided: no activity means no artificial verification; exact net 0 with activity creates a real closing verification; already-zeroed relevant balances with activity blocks for manual review.
- KAN-8 handles declared VAT period state: `open -> closed -> declared`.
- After the VAT track reaches a safe checkpoint, return to Kontoplan guidance for enskild firma users.

## Next Safe Step

- Review this handoff-state update.
- If approved, commit only:
  - `PROJECT_STATE.md`
  - `PROJECT_ARCHIVE.md`
- Suggested commit message: `docs: update handoff after KAN-5 checkpoint`
- Do not deploy, run migrations, start KAN-6, or work on any other Jira task without explicit approval.
