# SoloLedger Project State

Last updated: 2026-10-14. KAN-71 independent review PASS reported by Pontus; local checkpoint authorized, no push.

## Current Objective / Next Safe Step

- Pontus reports independent after-review PASS for the complete KAN-71 candidate. Implementation/review phase is finished; no further review loop without a concrete new finding. Current task: local checkpoint, isolated Staging release preparation and durable handoff.
- Branch: codex/KAN-71-sie-vat-periods.
- Worktree: C:/Users/Familjedator/.codex/worktrees/kan71-sie-vat-periods/sololedger_multi_user.
- Implementation base: d67db203c0d270aadbaa276c03eaa23ea48838bc, verified Production KAN-72 release. The authorized local checkpoint includes exactly the KAN-71 files below; its commit is the containing implementation commit. KAN-62/65 excluded.
- Freshly fetched origin/staging: 9ff22b45cc7b72e14d26a3d13a97219476965097; origin/main: d67db203c0d270aadbaa276c03eaa23ea48838bc. Canonical local staging is older/different documentation history and MUST NOT be the release base.
- Read-only Staging ledger fzxqiqenqjzhlyxxpvhg: exactly 40 versions, matching origin/staging repository versions/names, latest 20261014123000. The three KAN-71 versions sort after all 40 in order 20261014162850 -> 20261014171038 -> 20261014174218.
- Review/runbook: supabase/tests/KAN71_SIE_VAT_PERIODS.md. Exact hosted migration/publish/test-write steps need separate approval.
- Jira KAN-71 last read: Bug / High / To Do / unassigned. No Jira mutation; task tracking is unchanged by this checkpoint. PASS is Pontus's supplied independent-review verdict.

## Candidate / Accounting Surface

- Original and undo VAT rows contribute with correct signs by journal date; undone batch status no longer deletes report contributions.
- Entire relevant undone batch/period evidence is loaded across period/year boundaries. Uncertain/cross-period historical undo blocks safe withdrawal and new automatic UI close/declaration decisions.
- Closed/declared reports explicitly show current journal reconciliation separately from the preserved stored closing amount; no historical declaration is silently claimed/repaired.
- Migration 20261014162850_kan71_sie_undo_vat_period_guard.sql changes only undo_sie_import_atomic and close_vat_period_atomic, preserving identity/ACL boundaries.
- New review migration 20261014171038_kan71_sie_correction_period_guard.sql guards generic corrections and legacy manual-source SIE descendants through existing corrects_ver_nr provenance. Same-open-period corrections remain valid; closed/declared/other-period/year-crossing/ambiguous SIE paths fail atomically. Private lineage helper has no anon/authenticated EXECUTE.
- Report/dashboard reconciliation now compares EVERY affected closed/declared period with its stored amount, even without undone imports and when annual differences cancel. Difference or incomplete evidence blocks safe withdrawal; no historical state is changed.
- Undo locks original journal + correction months, rechecks state after locks, requires exactly the same verified open SoloLedger period, and rejects ambiguous reverse VAT, year crossing and locked years.
- Close blocks new decisions on unsafe legacy undone SIE evidence or ambiguous SIE reverse VAT. Historical closing amounts/rows/declaration state stay unchanged.
- Third migration 20261014174218_kan71_legacy_sie_correction_history_guard.sql reuses sie_correction_lineage for all tenant VAT corrections, including manual/no-batch descendants outside the report/year. The authenticated read RPC and post-month-lock new-close guard share one verdict. Cross-period/year, missing/overlapping/imported periods and ambiguous reverse VAT require review. Valid ordinary manual and same-period SIE chains remain valid.
- Report/dashboard consume the authoritative verdict even when a stored original close matches its journal; warning blocks automatic close/declaration UI and safe withdrawal. Missing/failed RPC fails closed. Already closed/declared DB behavior stays intact. Deploy migration BEFORE application code after separate approval.
- Provenance uses is_correction/corrects_ver_nr and user-scoped journal ver_nr to a preserved SIE source, never descriptions/amount guesses. Broken/ambiguous VAT lineage blocks the user's history-dependent decisions conservatively without classifying it as SIE. Fully erased provenance cannot be reconstructed/distinguished from a legitimate manual origin.
- No new table/domain, RLS/grant expansion, deletion lifecycle, SIE export, NE, invoice, year-close or KAN-62/65 logic change.
- Full historic SKV field snapshots were not stored. This patch labels reconciliation; no new snapshot persistence/backfill is added.

## Verification / Limits

