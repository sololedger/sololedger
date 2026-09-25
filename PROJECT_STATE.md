# SoloLedger Project State

Last updated: 2026-09-25

## Repository State

- Worktree: `C:\Users\Familjedator\Desktop\Sololedger Multi User App\sololedger_multi_user`
- Branch: `main`
- Git remote/origin verified as `https://github.com/sololedger/sololedger.git`
- Verified checkpoint before KAN-18 finalization prep: `HEAD == origin/main == 2fb68d7136e0c2c16a55ca170e306ab41ec4557e`
- Working tree is intentionally dirty for KAN-18 final checkpoint proposal only.
- Dirty files expected/proposed for checkpoint:
  - `package.json`
  - `scripts/test-vat-domain.ts`
  - `scripts/test-vat-treatment-decision.ts`
  - `src/lib/vatDomain.ts`
  - `src/lib/vatTreatmentDecision.ts`
  - `PROJECT_STATE.md`
  - `PROJECT_ARCHIVE.md`

## External Connections

- Jira cloud ID: `42c6216d-73c5-4777-a644-c41ef9bc6a1a`
- Jira project: `KAN` / `Sololedger`, project ID `10001`
- Jira statuses previously verified: `To Do` (`10004`), `In Progress` (`10005`), `In Review` (`10006`), `Done` (`10007`)
- Jira current user previously verified as Pontus Åkerhage `712020:01a218e5-6b15-4692-8096-c26687dca3f8`.
- Jira KAN-18 verified during finalization prep: Story, status `To Do`, assignee empty, parent KAN-14.
- No live Supabase access was used for KAN-18 finalization prep.

## Current Objective

- KAN-18 `VAT V2-3 - VAT treatment decision engine` is implemented locally and ready for final checkpoint approval.
- KAN-18 is pure TypeScript/domain work only: `VatFactsInput -> VatTreatment` via a typed ready/blocked decision result.
- KAN-18 extends the facts contract with `companyProfile`, explicit `calculationRate`, and transaction-level `deductionEntitlement`.
- KAN-18 keeps `calculationRate` as an input fact, not the whole VAT treatment.
- KAN-18 returns `treatment: null` for blocked decisions.
- KAN-18 blocks unknown/material facts when they can change VAT treatment and blocks unsupported first-slice scenarios rather than guessing.
- Implemented first-slice ready paths:
  - domestic taxable sale
  - domestic deductible purchase with full deduction and supplier-charged VAT
  - EU service reverse charge with no deduction
  - EU service reverse charge with full deduction
- Verified blocked/unsupported paths include unknown rate/countries/supplier VAT/deduction/profile facts, invalid profile invariants, invalid amounts, partial deduction, supplier-charged foreign VAT, domestic no-deduction purchase, non-Swedish sale, and domestic purchase without supplier-charged VAT.
- `npm run test:domain` now includes `scripts/test-vat-treatment-decision.ts`.

## KAN-18 Verification

- `npm run test:domain`: PASS.
- `npm run typecheck`: PASS.
- Targeted lint for touched KAN-18 files: PASS.
- `git diff --check`: PASS with Git line-ending warnings only for edited tracked files.
- `npm run test:regression`: PASS. The E2E portion contains public authentication UI smoke tests only and did not perform authenticated bookkeeping writes.

## Preserved Boundaries

- No BAS account mapping.
- No journal/debit/credit plan.
- No DB, RPC, Supabase, migration, or live data change.
- No frontend/runtime integration.
- No K1/NE implementation.
- No partial deduction formula or percent implementation.
- No import VAT implementation.
- No historical Adobe correction behavior.
- No partial first VAT period implementation.

## Active VAT V2 Context

- KAN-14 `VAT V2 - Utlandshandel / utländska inköp`: Epic, current Jira status `To Do`.
- KAN-15 `VAT V2 recon/design: utländska inköp och utlandsmoms`: Story under KAN-14, recon/master design complete.
- KAN-16 `VAT V2-1 - Domain/profile model`: implemented and remains KAN-18's domain/profile foundation.
- KAN-17 `VAT V2-2 - Central VAT account roles`: foundation completed/frozen through KAN-17C; do not reopen unless new evidence proves incompatibility.
- KAN-18 `VAT V2-3 - VAT treatment decision engine`: implemented locally, final checkpoint pending explicit approval.

## Open VAT V2 Questions

- EXTERNAL ACCOUNTING VERIFICATION REQUIRED: exact journal treatment for self-calculated reverse-charge VAT with no deduction, including BAS/account mapping, cost/acquisition-value handling, and K1/NE implications.
- EXTERNAL VERIFICATION REQUIRED: initial/partial VAT period when `vatReportingFrom` occurs inside a normal month/quarter/year period.
- EXTERNAL VERIFICATION REQUIRED: historical Adobe Ireland invoices with supplier-charged 25% VAT, including tax base, reverse-charge calculation, correction/refund handling, and VAT return correction.

## Implementation Order

1. KAN-16 VAT V2-1 - Domain/profile model - implemented.
2. KAN-17 VAT V2-2 - Central VAT account roles - implemented/frozen through KAN-17C.
3. KAN-18 VAT V2-3 - VAT treatment decision engine - implemented locally; final checkpoint/Jira finalization pending approval.
4. KAN-9 MASTER RECON can run after KAN-16 through KAN-18 if Pontus selects it.
5. KAN-19 VAT-aware booking RPC.
6. KAN-20 VAT report V2 fields.
7. KAN-21 Close / integrity / SIE / corrections.
8. KAN-22 UX fact capture.
9. KAN-23 Full VAT V1 + VAT V2 regression.

## Next Safe Step

- Wait for Pontus approval before staging, committing, pushing, or writing Jira.
- Proposed commit message: `KAN-18 add VAT treatment decision engine`
- If approved after commit/push: move Jira KAN-18 to `In Review`, assign to Pontus, and add the prepared verification/comment summary. Do not set `Done`.
