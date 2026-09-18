<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# SoloLedger Agent Rules

SoloLedger is a Swedish bookkeeping application for enskild firma without employees.

Correct bookkeeping, auditability, user isolation, and data integrity always come before speed. If something is uncertain, stop and verify before changing it.

Core principle: **Osäker → SoloLedger gissar inte.**

## Sources Of Truth

- Live Supabase is the source of truth for the current database structure, constraints, indexes, RLS policies, grants, and deployed RPC definitions.
- The local repository is the source of truth for application code.
- Do not guess database structure, RPC signatures, function bodies, existing application behavior, or accounting rules. Inspect the relevant source first.
- Before modifying an existing RPC, read the live deployed definition with `pg_get_functiondef()` and check related constraints, indexes, RLS policies, and grants when relevant.
- The files in `supabase/migrations/` are historical migrations. Future DB changes should be new, small migration files unless the user explicitly asks for something else.
- `supabase/baseline/` is an audit/recovery snapshot of production state. Do not run a baseline file against the current live SoloLedger project. Refresh or compare it only with explicit user intent.
- If documentation, migration history, live database state, and implementation appear to disagree, do not choose a version by assumption. Report the discrepancy and verify the source of truth.

## Change Safety

- Do not change the live database, run migrations, alter Supabase configuration, or modify Supabase data without explicit user approval.
- Do not deploy without explicit user approval.
- Do not commit or push without explicit user approval.
- Make small, focused changes. Do not combine broad refactoring with changes to bookkeeping, VAT, SIE, reports, subscriptions, RLS, or RPC behavior.
- Do not change working bookkeeping, VAT, result, NE, SIE, year-closing, or correction logic without a concrete reason and targeted verification.
- Never delete or modify real user data as test data.
- Prefer known fixtures, disposable test data, or rollback-safe verification for database testing.
- If production data or live DB state must be inspected, keep the action read-only unless the user has explicitly approved a write.

## Normal Workflow

Use this default workflow unless the user gives a different instruction:

1. Analyze the relevant code, docs, migrations, and live DB definitions when DB behavior is involved.
2. Propose a small change and the verification plan.
3. Implement locally.
4. Run the relevant local checks.
5. Let the user verify.
6. Create a checkpoint.
7. Commit or push only after explicit user approval.

## Project Structure

Important repo areas:

- `src/app/` - Next.js App Router pages and API routes.
- `src/app/api/checkout/route.ts` - Stripe Checkout route; verifies Supabase session server-side.
- `src/app/api/portal/route.ts` - Stripe Customer Portal route; verifies Supabase session server-side.
- `src/app/api/webhook/route.ts` - Stripe webhook handling and subscription sync.
- `src/components/` - UI components for bookkeeping, VAT report, NE report, SIE import, profile, admin, subscription UI, and transaction history.
- `src/hooks/useAuth.ts` - auth lifecycle, profile loading, login/logout, password recovery.
- `src/hooks/useAccountingData.ts` - loading transactions, journal rows, balances, NE data, VAT data, accounts, and year lock state.
- `src/lib/supabaseClient.ts` - browser Supabase client.
- `src/lib/accountingService.ts` - central bookkeeping service, RPC calls, balances, VAT breakdown, NE data, year closing.
- `src/lib/resultEngine.ts` - pure result/NE classification engine. Do not introduce I/O here.
- `src/lib/calculations.ts` - dashboard calculations built on the shared result engine.
- `src/lib/accountingKnowledge.ts` - account presets and accounting knowledge used by setup and account UI.
- `src/lib/setupDefaultAccounts.ts` - default accounts for new users.
- `src/lib/sieParser.ts`, `src/lib/sieImport.ts`, `src/lib/sieExport.ts`, `src/lib/cp437.ts` - SIE parsing/import/export and encoding.
- `src/lib/subscriptionLimits.ts` - free/trial/paid/admin limits and counted verification rules.
- `tests/e2e/` - Playwright E2E and regression tests.
- `supabase/migrations/` - database migration history.
- `supabase/baseline/` - verified production schema snapshot for audit/recovery.
- `supabase/functions/delete-user/` - Supabase Edge Function for admin user deletion.

## Local Commands

Use npm. The repo has `package-lock.json`.

Available package scripts:

- `npm run dev` - start local Next.js dev server.
- `npm run build` - build the app.
- `npm run start` - start a built app.
- `npm run lint` - run ESLint.
- `npm run typecheck` - run TypeScript with `tsc --noEmit`.
- `npm run test:domain` - run the result-engine and accounting-knowledge domain tests.
- `npm run test:e2e` - run Playwright E2E tests.
- `npm run test:regression` - run the safe regression suite.

