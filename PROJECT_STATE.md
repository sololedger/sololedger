# SoloLedger Project State

Last updated: 2026-09-18

## Repository State

- Worktree: `C:\Users\Familjedator\Desktop\Sololedger Multi User App\sololedger_multi_user`
- Branch: `main`
- Git remote/origin previously verified as `https://github.com/sololedger/sololedger.git`
- Latest pushed checkpoint commit: `a274047 test: add Playwright regression foundation`
- Local `main` is synced with `origin/main` except for the untracked VAT draft.
- Current untracked draft: `supabase/migrations/20260917_DRAFT_vat_guard_undo_sie_import.sql`
- Draft SHA-256 verified during this state update: `508C13EDAA99AC8B119F166DA5015031CEDCC903FED7737AE2B4E86091C6BF9B`
- The draft must not be executed as-is.

## External Connections

- Supabase project ref `wbaxmuvudpnkvuliicuy` was previously verified as accessible.
- Vercel team slug `sololedger1` was previously verified as accessible, but Vercel project slug `sololedger` was not verified through the plugin.
- Jira cloud ID: `42c6216d-73c5-4777-a644-c41ef9bc6a1a`
- Jira project: `KAN` / `Sololedger`, project ID `10001`
- Jira board: `KAN board`, board ID `2`, type `simple`
- Jira statuses: `To Do` (`10004`), `In Progress` (`10005`), `In Review` (`10006`), `Done` (`10007`)
- Jira issue types in project: `Epic` (`10006`), `Subtask` (`10007`), `Task` (`10008`), `Story` (`10009`), `Bug` (`10010`)
- Jira users verified: Pontus Åkerhage `712020:01a218e5-6b15-4692-8096-c26687dca3f8`; Codex `712020:3ed8efb7-32c8-4b70-a72e-b7764cdb7802`
- KAN-4 was used for Jira write-test and ended in `In Review`, issue type `Story`, assigned to Pontus. It is not selected as the current 3B.5 issue.
- VAT roadmap Jira issues: KAN-5 `3B.5 Undo SIE VAT guard`, KAN-6 `3B.5 Import SIE VAT guard`, KAN-7 `3B.5 close_vat_period_atomic foundation`, KAN-8 `3B.6 declared VAT period`.
- Post-VAT / separate Jira issues: KAN-9 `Kontoplan guidance for enskild firma`, KAN-10 correction row ordering bug, KAN-11 login stuck on `Laddar` bug.
- Current Jira issue for implementation: none selected.

## Current Objective

- Build the VAT concurrency/closing foundation before normal VAT closing is implemented.
- Current phase: 3B.5 VAT concurrency/state guard.
- 3B.5 implementation order: `undo_sie_import_atomic` -> `import_sie_batch` -> `close_vat_period_atomic`.
- Immediate next product step: make only the minimal local draft correction for the two important `undo_sie_import_atomic` findings, then run a new read-only adversarial review.

## Playwright And Regression Status

- `@playwright/test` has been installed locally as a dev dependency.
- Chromium has been installed locally for Playwright.
- Playwright config and initial public auth smoke tests are checkpointed in `a274047`.
- Public unauthenticated E2E: available and verified for login/register/reset UI smoke.
- Authenticated E2E: blocked until a dedicated test/staging Supabase environment and test user are explicitly verified.
- Write/destructive E2E: blocked until the isolated test environment/test user/reset strategy are explicitly approved and verified.
- Safe regression entry point: `npm run test:regression`; last local run passed with domain tests plus public unauthenticated Playwright smoke tests.
- Current Supabase tooling sees only project `wbaxmuvudpnkvuliicuy` and no existing branches; creating a new project/branch requires explicit cost/approval flow.

## Verified / Implemented VAT Context

- Already implemented and tested guards: `book_transaction_atomic`, `book_periodized_transaction_atomic`, and `create_correction_transaction_atomic`.
- Live `public.undo_sie_import_atomic(uuid)` was verified as the older deployed function without VAT advisory locks and without the new VAT period guard.
- Repo migration `20260917_add_vat_concurrency_helpers.sql` defines VAT sync scope as `261x`, `262x`, `263x`, exact `2641`, and `265x`. It does not cover generic `264x`.
- Repo migration `20260917_add_vat_concurrency_helpers.sql` defines closing balance scope as `261x`, `262x`, `263x`, and exact `2641`. `265x` is synchronization/state safety scope, not closing balance scope.
- VAT locks are transaction-level PostgreSQL advisory locks per calendar month, independent of the user's VAT period type.
- VAT helper lock keys are based on namespace + user UUID + `YYYY-MM`.
- Multi-month VAT locks are taken in chronological calendar order.
- Global lock order: all VAT advisory locks -> other advisory locks -> row locks -> protected reads/writes.
- Undo VAT date is `greatest(current_date, original.date)`.
- VAT period blocking applies to `source = 'sololedger'` and status `closed` or `declared`; `imported_history` does not block.
- Authoritative closed state must not be inferred from 265x activity.

