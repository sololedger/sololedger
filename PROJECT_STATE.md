# SoloLedger Project State

Last updated: 2026-10-15. KAN-74 controlled Staging release authorized; preparation in progress. No Production publication is authorized.

## Current Objective

- Separate branch codex/KAN-74-staging-release based on verified origin/staging a47a57d07fd76520034f02fc4ced4f67dc35caa2. Only approved checkpoint C 8692f0566feab0978976143d51fd5d1ed91daa19 is integrated. This candidate S retains pre-existing Staging KAN-62/65; it must NEVER be merged to main.
- Clean Production candidate C remains at its original worktree and parent 1d297c1fd387be2f3f6cd54a780b8c58c2901732. All other worktrees and uncommitted changes are preserved.
- User authorizes only the three KAN-74 Staging migrations, delete-user Edge, coordinated application publication, and bounded synthetic acceptance tests. No Jira mutation, unrelated repair, Production write/push/deploy, or automatic rollback.

## Exact Release Scope / Next Step

- docs/checkpoints/KAN-74-local-release-checkpoint.md records the 27-file checkpoint manifest; docs/reviews/KAN-74-staging-release-plan.md records the reviewed procedure. PROJECT_STATE is the only expected documentation merge conflict; product/SQL/test blobs remain identical to C.
- Apply only 20261015115900 -> 20261015120000 -> 20261015121000 after fresh preflight and a quiet import/admin-delete window. Official CLI 2.120.0 Direct/TLS/IPv6, startup/reset lock_timeout 5000 and statement_timeout 120000. Existing Staging ledger 43 must be preserved; expected final 46.
- Deploy reviewed delete-user Edge, then same-artifact route/client through only origin/staging; reload old tabs. Reject old free JSON; do not restore the unsafe RPC on failure.
- Check valid one-year import, blocked multiyear and invalid RAR, duplicate, manual booking, KAN-71, receipt isolation/replay, import errors and complete deletion using only disposable Staging users. Stop on any publication failure.
- Fresh preflight PASS: unchanged 43 ledger, RPC bodies/owners/grants, schema/RLS and Direct/CLI timeouts/session. Checkpoint C clean/exact. Integration tests and publication/acceptance are pending; do not infer PASS from this preparatory state.

## Preserved Boundaries

- KAN-62/65 remain held for Production. Their two already-applied Stage migrations are runner history only and must not replay. No main synchronization or unrelated grant repair.
- Mandatory original-file server parser, private max-10-minute receipt, receipt-only import and company row lock preserved. 4 MB file / 4,065,536 total body, 50,000 rows; conservative single-year history and KAN-71 unchanged.
- Evidence and final publication status: C:/Users/Familjedator/.codex/visualizations/2026/10/15/01a13dfa-6f68-7063-b1dc-9ca3f87c2006/kan74/staging-release/.

Await leader decision about Production after Staging verification.