Run only checks relevant to the change, and report any check that could not be run.

## Generated And Local Files

Do not hand-edit generated or local environment files:

- `next-env.d.ts`
- `.next/`
- `tsconfig.tsbuildinfo`
- `node_modules/`
- `.vercel/`
- `.env*`

Do not expose secrets from `.env` or any other local secret source.

`package-lock.json` should be changed only as the result of an intentional dependency/install change.

## Database And Supabase Rules

Central bookkeeping writes should remain server-side/database-side through RPCs, not recreated as multi-step client writes.

Important RPCs include:

- `book_transaction_atomic`
- `update_transaction_safe`
- `create_correction_transaction_atomic`
- `book_periodized_transaction_atomic`
- `import_sie_batch`
- `undo_sie_import_atomic`
- `close_year_atomic`
- `delete_user_data_atomic`

When changing DB behavior:

- Inspect the current live definition first.
- Check whether the change affects RLS, grants, indexes, constraints, triggers, storage policies, or Edge Functions.
- Prepare a complete migration file for review before any live execution.
- Keep migrations small and focused.
- Do not rewrite old applied migrations just to make them match current function bodies.
- Do not assume the baseline is a fresh-install migration.

## Accounting Rules

- Accounting behavior and invariants must be verified against current code, live DB definitions, migrations, and relevant project documentation before being changed.
- Do not treat `AGENTS.md` as a substitute for inspecting the implementation.
- Preserve the architecture that sensitive bookkeeping writes go through server-side/database-side validation.
- Preserve the principle that booked accounting history should be corrected through auditable bookkeeping mechanisms rather than casual mutation or deletion.
- Preserve user isolation, RLS/grant boundaries, and server-side identity checks around accounting data.
- When working with VAT, SIE, NE, year closing, corrections, periodization, account balances, or report calculations, verify the current implementation and the live database behavior before making changes.

## Security Boundaries

- Treat Supabase RLS, grants, server-side RPC validation, and server/Edge code as security boundaries.
- Treat client-side subscription/paywall checks primarily as product/UI enforcement, not protection for bookkeeping data.
- Do not expose `SUPABASE_SERVICE_ROLE_KEY`, Stripe secrets, or other server secrets to client code.
- `NEXT_PUBLIC_*` values are browser-visible.
- Checkout and portal flows must derive the user from a verified Supabase session server-side.
- Admin actions must verify admin authorization server-side/database-side.
- Storage attachments belong in the user's own path and must remain protected by Storage RLS.

## Testing And Regression

- Playwright is the E2E/regression tool for browser-level verification. Keep tests deterministic and focused on user-observable behavior.
- Every real bugfix must be assessed for an automated regression test. If the bug can be reproduced safely and deterministically, normally add a test that would have caught it and keep that test in the regression suite.
- If a bug is not suitable for automation, document why and give Pontus a concrete manual test step.
- Before Jira work is moved to `In Review`, relevant checks must be green, relevant tests for the changed surface must be green, and the safe regression suite for the current environment must be green.
- `In Review` means Codex implementation and automated verification are complete; Pontus IRL testing remains. Pontus normally sets `Done` after final testing.
- Destructive or write E2E tests may run only against an explicitly verified isolated test/staging environment and dedicated test user.
- Never run automated destructive/write E2E against ordinary/live Supabase or real user data.
- Test credentials and auth storage must stay out of Git, `AGENTS.md`, `PROJECT_STATE.md`, `PROJECT_ARCHIVE.md`, and Jira.
- Public/read-only Playwright smoke tests may run without a dedicated Supabase test project. Authenticated/write tests require a verified test environment first.

## Jira Workflow

