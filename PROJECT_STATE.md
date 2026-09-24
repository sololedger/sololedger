# SoloLedger Project State

Last updated: 2026-09-24

## Repository State

- Worktree: `C:\Users\Familjedator\Desktop\Sololedger Multi User App\sololedger_multi_user`
- Branch: `main`
- Git remote/origin verified as `https://github.com/sololedger/sololedger.git`
- Start checkpoint for the VAT V2 design checkpoint verified clean at `674b6a2c12705c87cd4a7af8528fa625fecacf33`, with local `HEAD == origin/main`.
- Current change is docs-only: `PROJECT_STATE.md`.
- No app code, tests, migrations, Supabase writes, DB/schema/RPC/RLS/grant changes, Vercel deploy, commit, or push has been performed in this checkpoint.

## External Connections

- Supabase project ref `wbaxmuvudpnkvuliicuy` is accessible.
- Vercel team slug `sololedger1` was previously verified as accessible, but Vercel project slug `sololedger` was not verified through the plugin.
- Jira cloud ID: `42c6216d-73c5-4777-a644-c41ef9bc6a1a`
- Jira project: `KAN` / `Sololedger`, project ID `10001`
- Jira statuses: `To Do` (`10004`), `In Progress` (`10005`), `In Review` (`10006`), `Done` (`10007`)
- Jira current user verified as Pontus Åkerhage `712020:01a218e5-6b15-4692-8096-c26687dca3f8`.

## Current Objective

- VAT V2 READ-ONLY recon and VAT V2 Master Design are complete and reviewed.
- Current checkpoint freezes the approved VAT V2 target architecture in `PROJECT_STATE.md` and Jira only. No VAT V2 implementation has started.
- KAN-14 `VAT V2 - Utlandshandel / utländska inköp`: Epic, `To Do`; updated with the approved target architecture, open questions, implementation order, and safety boundaries.
- KAN-15 `VAT V2 recon/design: utländska inköp och utlandsmoms`: Story under KAN-14, `To Do`; updated to show recon/master design complete, implementation not started, three open questions, and next step KAN-16.
- VAT V2 implementation children created under KAN-14:
  - KAN-16 `VAT V2-1 - Domain/profile model`
  - KAN-17 `VAT V2-2 - Central VAT account roles`
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
- Reuse existing `vat_periods` lifecycle `open -> closed -> declared`; do not create a parallel VAT V2 period system.
- Reuse the existing VAT month lock architecture and order: VAT month advisory locks -> other advisory locks -> row locks -> reads/writes. No separate foreign-VAT lock architecture.
- `resultEngine` remains truth for result/NE; VAT V2 must not duplicate result/NE classification.
- Unknown is first-class. Unknown must not silently mean Sweden, no deduction, no VAT, domestic, or business use. Booking blocks when an unknown fact can change VAT treatment.
- VAT V2 should persist minimal audit metadata: treatment code, rule version, relevant source facts/evidence, tax base, rate, output amount/report field, deduction treatment/amount/report field.
- VAT rules should be typed/time-aware with effective dates or equivalent. No runtime web scraping.

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

1. KAN-16 VAT V2-1 - Domain/profile model.
2. KAN-17 VAT V2-2 - Central VAT account roles.
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

- Review this docs/Jira checkpoint.
- Proposed docs-only checkpoint commit message: `Document VAT V2 master design checkpoint`
- Commit only `PROJECT_STATE.md` after explicit approval; push only after explicit approval.
- Next implementation work should be KAN-16 `VAT V2-1 - Domain/profile model` in a new Codex chat.
- Do not start VAT V2-1, KAN-9, deploys, migrations, live DB writes, resets, or source-code changes from this checkpoint.
