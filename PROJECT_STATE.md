# SoloLedger Project State

Last updated: 2026-09-24

## Repository State

- Worktree: `C:\Users\Familjedator\Desktop\Sololedger Multi User App\sololedger_multi_user`
- Branch: `main`
- Git remote/origin verified as `https://github.com/sololedger/sololedger.git`
- Current `HEAD` and `origin/main` verified at `23ae7f15b3518f2e2b39a3af5b33a868b47da1ff`.
- Working tree was clean before the 2026-09-24 VAT V2 planning update.
- Current uncommitted planning documentation change: `PROJECT_STATE.md`.
- Jira planning writes were performed for KAN-14 and KAN-15 on 2026-09-24. No deploy, DB write, app-code change, SQL/migration/test change, commit, or push has been performed.

## External Connections

- Supabase project ref `wbaxmuvudpnkvuliicuy` is accessible.
- Vercel team slug `sololedger1` was verified as accessible, but Vercel project slug `sololedger` was not verified through the plugin.
- Jira cloud ID: `42c6216d-73c5-4777-a644-c41ef9bc6a1a`
- Jira project: `KAN` / `Sololedger`, project ID `10001`
- Jira statuses: `To Do` (`10004`), `In Progress` (`10005`), `In Review` (`10006`), `Done` (`10007`)
- Jira current user verified as Pontus Åkerhage `712020:01a218e5-6b15-4692-8096-c26687dca3f8`.

## Current Objective

- Current task: documentation/planning update for future VAT V2 foreign-purchase work using newly verified Skatteverket feedback. No implementation is in scope.
- Jira verified/updated 2026-09-21:
  - KAN-5 `3B.5 Undo SIE VAT guard`: `In Review`, assignee empty.
  - KAN-6 `3B.5 Import SIE VAT guard`: `In Review`, assigned to Pontus.
  - KAN-7 `3B.5 close_vat_period_atomic foundation`: `Done`, assigned to Pontus.
  - KAN-8 `3B.6 declared VAT period`: `Done`, assignee empty.
  - KAN-12 `KAN-7B - Appintegration och integritetsskydd för momsperiodsstängning`: `Done`, assignee empty.
  - KAN-9 `Kontoplan guidance for enskild firma`: `To Do`, assignee empty; description updated with VAT V2 boundary notes and the private-purchase/company-card -> `eget uttag` scenario.
  - KAN-14 `VAT V2 – Utlandshandel / utländska inköp`: Epic, `To Do`; description updated 2026-09-24 with verified Skatteverket case, Adobe Ireland reference case, VAT V1 regression boundary, and initial VAT V2 scope.
  - KAN-15 `VAT V2 recon/design: utländska inköp och utlandsmoms`: Story under KAN-14, `To Do`; description updated 2026-09-24 to make the next technical step a separate READ-ONLY VAT V2 recon.
- KAN-5/KAN-6 remain `In Review`: their SIE VAT guards have strong implementation/rollback verification, but remaining empirical isolated/two-session/SIE verification has not been completed to the same level as the Production Close/Declare flow. They are not blockers for moving on from VAT V1.

## Locked VAT V1 Baseline

- VAT V1 is now considered the locked baseline for current work.
- Core flow verified: bookkeeping -> VAT report -> open VAT period -> close -> `vat_closing` system verification -> closed -> declare -> declared.
- Existing VAT architecture, period protection, concurrency design, closing semantics, and open -> closed -> declared state machine must not be changed during unrelated future work without a concrete verified regression or explicit product/accounting requirement.
- Manual Production validation closed and declared real VAT period `2026-04-01` to `2026-06-30`; archive contains the compact verification details.

## Active VAT Context

- Implemented VAT/system write guards: KAN-5 `undo_sie_import_atomic`, KAN-6 `import_sie_batch`, KAN-7 `close_vat_period_atomic`, KAN-8 `declare_vat_period_atomic`, KAN-12 / 7B.1 `vat_closing` protection in `create_correction_transaction_atomic` and `update_transaction_safe`, and earlier guarded write RPCs `book_transaction_atomic`, `book_periodized_transaction_atomic`, and `create_correction_transaction_atomic`.
- KAN-7 closing scope is exact `261x`, `262x`, `263x`, and `2641`; `265x` activity blocks normal auto-close/manual review but is not included in `closing_amount`.
- `closing_amount = -sum(debit-credit)` over relevant VAT account balances, and net is booked to `2650` only when net is nonzero.
- `declared_at` is set only by KAN-8 declaration, not by close.

## VAT V2 Verified Finding