- Jira is the source of truth for work queue, issue status, and assignment. It is not a source of truth for code, database implementation, accounting behavior, or live Supabase state.
- Pontus normally chooses and prioritizes work and assigns it to Codex.
- Do not start implementing other Jira issues just because they exist.
- Before using Jira for task tracking, verify the current Jira project, issue type, status, assignee, account IDs, and available transitions from Jira itself. Never guess Jira status, transition, or account IDs.
- Do not infer the active engineering task from an existing Jira issue unless the user explicitly selects it or the issue is clearly assigned as the current task.
- Do not auto-link unrelated Jira issues to sensitive bookkeeping, VAT, SIE, or database work.
- Create, edit, comment on, assign, or transition Jira issues only when the user has requested that Jira action or approved it for the current workflow.
- If a separate real bug is discovered during other work, first search Jira for a relevant duplicate. If no relevant duplicate exists, a new `Bug` issue may be created when Jira-write is allowed for the workflow. Do not begin implementing that new bug unless Pontus selects, assigns, or approves it.
- Jira bug reports should be compact and useful. When known, include reproduction, expected behavior, actual behavior, and scope/context.
- Do not write secrets or real sensitive user data in Jira.
- When assigned Jira work is implemented and Codex verification is complete but Pontus final testing remains, transition the issue to the verified `In Review` status, assign it to Pontus, and add a short Jira comment with what changed, what Codex verified, exactly what Pontus should test, and known limitations when relevant.
- Do not set a Jira issue to `Done` as a substitute for Pontus final testing unless Pontus explicitly instructs it.
- When work comes from Jira, include the issue key in relevant `PROJECT_STATE.md` entries and normally in the commit message.
- When creating Jira issues for SoloLedger work, prefer small scoped tasks that can be reviewed and verified independently.

## Session State And Handoff

- At the start of a substantive work session, read `AGENTS.md` and `PROJECT_STATE.md` when they exist.
- Do not read `PROJECT_ARCHIVE.md` by default. Read it only when the current task needs older history or `PROJECT_STATE.md` points to it.
- If a current Jira issue is listed, read it before acting on that task.
- Keep `PROJECT_STATE.md` concise and current for active work: branch, checkpoint, dirty files, current focus, verified external connections, and next safe step.
- Keep `PROJECT_STATE.md` normally under about 150 lines.
- Use `PROJECT_ARCHIVE.md` only for compact long-term summaries of completed or superseded workstreams. Do not move an active workstream there prematurely.
- Do not put quickly stale task state in `AGENTS.md`; keep permanent rules here and task-specific state in `PROJECT_STATE.md` or the current prompt.
- `PROJECT_STATE.md` and `PROJECT_ARCHIVE.md` are navigation and handoff aids. They must never replace the actual implementation, Git history, or live Supabase as source of truth.
- Verify relevant state claims before sensitive decisions.
- Do not write secrets or real sensitive user data in `PROJECT_STATE.md` or `PROJECT_ARCHIVE.md`.
- If project documentation, `PROJECT_STATE.md`, migrations, live DB state, and implementation disagree, report the discrepancy and verify the relevant source of truth before acting.

## Retention

- Check retention during `Prepare handoff` and `Finalize checkpoint`.
- Move or compress information into `PROJECT_ARCHIVE.md` when it belongs to completed verified/checkpointed work, is a resolved blocker or finding that no longer affects the next step, has been replaced by a later verified decision, or is no longer needed for the Current Objective or Next Step.
- Do not archive raw prompts, large diffs, or unnecessary reasoning.
- Do not remove still-relevant information solely to meet the line guideline.

## Prepare Handoff

When Pontus says `Prepare handoff`, or clearly asks for the same action:

- Do not implement new functionality.
- Verify repo, branch, git status, diff, and latest commit.
- Check the current Jira issue when relevant.
- Verify the actual current state before changing handoff files.
- Run retention.
- Update `PROJECT_STATE.md`.
- Update `PROJECT_ARCHIVE.md` only when relevant.
- Mark uncommitted or incomplete work clearly.
- State the exact Next Step.
- Show or summarize the handoff diff.
- Ask for explicit approval before committing or pushing handoff documentation.
- After approval, commit only the handoff documentation and push to the current branch.
- Verify the local branch and remote point to the same commit and the working tree is clean.
- The handoff is complete only after the handoff documentation is committed, pushed, and verified clean.

## Checkpoints And Finalization

- Before a checkpoint commit, verify exactly which files are included and ensure unrelated user changes are not included.
- A checkpoint commit is local unless the user explicitly approves a push.
- At the end of a meaningful task, report changed files, checks run, checks not run, current git status, and whether any Jira, Supabase, migration, deploy, commit, or push action was performed.
- When Pontus says `Finalize checkpoint`, do not start new implementation. Verify the current diff, run relevant checks, verify current Jira/state status, run retention, update `PROJECT_STATE.md` and when needed `PROJECT_ARCHIVE.md` to the verified state, present exactly which files should be included, propose a commit message, and wait for explicit approval.
- Commit requires explicit approval.
- Push requires explicit approval unless Pontus explicitly approves commit and push together in the same instruction.
- Deploys and live Supabase writes continue to require explicit approval under the existing rules.
