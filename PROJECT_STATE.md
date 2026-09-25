# SoloLedger Project State

Last updated: 2026-09-25

## Repository State

- Worktree: `C:\Users\Familjedator\Desktop\Sololedger Multi User App\sololedger_multi_user`
- Branch: `main`
- Git remote/origin verified as `https://github.com/sololedger/sololedger.git`
- Current checkpoint base: `9f82cbdab8b8e15720770e8aa624feff67c4e9f0`; local `HEAD == origin/main` before the KAN-17A checkpoint commit.
- Current uncommitted checkpoint files:
  - `supabase/migrations/20260925_add_vat_account_classification.sql`
  - `supabase/tests/kan17a_vat_account_classification_candidate.sql`
  - `PROJECT_STATE.md`
- KAN-17A live migration has been applied with explicit approval.
- No commit, push, deploy, Jira write, consumer switch, or further live DB change has been performed after the approved KAN-17A live migration.

## External Connections

- Supabase project ref `wbaxmuvudpnkvuliicuy` is accessible.
- Live Supabase migration applied for KAN-17A: `20260925050113 / 20260925_add_vat_account_classification`.
- Vercel team slug `sololedger1` was previously verified as accessible, but Vercel project slug `sololedger` was not verified through the plugin.
- Jira cloud ID: `42c6216d-73c5-4777-a644-c41ef9bc6a1a`
- Jira project: `KAN` / `Sololedger`, project ID `10001`
- Jira statuses: `To Do` (`10004`), `In Progress` (`10005`), `In Review` (`10006`), `Done` (`10007`)
- Jira current user verified as Pontus Åkerhage `712020:01a218e5-6b15-4692-8096-c26687dca3f8`.
- Jira KAN-17 current verified status before final Jira update: `To Do`; assignee empty; no comments at checkpoint finalization time.

## Current Objective

- KAN-17A, the first sub-slice of KAN-17 `VAT V2-2 - Central VAT account roles`, is implemented, live-applied, and SELECT-equivalence verified.
- KAN-17 overall is not complete. Do not mark KAN-17 `Done`.
- KAN-17A is an additive DB foundation only. It adds a central VAT account classification primitive and semantic wrappers, but no runtime consumer has been switched.
- VAT account semantics are capability-based, not one-role/one-boolean.
- KAN-16 `VAT V2-1 - Domain/profile model` is implemented and remains the current domain/profile foundation.
- KAN-16 adds a pure TypeScript VAT domain foundation only: `CompanyVatProfile`, `VatFactsInput`, `VatTreatment`, supporting VAT types, profile validation/invariants, and domain representation tests.
- `npm run test:domain` includes the VAT domain test script.
- No runtime integration exists yet. VAT V1 runtime behavior, booking, VAT report, Kontoplan, `resultEngine`, RLS/grants, and live data remain unchanged by KAN-16/KAN-17A except for the approved additive KAN-17A helper functions.
- KAN-14 `VAT V2 - Utlandshandel / utländska inköp`: Epic, `To Do`; contains the approved target architecture, open questions, implementation order, and safety boundaries.
- KAN-15 `VAT V2 recon/design: utländska inköp och utlandsmoms`: Story under KAN-14, `To Do`; recon/master design complete.
- VAT V2 implementation children under KAN-14:
  - KAN-16 `VAT V2-1 - Domain/profile model` - implemented.
  - KAN-17 `VAT V2-2 - Central VAT account roles` - KAN-17A foundation implemented/live-applied/verified; KAN-17 overall remains in progress.
  - KAN-18 `VAT V2-3 - VAT treatment decision engine`
  - KAN-19 `VAT V2-4 - VAT-aware booking RPC`
  - KAN-20 `VAT V2-5 - VAT report V2 fields`
  - KAN-21 `VAT V2-6 - Close / integrity / SIE / corrections`
  - KAN-22 `VAT V2-7 - UX fact capture`
  - KAN-23 `VAT V2-8 - Full VAT V1 + VAT V2 regression`

