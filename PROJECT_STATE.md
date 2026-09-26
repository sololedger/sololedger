# SoloLedger Project State

Last updated: 2026-09-26

## Repository State

- Worktree: `C:\Users\Familjedator\Desktop\Sololedger Multi User App\sololedger_multi_user`
- Branch: `main`
- Git remote/origin verified as `https://github.com/sololedger/sololedger.git`
- Checkpoint base for KAN-19 Slice 2 verified: `HEAD == origin/main == 6d2ebd9034aba49877c3a58e352f67389e24b4e4`
- Latest committed subject: `KAN-19 add initial VAT journal plan`
- Slice 1 checkpoint is committed and pushed at `6d2ebd9034aba49877c3a58e352f67389e24b4e4`.
- Working tree is intentionally dirty for KAN-19 Slice 2 checkpoint proposal only.
- Dirty/untracked implementation files expected for Slice 2:
  - `package.json`
  - `scripts/test-vat-audit-snapshot.ts`
  - `src/lib/vatAuditSnapshot.ts`
- Dirty documentation files expected for checkpoint finalization:
  - `PROJECT_STATE.md`

## External Connections

- Jira cloud ID: `42c6216d-73c5-4777-a644-c41ef9bc6a1a`
- Jira project: `KAN` / `Sololedger`, project ID `10001`
- Jira statuses previously verified: `To Do` (`10004`), `In Progress` (`10005`), `In Review` (`10006`), `Done` (`10007`)
- Jira current user previously verified as Pontus Åkerhage `712020:01a218e5-6b15-4692-8096-c26687dca3f8`.
- Jira KAN-15 verified 2026-09-26: Story, status `Done`.
- Jira KAN-18 verified 2026-09-26: Story, status `Done`, assignee Pontus Åkerhage.
- Jira KAN-19 verified 2026-09-26: Story, status `In Progress`, assignee empty.
- No live Supabase access was used for KAN-19 Slice 1 or Slice 2 implementation/checkpoint prep.

## Current Objective

- KAN-19 `VAT V2-4 - VAT-aware booking RPC` is active/in progress, not complete.
- Slice 1 JournalPlan checkpoint is committed and pushed.
- Slice 2 audit snapshot contract is implemented locally and final-reviewed: `KAN-19 SLICE 2 FINAL REVIEW PASSED`.
- Slice 2 builds a pure pre-persistence VAT audit snapshot from `VatTreatment + VatJournalPlan`.
- Supported boundary remains intentionally narrow:
  - `EU_SERVICE_REVERSE_CHARGE`
  - `calculationRate = 25`
  - `deductionEntitlement = full`
- Snapshot creation independently validates treatment evidence against journal rows and reconciliation.
- Verified Slice 2 account semantics:
  - `4535` debit acquisition base
  - `2645` debit deductible calculated input VAT
  - `2614` credit calculated output VAT
  - variable valid payment/payable account credited for the acquisition base
- All other VAT V2 audit snapshot paths remain blocked. Next KAN-19 work must not silently broaden this boundary.

## KAN-19 Verification

- Slice 1 read-only review verdict: `FIRST KAN-19 SLICE REVIEW PASSED`.
- Slice 2 final read-only review verdict: `KAN-19 SLICE 2 FINAL REVIEW PASSED`.
- Slice 2 checks passed during checkpoint prep:
  - `node scripts/test-vat-audit-snapshot.ts`
  - `npm run test:domain`
  - `npm run typecheck`
  - `npx eslint src/lib/vatAuditSnapshot.ts scripts/test-vat-audit-snapshot.ts`
  - `git diff --check`
- `npm run test:domain` includes the Slice 1 JournalPlan tests and the Slice 2 audit snapshot tests.

## Preserved Boundaries

- No DB persistence exists yet for KAN-19.
- No RPC/runtime integration exists yet for KAN-19.
- No live Supabase change exists for KAN-19.
- No migration, booking RPC change, accountingService change, VAT report change, VAT classification change, correction-flow change, or UI wiring.
- No-deduction remains blocked pending account/allocation decision.
- Partial deduction remains blocked.
- EU goods, non-EU services, and imports remain blocked.
- Domestic VAT V1 behavior is not routed through the KAN-19 JournalPlan or audit snapshot slices.

## Active VAT V2 Context

- KAN-14 `VAT V2 - Utlandshandel / utländska inköp`: Epic, current Jira status previously verified as `To Do`.
- KAN-15 `VAT V2 recon/design: utländska inköp och utlandsmoms`: Done.
- KAN-16 `VAT V2-1 - Domain/profile model`: implemented and remains the domain/profile foundation.
- KAN-17 `VAT V2-2 - Central VAT account roles`: foundation completed/frozen through KAN-17C; do not reopen unless new evidence proves incompatibility.
- KAN-18 `VAT V2-3 - VAT treatment decision engine`: Done.
- KAN-19 `VAT V2-4 - VAT-aware booking RPC`: active/in progress; Slice 2 audit snapshot checkpoint pending approval.

## Open VAT V2 Questions

- Live/current VAT classification still treats account `2645` as P1 false, P2 false, P3 false.
- Before VAT V2 can be written through runtime/RPC, the `2645` classification question must be solved and regression-tested.
- Do not imply that P1/P2 changes are already approved, and do not claim `2645` belongs to P1/P2 until that future slice has been designed and verified.
- EXTERNAL ACCOUNTING VERIFICATION REQUIRED: exact journal treatment for self-calculated reverse-charge VAT with no deduction, including BAS/account mapping, cost/acquisition-value handling, and K1/NE implications.
- EXTERNAL VERIFICATION REQUIRED: initial/partial VAT period when `vatReportingFrom` occurs inside a normal month/quarter/year period.
- EXTERNAL VERIFICATION REQUIRED: historical Adobe Ireland invoices with supplier-charged 25% VAT, including tax base, reverse-charge calculation, correction/refund handling, and VAT return correction.

## Implementation Order

1. KAN-16 VAT V2-1 - Domain/profile model - implemented.
2. KAN-17 VAT V2-2 - Central VAT account roles - implemented/frozen through KAN-17C.
3. KAN-18 VAT V2-3 - VAT treatment decision engine - Done.
4. KAN-19 VAT V2-4 - VAT-aware booking RPC - active; Slice 2 audit snapshot checkpoint pending approval.
5. KAN-20 VAT report V2 fields.
6. KAN-21 Close / integrity / SIE / corrections.
7. KAN-22 UX fact capture.
8. KAN-23 Full VAT V1 + VAT V2 regression.

## Next Safe Step

- Wait for Pontus approval before staging, committing, pushing, or writing Jira.
- Proposed commit message: `KAN-19 add VAT audit snapshot contract`
- If approved, commit exactly the proposed KAN-19 Slice 2 files and minimal checkpoint documentation, then push only if Pontus explicitly approves push too.
- Do not move KAN-19 to `In Review` or `Done` for this partial checkpoint.
- Do not start another KAN-19 slice until Pontus explicitly approves it.
