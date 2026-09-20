# SoloLedger Project State

Last updated: 2026-09-20

## Repository State

- Worktree: `C:\Users\Familjedator\Desktop\Sololedger Multi User App\sololedger_multi_user`
- Branch: `main`
- Git remote/origin verified as `https://github.com/sololedger/sololedger.git`
- Current `HEAD` and `origin/main` verified at `31b38a122e950150a2a04d97703c49711274a4de`.
- Working tree was clean before this state-sync documentation update.
- Current uncommitted state-sync changes:
  - `PROJECT_STATE.md`
  - `PROJECT_ARCHIVE.md`
- No deploy, DB write, app-code change, SQL/migration/test change, Jira write, commit, or push has been performed during this state sync.

## External Connections

- Supabase project ref `wbaxmuvudpnkvuliicuy` is accessible.
- Vercel team slug `sololedger1` was verified as accessible, but Vercel project slug `sololedger` was not verified through the plugin.
- Jira cloud ID: `42c6216d-73c5-4777-a644-c41ef9bc6a1a`
- Jira project: `KAN` / `Sololedger`, project ID `10001`
- Jira statuses: `To Do` (`10004`), `In Progress` (`10005`), `In Review` (`10006`), `Done` (`10007`)
- Jira users verified: Pontus Åkerhage `712020:01a218e5-6b15-4692-8096-c26687dca3f8`; Codex `712020:3ed8efb7-32c8-4b70-a72e-b7764cdb7802`

## Current Objective

- Current task: state sync after manual IRL/Production VAT V1 validation.
- Jira verified 2026-09-20:
  - KAN-5 `3B.5 Undo SIE VAT guard`: `In Review`, assignee empty.
  - KAN-6 `3B.5 Import SIE VAT guard`: `In Review`, assigned to Pontus.
  - KAN-7 `3B.5 close_vat_period_atomic foundation`: `Done`, assigned to Pontus.
  - KAN-8 `3B.6 declared VAT period`: `Done`, assignee empty.
  - KAN-12 `KAN-7B - Appintegration och integritetsskydd för momsperiodsstängning`: `Done`, assignee empty.
  - KAN-9 `Kontoplan guidance for enskild firma`: `To Do`, assignee empty.
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

## Deferred / Future Ideas

- Known non-blocking/deferred items: KAN-5/KAN-6 remaining empirical SIE/concurrency verification; full isolated staging E2E coverage; payment/refund flow after VAT close; 1630/tax-account handling; correction/reopen/undeclare flow for already declared VAT; empirical two-session concurrency coverage where previously documented.
- Future ideas only, not active implementation: reusable SoloLedger-native confirmation/status dialogs; bookkeeping transaction search/filter; read-only verification detail view with accounts/debit/credit/totals; preserve an already calculated VAT report visually after metadata-only actions such as Declare.

## Next Safe Step

- Proposed state-sync commit message: `Update state after VAT V1 production validation`
- Commit only `PROJECT_STATE.md` and `PROJECT_ARCHIVE.md` after explicit approval; push only after explicit approval.
- Next intended implementation work: KAN-9 `Kontoplan guidance for enskild firma`.
- KAN-9 constraint: kontoplan/account guidance must preserve the locked VAT V1 accounting behavior and must not casually change `accountingService`, VAT mappings, report logic, RPCs, VAT guards, or NE behavior.
- Product goal for KAN-9: a sole proprietor should not need to know the BAS chart of accounts to choose the correct bookkeeping account. The motivating photography-course/account-7610 case requires verified guidance later; do not decide or implement that accounting rule during state sync.
- Do not deploy, run migrations, perform live DB writes, move Jira issues, run broad checks, or start KAN-9 without explicit approval.
