# KAN-71 – local review candidate

2026-10-14. Branch: codex/KAN-71-sie-vat-periods. Base: d67db203c0d270aadbaa276c03eaa23ea48838bc (verified Production release).
Local checkpoint and isolated release-candidate commits are now explicitly authorized by Pontus. No push, hosted DB write/migration, deploy or historical data repair is authorized/performed. KAN-62/65 are excluded from implementation changes.

## Latest status: independent after-review PASS, local Staging preparation

Pontus reports PASS for the final independent after-review. Implementation/review phase is complete; no further review loop without concrete new findings. Prepare the release from freshly fetched origin/staging 9ff22b45cc7b72e14d26a3d13a97219476965097, preserving all Staging changes including unchanged KAN-62/65. Read-only hosted Staging ledger was reverified: 40 matching repository migration versions/names through 20261014123000. KAN-71 adds versions 41-43 in exact order 20261014162850, 20261014171038, 20261014174218. See release-candidate PROJECT_STATE.md for final hashes, integration tests/build and approval boundary.

## Latest implementation: legacy manual SIE history P1

Pontus reported that the generic-RPC bypass is verified closed. Remaining P1 was Q2/Q3: a manual-source correction without import_batch_id escaped report history and NEW close checks, even when Q2 journal matched its preserved stored close.

Third migration: 20261014174218_kan71_legacy_sie_correction_history_guard.sql, created with official CLI 2.120.0. Earlier migrations are unchanged.
- Reuses sie_correction_lineage: is_correction/corrects_ver_nr follows tenant-owned journal ver_nr to an actual SIE source. It scans descendants across periods/years so original AND correction reports see unsafe chains. Neither import_batch_id nor description/amount heuristics are required.
- Shared private read helper rejects cross-period/year chains, missing/overlapping/imported period evidence and uncertain reverse VAT. Valid ordinary manual chains return no SIE classification; valid same-period SIE chains remain supported. Cyclic/orphan/ambiguous VAT provenance conservatively requires review for the user, without inventing an SIE origin. Completely erased source/link metadata is indistinguishable from legitimate manual bookkeeping; no historical reconstruction is attempted.
- Authenticated get_sie_vat_history_review(date,date) derives auth.uid, returns only a boolean and cannot inspect another tenant. No anon/private helper EXECUTE or table/RLS expansion. No persistent domain or deletion lifecycle change.
- Report/dashboard share the DB verdict. Missing/error/nonboolean RPC response blocks calculations; unsafe history shows the Swedish separate-handling warning and safe withdrawal=0. Report signs/amounts and existing UI close/declaration gates remain as reviewed.
- close_vat_period_atomic uses the SAME read helper AFTER existing VAT month locks and open-state checks. Direct authenticated calls cannot bypass it. Its previous candidate body is otherwise identical. Existing closed/declared behavior and stored closing/declaration/journal data are preserved.

Latest verification PASS:
- 16 new rollback scenarios: Q2/Q3 with closed, declared or open original; manual no-batch chain; multihop; ordinary manual; same open/closed period; year crossing, including malformed spanning-period definition; reverse VAT; missing/overlap/imported period; orphan and foreign-ver linkage. Direct close, auth/ACL/tenant and unchanged history assertions included.
- 19 actual DB verdict/journal snapshots verified by production report and dashboard/safe-withdrawal code; Q2=250, Q3=-250, annual=0 all require review for unsafe SIE history. Ordinary manual remains usable.
- Complete runner PASS: 15 original + 20 generic + 16 legacy SQL scenarios, 13 + 19 report assertions, seven real authenticated two-session advisory races. Reapplying migrations over nonempty synthetic closing/accounting history preserves it exactly.
- Full domain suite, typecheck, targeted changed-file lint and diff check PASS. Public Chromium smoke 2/2 PASS with established process-only Webpack fallback. Authenticated feature-browser/Staging acceptance and production build are not run; known literal Turbopack test:regression limitation remains.

