# SoloLedger Project State

Last updated: 2026-10-14

## Current Objective: KAN-72

- Independent re-review: PASS MED ANMARKNINGAR. All three findings independently verified fixed; Pontus approved one local KAN-72 commit. Staging acceptance remains pending.
- Jira KAN-72 was explicitly approved for In Progress and transitioned there.
- Worktree: C:/Users/Familjedator/.codex/worktrees/kan72-standard-amount-guard/sololedger_multi_user
- Branch: codex/KAN-72-standard-amount-guard
- Base: 357c980fba8a343ec7330b26b6268e6525cd49d4. This approved local checkpoint is identified by git log -1 on the KAN-72 branch; no push is approved.
- Production main/remote and Vercel build were reverified at that commit before implementation.
- Production URL: https://sololedger.vercel.app; Staging URL: https://sololedger-git-staging-sololedger1.vercel.app
- Remote Staging remains 30e82adf9d2868e0e1f1c028b433bc11aa9a7ff7.
- Production Supabase: wbaxmuvudpnkvuliicuy; Staging Supabase: fzxqiqenqjzhlyxxpvhg.

## Preserved Workspace / Paused Work

- Original checkout remains on staging at ef498b9e5e2ca25c35216ee18899b7c51ab7cdc6.
- Its ff671bf and ef498b9 documentation commits and untracked audit-packages/ and scripts/create-kan63-staging-user.mjs remain untouched.
- KAN-62/KAN-65 remain paused pending Skatteverket; their Staging changes are absent from this Production-based branch.
- Do not merge Staging wholesale into a Production candidate. Integrate only approved KAN-72 changes into Staging later.

## Implementation / Review Surface

- src/lib/standardBookingAmount.ts: shared exact digit/exponent normalization before whole-cent validation, numeric(15,2) range and conversion round-trip. Preserves .50, .01, 1e2 and 1E-2 without floating-point rounding.
- src/components/TransactionForm.tsx: native constraints, visible accessible error and guarded ordinary submit.
- src/app/page.tsx: validates raw amount before upload/write; booked attachment edits bypass new amount validation.
- src/lib/accountingService.ts: validates both standard booking service entry points.
- supabase/migrations/20261014100000_kan72_standard_booking_integrity.sql: replaces only book_transaction_atomic(jsonb) and book_periodized_transaction_atomic(jsonb).
- RPCs validate amount before number allocation. Each check reads the entire (user_id, ver_nr) verification plus all rows linked to the new transaction; transaction/owner/number identities use IS DISTINCT FROM. Expected row count, valid nonnegative values and exact debit/credit balance are required. Both periodization verifications are checked separately. No locks added.
- No global journal trigger, correction rewrite, new transaction source, refund flow, RLS/grant or report change.
- Live definitions were read in this session before modification and their hashes reverified unchanged before implementation.
- Scripts/tests added: scripts/test-standard-booking-amount.mjs and supabase/tests/kan72_standard_booking_integrity_candidate.sql.
- package.json adds the service/UI regression to test:domain; scripts/run-db-regression-guard.mjs applies the new migration only to its verified local target and runs the new rollback fixture.

## Accounting Integration Impact

- Journal and two standard write paths change. Sources remain manual with existing periodization markers.
- VAT aggregation/inference, VAT locks/periods, result/NE/balances, dashboard/safe withdrawal and SIE calculations remain unchanged; their existing regression paths were exercised.
- Controlled correction and periodization-pair correction remain unchanged and are covered by local tests.
- No customer-invoice/payment/receivable, settlement, year-close, deletion-lifecycle, Storage or Edge Function implementation change.
- Before a separately approved Staging/Production candidate: inspect representative sale/purchase and periodization journals, VAT report, NE/dashboard, bank balance, correction and relevant SIE/year-boundary results. Invoice/receivable behavior is outside this change.

## Actual Verification Results

