# SoloLedger Project State

Last updated: 2026-09-18

## Repository State

- Worktree: `C:\Users\Familjedator\Desktop\Sololedger Multi User App\sololedger_multi_user`
- Branch: `main`
- Git remote/origin previously verified as `https://github.com/sololedger/sololedger.git`
- Latest pushed checkpoint commit: `a413843 docs: persist VAT roadmap and project handoff`
- Local `main` is synced with `origin/main` except for current uncommitted KAN-5 files.
- Current uncommitted files:
  - `supabase/migrations/20260917_add_vat_guard_to_undo_sie_import.sql`
  - `PROJECT_STATE.md`

## External Connections

- Supabase project ref `wbaxmuvudpnkvuliicuy` is accessible.
- Vercel team slug `sololedger1` was verified as accessible, but Vercel project slug `sololedger` was not verified through the plugin.
- Jira cloud ID: `42c6216d-73c5-4777-a644-c41ef9bc6a1a`
- Jira project: `KAN` / `Sololedger`, project ID `10001`
- Jira statuses: `To Do` (`10004`), `In Progress` (`10005`), `In Review` (`10006`), `Done` (`10007`)
- Jira users verified: Pontus Åkerhage `712020:01a218e5-6b15-4692-8096-c26687dca3f8`; Codex `712020:3ed8efb7-32c8-4b70-a72e-b7764cdb7802`

## Current Objective

- Current Jira issue: KAN-5 `3B.5 Undo SIE VAT guard`
- Jira status: `In Progress`
- Current phase: KAN-5 migration permanently installed and verified; checkpoint approval pending.
- 3B.5 order remains: `undo_sie_import_atomic` -> `import_sie_batch` -> `close_vat_period_atomic`.
- Exact next KAN-5 step: commit/push this checkpoint, then move KAN-5 to `In Review`.
- Next engineering task after the KAN-5 checkpoint is KAN-6 `3B.5 Import SIE VAT guard`; do not start it without explicit instruction.

## KAN-5 Migration Candidate

- Candidate file: `supabase/migrations/20260917_add_vat_guard_to_undo_sie_import.sql`
- Candidate SHA-256 after final comment-only promotion: `6176E76A30A9A38E010260542B299036B457FE1607C17BB2532D148C27EA3597`
- Executable SQL definition is unchanged from the version that passed functional rollback testing; only the top comment was changed after tests.
- Permanent live installation completed after explicit approval.
- Direct post-install read-back verified the live `public.undo_sie_import_atomic(uuid)` definition contains the KAN-5 VAT pre-scan, transaction fingerprinting, VAT locks, deterministic row locks, authoritative VAT recompute, and SoloLedger closed/declared VAT-period guard.

## KAN-5 Verification Status

- Live `public.undo_sie_import_atomic(uuid)` was verified before KAN-5 as the older deployed function without VAT advisory locks and without the new VAT period guard.
- Candidate implements:
  - read-only pre-scan before row locks;
  - VAT month discovery using current undo date semantics `greatest(current_date, original.date)`;
  - VAT advisory locks before row locks;
  - batch row lock/revalidation;
  - deterministic transaction row locks;
  - transaction count and fingerprint revalidation over `id`, `date`, `source`, `import_batch_id`;
  - deterministic original `journal_entries` row locks after transaction row locks;
  - authoritative VAT-date recompute;
  - SoloLedger VAT period guard blocking `source = 'sololedger'` periods with status `closed` or `declared`;
  - existing full-batch validation and undo/correction semantics.
- Functional rollback DB tests against live: 10/10 PASS.
- Post-test live verification: clean.
- Permanent post-install read-only verification: PASS.
- Post-install metadata verification found expected function grants, RLS enabled on relevant tables, existing policies, constraints, and indexes; no unexpected KAN-5 schema objects were found.
- Functional tests covered non-VAT success, VAT open success, closed/declared block, `imported_history`, multi-month VAT, success side effects/mirror semantics, negative atomicity, second undo, and year-lock for the actual correction year.
- Testuser used for rollback tests: `47d6e49f-a595-4292-9529-78ba731bd9de`.
- Post-test verification confirmed no fixture batches/transactions/journal entries/vat periods/closed years remained, testuser `ver_nr_sequences.last_ver_nr` returned to baseline, and live RPC reverted to the pre-KAN-5 definition.

## KAN-5 Concurrency Status

- Concurrency A/B test designs completed and adversarially reviewed with no BLOCKER/IMPORTANT findings in the design.
- A: transaction fingerprint/revalidation race design uses a deterministic VAT advisory-lock wait point to prove undo passed pre-scan before a competing transaction metadata change.
- B: journal-entry INSERT-after-transaction-lock design verifies the FK/parent-row-lock reasoning.
- Concurrency A/B tests were not empirically run.
- Do not mark concurrency tests as PASS.
- Deferred reason: safe crash-proof two-session isolation cannot be guaranteed against live production with the current environment because two sessions cannot share the same outer rollback transaction.
- Run concurrency A/B later in an isolated Supabase branch/test project or equivalent disposable environment.

## Verified / Implemented VAT Context

- Already implemented and tested guards: `book_transaction_atomic`, `book_periodized_transaction_atomic`, and `create_correction_transaction_atomic`.
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

- Review this checkpoint.
- If approved, commit only:
  - `supabase/migrations/20260917_add_vat_guard_to_undo_sie_import.sql`
  - `PROJECT_STATE.md`
- Proposed commit message: `KAN-5 add undo SIE VAT guard migration candidate`
- After the checkpoint is committed and pushed, move KAN-5 to `In Review`.
- Do not deploy, start KAN-6, or work on any other Jira task without explicit approval.
