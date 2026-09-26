# SoloLedger Project State

Last updated: 2026-09-26

## Repository State

- Worktree: `C:\Users\Familjedator\Desktop\Sololedger Multi User App\sololedger_multi_user`
- Branch: `main`
- Git remote/origin verified as `https://github.com/sololedger/sololedger.git`
- Checkpoint base verified before KAN-19 finalization prep: `HEAD == origin/main == 1aa2253c4ce6c216c10391641784fdb58e37245a`
- Working tree is intentionally dirty for KAN-19 first-slice checkpoint proposal only.
- Dirty files expected/proposed for checkpoint:
  - `package.json`
  - `scripts/test-vat-journal-plan.ts`
  - `src/lib/vatJournalPlan.ts`
  - `PROJECT_STATE.md`
  - `PROJECT_ARCHIVE.md`

## External Connections

- Jira cloud ID: `42c6216d-73c5-4777-a644-c41ef9bc6a1a`
- Jira project: `KAN` / `Sololedger`, project ID `10001`
- Jira statuses previously verified: `To Do` (`10004`), `In Progress` (`10005`), `In Review` (`10006`), `Done` (`10007`)
- Jira current user previously verified as Pontus Åkerhage `712020:01a218e5-6b15-4692-8096-c26687dca3f8`.
- Jira KAN-15 verified 2026-09-26: Story, status `Done`.
- Jira KAN-18 verified 2026-09-26: Story, status `Done`, assignee Pontus Åkerhage.
- Jira KAN-19 verified 2026-09-26: Story, status `To Do`, assignee empty.
- No live Supabase access was used for KAN-19 first-slice implementation or checkpoint prep.

## Current Objective

- KAN-19 `VAT V2-4 - VAT-aware booking RPC` is active/in progress, not complete.
- First KAN-19 implementation slice is implemented locally and passed read-only review: pure VAT JournalPlan builder plus focused domain tests.
- Supported JournalPlan boundary is intentionally narrow:
  - `EU_SERVICE_REVERSE_CHARGE`
  - `calculationRate = 25`
  - `deductionEntitlement = full`
- Generated verified rows for this boundary:
  - `4535` debit acquisition base
  - `2645` debit deductible calculated input VAT
  - `2614` credit calculated output VAT
  - supplied payment/payable account credit acquisition base
- All other VAT V2 JournalPlan paths remain blocked. Next KAN-19 work must not silently broaden this boundary.

## KAN-19 Verification

- Read-only review verdict: `FIRST KAN-19 SLICE REVIEW PASSED`.
- `npm run test:domain`: PASS.
- `npm run typecheck`: PASS.
- `npx eslint src/lib/vatJournalPlan.ts scripts/test-vat-journal-plan.ts`: PASS.
- `git diff --check`: PASS with Git line-ending warning only for `package.json`.

## Preserved Boundaries

- No runtime/RPC/DB integration exists yet for KAN-19.
- No live Supabase change exists for KAN-19.
- No migration, booking RPC change, accountingService change, VAT report change, or UI wiring.
- No-deduction remains blocked pending account/allocation decision.
- Partial deduction remains blocked.
- EU goods, non-EU services, and imports remain blocked.
- Domestic VAT V1 behavior is not routed through this JournalPlan slice.

## Active VAT V2 Context

- KAN-14 `VAT V2 - Utlandshandel / utländska inköp`: Epic, current Jira status previously verified as `To Do`.
- KAN-15 `VAT V2 recon/design: utländska inköp och utlandsmoms`: Done.
- KAN-16 `VAT V2-1 - Domain/profile model`: implemented and remains the domain/profile foundation.
- KAN-17 `VAT V2-2 - Central VAT account roles`: foundation completed/frozen through KAN-17C; do not reopen unless new evidence proves incompatibility.
- KAN-18 `VAT V2-3 - VAT treatment decision engine`: Done.
- KAN-19 `VAT V2-4 - VAT-aware booking RPC`: active/in progress; first pure JournalPlan slice checkpoint pending approval.

## Open VAT V2 Questions

- EXTERNAL ACCOUNTING VERIFICATION REQUIRED: exact journal treatment for self-calculated reverse-charge VAT with no deduction, including BAS/account mapping, cost/acquisition-value handling, and K1/NE implications.
- EXTERNAL VERIFICATION REQUIRED: initial/partial VAT period when `vatReportingFrom` occurs inside a normal month/quarter/year period.
- EXTERNAL VERIFICATION REQUIRED: historical Adobe Ireland invoices with supplier-charged 25% VAT, including tax base, reverse-charge calculation, correction/refund handling, and VAT return correction.

## Implementation Order

1. KAN-16 VAT V2-1 - Domain/profile model - implemented.
2. KAN-17 VAT V2-2 - Central VAT account roles - implemented/frozen through KAN-17C.
3. KAN-18 VAT V2-3 - VAT treatment decision engine - Done.
4. KAN-19 VAT V2-4 - VAT-aware booking RPC - active; first JournalPlan slice checkpoint pending approval.
5. KAN-20 VAT report V2 fields.
6. KAN-21 Close / integrity / SIE / corrections.
7. KAN-22 UX fact capture.
8. KAN-23 Full VAT V1 + VAT V2 regression.

## Next Safe Step

- Wait for Pontus approval before staging, committing, pushing, or writing Jira.
- Proposed commit message: `KAN-19 add initial VAT journal plan`
- If approved, commit exactly the proposed KAN-19 first-slice files and minimal checkpoint documentation, then push only if Pontus explicitly approves push too.
- Do not move KAN-19 to `In Review` or `Done` for this partial checkpoint.
