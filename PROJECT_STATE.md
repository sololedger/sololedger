# SoloLedger Project State

Last updated: 2026-09-18

## Repository State

- Worktree: `C:\Users\Familjedator\Desktop\Sololedger Multi User App\sololedger_multi_user`
- Branch: `main`
- Git remote/origin previously verified as `https://github.com/sololedger/sololedger.git`
- Latest pushed checkpoint commit: `84db24d docs: add project state and Jira workflow`
- Local `main` is synced with `origin/main` except for Playwright/test-infrastructure changes ready for checkpoint and the untracked VAT draft.
- Current untracked draft: `supabase/migrations/20260917_DRAFT_vat_guard_undo_sie_import.sql`
- Draft SHA-256 verified before this state update: `508C13EDAA99AC8B119F166DA5015031CEDCC903FED7737AE2B4E86091C6BF9B`
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
- Current Jira issue for 3B.5: none selected.

## Current Objective

- Checkpoint the completed Playwright/safe regression-test foundation after user approval.
- Build the VAT concurrency foundation step 3B.5 before `close_vat_period_atomic()`.
- Current focus after setup: minimal local correction of the two important findings in the draft for `public.undo_sie_import_atomic(uuid)`, then a new adversarial review.
- Later steps: review/update `import_sie_batch`, then proceed to `close_vat_period_atomic()`.

## Playwright And Regression Status

- `@playwright/test` has been installed locally as a dev dependency.
- Chromium has been installed locally for Playwright.
- Playwright config and initial public auth smoke tests are established locally.
- Public unauthenticated E2E: available and verified for login/register/reset UI smoke.
- Authenticated E2E: blocked until a dedicated test/staging Supabase environment and test user are explicitly verified.
- Write/destructive E2E: blocked until the isolated test environment/test user/reset strategy are explicitly approved and verified.
- Safe regression entry point: `npm run test:regression`; last local run passed with domain tests plus public unauthenticated Playwright smoke tests.
- Current Supabase tooling sees only project `wbaxmuvudpnkvuliicuy` and no existing branches; creating a new project/branch requires explicit cost/approval flow.

## Verified VAT Concurrency Context

- Already implemented and tested guards: `book_transaction_atomic`, `book_periodized_transaction_atomic`, and `create_correction_transaction_atomic`.
- Live `public.undo_sie_import_atomic(uuid)` was verified as the older deployed function without VAT advisory locks and without the new VAT period guard.
- Relevant live helper scope: `vat_concurrency_account(text)` covers `261x`, `262x`, `263x`, exact `2641`, and `265x`. It does not cover generic `264x`.
- VAT locks are per calendar month.
- Global lock order: all VAT advisory locks, then other advisory locks, then row locks, then protected reads/writes.
- Undo VAT date is `greatest(current_date, original.date)`.
- VAT period blocking applies to `source = 'sololedger'` and status `closed` or `declared`; `imported_history` does not block.

## Latest Review Notes For Undo Draft

- No clear blocker was found in the latest read-only adversarial review.
- Important finding 1: transaction-set revalidation in the draft is count-based; strengthen it with identity, relevant date, and/or source checks.
- Important finding 2: relevant `journal_entries` should be locked or otherwise stabilized so the authoritative VAT scan, validation, and undo write use the same stable row set.
- Nice-to-have excluded from this implementation: broad batch fingerprinting.

## Next Safe Step

- Do not run the draft.
- Do not change live Supabase, run migrations, deploy, push, or commit without explicit approval.
- Next product step after Playwright checkpoint: make only the minimal local draft correction for the two important undo findings, then run a new read-only adversarial review.