## Locked VAT V1 Baseline

- VAT V1 remains the locked regression baseline.
- Core flow verified earlier: bookkeeping -> VAT report -> open VAT period -> close -> `vat_closing` system verification -> closed -> declare -> declared.
- Existing VAT architecture, period protection, concurrency design, close/declare semantics, SIE guards, corrections, system transactions, and open -> closed -> declared state machine must be preserved unless a concrete verified VAT V2 requirement justifies a controlled change.
- Current V1 close scope is exact `261x`, `262x`, `263x`, and `2641`; `265x` activity blocks normal auto-close/manual review but is not included in `closing_amount`.
- Current V1 `declare_vat_period_atomic` is state-neutral and should remain unchanged unless VAT V2 implementation evidence requires otherwise.

## Approved VAT V2 Target Architecture

- VAT V2 will be an explicit VAT domain above existing journal/RPC integrity.
- Approved pipeline: transaction/company facts -> VAT treatment decision -> `VatTreatment` -> journal plan -> safe RPC -> journal -> VAT report.
- VAT V2 is treatment-first, not account-first; `vat_rate` must not be overloaded into the whole VAT treatment.
- Preserve VAD / HUR / MOMS separation:
  - VAD = accounting event/category/treatment.
  - HUR = journal/payment/settlement mechanics.
  - MOMS = VAT treatment/reporting consequences.
- VAT V2 owns MOMS. KAN-9 may later provide domain facts but must not choose VAT accounts, choose VAT return boxes, or implement a parallel VAT engine.
- Current `vat_status = registered | not_registered | unknown` is too coarse for VAT V2 and will be replaced or reworked by KAN-16.
- Future profile/domain model must separate domestic sales VAT treatment, VAT registration status, foreign-purchase reporting obligation, VAT period type, VAT reporting start, and deduction context.
- Output VAT obligation and deductible input VAT are independent. Company-level deduction context is only a default/context; transaction-level `VatTreatment` must decide deduction when facts require it.
- Journal remains accounting truth. VAT decision and journalization are separate steps.
- VAT report direction is hybrid: native VAT V2 transactions use typed VAT decision/report metadata; legacy/imported/SIE cases use account-role/journal fallback. Treatment metadata and journal must reconcile; silent drift is not acceptable.
- Central DB-safe VAT account roles should replace scattered prefix logic such as `261%`, `262%`, `263%`, `2641`, `265%` over time, and be reusable by booking, report, concurrency, close, SIE, corrections, integrity guards, and system-account knowledge.
- KAN-17A establishes the central DB-safe VAT account role foundation as capability-based semantics, not one generic `isVatAccount` boolean.
- Reuse existing `vat_periods` lifecycle `open -> closed -> declared`; do not create a parallel VAT V2 period system.
- Reuse the existing VAT month lock architecture and order: VAT month advisory locks -> other advisory locks -> row locks -> reads/writes. No separate foreign-VAT lock architecture.
- `resultEngine` remains truth for result/NE; VAT V2 must not duplicate result/NE classification.
- Unknown is first-class. Unknown must not silently mean Sweden, no deduction, no VAT, domestic, or business use. Booking blocks when an unknown fact can change VAT treatment.
- VAT V2 should persist minimal audit metadata: treatment code, rule version, relevant source facts/evidence, tax base, rate, output amount/report field, deduction treatment/amount/report field.
- VAT rules should be typed/time-aware with effective dates or equivalent. No runtime web scraping.

## KAN-16 Domain Foundation

