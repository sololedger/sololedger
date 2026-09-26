# SoloLedger Project State

Last updated: 2026-09-26

## Repository State

- Worktree: `C:\Users\Familjedator\Desktop\Sololedger Multi User App\sololedger_multi_user`
- Branch: `main`
- Git remote/origin verified as `https://github.com/sololedger/sololedger.git`
- Current checkpoint base verified: `HEAD == origin/main == 7039ea4e3ee4385e3dce56b91e0bb0749dd37d77`
- Latest committed subject: `KAN-19 add VAT audit snapshot contract`
- KAN-19 Slice 1 checkpoint: `6d2ebd9034aba49877c3a58e352f67389e24b4e4`
- KAN-19 Slice 2 checkpoint: `7039ea4e3ee4385e3dce56b91e0bb0749dd37d77`
- Working tree is intentionally dirty only for the exact-2645 classification checkpoint proposal.

## External Connections

- Jira cloud ID: `42c6216d-73c5-4777-a644-c41ef9bc6a1a`
- Jira project: `KAN` / `Sololedger`, project ID `10001`
- Jira KAN-19 verified 2026-09-26: Story, status `In Progress`, assignee empty.
- Live Supabase read-only verification 2026-09-26 confirms `2645` is still P1=false, P2=false, P3=false.

## Current Objective

- KAN-19 `VAT V2-4 - VAT-aware booking RPC` remains active/in progress, not complete.
- Exact-2645 VAT account-classification prerequisite slice is implemented locally and final-reviewed: `KAN-19 2645 FINAL REVIEW PASSED`.
- This checkpoint freezes only the local migration candidate and rollback regression test.
- Candidate semantics for exact `2645`:
  - P1 period guard/concurrency: true
  - P2 VAT close balance participant: true
  - P3 close manual review: false
- Preserved semantics: 261x/262x/263x unchanged, exact `2641` unchanged, 265x unchanged, and other 264x remain outside (`2640`, `2646`, `26410`, `26450` false/false/false).
- Migration has not been applied live.

## Proposed Checkpoint Files

- `supabase/migrations/20260926132107_add_2645_vat_account_classification.sql`
- `supabase/tests/kan19_2645_vat_account_classification_candidate.sql`
- `PROJECT_STATE.md`

## KAN-19 Verification

- Final read-only review verdict: `KAN-19 2645 FINAL REVIEW PASSED`.
- Production-derived local rollback regression passed for the exact-2645 candidate.
- Current KAN-17C close-classification rollback regression passed.
- Reverse-charge close proof passed: `Dr 4535 228`, `Dr 2645 57`, `Cr 2614 57`, `Cr payment/payable 228` results in `2614=0`, `2645=0`, `2650=0`, `closing_amount=0`.
- Representative VAT V1 `2611`/`2641` close regression passed.
- Zero-activity close remains unchanged.
- `imported_history` close behavior remains unchanged.
- Local post-test classifier restored to pre-candidate state: `2645` P1=false, P2=false, P3=false.
- No persistent synthetic rows remained in the checked rollback fixture windows.
- True two-session concurrency has not been empirically proven.
- Historical KAN-17A/KAN-17B candidate tests were independently reviewed and confirmed stale because KAN-17B/KAN-17C intentionally superseded their embedded assertions; they are not current architecture gates.

## Preserved Boundaries

- No runtime/RPC booking integration exists yet for VAT V2.
- No VAT report V2 implementation exists yet.
- No VAT audit persistence implementation exists yet.
- No live Supabase migration apply, live DB object/data modification, deployment, commit, push, or Jira write has been performed for this checkpoint.
- Approval to commit or push this checkpoint must not be interpreted as approval to apply the migration live.

## Active VAT V2 Context

- KAN-14 `VAT V2 - Utlandshandel / utländska inköp`: Epic, current Jira status previously verified as `To Do`.
- KAN-15 `VAT V2 recon/design: utländska inköp och utlandsmoms`: Done.
- KAN-16 `VAT V2-1 - Domain/profile model`: implemented and remains the domain/profile foundation.
- KAN-17 `VAT V2-2 - Central VAT account roles`: foundation completed/frozen through KAN-17C; do not reopen unless new evidence proves incompatibility.
- KAN-18 `VAT V2-3 - VAT treatment decision engine`: Done.
- KAN-19 `VAT V2-4 - VAT-aware booking RPC`: active/in progress; exact-2645 classification checkpoint pending approval.

## Open VAT V2 Questions

- EXTERNAL ACCOUNTING VERIFICATION REQUIRED: exact journal treatment for self-calculated reverse-charge VAT with no deduction, including BAS/account mapping, cost/acquisition-value handling, and K1/NE implications.
- EXTERNAL VERIFICATION REQUIRED: initial/partial VAT period when `vatReportingFrom` occurs inside a normal month/quarter/year period.
- EXTERNAL VERIFICATION REQUIRED: historical Adobe Ireland invoices with supplier-charged 25% VAT, including tax base, reverse-charge calculation, correction/refund handling, and VAT return correction.

## Next Safe Step

- Wait for Pontus approval before staging, committing, pushing, writing Jira, or applying any live migration.
- Proposed commit message: `KAN-19 classify 2645 for VAT guard and close`
- If approved to commit, commit exactly the proposed checkpoint files.
- Push only if Pontus explicitly approves push.
- Live migration apply remains a separate future approval decision.