- RED before implementation: real service accepted -1250; local RPC accepted a negative standard booking and injected journal imbalance.
- Final KAN-72 service/raw-input/rendered-form/actual page-handler tests: PASS, including Chromium DOM value versus valueAsNumber, valid decimal/exponent formats and sub-cent/overflow/precision disguises.
- Final npm run typecheck: PASS.
- Final npm run test:db-regression: PASS, including KAN-72 and seven existing rollback fixtures.
- Local test DB independently verified: sololedger_kan17c_test, localhost (::1), port 5432. No hosted DB test writes.
- SQL coverage: negative/zero/precision/invalid inputs at 0/6/12/25%, cent and known VAT rounding fixtures, maximum representable amount, full/no deduction, owner flows, ordinary/periodized journal faults, first/existing/multiple number rollback, metadata attachment preservation, profile/year/VAT/correction guards and actual authenticated/anon roles.
- Postcheck found zero remaining KAN-72 transactions/accounts/fault triggers after rollback.
- npm run test:db-invariants and npm run test:e2e:safety: PASS.
- Public Playwright smoke on local app: 2/2 PASS.
- npm run test:regression: PASS, all 38 domain scripts and public Playwright smoke 2/2.
- npm run test: PASS, including all domain scripts, admin-delete dry-run and DB invariants.
- scripts/test-transaction-form-ui.ts replaces the obsolete literal-return invoice assertion with actual defaultCustomerInvoiceVatTreatment calls for exempt, not-registered, taxable, mixed and unknown profiles. Invoice policy code remains unchanged.
- Full npm run lint: FAIL, 86 existing errors and 6 warnings. Changed-file baseline comparison reports zero new diagnostics; new files lint clean.
- git diff --check: PASS.
- Authenticated/write browser acceptance and hosted migration verification not run: hosted writes are not approved.

## Independent Review Follow-up (2026-10-14)

- Finding 1 reproduced: Chromium accepted the four formats but the first parser rejected them. Exact digit/exponent normalization now preserves valid whole-cent amounts and rejects precision lost by Number/valueAsNumber.
- Finding 2 reproduced: existing invoice assertion failed; behavioral profile-default tests replace it. No customer-invoice product logic changed.
- Finding 3 reproduced in local rollback transactions for ordinary and periodized booking: an extra 0.01 debit with the same owner/number and a different transaction was accepted. Complete verification checks now reject it, including NULL, zero and balanced extra-row variants and an extra row on the second periodization verification.
- Additional isolation test confirms another user's same verification number does not interfere. Failure fixtures verify all journal/transaction counts and the full number-table snapshot roll back, followed by a gap-free successful booking.
- Candidate comparison after removing only KAN-72 additions found every KAN-55 statement unchanged in both RPCs. Existing KAN-55 rollback regression passes.
- Original staging checkout reverified unchanged at ef498b9 with its existing untracked files. No Jira mutation in this follow-up.

## Independent Re-review / Remaining Notes

- Read the final PASS MED ANMARKNINGAR report from Granska KAN-72 beloppsskydd. Reviewer independently passed full test/regression, local DB regression, 25,000 parser cases, journal rollback/number sequence, concurrency, types and safety guards; no new lint diagnostics or blocking risk.
- P3 potential performance risk: the broader user_id/ver_nr searches have no composite index in the inspected Production schema. Large user histories may increase query time while the number lock is held. No slowdown/deadlock was demonstrated. Measure query plans and booking time with large isolated fixtures before proposing any index migration; a new index requires separate approval.
- Staging bookkeeping acceptance and the high-volume performance measurement remain outstanding.

## Next Safe Step / Approval Boundaries

- Wait for separate Staging integration/push and hosted migration approvals, then verify representative journal -> VAT report -> dashboard -> NE flows, periodization and correction. Release only the approved KAN-72 scope; KAN-62/65 remain paused.
- KAN-72 remains In Progress. No In Review/Done transition or assignment was approved/performed.
- This checkpoint is approved for one local commit only. No push, merge, deploy or Production/Staging data/schema write is approved or performed.
- The new migration was applied only in the isolated local regression DB.
- Wait for Pontus before publishing to Staging, hosted migration or deploy.
