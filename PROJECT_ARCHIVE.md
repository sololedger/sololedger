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