- `CompanyVatProfile` separates domestic sales VAT treatment, VAT registration status, foreign-purchase reporting obligation, VAT period type/reporting start, and deduction context.
- Unknown is explicit and first-class; it is not equivalent to no, false, `not_registered`, or `not_required`.
- `domesticSalesVatTreatment = small_business_exempt` may validly coexist with `vatRegistrationStatus = registered` and `foreignPurchaseReporting = required`.
- Company-level `defaultDeductionEntitlement` is context/default only and must not decide transaction-level deduction.
- `defaultDeductionPercent` is valid only for `partial`, required for `partial`, finite, and 0-100 inclusive.
- `VatFactsInput` is the future facts boundary and distinguishes known country, unknown country, and not-applicable country.
- `VatTreatment` is currently representational only: not a treatment decision engine, runtime validator, journal plan, account mapping, or RPC payload.
- `VatTreatment` can represent output VAT and deductible input VAT independently, including the verified EU service case with output VAT 57 on base 228 and zero deductible input VAT.
- No BAS account mappings, journal mappings, or treatment decision rules were implemented.

## KAN-17A Central VAT Account Classification

- Migration file: `supabase/migrations/20260925_add_vat_account_classification.sql`
- Live Supabase migration: `20260925050113 / 20260925_add_vat_account_classification`
- Approved migration SHA-256: `1B795514BC5CAA42394EB95958F806B8CB4CAD0623030F21AA133E16967C98AF`
- Live functions:
  - `public.vat_account_classification(text)`
  - `public.vat_account_is_period_guard_relevant(text)`
  - `public.vat_account_is_close_balance_participant(text)`
  - `public.vat_account_requires_close_manual_review(text)`
- All four live functions are `LANGUAGE sql`, `IMMUTABLE`, `PARALLEL SAFE`, with `search_path=public`.
- `PUBLIC`, `authenticated`, and `anon` have no `EXECUTE` privilege on all four functions.
- P1, VAT period guard/concurrency relevance: `261%`, `262%`, `263%`, exact `2641`, `265%`.
- P2, VAT close balance participation: `261%`, `262%`, `263%`, exact `2641`.
- P3, VAT close manual-review relevance: `265%`.
- `265x` is period-guard/concurrency relevant and manual-review relevant, but is not a close-balance participant.
- Other `264x` accounts are not part of P1, P2, or P3.
- Live SELECT-only equivalence verification:
  - P1: `0` mismatches across 29 candidate cases.
  - P2: `0` mismatches across 29 candidate cases.
  - P3: `0` mismatches across 29 candidate cases.
  - wrappers vs central classifier: `0` mismatches.
- Edge behavior preserved as V1 predicate equivalence, not BAS validation:
  - `NULL` -> `NULL` capabilities.
  - `''`, `26`, `26410`, `vat` -> false capabilities.
  - `261`, `26100`, `261ABC` -> period guard true, close balance true, manual review false.
  - `265`, `265ABC` -> period guard true, close balance false, manual review true.
- Existing `public.vat_concurrency_account(text)` pre/post hash: `fa2a0b9929cdcf3545f0a5848a216a16`; unchanged.
- Existing `public.close_vat_period_atomic(uuid)` pre/post hash: `d507fe3b15a63caeec7a79907301ef72`; unchanged.
- No existing public runtime function references the new classifier or wrappers.
- KAN-17A classifier currently has zero runtime consumers.
- No booking, close, SIE, correction, report, `not_registered`, or VAT V1 runtime behavior changed.
- Pre/post checks found no changes to `transactions`, `journal_entries`, `vat_periods`, or `accounts`.
- No persistent `kan17a` test table exists.
- Exact SQL rollback candidate was not executed against live because the environment safety review rejected re-running DDL against the live database even inside `BEGIN`/`ROLLBACK`.
- That safety boundary was respected and no workaround was attempted.
- The candidate SQL remains as a reusable regression artifact: `supabase/tests/kan17a_vat_account_classification_candidate.sql`.

## VAT V2 Reference Case

- Jessika reference/regression case:
  - Swedish sole trader.
  - Domestic sales: small-business VAT exempt.
  - VAT registration: yes, because of relevant foreign service purchases.
  - Foreign purchase reporting: required.
  - Future EU digital-service invoice: supplier VAT absent where correct reverse charge applies.
  - Swedish calculated output VAT: yes.
  - Input VAT deduction: none in the verified reference situation.
  - VAT report: EU service acquisition base + calculated output VAT, no deductible input VAT field.