- Local DB sololedger_kan71_candidate_20261014 / localhost:5432 / ::1: separate data-empty copy of KAN-71 reproduction DB, relevant exact live definitions/helpers. Existing local DBs preserved.
- Fifteen rollback SQL scenarios and thirteen actual RPC-source report assertions PASS. Existing manual-review close guard for all-zero VAT activity retained/tested.
- Three two-session races PASS with observed advisory waits: close then undo, undo then close, two undos.
- Latest review DB: sololedger_kan71_review_20261014 / localhost:5432 / ::1, schema-only copy plus exact live correction/security context. Earlier DBs preserved. 20 authenticated generic correction/lineage scenarios PASS; seven authenticated two-session races PASS, including lock on original's older month; both migrations preserve existing synthetic historical rows.
- Migration preserves existing synthetic accounting/history/closing state PASS; balance, immutable originals, atomic failure, auth/tenant and duplicate undo checks PASS.
- New domain/loader/report/dashboard/safe-withdrawal/SIE/NE regression included in test:domain; complete domain coverage PASS.
- Typecheck, changed library/test lint and diff check PASS. React/test lint comparison: zero new diagnostics; ProfileSettings retains 12 existing diagnostics.
- Public Playwright Chromium smoke 2/2 PASS via one documented process-only Webpack fallback. Default test:regression FAILED at Turbopack startup on the local dependency junction after domain PASS; do not call that literal command green.
- Latest domain suite/typecheck/targeted lint and established Webpack public smoke 2/2 PASS. Independent after-review PASS reported by Pontus. Not run: authenticated feature-browser/write E2E, full lint cleanup, Production build or Staging acceptance. Release-candidate build/local integration checks follow in the isolated Staging worktree; manual checklist is in the runbook.
- No whole-hosted-schema/data parity claim. Relevant live RPC/RLS/ACL/constraints/indexes inspected read-only.
- SQL fixtures roll back; six NEW synthetic concurrency users remain in this dedicated candidate DB. Existing fixtures/users/history untouched.
- Review serial fixtures roll back; 14 new synthetic race users retained only in the new review DB. Final evidence review-full-db-tests.log and C:/Users/FAMILJ~1/AppData/Local/Temp/sololedger-kan71-TOursX/.
- Latest isolated DB sololedger_kan71_history_20261014 / localhost:5432 / ::1: schema-only copy of review DB, no data copied/old DB repair. 16 legacy history/direct-close rollback cases and 19 actual DB-verdict/report/safe-withdrawal snapshots PASS; includes Q2/Q3 closed/declared originals, no batch, multihop, ordinary manual, same open/closed period, year crossing (also one malformed spanning period), uncertain reverse VAT, missing/overlap/imported periods, orphan/foreign lineage, auth/ACL/tenant isolation.
- Complete latest DB runner PASS: 15 original + 20 generic + 16 legacy SQL scenarios, 13 + 19 report assertions, seven observed two-session races. Migration preserves nonempty existing synthetic state exactly; close body differs only by new post-lock read guard. Latest full domain/typecheck/targeted lint/diff checks and public Webpack Chromium smoke 2/2 PASS. Default Turbopack limitation and authenticated browser/Staging gaps remain.
- Latest DB evidence C:/Users/FAMILJ~1/AppData/Local/Temp/sololedger-kan71-KnnkmC/. Serial scenarios roll back; 14 NEW synthetic race users remain in this new DB after two passing runs. Earlier databases, users and historical fixtures untouched.
- Evidence: C:/Users/Familjedator/.codex/visualizations/2026/10/14/01a13b30-3ccb-7de2-9f6b-a07a4c753484/kan71/ and C:/Users/FAMILJ~1/AppData/Local/Temp/sololedger-kan71-XtlFbD/.

## Exact Local Checkpoint Scope

- Modified: package.json; scripts/test-dashboard-calculations.ts, test-vat-report-aggregation.ts, test-vat-report-service.ts; src/components/Momsrapport.tsx, ProfileSettings.tsx; src/lib/dashboardVat.ts, legacyVatInference.ts, vatReportAggregation.ts, vatReportPresentation.ts, vatReportService.ts; this state file.
- New: scripts/test-sie-vat-periods.ts, run-kan71-local-regression.mjs; src/lib/sieVatHistory.ts; migration above; supabase/tests/kan71_sie_vat_period_guard.sql, kan71_concurrency_fixture.sql, KAN71_SIE_VAT_PERIODS.md.
- Review adds second migration above and supabase/tests/kan71_generic_sie_correction_guard.sql; existing report/dashboard tests and local runner extended. All earlier candidate files preserved.
- Latest follow-up adds third migration above and supabase/tests/kan71_legacy_sie_history_guard.sql; extends vatReportService.ts, sieVatHistory.ts, test-vat-report-service.ts, test-sie-vat-periods.ts, local runner and runbook. Earlier changes preserved; no KAN-62/65 edit.
- Exactly 23 KAN-71 files are authorized for the local checkpoint: 12 previously modified and 11 new as listed above. No env/auth/evidence/generated files. package-lock.json, AGENTS.md, next-env.d.ts and all KAN-62/65 files unchanged.
- node_modules is a local junction to existing dependencies; no dependency install/change. Generated .next/test results ignored.
- Superseded KAN-72 operational history is in canonical PROJECT_ARCHIVE.md; old worktree pre-release state is replaced here, not used as current truth.

## Preserve / External Boundaries

- Canonical docs: C:/Users/Familjedator/Desktop/Sololedger Multi User App/sololedger_multi_user. Its staging HEAD e639347 and untracked audit-packages/ and scripts/create-kan63-staging-user.mjs preserved. Its already-dirty state doc points here.
- All older KAN-48/KAN-63/KAN-72 worktrees retained. KAN-72 staging-integration dirty state and KAN-63 migration-prep two untracked KAN-62 migrations untouched.
- Production wbaxmuvudpnkvuliicuy / Staging fzxqiqenqjzhlyxxpvhg: no hosted writes/migration, deploy, env change, data repair, push or Jira mutation. Local KAN-71 checkpoint/release-candidate commits are explicitly authorized by the current request.
- KAN-62/65 remain ON HOLD; other backlog findings out of scope.
- Next: prepare isolated release candidate FROM fetched origin/staging, preserving its complete existing changes including KAN-62/65. Record exact checkpoint/candidate hashes and local integration/build results in release PROJECT_STATE.md. Then stop for separate leader approval of exact Staging migration, push/deploy and dedicated test writes. No further code review is required absent concrete new findings.
