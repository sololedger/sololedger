# SoloLedger Project State

Last updated: 2026-10-15. KAN-74 isolated local release checkpoint C; leader-authorized commit only. Ready for separate Staging decision. No push/deploy/hosted writes authorized.

## Current Objective / Next Step

- Branch codex/KAN-74-release-checkpoint in C:/Users/Familjedator/.codex/worktrees/kan74-release-checkpoint/sololedger_multi_user. The commit containing this state is checkpoint C; obtain its exact SHA from git log. Its sole parent is verified Production base 1d297c1fd387be2f3f6cd54a780b8c58c2901732.
- Current checkpoint report and exact 27-file manifest: docs/checkpoints/KAN-74-local-release-checkpoint.md. Approved implementation/design/history and isolated release plan remain under docs/reviews/.
- Next: leader approval of exact checkpoint and separate Staging integration/publication. Only C delta may be transferred to a separate S based on then-verified origin/staging. Never merge all staging/S into main; KAN-62/65 remain held.
- No push, hosted migration/data write, Vercel/Edge deploy or Jira mutation in this checkpoint task. Separate exact approvals required for every publication/write step, including Staging tests. KAN-74 is not Done.

## Scope / Safety

- Mandatory original-file /api/sie/import server parser -> private short-lived receipt -> receipt-only import_sie_batch. Reviewed product, SQL and tests copied without implementation change from codex/KAN-74-sie-opening-guard.
- Exactly three new migrations: 20261015115900 -> 20261015120000 -> 20261015121000. Receipt lifecycle includes delete_user_data_atomic, admin counts and updated supabase/functions/delete-user/index.ts with residual check.
- One-calendar-year policy, period validation, FOR SHARE NOWAIT company pinning, same-year duplicate rules, KAN-71 and atomic receipt consumption preserved. 4,000,000 original bytes, 4,065,536 total multipart body bytes, 50,000 journal rows, max 10-minute receipt.
- No balance/NE/export/year-locking/fixed-asset behavior change, no historic data repair, no package-lock or permanent AGENTS/Architecture/archive changes. Historical analysis docs are retained as provenance.

## Verification

- Fresh isolated worktree: npm ci --offline --ignore-scripts, build, separate typecheck, npm test (domain/SIE/server/client/admin/invariants), focused lint and public localhost Playwright 2/2 PASS. Dummy config only; no env/Auth/credential files copied.
- SQL/race tests not rerun for byte-identical isolation. Prior approved evidence retained: 66 rollback, 18 two-session, two isolation denials, five existing SQL regression suites and five real server-parser/local-RPC fixtures incl 50,000 rows.
- Fresh Production/Staging live comparison and Direct IPv6/TLS/read-only startup/reset in psql and CLI 2.120.0 PASS earlier today. lock_timeout 5000/5000, statement_timeout 120000/120000. Production ledger 41, Staging 43. No hosted queries repeated for checkpoint.
- Three proposal SQL hashes unchanged since independent PASS and live comparison. Existing broader Staging helper EXECUTE/MAINTAIN grants, two held KAN-62 ledger entries and three old SQL-history representation differences remain documented, not repaired.
- Full lint not rerun; known pre-existing repo-wide/Edge lint debt retained. No new diagnostics in focused check.

## Preserve Other Work / Release Boundaries

- All 14 prior worktrees/HEAD/branches/status/staged changes and checked dirty/untracked file fingerprints are preserved. The source KAN-74 worktree remains dirty and entirely unchanged; checkpoint is a separate copy, not cleanup or history rewrite. This is the fifteenth worktree.
- Canonical local staging/docs commit 11d8306442320430557b37d1003c342857d10fc2, its audit-packages/ and scripts/create-kan63-staging-user.mjs, all KAN-62/65 work and original env/Auth/ignored files remain untouched.
- Remote main verified at 1d297c1 and staging at a47a57d. Neither main nor staging was moved. Checkpoint is a single main-based local commit, no held branches merged. No upstream/push configured by this task.
- Future Staging runner must contain its 43 already-applied originals + only three KAN-74 files; no historical replay/repair. Import/admin-delete pause, DB order, delete-user Edge, same-artifact route/client and approved acceptance remain mandatory.
- Evidence: C:/Users/Familjedator/.codex/visualizations/2026/10/15/01a13dfa-6f68-7063-b1dc-9ca3f87c2006/kan74/checkpoint/. Prior company-lock/ and home-live/ evidence retained. Final commit/status/preservation checks are recorded externally after commit to avoid a self-referential SHA.

Await leader approval. This local checkpoint is not a pushed release or a completed Staging acceptance.