- Verified from Skatteverket: a Swedish sole proprietor whose ordinary Swedish sales are VAT-exempt due to low annual turnover can still need VAT registration for purchases of services from companies in other EU countries.
- Verified: for relevant EU service purchases, the business may need to self-calculate and report Swedish output VAT from the first relevant purchase/sale, which is also used as the VAT-registration start date.
- Verified: Swedish VAT-exempt domestic sales can coexist with VAT registration/foreign-purchase reporting obligation.
- Verified: in the described case, when registration only exists because of these purchases and the purchase is not connected to VAT-liable activity, there is no right to deduct the corresponding input VAT.
- Domain consequence for VAT V2 recon: domestic sales VAT status, foreign-purchase VAT reporting obligation, and input VAT deduction entitlement are separate dimensions and may have different values at the same time.
- Adobe Systems Software Ireland Ltd / Adobe Creative Cloud Photography is a real reference/regression case. Historical invoices include examples like 228 SEK net, 57 SEK charged foreign VAT, 285 SEK total, before a Swedish VAT number was provided.
- Historical wrongly VAT-charged Adobe invoices are a separate unresolved correction scenario; do not assume exact tax base, correction entry, VAT return treatment, Adobe crediting/re-invoicing, or booking before the service-specific facts are verified.
- Still not verified/designed: future data model; whether/how `vat_status = registered | not_registered | unknown` changes; exact accounts/system accounts; exact RPC changes; exact period model; historical Adobe correction; exact close/declare impact; exact UI; exact implementation.

## Deferred / Future Ideas

- Known non-blocking/deferred items: KAN-5/KAN-6 remaining empirical SIE/concurrency verification; full isolated staging E2E coverage; payment/refund flow after VAT close; 1630/tax-account handling; correction/reopen/undeclare flow for already declared VAT; empirical two-session concurrency coverage where previously documented.
- Future ideas only, not active implementation: reusable SoloLedger-native confirmation/status dialogs; bookkeeping transaction search/filter; read-only verification detail view with accounts/debit/credit/totals; preserve an already calculated VAT report visually after metadata-only actions such as Declare.
- VAT V2 future area: foreign purchases only for the first recon/design pass. Must cover EU goods purchases, EU service purchases, non-EU goods import, and non-EU service purchases/import. International sales, export, OSS, and broader foreign VAT stay out of initial scope unless later requirements justify expansion.
- VAT V2 principles: Adobe Ireland is a real reference case, not a hardcoded vendor rule; legal seller and actual invoice facts drive foreign-VAT classification; bookkeeping/account choice and VAT treatment are separate decisions; `not_registered` must not mean VAT is irrelevant; calculated output VAT must not automatically imply deductible input VAT in field 48; today's `vat_status = registered | not_registered | unknown` may be too coarse, but no schema change is proposed now.
- Before any VAT V2 implementation: perform a separate read-only recon of current repo architecture, live Supabase structure/RPC/RLS/grants where relevant, locked VAT V1 boundaries, and current Skatteverket sources.
- Future discovered requirement from KAN-9 design: invoice/receivable/year-end handling for issued customer invoices, payments, and unpaid receivables under the cash/bokslutsmetod. Verified accounting-flow need: an incoming customer payment is not necessarily a new sale; it may settle an already booked receivable, especially around year-end. This must not be built inside KAN-9 beyond preserving that principle.
- The invoice/receivable/year-end area must be treated as an identified need / recon area, not as a claim about missing SoloLedger capability. Future read-only recon must verify current support for bookkeeping method, invoice tracking, `1510`, receivables, B7/NE, VAT year-end handling, transaction/journal model, periodization/corrections, `close_year_atomic`, default accounts, and any existing receivable logic before designing implementation.
- Future scope to analyze separately: issued invoice date, payment date, unpaid/paid status, linking later payment to a prior invoice/receivable, year-end treatment of unpaid customer invoices, work/sales that may need to have been invoiced before year-end but were not, correct result year, balance/NE impact, VAT implications for VAT-registered users, and protection against double revenue booking when a receivable is paid in the following year.

## Next Safe Step

- Proposed planning checkpoint commit message: `Document verified VAT V2 planning update`
- Commit only `PROJECT_STATE.md` after explicit approval; push only after explicit approval.
- Next intended work: separate VAT V2 READ-ONLY recon in KAN-15. Do not start that recon in the same planning-update run.
- KAN-9 constraint: kontoplan/account guidance must preserve the locked VAT V1 accounting behavior and must not casually change `accountingService`, VAT mappings, report logic, RPCs, VAT guards, or NE behavior.
- Product goal for KAN-9: a sole proprietor should not need to know the BAS chart of accounts to choose the correct bookkeeping account. The motivating photography-course/account-7610 case requires verified guidance later; the private-purchase/company-card scenario should guide toward `eget uttag`; do not decide or implement those accounting rules during this planning checkpoint.
- Do not deploy, run migrations, perform live DB writes, move Jira issues, run broad checks, start VAT V2 recon, or resume KAN-9 without explicit approval.