Isolated local DB sololedger_kan71_history_20261014 / localhost:5432 / ::1 is a new schema-only copy of the review DB; no user data copied and no old fixture repaired. Serial fixtures roll back; two passing full runs retain 14 NEW synthetic concurrency users only in this new DB. Earlier DBs untouched. Latest evidence: C:/Users/FAMILJ~1/AppData/Local/Temp/sololedger-kan71-KnnkmC/ and history-migration-preservation.log in the evidence folder.

Independent after-review now PASS per Pontus; Staging publication remains unauthorized. After exact leader approval, apply all three migrations in order BEFORE application publication; the new read RPC is mandatory and unavailable RPC intentionally fails closed. No shared execution is performed/authorized here.

## Previous: generic RPC BLOCKED review remediation

Pontus reported P1: generic create_correction_transaction_atomic could correct an SIE original from a closed/declared period into another open period. Reproduced using the exact live RPC as authenticated, in a fresh local schema-only copy: closed original retained 250, but the RPC created a correction. All reproduction writes rolled back.

Second migration: 20261014171038_kan71_sie_correction_period_guard.sql (official CLI 2.120.0). Original KAN-71 migration is unchanged. No new transaction source or persistent table/column is added.
- The generic RPC now protects SIE provenance through existing corrects_ver_nr/journal linkage, including older corrections stored as manual. It discovers all original/ancestor journal 26xx months plus correction month before locks, revalidates ancestry/dates after locks, and requires exactly the same verified open SoloLedger period for every relevant row. Unknown/orphan/cyclic ancestry fails closed.
- Authenticated direct calls cannot correct closed/declared/other-period/year-crossing/ambiguous SIE VAT. Same-open-period SIE corrections and legitimate ordinary manual corrections remain supported. Source/history/closing/declaration fields are not rewritten.
- Internal SECURITY INVOKER lineage helper is unavailable to anon/authenticated; the existing authenticated RPC keeps server-derived auth.uid, ownership filtering, SECURITY DEFINER and fixed search_path. No table grants/RLS changes.
- Non-blocking reconciliation finding is fixed in the existing report service: stored closed/declared amounts are checked against journal-based reports PERIOD BY PERIOD. Annual matching totals cannot hide offsetting differences. Missing/partial/invalid reconciliation evidence also blocks safe withdrawal. The UI receives the same flag; no automatic historic repair occurs.

Latest verification PASS:
- 20 direct authenticated correction cases: same open period; same/older closed and declared periods; other period; year crossing; journal date differing from transaction date; ambiguous reverse VAT including 2645 alone; missing/overlapping/imported-history periods; ordinary manual current/older/no-VAT corrections; open/closed descendants; legacy manual-source descendant; orphan correction.
- The original 15 undo/closing SQL cases and 13 real source-report assertions also pass with both migrations.
- Seven observed two-session advisory races: the original three undo races, close then generic correction, generic correction then close, duplicate generic correction, and closing the older ORIGINAL period while correction targets the current month. Calls run as authenticated. Exactly one atomic outcome; blocked paths consume no correction/sequence or historical mutation.
- Both migrations reapplied over existing synthetic closing/accounting state preserve that state exactly.
- Reconciliation tests cover a mismatch without undone imports, matching amounts, annual offsetting mismatches, partial-period uncertainty, real loader integration and safe withdrawal=0.
- Full domain suite, typecheck, targeted lint and public Chromium smoke 2/2 (the established process-only Webpack runner) pass. No new browser infrastructure/config/dependency change.

Fresh local DB: sololedger_kan71_review_20261014 / localhost:5432 / ::1. Schema-only copy plus exact read-only live correction/classification/trigger definitions. Earlier candidate/reproduction DBs remain unchanged. Serial fixtures roll back; two full runner executions retain 14 NEW synthetic concurrency users in this review DB.
Evidence: review-*.log/json/sql in the existing evidence folder; final runner output review-full-db-tests.log and C:/Users/FAMILJ~1/AppData/Local/Temp/sololedger-kan71-TOursX/.
Remaining acceptance: targeted independent re-review, authenticated browser/manual Staging acceptance and hosted build. The earlier literal Turbopack test:regression failure remains an environment limitation, not a green command. No hosted action is authorized.

