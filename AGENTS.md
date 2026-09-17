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

There is currently no `typecheck` script in `package.json`. If a typecheck is needed, use the existing TypeScript config intentionally, for example `npx tsc --noEmit`.

There is currently no `test` script in `package.json`. Domain test files exist and can be run intentionally with local `tsx`, for example:

- `npx tsx scripts/test-result-engine.ts`
- `npx tsx scripts/test-accounting-knowledge.ts`

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
