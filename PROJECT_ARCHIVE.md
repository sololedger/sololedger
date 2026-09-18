# SoloLedger Project Archive

This file is for compact long-term summaries of completed or superseded workstreams.

Do not archive active work here prematurely. Current active work remains in `PROJECT_STATE.md`.

## Archived Workstreams

### KAN-5 3B.5 Undo SIE VAT Guard

- Completed checkpoint commit: `2efdfa1 KAN-5 add undo SIE VAT concurrency guard`.
- Jira KAN-5 was moved to `In Review`; Pontus final IRL/review remains before `Done`.
- Permanent live migration installed: `supabase/migrations/20260917_add_vat_guard_to_undo_sie_import.sql`.
- Migration SHA-256: `6176E76A30A9A38E010260542B299036B457FE1607C17BB2532D148C27EA3597`.
- Live `public.undo_sie_import_atomic(uuid)` now includes VAT pre-scan, transaction fingerprint revalidation, VAT advisory locks, deterministic transaction and journal-entry locks, authoritative VAT-date recompute, and SoloLedger `closed`/`declared` VAT period guard.
- Functional rollback DB tests against live: 10/10 PASS; post-test live verification clean.
- Permanent post-install read-only verification: PASS for live definition, function grants, VAT helper grants, relevant RLS/policies, constraints, indexes, and absence of unexpected KAN-5 schema objects.
- Concurrency A/B tests were designed and adversarially reviewed but not empirically run; they are deferred to an isolated Supabase branch/test environment and must not be marked PASS.

### KAN-6 3B.5 Import SIE VAT Guard

- Checkpoint files were prepared on 2026-09-18 before commit/push approval.
- Jira KAN-6 was moved to `In Review` and assigned to Pontus; Pontus final IRL/review remains before `Done`.
- Permanent live migration installed: `supabase/migrations/20260918_add_vat_guard_to_import_sie_batch.sql`.
- Migration SHA-256: `096E0825DFF11B7744C8024AF1BD64E0108AD720C54A0D1554C1913FD06BF611`.
- Live `public.import_sie_batch(jsonb)` now includes read-only VAT pre-scan, VAT advisory locks, SoloLedger VAT-period state guard before writes, duplicate check after VAT guard, and `get_next_ver_nr` only after protective locks/state guard.
- Functional/regression rollback DB tests against live: 14/14 PASS; atomicity/negative cases, outer rollback, and fixture cleanup PASS.
- Permanent post-install read-only verification: PASS. Live function md5 `13ce699a75462ce1e97cc52755a79376`, length `18408`, and grants/metadata verified.
- Empirically executed rollback test artifact before final `\ir` rename-reference SHA-256: `E807AB1BAFC6C19F19BE2DE50881A5B8B8564C0794F22036A50218EB841EFCC6`; final test file differs only by pointing `\ir` to the permanent migration filename.
- KAN-6 concurrency is DEFERRED / NOT EMPIRICALLY TESTED.
- KAN-5 concurrency remains DEFERRED / NOT EMPIRICALLY TESTED.