The sections below retain the initial candidate design/evidence; the additional migration and latest results above supersede its two-RPC/three-race scope.

## Change and accounting boundaries

- The global undone-batch filter is removed from legacyVatInference. Original/undo rows contribute with signed VAT amounts according to journal_entries.date. Native VAT V2, customer-invoice classification and settlement exclusions are preserved.
- The report loader reads the complete relevant undone batch, including counterpart rows outside the selected period/year. It verifies actual VAT period membership. Cross-period, missing-period or overlapping historical undo is explicitly marked for review even when the annual net is zero.
- Dashboard uses that review flag to block safe withdrawal. The report retains signed reconciliation amounts; it does not hide those rows or claim a corrected tax declaration.
- Closed/declared reports explicitly label displayed amounts as current journal reconciliation. Stored closing_amount is displayed separately. A review flag or difference against the stored amount disables new close/declaration actions in the UI.
- Profile undo confirmation explains same-open-period and historical/manual handling. DB errors provide the authoritative Swedish stop reason.

Migration: 20261014162850_kan71_sie_undo_vat_period_guard.sql, generated with official Supabase CLI 2.120.0.
Only undo_sie_import_atomic(uuid) and close_vat_period_atomic(uuid) definitions/grants change:
- Undo locks ORIGINAL JOURNAL months plus correction months before batch/transaction/journal row locks. It revalidates lock coverage after locking.
- Every original 26xx row and its correction must belong to exactly one identical open SoloLedger VAT period. Relevant period rows are locked before checking state.
- Missing/overlapping/imported-history/closed/declared periods, year crossing/locked years and ambiguous 2614/2624/2634/2645 stop the whole batch before correction writes or verification-number consumption.
- Close retains its existing closed/declared behavior. Only NEW closing decisions are additionally blocked for existing cross-period legacy undone batches and ambiguous SIE reverse VAT.
- Existing original/correction journal rows, closing journals, closing amounts, declaration marks/dates, tax settlements and payments are never rewritten by the migration.
- Anonymous/PUBLIC execution remains denied; authenticated/service_role/postgres execution remains explicitly granted. auth.uid ownership checks and SECURITY DEFINER/search_path settings remain.
- No new table/column/domain, RLS change, historical migration edit, attachment/storage change or deletion lifecycle change.

## Verified evidence

Read-only Production inspection: pg_get_functiondef for undo/close/ensure/declare, RPC ACL, related table grants/RLS/policies/indexes and prior relevant constraints.
Historical code/live-definition mismatch in the old local DB was handled in the separate reproduction DB before this implementation. No existing local DB was repaired or replaced.
Local candidate: sololedger_kan71_candidate_20261014, localhost:5432, ::1, cloned from the data-empty KAN-71 reproduction DB. This is targeted behavior verification with actual relevant live RPC copies, not a claim of full hosted schema/RLS parity.

PASS:
- Fifteen rollback SQL scenarios: same-period undo before close; full cancellation/all-zero VAT activity; after close; after declaration; period crossing; year crossing; journal row year differing from transaction year; no period; overlap; imported_history; reverse VAT; no-VAT undo; locked year; existing declared legacy undo; existing open legacy undo.
- Duplicate undo, balanced journals, immutable originals, foreign/unauthenticated batch denial, readable stop reason and atomic unchanged-state assertions.
- Thirteen real RPC-generated source snapshots processed by production report/aggregation code: signed reconciliation and historical-review assertions.
- Three two-session races, with observed advisory lock waits: close wins -> undo fails/no correction, undo wins -> close uses remaining independent VAT, duplicate undo -> one correction only.
- Reapplying the migration over synthetic existing closed/declaration/accounting state leaves all period/transaction/journal/batch rows identical.
- New domain/loader regression: signed periods, full-year zero masking, prior year, missing/overlapping period, tenant scope, unsafe reverse VAT, safe withdrawal, NE/result and SIE retention.
- Complete existing test:domain coverage (including the new test), TypeScript, changed library/test lint, git diff --check.
- Changed React/test lint comparison: no new diagnostics. Momsrapport 0; ProfileSettings 12 existing diagnostics before/after.
- Public Playwright Chromium smoke 2/2 passed using documented process-only --webpack fallback.