## Latest Review Notes For Undo Draft

- No clear blocker was found in the latest read-only adversarial review.
- Important finding 1: transaction-set revalidation in the draft is count-based; strengthen it with identity, relevant date, and/or source checks.
- Important finding 2: relevant `journal_entries` should be locked or otherwise stabilized so the authoritative VAT scan, validation, and undo write use the same stable row set.
- Nice-to-have excluded from this implementation: broad batch fingerprinting.

## Decided Design Not Yet Implemented

- `20260917_DRAFT_vat_guard_undo_sie_import.sql` is review-only. It has not been run live and must not be run in its current form.
- A prior V1 close-VAT draft, if found, must not be used as a migration without fresh review.
- `import_sie_batch` can contain arbitrary accounts and journal rows across multiple months. Its VAT guard should use two passes: read-only payload scan, collect all VAT-relevant calendar months, take VAT locks chronologically, check SoloLedger-managed VAT period state, then take the existing opening-balance advisory lock, then write. If any VAT-relevant row hits a SoloLedger period that is `closed` or `declared`, the whole import must stop atomically.
- `close_vat_period_atomic()` should be atomic, create a real `transactions` row with `source = 'vat_closing'` and journal rows when closing activity exists, use `period_end` as verification date, and base period membership/balances on `journal_entries.date`.
- Do not change `getMomsBreakdown()` just to implement VAT closing.
- Each actually relevant closing-scope account must be zeroed individually: `261x`, `262x`, `263x`, exact `2641`; net goes to `2650 Redovisningskonto för moms`.
- Normal auto-close should block and require manual review if there is already `265x` activity in the open period.
- `imported_history` must not be normal-closed by SoloLedger.
- Future periods must not be closed.
- A period whose `period_end` is in a locked year must not be closed.
- Closing must be concurrency-safe and idempotent.
- `close_vat_period_atomic()` must set `status = 'closed'`, set `closing_amount`, set `closing_transaction_id` when a closing verification exists, and must not set `declared_at`.
- Special case: no VAT activity means no artificial verification, `closing_amount = 0`, and `closing_transaction_id = NULL`.
- Special case: VAT activity exists and net is exactly 0 means create a real closing verification; `closing_transaction_id` is not NULL.
- Special case: VAT activity exists but all relevant per-account balances are already 0 means do not create fabricated 0/0 journal rows; block auto-close and send to manual review.
- No 1630 handling belongs in VAT V1. Later VAT payment is `2650 D / 1930 K`; later VAT refund is `1930 D / 2650 K`.
- Future SIE/export work should use the correct 2650 name: `Redovisningskonto för moms`.

## Future Work Requiring Design / Verification

- 3B.6 handles declared VAT period state: `open -> closed -> declared`. Closing and declaration must remain separate, and `close_vat_period_atomic()` must never itself set `declared_at`.
- Exact 3B.6 UX/DB behavior must be designed and verified when that phase starts.
- After the VAT track reaches a safe checkpoint, return to Kontoplan guidance for enskild firma users. Goal: help users answer "Vilket konto ska jag bokföra detta på?" without overconfident wrong recommendations.
- Kontoplan work must account for `accountingService`, VAT report logic, NE mapping/logic, and existing bookkeeping behavior. SoloLedger should prefer "needs checking" over confident incorrect account guidance.
- Do not mix NE's broader tax scope, such as 266/271/273, into VAT closing scope.
- Observation/bug to track separately: correction row in UI is not always shown next to the original transaction.
- Observation/bug to track separately: login for `testare@test.com` once remained stuck on `Laddar` until refresh.

## Next Safe Step

- Do not run the draft.
- Do not change live Supabase, run migrations, deploy, push, or commit without explicit approval.
- Next product step after this roadmap checkpoint: make only the minimal local draft correction for the two important undo findings, then run a new read-only adversarial review.