- Adobe Ireland is a real reference fixture, not a hardcoded accounting rule.

## Open VAT V2 Questions

- OPEN / EXTERNAL ACCOUNTING VERIFICATION REQUIRED: exact journal treatment for self-calculated reverse-charge VAT with no deduction. Exact Swedish BAS/accounting treatment, cost/acquisition-value handling, K1/NE implications, and account mappings are not approved.
- OPEN / EXTERNAL VERIFICATION REQUIRED: initial/partial VAT period when `vatReportingFrom` occurs inside a normal month/quarter/year period. Current VAT V1 `ensure_vat_periods` skips partial initial periods; do not change this until reporting-period semantics are verified.
- OPEN / EXTERNAL VERIFICATION REQUIRED: historical Adobe Ireland invoices with supplier-charged 25% VAT. Historical tax base, reverse-charge calculation, journal correction, credit note/refund handling, and VAT return correction remain unresolved.

## Migration / Data Compatibility

- Current users/data are development/test data. Full backward compatibility with today's test data is not an absolute requirement.
- A clean domain migration or later reset may be recommended if it gives better long-term architecture.
- No reset, destructive migration, user-data deletion, or data rewrite is approved.
- Before any future destructive operation, make a separately verified backup/export plan against actual live tables/storage. SIE export alone must not be assumed to restore all SoloLedger metadata.

## Implementation Order

1. KAN-16 VAT V2-1 - Domain/profile model - implemented.
2. KAN-17 VAT V2-2 - Central VAT account roles.
   - KAN-17A central VAT account classification foundation - implemented, live-applied, SELECT-equivalence verified, zero runtime consumers.
   - KAN-17B is the next planned KAN-17 slice and has not started.
3. KAN-18 VAT V2-3 - VAT treatment decision engine.
4. Stable facts -> treatment VAT boundary exists.
5. KAN-9 MASTER RECON can run after KAN-16 through KAN-18; KAN-9 does not need to wait for full VAT V2.
6. KAN-19 VAT-aware booking RPC.
7. KAN-20 VAT report V2 fields.
8. KAN-21 Close / integrity / SIE / corrections.
9. KAN-22 UX fact capture.
10. KAN-23 Full VAT V1 + VAT V2 regression.

## Deferred / Future Ideas

- KAN-5/KAN-6 remain `In Review`: their SIE VAT guards have strong implementation/rollback verification, but remaining empirical isolated/two-session/SIE verification has not been completed to the same level as the Production Close/Declare flow. They are not blockers for moving on from VAT V1/VAT V2 planning.
- Known non-blocking/deferred items: full isolated staging E2E coverage; payment/refund flow after VAT close; 1630/tax-account handling; correction/reopen/undeclare flow for already declared VAT; empirical two-session concurrency coverage where previously documented.
- Future KAN-9-adjacent recon area: invoice/receivable/year-end handling for issued customer invoices, payments, and unpaid receivables under the cash/bokslutsmetod. Treat as identified need/recon area, not an implementation claim.

## Next Safe Step

- Await external approval to commit and push the KAN-17A checkpoint.
- Proposed checkpoint commit message: `Add central VAT account classification`
- Proposed Jira follow-up, after successful commit/push verification: transition KAN-17 from `To Do` to `In Progress` and add a comment that KAN-17A is complete/verified while KAN-17 overall remains in progress.
- Next planned implementation slice is KAN-17B, not started.
- KAN-17B should be the first controlled consumer migration for the existing P1 concurrency / VAT-period-guard semantic. Its exact implementation approach is not locked; delegation from `vat_concurrency_account()` to the new classifier is a candidate design, not an approved implementation.
- Do not start KAN-17B, KAN-18, KAN-9, deploys, additional migrations, live DB writes, resets, or runtime wiring from this checkpoint.