Important limitation: the literal npm run test:regression attempt completed domain tests but FAILED at Turbopack server startup because the worktree's node_modules junction points outside its filesystem root. One bounded diagnostic used --webpack and ran the same public smoke tests successfully. No project config/dependency/env file was changed. Do not label the default Turbopack command green.
Authenticated feature-browser E2E, full lint cleanup, Production build and Staging acceptance are not completed. Initial independent review was reported BLOCKED; latest local remediation awaits targeted independent re-review. Full pre-existing lint debt is out of scope.

Evidence:
- C:/Users/Familjedator/.codex/visualizations/2026/10/14/01a13b30-3ccb-7de2-9f6b-a07a4c753484/kan71/
- Final DB runner evidence: C:/Users/FAMILJ~1/AppData/Local/Temp/sololedger-kan71-XtlFbD/
- SQL fixture writes roll back. Two successful DB runner executions retain six NEW synthetic concurrency users in the dedicated candidate DB. Existing databases/fixtures/users were preserved; these are not production-derived data.
- The earlier reproduction fixtures/results are preserved separately and deliberately represent the pre-fix behavior.

## Local execution

Use the established local PostgreSQL 17 client and process-local PGPASSFILE (never print/copy credential contents):
- npm run typecheck
- npm run test:domain (includes scripts/test-sie-vat-periods.ts)
- npm run test:kan71:db with SOLOLEDGER_LOCAL_TEST_DATABASE_URL pointing at the dedicated local sololedger_kan71_* database.
The DB runner rejects hosted/other targets, verifies actual server/database, applies only the three KAN-71 local candidate migrations and creates synthetic fixtures. Do not point it at the original reproduction DB if its pre-fix behavior must be preserved.
Use a dedicated data-empty local copy for a new clean run. Do not change a shared database or repair migration history.

## Historical limits and integration review

- Old complete SKV return-field snapshots were never stored. They cannot be safely reconstructed or backfilled as “previously submitted”. This candidate labels live reconciliation and keeps stored closing state; it does not add a new snapshot persistence model.
- The existing close guard for VAT activity with every account balance already zero is preserved: after a full same-period cancellation the report is zero, but close still requests manual review. This is explicitly tested; changing that pre-existing closing policy is outside this patch.
- A reversal in a later journal period is not an automatic tax decision to move a previously declared error into that later declaration. Old affected periods remain review-only until separately handled. No data repair is part of KAN-71.
- SIE continues to export originals/corrections in their own transaction years. No export/encoding change.
- NE and dashboard income/result keep their existing journal/transaction-year calculations. Tests preserve original-year +1000 / correction-year -1000 and same-year cancellation; no NE or year-close logic changes.
- Stored closing amount remains the basis of tax-account settlement. No new liability, payment, settlement or customer-receivable writes were introduced.
- All 26xx undo rows require verified period handling, conservatively including VAT/opening settlement accounts. Unknown reverse-charge facts are not inferred; KAN-34 remains separate.
- Independent reviewer should check all-month lock order, post-lock authoritative period checks, signed report scoping/full-batch fetch, historical read-only labels/gates, false-safe withdrawal prevention and ACL preservation.

## Next approval boundary / Staging acceptance

Independent code/SQL after-review is complete with PASS per Pontus. Separate exact approval is required for Staging migration, publish and dedicated-user test writes.
Before Staging/Production acceptance:
1. Import ordinary Swedish VAT in the current verified open period; undo; check original/correction journals, report against close and dashboard/safe withdrawal.
2. Verify older/closed/declared/year-crossing/ambiguous imports stop with understandable Swedish messages and no batch/sequence/journal/period writes.
3. Inspect existing historical legacy undo: signed reconciliation + stored closing amount + review notice; no declaration/close action or safe withdrawal offered as safe.
4. Export SIE and compare NE/result/balance/year behavior; verify settlement basis remains unchanged.
5. Use the isolated runner for concurrency; do not race real hosted users.
Do not transfer all Staging history into Production: KAN-62/65 remain on hold.
