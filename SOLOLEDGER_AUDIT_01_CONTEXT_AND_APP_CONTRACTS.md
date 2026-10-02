# SoloLedger External Audit #1 - Context And App Contracts

Repository state, product context, app orchestration, user-facing VAT/profile/import contracts, and data-loading hooks.

This file is part of SoloLedger External Audit #1. It contains verbatim source from the approved repository snapshot.

==================================================
FILE: AGENTS.md
==================================================

````markdown
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
- `supabase/migration_archive/pre_20260925000000_legacy_date_only/` contains legacy SQL that was historically applied manually in Supabase SQL Editor and then saved in Git. It is not an active Supabase CLI migration chain and must not be replayed against current production.
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

Supabase CLI may create or recreate `supabase/.temp/`. In the verified SoloLedger case it contained generated CLI state files `cli-latest` and `linked-project.json`. That generated directory alone is not a source-code working-tree failure, but before ignoring or removing it, inspect only filenames/metadata/status and verify it contains no project source or migration changes. Never read or display credential/secret contents, and do not add generated `.temp` state to Git merely to make status clean.

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
- `supabase/migrations/20260925000000_pre_kan17_cli_baseline.sql` is the active CLI cutover/reconstruction baseline for the manually-applied legacy SQL era. It is separate from the audit/recovery snapshots in `supabase/baseline/` and must not be executed against the existing production database.
- Supabase MCP `apply_migration` accepts a migration name and SQL but generates the live migration version separately. For committed timestamped repo migrations, use an official workflow that preserves or repairs repo/live migration identity; do not assume MCP `apply_migration` records the filename timestamp as the applied version.
- Do not use MCP `apply_migration` for timestamped repo migrations where repo/live version identity matters. The preferred flow is: local migration -> isolated local DB verification -> review/checkpoint -> official Supabase CLI apply preserving the same version -> verify that exact version live.
- Do not use migration repair casually. If migration history is inconsistent, diagnose the repo migration versions, remote `supabase_migrations` ledger, and stored migration SQL first; never use `--include-all` or execute historical migrations against production merely to make history align.

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
- PostgreSQL 17 client may be available at `C:\Program Files\PostgreSQL\17\bin\psql.exe` even when `psql` is not on PATH. Reuse the existing isolated SoloLedger local PostgreSQL test environment when appropriate instead of recreating it unnecessarily.
- Never read, display, copy, or hash pgpass contents. Use `PGPASSFILE` only as process/session-local test configuration.
- The production-derived local PostgreSQL database strategy remains the preferred safe DB/RPC regression environment when live data writes are not approved.

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
````````

==================================================

==================================================
FILE: PROJECT_STATE.md
==================================================

````markdown
# SoloLedger Project State

Last updated: 2026-09-30

## Repository State

- Worktree: `C:\Users\Familjedator\Desktop\Sololedger Multi User App\sololedger_multi_user`
- Branch: `main`
- Git remote/origin: `https://github.com/sololedger/sololedger.git`
- Production path: GitHub `sololedger/sololedger` `main` -> Vercel team
  `sololedger1`, project `sololedger`, domain `https://sololedger.vercel.app`.
- This checkout has no `.vercel/project.json`; do not use a manual Vercel CLI
  deployment path without re-verifying team/project context and explicit
  approval.
- `supabase/.temp/` may exist as generated Supabase CLI state only. Verified
  generated files in this checkpoint include `cli-latest`, `gotrue-version`,
  `linked-project.json`, `pooler-url`, `postgres-version`, `project-ref`,
  `rest-version`, `storage-migration`, and `storage-version`. Do not
  read/display secrets and do not add this directory to Git.

## External Connections

- Jira cloud ID: `42c6216d-73c5-4777-a644-c41ef9bc6a1a`
- Jira project: `KAN` / `Sololedger`, project ID `10001`
- KAN-20 and KAN-26 are `Done`; KAN-27 VAT settlement is production-accepted.
- Do not modify Jira until Pontus explicitly approves that step.
- Live Supabase migration head: `20260929183000`.

## Current Objective

- VAT lifecycle Slice 3 tax-account money movement implementation exists and is
  ready for the app checkpoint.
- Production migration is LIVE and verified:
  `supabase/migrations/20260929183000_add_tax_account_movement.sql`
- Migration SHA-256:
  `E32E1C0E55CEA8BF6A44A23367C1AC469CB97491327D24CB3F8025684EF5C679`
- Live DB verification verdict:
  `LIVE DB APPLY VERIFIED - SAFE TO PROCEED TO APP CHECKPOINT`
- The migration created zero `tax_account_movements`, zero
  `tax_account_movement` transactions, and zero related journal entries.
- Production IRL UI/accounting acceptance passed for TESTNAMN AB on
  2026-09-30. Accepted proof: `VER-17` source `tax_account_movement`,
  Dr `2012` 4000.00 / Cr `1930` 4000.00, exactly one linked
  `tax_account_movements` row, no duplicate/retry artifact.
- KAN-27 remains separate: `VER-16` source `vat_settlement`,
  Dr `2650` 4000.00 / Cr `2012` 4000.00. Combined `VER-16` + `VER-17`
  nets account `2012` to zero for the Q1 lifecycle chain.

## Slice 3 Durable Architecture

- New controlled transaction source: `tax_account_movement`.
- New immutable metadata table: `public.tax_account_movements`.
- New RPC:
  `record_tax_account_movement_atomic(text,date,numeric,uuid,uuid)`.
- Movement kinds are:
  `business_to_tax_account`, `owner_private_to_tax_account`,
  `tax_account_to_business`, and `tax_account_to_owner_private`.
- Business funding uses configured semantic payment role
  `business_payment_account`; private funding uses
  `owner_private_payment`; tax-account-to-private withdrawal derives fixed
  counter account `2013`.
- The database supports nullable `vat_period_id` for future unlinked
  tax-account movements, while the current UI is VAT-focused first.
- Durable DB idempotency is enforced by `(user_id, idempotency_key)` and the
  frontend stores retry/session intent for indeterminate submit outcomes.
- Generic edit and generic correction are blocked for `tax_account_movement`;
  ordinary VAT guard activity is false.
- `tax_account_movements` grants/RLS are intended: authenticated can read only
  own rows and cannot directly insert/update/delete metadata; service role has
  intended table access.

## Verification State

- Local isolated PostgreSQL 17 rollback regression passed for the final Slice 3
  migration before production apply.
- Live post-apply verification passed for migration history, source constraint,
  taxonomy, table constraints/indexes, RLS/grants, triggers, RPC definition,
  generic guards, zero side effects, and existing KAN-27 sanity.
- Existing Q1 `VER-15`/`VER-16` VAT lifecycle data was checked read-only after
  migration and no mutation was observed.
- Final app checkpoint passed: `git diff --check`, `npm run typecheck`,
  focused tax-account movement UI tests, and `npm run test:domain`.
- Full repo `npm run lint` still has pre-existing unrelated debt; do not fix
  unrelated lint debt as part of Slice 3.
- Existing Dashboard Bank card remains hard-coded to `1930`; this is out of
  scope for Slice 3.

## Live Migration State

- Active live migrations include the reconciled CLI baseline and all active
  migrations through `20260929183000`.
- Current head:
  `20260929183000_add_tax_account_movement.sql`.
- Future production DB migrations should use the official Supabase CLI flow
  preserving repo migration versions.
- Do not use MCP `apply_migration` for timestamped repo migrations where
  repo/live version identity matters.
- Do not use `--include-all`, repair history casually, or execute archived
  legacy migrations against production.

## Local Test Environment

- Production-derived local PostgreSQL DB `sololedger_kan17c_test` remains the
  preferred safe DB/RPC regression environment.
- PostgreSQL 17 client exists at `C:\Program Files\PostgreSQL\17\bin\psql.exe`.
- Authorized local credential file for isolated local PostgreSQL verification:
  `C:\SoloLedger\LocalTest\pgpass.conf`.
- Never read/display/copy/hash pgpass contents; use that file only via
  process/session-local `PGPASSFILE`.

## Next Safe Step

- Close Jira KAN-28 if it is confirmed to be the Slice 3 tax-account money
  movement issue.
- Do not deploy manually, perform production accounting actions, or start
  unrelated follow-up work without explicit approval.
````````

==================================================

==================================================
FILE: Architecture.md
==================================================

````markdown
# SoloLedger — Arkitekturöversikt

Den här filen beskriver SoloLedgers nuvarande huvudarkitektur. SoloLedger är byggt för svensk **enskild firma utan anställda**.

## Översikt

```text
Browser / React
    |
    +-- Supabase Auth
    +-- Supabase SELECT via RLS
    +-- PostgreSQL RPC för känsliga bokföringsskrivningar
    +-- Supabase Storage för bilagor
    |
Next.js API routes
    |
    +-- Stripe Checkout
    +-- Stripe Customer Portal
    +-- Stripe Webhooks
    |
Supabase
    +-- PostgreSQL + RLS
    +-- Storage + Storage RLS
    +-- Edge Function: delete-user
```

## `src/app/`

**`page.tsx`** — Huvudsidan. Orkestrerar tabs, formulär, modaler, filuppladdning och UI-state samt konsumerar auth- och bokföringshooks.

**`layout.tsx`** — Next.js root layout.

**`globals.css`** — Global CSS.

### `src/app/api/`

| Route | Ansvar |
|---|---|
| `checkout/route.ts` | Verifierar Supabase-användare server-side och skapar Stripe Checkout |
| `portal/route.ts` | Verifierar Supabase-användare server-side och öppnar Stripe Customer Portal |
| `webhook/route.ts` | Tar emot Stripe-events och synkroniserar prenumerationsstatus |

Webhooken hanterar relevanta Checkout-, invoice- och subscription-events, inklusive `customer.subscription.updated`.

## `src/components/`

| Fil | Ansvar |
|---|---|
| `AdminPanel.tsx` | Adminvy: användarlista, dry-run och permanent användarradering |
| `FAQ.tsx` | Produkt- och bokföringsinformation |
| `FavoriteChips.tsx` | Sparade bokföringsfavoriter |
| `Kontoplan.tsx` | Användarens kontoplan och skydd mot borttagning av använda kategorier |
| `Layout.tsx` | Navigation, logout och Admin-tab för admin |
| `Momsrapport.tsx` | Visar momsrapport |
| `NEBilaga.tsx` | NE-underlag/förenklat årsbokslut |
| `OverviewCards.tsx` | Dashboardens sammanfattningskort |
| `Paywall.tsx` | Information/uppgradering för free/trial/paid |
| `ProfileSettings.tsx` | Profil, lösenord och SIE-importhistorik/undo |
| `SubscribeButton.tsx` | Startar prenumerationsflöde |
| `SubscriptionGuard.tsx` | UI-behörighet för prenumerationsfunktioner |
| `TransactionForm.tsx` | Skapa/redigera transaktioner; låser bokföringsdatum när relevant |
| `TransactionTable.tsx` | Historik, journalrader, KORRVER och SIE-undo-presentation |

## `src/hooks/`

| Fil | Ansvar |
|---|---|
| `useAuth.ts` | Auth-livscykel, profil, login/logout, recovery och lösenordsbyte |
| `useAccountingData.ts` | Transaktioner, journaler, saldon, kontoplan, NE-data, refresh och årslåsning |

`useAccountingData` håller årsspecifik data synkroniserad och använder separat logik för årsresultat respektive kumulativa balanskonton.

## `src/lib/`

| Fil | Ansvar |
|---|---|
| `accountingService.ts` | Bokförings-RPC:er, saldon, moms, NE-data, korrigering och periodisering |
| `calculations.ts` | Dashboard-/sammanställningsberäkningar |
| `setupDefaultAccounts.ts` | Standardkonton för nya användare |
| `sieImport.ts` | SIE-import och validering |
| `sieExport.ts` | SIE-export |
| `subscriptionLimits.ts` | Free/trial/paid-regler och 15-verifikationsgränsen |
| `supabaseClient.ts` | Browser-klient för Supabase |

## Bokföringsarkitektur

Centrala bokföringsskrivningar sker genom PostgreSQL-funktioner i stället för direkta klientskrivningar.

### Normal bokning

`book_transaction_atomic`

Skapar transaction, verifikationsnummer och journalrader i samma PostgreSQL-transaktion. Servern validerar bland annat användare och stödda momssatser.

### Redigering

`update_transaction_safe`

Bokförda transaktioners ekonomiska kärnfält och bokföringsdatum kan inte ändras fritt efter bokföring. Tillåtna metadataändringar hanteras server-side.

### Korrigering

`create_correction_transaction_atomic`

Skapar separat korrigeringsverifikation med spegelvända journalrader. Samma originalverifikation kan endast korrigeras en gång; databasen har en unik spärr på användare + korrigerat verifikationsnummer.

### Periodisering

`book_periodized_transaction_atomic`

Skapar periodiseringens original- och vändningsverifikation atomiskt.

### SIE-import

`import_sie_batch`

Importerar SIE atomiskt och hanterar bland annat verifikationer, ingående balans, resultatbrygga och duplicate-opening-skydd.

### SIE-undo

Säker undo av en orörd genomförd import skapar korrigeringsverifikationer i stället för att hårdradera importerad bokföringshistorik. Importbatchen markeras som ångrad.

## Resultat och balans

SoloLedger skiljer på resultat- och balanskonton:

- Resultatkonton (3xxx–8xxx) beräknas per räkenskapsår.
- Balanskonton (1xxx–2xxx) beräknas kumulativt fram till valt års slut.

NE/B10 använder kumulativa balansvärden och kumulativt eget kapital enligt appens verifierade modell.

## Moms

Stödda momssatser för appens normala bokföringsflöden är:

- 25 %
- 12 %
- 6 %
- 0 %

Server-side validering finns i bokförings-RPC:erna.

Momsrapporten bygger på journalrader. Interna momsombokningar med 265x identifieras så att de inte räknas som nya affärshändelser.

## NE

NE-vyn visar R1–R17 samt relevanta balansrader B1–B10 och B13–B16 för förenklat årsbokslut.

R7 finns kvar som deklarationsrad men är normalt 0 för SoloLedgers målgrupp utan anställda och döljs tillsammans med andra tomma deklarationsrutor i normalvyn.

R14–R16 saknar i nuläget automatisk specialmappning och visas som 0 tills särskilt stöd implementeras.

NE-vyn är ett underlag och inte en elektronisk deklarationsinlämning till Skatteverket.

## Supabase

### Centrala tabeller

| Tabell | Innehåll |
|---|---|
| `profiles` | Profil, företag, roll och Stripe/prenumerationsdata |
| `transactions` | Bokförda transaktioner och korrigeringsmetadata |
| `journal_entries` | Debet-/kreditrader |
| `accounts` | Kontoplan per användare |
| `favorites` | Sparade bokföringsfavoriter |
| `closed_years` | Låsta räkenskapsår |
| `import_batches` | SIE-importhistorik, status och undo-metadata |
| `ver_nr_sequences` | Atomisk verifikationsnummersekvens |

### RLS och grants

RLS används för användarisolering. Normala användare ska endast kunna läsa sin egen bokföringsdata.

Direkta klientskrivningar till `transactions` och `journal_entries` är begränsade; normala bokföringsskrivningar går via server-side RPC:er.

`profiles` tillåter vanlig användare att uppdatera avsedda företagsfält, medan roll-, subscription- och Stripe-fält inte är klientredigerbara.

Adminåtkomst avgörs av server-/databasverifierad roll.

## Storage

Bucket: `attachments`

Konfiguration:

- Privat bucket.
- Objekt lagras under `<user-id>/...`.
- Storage RLS begränsar SELECT, INSERT och DELETE till den inloggade användarens egen mapp.
- Max filstorlek: **10 MB**.
- Tillåtna MIME-typer:
  - `image/jpeg`
  - `image/png`
  - `image/webp`
  - `application/pdf`

Frontend validerar också filtyp och genererar säkra filnamn, men bucket-konfigurationen är det server-side skyddet mot andra filtyper/storlekar.

> Filstorlek och MIME-lista är Supabase bucket-konfiguration och ligger inte i PostgreSQL-migrationshistoriken. Ändringar där ska därför dokumenteras här.

## Edge Function: `delete-user`

Permanent adminradering följer i huvudsak:

```text
Verifiera anropare/admin
        ↓
Hantera Stripe-prenumeration
        ↓
Radera Storage-bilagor
        ↓
Atomisk PostgreSQL-radering
        ↓
Extra Storage-sweep/kontroll
        ↓
Radera Supabase Auth-användare sist
```

Databasraderingen sker genom `delete_user_data_atomic`, som tar bort appdata i en PostgreSQL-transaktion.

Hela kedjan kan inte vara globalt atomisk eftersom Stripe, Storage, PostgreSQL och Auth är separata system. Extra Storage-kontroll används för att minska risken för filer som skapas under raderingsflödet.

Self-service account deletion är inte implementerad; permanent radering är tills vidare en adminfunktion.

## Stripe

Stripe används för Checkout, Customer Portal och webhook-synkronisering.

Next.js API-routes accepterar inte ett klientangivet användar-ID som sanning. Supabase-token verifieras server-side och användaren härleds från den verifierade sessionen.

Webhooken uppdaterar prenumerationsinformation i `profiles` när relevanta Stripe-events tas emot.

Prenumerations-/free-limit-regler är främst produktregler på klient/UI-nivå. De ska inte betraktas som samma säkerhetsgräns som RLS och server-side bokföringsvalidering.

## Databasbaseline och migrationsprincip

Verifierad produktionssnapshot:

`supabase/baseline/20260911_production_schema_baseline.sql`

Baselinen dokumenterar det verifierade produktionsläget för audit/recovery. Den är inte tänkt som en garanterat komplett fresh-install migration.

Historiska migrationsfiler behålls. Framtida databasändringar ska göras som nya, små migrationsfiler i stället för att skriva om gamla fullständiga funktionskopior.

## Viktiga integritetsregler

- Bokförda poster rättas med KORRVER, inte normal hårdradering.
- Samma originalverifikation kan inte korrigeras två gånger.
- Använda kontoplanskategorier kan inte tas bort.
- Bokföringsdatum på bokförd transaktion kan inte flyttas efter bokföring.
- Låsta år blockerar relevanta ändringar.
- Bokförings-RPC:er verifierar användaren server-side/databas-side.
- Bilagor isoleras per användare genom Storage RLS.

## Kända avgränsningar / teknisk skuld

- Projektet innehåller fortfarande TypeScript `any` på flera ställen. Detta är accepterad teknisk skuld och inte i sig en säkerhetsgräns.
- Free/trial/paywall-enforcement är huvudsakligen klientbaserad och betraktas som en accepterad affärsrisk, inte som skydd för bokföringsdata.
- Self-service permanent kontoradering är inte implementerad.
- Storage bucket-inställningar för maxstorlek/MIME dokumenteras här eftersom de inte ligger i Git-migrationerna.
````````

==================================================

==================================================
FILE: README.md
==================================================

````markdown
# SoloLedger

SoloLedger är en Next.js + Supabase-applikation för enkel bokföring i svensk **enskild firma utan anställda**.

Projektet innehåller bokföring, verifikationer, momsrapport, NE-underlag, SIE import/export, bilagor, årslåsning samt prenumerationshantering via Stripe.

## Projektstatus

Kärnflödena är implementerade och har testats löpande i utvecklings- och produktionsmiljö. Databasändringar hanteras med migrationsfiler under `supabase/migrations/`.

## Huvudfunktioner

### Bokföring
- Vanliga intäkter och kostnader bokförs via atomiska PostgreSQL-RPC:er.
- Verifikationsnummer skapas server-side och sekventiellt per användare.
- Bokförda transaktioner hårdraderas inte i normala användarflöden.
- Felaktiga verifikationer rättas med separat korrigeringsverifikation (KORRVER).
- Samma originalverifikation kan endast korrigeras en gång.
- Bokföringsdatum och ekonomiska kärnfält på en bokförd transaktion kan inte ändras i efterhand.
- Periodisering över årsskifte skapar original- och vändningsverifikation atomiskt.
- Låsta räkenskapsår blockerar relevanta bokföringsändringar.

### Moms och NE
- Moms stöds för 25 %, 12 %, 6 % och 0 %.
- Utgående moms routas till 261x/262x/263x och ingående moms till 264x enligt appens bokföringsmodell.
- Momsrapporten bygger på journalrader och hanterar interna momsombokningar.
- NE-vyn visar resultat- och balansrader för förenklat årsbokslut.
- Balanskonton beräknas kumulativt medan resultatkonton beräknas per räkenskapsår.
- NE-underlaget är ett hjälpmedel för deklarationen och ersätter inte Skatteverkets deklarationstjänst.

### SIE
- Import av SIE med verifikationer, ingående balans och resultathantering.
- Importen sker atomiskt: en felaktig import ska inte lämna ett halvt importerat underlag.
- Importhistorik sparas i `import_batches`.
- En orörd genomförd import kan ångras genom korrigeringsverifikationer; importerad bokföringshistorik hårdraderas inte.
- SIE-export genereras från bokförda verifikationer och journalrader.

### Kontoplan och historik
- Varje användare har sin egen kontoplan.
- Konton/kategorier som redan används av bokförda transaktioner kan inte tas bort.
- Historiska transaktioner presenteras utifrån de journalrader som faktiskt bokfördes, inte en senare ändrad kontoplansdefinition.

### Bilagor
- Kvitton och andra bilagor kan lagras i Supabase Storage.
- Tillåtna filtyper i appen är JPG, PNG, WebP och PDF.
- Storage-bucketens server-side begränsningar dokumenteras i `Architecture.md`.

## Prenumerationer

SoloLedger har stöd för `free`, `trial`, `paid` och administratörsbehörighet.

- Gratisversionen tillåter totalt 15 räknade bokföringsverifikationer per konto.
- Korrigeringsverifikationer och teknisk SIE-ingående balans räknas inte mot gratisgränsen.
- Trial är 14 dagar.
- Stripe Checkout används för att starta prenumeration.
- Stripe Customer Portal används för hantering av prenumerationen.
- Stripe-webhooks synkroniserar relevanta prenumerationshändelser till `profiles`, inklusive subscription updates.

> Prenumerations-/gratisgränsen är i nuläget främst ett produkt- och UI-skydd. Bokföringsintegritet och användarisolering skyddas separat i databasen med RLS, grants och server-side RPC-validering.

## Säkerhetsmodell

SoloLedger använder Supabase Auth och Row Level Security.

- Bokföringsdata isoleras per `user_id`.
- Direkta klientskrivningar till centrala bokföringstabeller är begränsade; känsliga flöden går via server-side PostgreSQL-RPC:er.
- Profilfält med behörighets- och prenumerationsdata kan inte ändras av en vanlig användare genom klienten.
- Adminbehörighet verifieras server-side/databas-side.
- Stripe Checkout och Customer Portal verifierar Supabase-sessionen på servern.
- Bilagor skyddas med Storage RLS till användarens egen mapp.

En verifierad produktionssnapshot av databasschemat finns under:

`supabase/baseline/20260911_production_schema_baseline.sql`

Baselinen är dokumentation/audit-underlag och ersätter inte migrationshistoriken.

## Admin och användarradering

Adminpanelen kan göra dry-run och permanent radering av användare.

Raderingsflödet hanterar:
1. Stripe-prenumeration när sådan finns.
2. Användarens bilagor i Storage.
3. Appdata genom atomisk PostgreSQL-RPC.
4. Supabase Auth-kontot sist.

Databasdelen är atomisk. Eftersom Stripe, Storage, PostgreSQL och Auth är separata system är hela kedjan inte en enda global transaktion.

Self-service-radering för slutanvändare är inte implementerad; permanent radering hanteras tills vidare av admin.

## Viktiga mappar

```text
src/app/                 Next.js-sidor och API-routes
src/components/          UI-komponenter
src/hooks/               Auth- och bokföringshooks
src/lib/                 Bokföring, beräkningar, SIE, limits och Supabase-klient
supabase/functions/      Supabase Edge Functions
supabase/migrations/     Databasmigrationer
supabase/baseline/       Verifierad schema-snapshot för audit/recovery
```

Mer detaljer finns i `Architecture.md`.

## Databas – centrala tabeller

| Tabell | Ansvar |
|---|---|
| `profiles` | Profil, företag, roll och prenumerationsdata |
| `transactions` | Transaktioner/verifikationer och korrigeringsmetadata |
| `journal_entries` | Debet-/kreditrader per transaktion |
| `accounts` | Användarens kontoplan |
| `favorites` | Sparade bokföringsfavoriter |
| `closed_years` | Låsta räkenskapsår |
| `import_batches` | Historik och status för SIE-importer |
| `ver_nr_sequences` | Server-side räknare för verifikationsnummer |

## Lokal utveckling

Installera dependencies och starta utvecklingsservern:

```bash
npm install
npm run dev
```

Supabase- och Stripe-konfiguration kräver projektets egna miljövariabler/secrets. Hemligheter ska inte committas till Git.
````````

==================================================

==================================================
FILE: package.json
==================================================

````json
{
  "name": "min-bokforing",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "typecheck": "tsc --noEmit",
    "test:domain": "node scripts/test-result-engine.ts && node scripts/test-accounting-knowledge.ts && node scripts/test-vat-domain.ts && node scripts/test-vat-profile-adapter.ts && node scripts/test-vat-treatment-decision.ts && node scripts/test-vat-journal-plan.ts && node scripts/test-vat-audit-snapshot.ts && node scripts/test-vat-report-aggregation.ts && node scripts/test-vat-report-service.ts && node scripts/test-vat-report-presentation.ts && node scripts/test-vat-transaction-preflight.ts && node scripts/test-payment-account-roles.ts && node scripts/test-vat-payment-source.ts && node scripts/test-vat-runtime-booking.ts && node scripts/test-vat-lifecycle-ui.ts && node scripts/test-vat-settlement-ui.ts && node scripts/test-tax-account-movement-ui.ts",
    "test:e2e": "node scripts/run-playwright-e2e.mjs",
    "test:regression": "npm run test:domain && npm run test:e2e"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.105.4",
    "next": "16.2.6",
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "stripe": "^22.2.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.63.0",
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^9",
    "eslint-config-next": "16.2.6",
    "tailwindcss": "^4",
    "tsx": "^4.23.13",
    "typescript": "^5"
  }
}
````````

==================================================

==================================================
FILE: src/app/page.tsx
==================================================

````typescript
'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef, type FormEvent } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { bookTransaction, bookVatV2EuServiceReverseChargeTransaction, createCorrectionTransaction, bookPeriodizedTransaction, isYearClosed, closeYear, updateTransaction } from '@/lib/accountingService'
import { exportSIE } from '@/lib/sieExport'
import { encodeCP437 } from '@/lib/cp437'
import { calculateDashboard, getBankSaldo } from '@/lib/calculations'
import Layout from '@/components/Layout'
import NEBilaga from '@/components/NEBilaga'
import Kontoplan from '@/components/Kontoplan'
import FAQ from '@/components/FAQ'
import Momsrapport from '@/components/Momsrapport'
import ProfileSettings from '@/components/ProfileSettings'
import TransactionTable from '@/components/TransactionTable'
import EmptyBookkeepingState from '@/components/EmptyBookkeepingState'
import OverviewCards from '@/components/OverviewCards'
import TransactionForm from '@/components/TransactionForm'
import SieImportModal from '@/components/SieImportModal'

import SubscriptionGuard from '@/components/SubscriptionGuard'
import Paywall from '@/components/Paywall'
import AdminPanel from '@/components/AdminPanel'

import { canCreateTransactions, FREE_TRANSACTION_LIMIT, getFreeTransactionUsage } from '@/lib/subscriptionLimits'
import { useAuth } from '@/hooks/useAuth'
import { useAccountingData } from '@/hooks/useAccountingData'
import { profileToCompanyVatProfile } from '@/lib/vatProfileAdapter'
import type { VatV2RuntimeBookingRequest } from '@/lib/vatRuntimeBooking'
import {
  isTransactionSystemManagedInUi,
  transactionSourceUiLabel,
} from '@/lib/transactionSourceUi'

export default function Home() {
  const {
    user, profile, authLoading, profileError, retryProfile,
    authNotice, dismissAuthNotice, resetPassword, updatePassword,
    passwordRecoveryMode, exitPasswordRecoveryMode,
    handleAuth, handleLogout, setProfile,
  } = useAuth()

  const [isRegistering, setIsRegistering] = useState(false)
  const [showResetForm, setShowResetForm] = useState(false)
  const [recoveryPassword, setRecoveryPassword] = useState('')
  const [recoveryPasswordConfirm, setRecoveryPasswordConfirm] = useState('')
  const [recoverySaving, setRecoverySaving] = useState(false)
  const [recoveryNotice, setRecoveryNotice] = useState<{ type: 'error' | 'success'; text: string } | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [activeTab, setActiveTab] = useState('dashboard')
  // SSR-säkert: statiskt värde vid server-render
  const [selectedYear, setSelectedYear] = useState(2025)

  const {
    transactions,
    balances,
    balanceSheetBalances,
    neData,
    journalMap,
    kontoplan,
    dataLoading,
    isYearLocked, setIsYearLocked,
    refreshData,
    refreshDataWithStatus,
    loadKontoplanOptions,
    momsBreakdown,
  } = useAccountingData(user, selectedYear, profile?.subscription_type)

  const isAdmin = profile?.role === 'admin'
  const companyVatProfileResult = profileToCompanyVatProfile(profile)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingBooked, setEditingBooked] = useState(false)
  const [showLimitPaywall, setShowLimitPaywall] = useState(false)
  const [freeUsageCount, setFreeUsageCount] = useState(0)

  // SSR-säkert: alltid 45 vid server-render, synkas med localStorage i useEffect nedan
  const [taxRate, setTaxRate] = useState(45)

  const [uploading, setUploading] = useState(false)
  // Synchronous guard: React-state hinner inte alltid disable:a knappen mellan
  // två extremt snabba submit-events. Ref:en sätts direkt och stoppar ett andra
  // anrop innan något async-arbete eller databasanrop startas.
  const submitInFlightRef = useRef(false)
  const [showSieImport, setShowSieImport] = useState(false)
  const [activeModal, setActiveModal] = useState<null | 'bank' | 'skatt' | 'moms' | 'resultat'>(null)
  const [lastSubmitted, setLastSubmitted] = useState<{ type: string; amount: string; vatRate: number } | null>(null)

  // SSR-säkert: tomma strängar vid server-render, fylls i av useEffect nedan
  const [formData, setFormData] = useState({
    date: '2025-01-01', // ✅ VIKTIGT
    description: '',
    amount: '',
    type: '',
    vatRate: 0,
    file: null as File | null
  })

  const [periodisera, setPeriodisera] = useState(false)
  // SSR-säkert: tom sträng vid server-render
  const [periodMonth, setPeriodMonth] = useState('2026-01')

  // Sätter datum-defaultvärden efter hydration
  useEffect(() => {
    const today = new Date()
    setSelectedYear(today.getFullYear())
    setFormData(prev => ({
      ...prev,
      date: today.toISOString().split('T')[0]
    }))
    const next = new Date()
    next.setFullYear(next.getFullYear() + 1, 0, 1)
    setPeriodMonth(next.toISOString().slice(0, 7))
  }, [])

  const years = [selectedYear - 1, selectedYear, selectedYear + 1]

  async function refreshFreeUsageCount(): Promise<number> {
    if (!user?.id) {
      setFreeUsageCount(0)
      return 0
    }

    const count = await getFreeTransactionUsage(user.id)
    setFreeUsageCount(count)
    return count
  }

  // Gratisgränsen gäller TOTALT över alla år, inte bara valt räkenskapsår.
  useEffect(() => {
    let cancelled = false

    if (!user?.id) {
      setFreeUsageCount(0)
      return
    }

    getFreeTransactionUsage(user.id)
      .then(count => {
        if (!cancelled) setFreeUsageCount(count)
      })
      .catch(err => console.error('Kunde inte läsa gratisanvändning:', err))

    return () => {
      cancelled = true
    }
  }, [user?.id])

  // Lås bakgrundsscrollen när betalväggen visas
  useEffect(() => {
    if (showLimitPaywall) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'auto'
    }
    return () => {
      document.body.style.overflow = 'auto'
    }
  }, [showLimitPaywall])

  // Läser sparad skattesats från localStorage EFTER hydration (aldrig under SSR)
  useEffect(() => {
    const saved = Number(localStorage.getItem('taxRate'))
    if (!isNaN(saved) && saved >= 25 && saved <= 55) {
      setTaxRate(saved)
    }
  }, [])

  // Skriver tillbaka till localStorage när användaren justerar reglaget
  useEffect(() => {
    localStorage.setItem('taxRate', taxRate.toString())
  }, [taxRate])

  async function handleExportSIE() {
    try {
      const content = await exportSIE(selectedYear)
      // #FORMAT PC8 i filens header kräver enligt SIE-specifikationen att
      // filens faktiska bytes är kodade som IBM Extended 8-bit ASCII
      // (codepage 437) - inte UTF-8, som new Blob([content]) annars skulle
      // ge implicit. Konverteringen sker HELT separat i src/lib/cp437.ts.
      const bytes = encodeCP437(content)
      const blob = new Blob( [bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], { type: 'application/octet-stream' } )
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `SIE-${selectedYear}.se`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      alert('SIE-export misslyckades: ' + err.message)
    }
  }

  // Sätter default-typ/momssats på formuläret första gången kontoplanen laddas,
  // motsvarar det som tidigare gjordes inuti loadKontoplanOptions.
  useEffect(() => {
    if (!formData.type && kontoplan[0]) {
      setFormData(prev => ({
        ...prev,
        type: kontoplan[0].id,
        vatRate: profile?.vat_status === 'not_registered'
          ? 0
          : Number(kontoplan[0].default_vat_rate) || 0,
      }))
    }
  }, [kontoplan, profile?.vat_status])

  // UI-skyddet speglar serverregeln: när profilen uttryckligen är markerad
  // som inte momsregistrerad ska formuläret aldrig bära med sig en momssats.
  // Databasen är fortfarande den riktiga säkerhetsgränsen.
  useEffect(() => {
    if (profile?.vat_status !== 'not_registered') return
    setFormData(prev => prev.vatRate === 0 ? prev : { ...prev, vatRate: 0 })
  }, [profile?.vat_status])

  async function handleFileUpload(file: File): Promise<string> {
    const ALLOWED_TYPES: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png':  'png',
      'image/webp': 'webp',
      'application/pdf': 'pdf',
    }
    const ext = ALLOWED_TYPES[file.type]
    if (!ext) {
      throw new Error(`Filtypen "${file.type}" är inte tillåten. Endast JPG, PNG, WebP och PDF accepteras.`)
    }
    const safeName = `${user.id}/${Date.now()}-${crypto?.randomUUID?.() || Date.now().toString()}.${ext}`
    const { error } = await supabase.storage.from('attachments').upload(safeName, file)
    if (error) throw new Error('Filuppladdning misslyckades: ' + error.message)
    return safeName
  }

  function isSystemManagedTransaction(tx: { source?: string } | null | undefined) {
    return isTransactionSystemManagedInUi(tx)
  }

  function describeSystemManagedTransaction(tx: { source?: string } | null | undefined) {
    return transactionSourceUiLabel(tx) ?? 'Systemverifikationer'
  }

  async function handleVatV2RuntimeBooking(
    request: VatV2RuntimeBookingRequest,
    file: File | null
  ) {
    if (isYearLocked) {
      throw new Error('Räkenskapsåret är låst för ändringar.')
    }
    if (submitInFlightRef.current) {
      throw new Error('Bokningen behandlas redan.')
    }

    submitInFlightRef.current = true
    setUploading(true)

    try {
      const currentUsage = await refreshFreeUsageCount()
      const allowed = canCreateTransactions(
        profile ?? { subscription_type: 'free', subscription_end: null },
        currentUsage,
        1
      )

      if (!allowed) {
        setShowLimitPaywall(true)
        throw new Error('Gratisgränsen är nådd för nya verifikationer.')
      }

      const targetYear = parseInt(request.date.slice(0, 4))
      const isTargetYearClosed = await isYearClosed(targetYear)
      if (isTargetYearClosed) {
        throw new Error(`Räkenskapsår ${targetYear} är låst för ändringar.`)
      }

      let fileUrl = ''
      if (file) {
        fileUrl = await handleFileUpload(file)
      }

      const result = await bookVatV2EuServiceReverseChargeTransaction({
        date: request.date,
        description: request.description,
        treatment: request.treatment,
        paymentAccountNumber: request.paymentAccountNumber,
        fileUrl: fileUrl || null,
      })

      setLastSubmitted(null)
      setFormData(prev => ({
        ...prev,
        date: new Date().toISOString().split('T')[0],
        description: '',
        amount: '',
        file: null,
      }))
      setPeriodisera(false)

      try {
        await refreshData()
        await refreshFreeUsageCount()
      } catch (refreshError) {
        console.error('VAT V2-bokning skapad men uppdatering misslyckades:', refreshError)
        alert(`✅ VAT V2-bokning skapad som VER-${result.verNr}. Uppdatera sidan om den inte syns direkt.`)
        return
      }

      alert(`✅ VAT V2-bokning skapad som VER-${result.verNr}.`)
    } catch (err: unknown) {
      console.error('Fel vid VAT V2-bokning:', err)
      throw new Error(
        err instanceof Error
          ? err.message
          : 'VAT V2-bokningen misslyckades.'
      )
    } finally {
      submitInFlightRef.current = false
      setUploading(false)
    }
  }

  async function handleAddTransaction(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (isYearLocked) return

    if (submitInFlightRef.current) return
    if (editingId) {
      const editingTx = transactions.find(tx => tx.id === editingId)
      if (isSystemManagedTransaction(editingTx)) {
        alert(`${describeSystemManagedTransaction(editingTx)} är systemverifikationer och kan inte ändras.`)
        return
      }
    }

    submitInFlightRef.current = true
    setUploading(true)

    try {
      if (!editingId) {
        const currentUsage = await refreshFreeUsageCount()
        // En vanlig bokning skapar 1 VER. En periodisering skapar 2 riktiga VER
        // (ursprungsverifikation + framtida vändningsverifikation).
        const verificationsToCreate = periodisera ? 2 : 1
        const allowed = canCreateTransactions(
          profile ?? { subscription_type: 'free', subscription_end: null },
          currentUsage,
          verificationsToCreate
        )

        if (!allowed) {
          setShowLimitPaywall(true)
          return
        }
      }
      const targetYear = parseInt(formData.date.slice(0, 4))
      const isTargetYearClosed = await isYearClosed(targetYear)
      if (isTargetYearClosed) {
        throw new Error(`Räkenskapsår ${targetYear} är låst för ändringar.`)
      }

      let fileUrl = ''
      if (formData.file) {
        fileUrl = await handleFileUpload(formData.file)
      }

      if (editingId) {
        const updatePayload: any = {
          date: formData.date,
          description: formData.description
        }
        if (!editingBooked) {
          updatePayload.amount = Number(formData.amount)
          updatePayload.type = formData.type
          updatePayload.vat_rate = formData.vatRate
        }
        if (fileUrl) {
          updatePayload.file_url = fileUrl
        }
        await updateTransaction(editingId, updatePayload)
        setEditingId(null)
        setEditingBooked(false)
      } else {
        if (periodisera) {
          const futureDate = `${periodMonth}-01`
          await bookPeriodizedTransaction({
            date: formData.date,
            future_date: futureDate,
            description: formData.description,
            amount: Number(formData.amount),
            type: formData.type,
            vat_rate: formData.vatRate,
            file_url: fileUrl || null,
          })
        } else {
          // Vanlig bokföring sker i ett enda atomärt RPC-anrop.
          // Frontend skapar inte längre först en "halv" transaction.
          await bookTransaction({
            date: formData.date,
            description: formData.description,
            amount: Number(formData.amount),
            type: formData.type,
            vat_rate: formData.vatRate,
            file_url: fileUrl || null,
          })
        }
      }

      setLastSubmitted({ type: formData.type, amount: formData.amount, vatRate: formData.vatRate })
      setFormData(prev => ({
        ...prev,
        date: new Date().toISOString().split('T')[0],
        description: '',
        amount: '',
        file: null
      }))
      setPeriodisera(false)
      await refreshData()
      await refreshFreeUsageCount()
    } catch (err: any) {
      console.error('Fel vid bokföring:', err)
      alert('Fel: ' + err.message)
    } finally {
      submitInFlightRef.current = false
      setUploading(false)
    }
  }

  async function handleDelete(tx: any) {
    if (isYearLocked) return
    if (isSystemManagedTransaction(tx)) {
      alert(`${describeSystemManagedTransaction(tx)} är systemverifikationer och kan inte korrigeras här.`)
      return
    }

    const journal = journalMap[tx.id] || []
    const verNr = journal[0]?.ver_nr
    const confirmed = confirm(
      verNr
        ? `Skapa korrigeringsverifikation VER-? för VER-${verNr}?\n\nDetta nollar ut bokföringen och kan inte ångras.`
        : `Skapa korrigeringsverifikation för "${tx.description}"?\n\nDetta kan inte ångras.`
    )
    if (!confirmed) return
    try {
      const newVerNr = await createCorrectionTransaction(tx.id)
      alert(`✅ Korrigeringsverifikation VER-${newVerNr} skapad.`)
      await refreshData()
    } catch (err: any) {
      console.error('Fel vid korrigering:', err)
      alert('Kunde inte skapa korrigering: ' + err.message)
    }
  }

  const handleEdit = (tx: any) => {
    if (isYearLocked) return
    if (isSystemManagedTransaction(tx)) {
      alert(`${describeSystemManagedTransaction(tx)} är systemverifikationer och kan inte ändras.`)
      return
    }

    setEditingId(tx.id)
    setEditingBooked(tx.booked === true)
    setFormData({
      date: tx.date,
      description: tx.description,
      amount: tx.amount.toString(),
      type: tx.type,
      vatRate: tx.vat_rate,
      file: null
    })
    // Scrolla till formuläret (inte sidans topp) — viktigt på mobil där
    // Ekonomiöversikt-korten annars hamnar mellan användaren och formuläret.
    requestAnimationFrame(() => {
      const formSection = document.getElementById('transaction-form-section')
      if (formSection) {
        const top = formSection.getBoundingClientRect().top + window.scrollY - 16
        window.scrollTo({ top, behavior: 'smooth' })
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditingBooked(false)
    setFormData(prev => ({ ...prev, description: '', amount: '', file: null }))
  }

  async function handleLockYear() {
    const confirmed = confirm(
      `Är du säker på att du vill låsa ${selectedYear}?\n\nDetta låser alla verifikationer permanent och kan inte ångras enligt god redovisningssed.`
    )
    if (!confirmed) return
    try {
      await closeYear(selectedYear)
      setIsYearLocked(true)
      await refreshData()
    } catch (err: any) {
      alert('Fel vid låsning: ' + err.message)
    }
  }

  async function handleFavorite(name: string) {
    if (!lastSubmitted) return
    await supabase.from('favorites').insert({
      user_id: user.id,
      name,
      type: lastSubmitted.type,
      amount: Number(lastSubmitted.amount),
      vat_rate: lastSubmitted.vatRate,
    })
    setLastSubmitted(null)
  }

  const data = calculateDashboard(balances, taxRate, momsBreakdown)
  // Steg 2 av carry-forward-arbetet: ENDAST Bank-kortet ska visa kumulativt
  // saldo (balanceSheetBalances, se getBalanceSheetBalances()) istället för
  // årets egna rörelse. Allt annat i "data" (bl.a. sakertUttag) kommer
  // fortsatt från calculateDashboard() ovan och är medvetet oförändrat i
  // detta steg - se separat beslut om när/hur sakertUttag ska följa med.
  data.bankSaldo = getBankSaldo(balanceSheetBalances)
  // Steg 2b: Säkert uttag räknas om med samma formel som calculateDashboard()
  // redan använder (calculations.ts), men med det nu kumulativa
  // data.bankSaldo istället för årets egna bankrörelse. skattReserv och
  // momsNetto kommer fortfarande oförändrade från calculateDashboard().
  data.sakertUttag = Math.round(
    (data.bankSaldo - data.skattReserv - (data.momsNetto > 0 ? data.momsNetto : 0)) * 100
  ) / 100


  const hasActiveSubscription =
    (profile?.subscription_type === 'paid' || profile?.subscription_type === 'trial') &&
    (!profile?.subscription_end || new Date(profile.subscription_end).getTime() > Date.now())
  const showFreeBanner = !hasActiveSubscription

  if (authLoading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center font-bold text-gray-400">Laddar...</div>
  }

  if (user && !profile) {
    if (profileError) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-[2.5rem] border border-red-100 shadow-sm p-8 max-w-sm w-full text-center">
            <p className="text-3xl mb-3">⚠️</p>
            <p className="text-sm font-black uppercase text-gray-700 mb-2">Kunde inte ladda din profil</p>
            <p className="text-xs text-gray-400 font-bold mb-6">
              Det tar ovanligt lång tid att hämta dina kontouppgifter. Kontrollera din uppkoppling och försök igen.
            </p>
            <button
              onClick={retryProfile}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-3 text-xs font-black uppercase tracking-widest transition-all"
            >
              Försök igen
            </button>
          </div>
        </div>
      )
    }
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center font-bold text-gray-400">Laddar...</div>
  }

  // Om användaren kom hit via en klickad återställningslänk: visa en
  // dedikerad "sätt nytt lösenord"-skärm direkt, istället för att tyst
  // släppa in dem i vanliga appen där det inte är uppenbart varför de
  // egentligen är inloggade.
  if (passwordRecoveryMode) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            setRecoveryNotice(null)
            if (recoveryPassword.length < 6) {
              setRecoveryNotice({ type: 'error', text: 'Lösenordet måste vara minst 6 tecken.' })
              return
            }
            if (recoveryPassword !== recoveryPasswordConfirm) {
              setRecoveryNotice({ type: 'error', text: 'Lösenorden matchar inte.' })
              return
            }
            setRecoverySaving(true)
            const result = await updatePassword(recoveryPassword)
            setRecoverySaving(false)
            if (result.success) {
              setRecoveryNotice({ type: 'success', text: '✓ Lösenordet är uppdaterat! Du kan nu använda appen som vanligt.' })
              setRecoveryPassword('')
              setRecoveryPasswordConfirm('')
              setTimeout(() => exitPasswordRecoveryMode(), 1500)
            } else {
              setRecoveryNotice({ type: 'error', text: result.error })
            }
          }}
          className="bg-white p-10 rounded-[2.5rem] shadow-xl border-2 border-emerald-500 w-full max-w-sm text-center"
        >
          <div className="w-14 h-14 bg-emerald-600 rounded-2xl flex items-center justify-center text-white font-black text-2xl italic mx-auto mb-6">S</div>
          <h1 className="text-lg font-black uppercase tracking-tighter italic text-gray-800 mb-2">SoloLedger</h1>
          <p className="text-[10px] font-black uppercase text-emerald-600 mb-6 tracking-wider">Sätt nytt lösenord</p>

          {recoveryNotice && (
            <div className={`mb-4 rounded-2xl px-4 py-3 text-[11px] font-bold text-left ${
              recoveryNotice.type === 'error'
                ? 'bg-red-50 text-red-600 border border-red-200'
                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            }`}>
              {recoveryNotice.text}
            </div>
          )}

          <input
            type="password"
            value={recoveryPassword}
            onChange={e => setRecoveryPassword(e.target.value)}
            placeholder="Nytt lösenord (minst 6 tecken)"
            className="w-full bg-gray-50 rounded-2xl p-4 mb-3 text-center font-bold outline-none text-sm border border-transparent focus:border-emerald-300"
            required
          />
          <input
            type="password"
            value={recoveryPasswordConfirm}
            onChange={e => setRecoveryPasswordConfirm(e.target.value)}
            placeholder="Bekräfta nytt lösenord"
            className="w-full bg-gray-50 rounded-2xl p-4 mb-6 text-center font-bold outline-none text-sm border border-transparent focus:border-emerald-300"
            required
          />
          <button
            type="submit"
            disabled={recoverySaving}
            className="w-full bg-emerald-600 text-white p-4 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-emerald-700 transition-all shadow-md disabled:opacity-50"
          >
            {recoverySaving ? 'Uppdaterar...' : 'Spara nytt lösenord'}
          </button>
        </form>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white p-10 rounded-[2.5rem] shadow-xl border-2 border-emerald-500 w-full max-w-sm text-center">
          <div className="w-14 h-14 bg-emerald-600 rounded-2xl flex items-center justify-center text-white font-black text-2xl italic mx-auto mb-6">
            S
          </div>
  
          <h1 className="text-lg font-black uppercase tracking-tighter italic text-gray-800 mb-2">
            SoloLedger
          </h1>
  
          <p className="text-[10px] font-black uppercase text-emerald-600 mb-6 tracking-wider">
            {showResetForm
              ? 'Återställ lösenord'
              : isRegistering
                ? 'Skapa nytt konto'
                : 'Fleranvändarsystem'}
          </p>
  
          {authNotice && (
            <div
              className={`mb-4 rounded-2xl px-4 py-3 text-[11px] font-bold text-left ${
                authNotice.type === 'error'
                  ? 'bg-red-50 text-red-600 border border-red-200'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              }`}
            >
              {authNotice.text}
            </div>
          )}
  
  {showResetForm ? (
            <form>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="E-postadress"
                className="w-full bg-gray-50 rounded-2xl p-4 mb-3 text-center font-bold outline-none text-sm border border-transparent focus:border-emerald-300"
                required
              />

              <p className="text-[10px] text-gray-400 font-bold mb-6 leading-relaxed">
                Vi skickar en länk till din e-post där du kan sätta ett nytt lösenord.
              </p>

              <button
                type="button"
                onClick={() => resetPassword(email)}
                className="w-full bg-emerald-600 text-white p-4 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-emerald-700 transition-all shadow-md mb-4"
              >
                Skicka återställningslänk
              </button>

              <button
                type="button"
                onClick={() => { setShowResetForm(false); dismissAuthNotice() }}
                className="text-[10px] text-gray-400 hover:text-emerald-600 font-black uppercase tracking-wider transition-colors"
              >
                Tillbaka till inloggning
              </button>
            </form>
          ) : (
            <form
              onSubmit={(e) =>
                handleAuth(e, {
                  email,
                  password,
                  isRegistering,
                })
              }
            >
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="E-postadress"
                className="w-full bg-gray-50 rounded-2xl p-4 mb-3 text-center font-bold outline-none text-sm border border-transparent focus:border-emerald-300"
                required
              />
  
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Lösenord"
                className="w-full bg-gray-50 rounded-2xl p-4 mb-2 text-center font-bold outline-none text-sm border border-transparent focus:border-emerald-300"
                required
              />
  
              {!isRegistering && (
                <button
                  type="button"
                  onClick={() => {
                    setShowResetForm(true)
                    dismissAuthNotice()
                  }}
                  className="block ml-auto mb-4 text-[9px] text-gray-400 hover:text-emerald-600 font-bold uppercase tracking-wider transition-colors"
                >
                  Glömt lösenord?
                </button>
              )}
  
              <button
                type="submit"
                className={`w-full bg-emerald-600 text-white p-4 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-emerald-700 transition-all shadow-md mb-4 ${
                  isRegistering ? '' : 'mt-2'
                }`}
              >
                {isRegistering ? 'Registrera dig' : 'Logga in'}
              </button>
  
              <button
                type="button"
                onClick={() => {
                  setIsRegistering(!isRegistering)
                  dismissAuthNotice()
                }}
                className="text-[10px] text-gray-400 hover:text-emerald-600 font-black uppercase tracking-wider transition-colors"
              >
                {isRegistering
                  ? 'Har du redan ett konto? Logga in'
                  : 'Inget konto? Skapa ett här'}
              </button>
            </form>
          )}
        </div>
      </div>
    )
  }

  return (
    <Layout 
      activeTab={activeTab} 
      setActiveTab={setActiveTab}
      onLogout={handleLogout}
      isAdmin={isAdmin}
    >
      {showLimitPaywall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative bg-white rounded-[2.5rem] p-8 max-w-lg w-full shadow-2xl border-2 border-amber-400 animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setShowLimitPaywall(false)}
              className="absolute top-6 right-6 w-8 h-8 bg-gray-100 hover:bg-gray-200 text-gray-500 font-black rounded-full flex items-center justify-center transition-all"
            >
              ✕
            </button>
            <Paywall feature="Obegränsat antal transaktioner" user={user} />
          </div>
        </div>
      )}

      <SieImportModal
        isOpen={showSieImport}
        onClose={() => setShowSieImport(false)}
        refreshData={refreshData}
        userId={user.id}
        profile={profile}
        onLimitReached={() => {
          setShowSieImport(false)
          setShowLimitPaywall(true)
        }}
        onUsageChanged={async () => { await refreshFreeUsageCount() }}
      />

<div className="mb-8 px-4 sm:px-6 lg:px-8">
  <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
    <div className="min-w-0">
      <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900">
        {activeTab === 'dashboard'
          ? 'Ekonomiöversikt'
          : activeTab === 'kontoplan'
            ? 'Kontoplan'
            : activeTab === 'faq'
              ? 'Hjälp & FAQ'
              : activeTab === 'moms'
                ? 'Momsrapport'
                : activeTab === 'profil'
                  ? 'Profilinställningar'
                  : activeTab === 'admin'
                    ? 'Admin'
                    : 'NE-Bilaga'}
      </h1>

      <div className="flex flex-col gap-1 mt-1">
        <p className="text-[10px] text-gray-400 font-bold">
          Inloggad som: {user?.email}
        </p>

        {showFreeBanner && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 mt-0.5">
            <span className="text-[10px] text-amber-600 font-black uppercase tracking-wider">
              Gratisplan — uppgradera för obegränsat
            </span>

            <span className="text-[10px] bg-amber-50 text-amber-700 font-black px-2 py-0.5 rounded-full border border-amber-200 shadow-sm w-fit">
              📊 {freeUsageCount} / {FREE_TRANSACTION_LIMIT} verifikationer använda
            </span>
          </div>
        )}
      </div>
    </div>

    <div className="flex flex-wrap items-center gap-2.5 xl:justify-end">
      {!['profil', 'faq', 'kontoplan', 'moms'].includes(activeTab) && (
        <div className="h-10 flex items-center gap-2 bg-white px-3 rounded-xl border border-gray-200 shadow-sm">
          <span className="text-[10px] font-black uppercase text-gray-400 italic">
            År
          </span>

          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="bg-emerald-50 border-none rounded-lg px-3 py-1 font-black text-sm text-emerald-600 outline-none cursor-pointer hover:bg-emerald-100 transition-colors"
          >
            {years.map(y => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      )}

      {activeTab === 'dashboard' && (
        <>
          <button
            onClick={() => setShowSieImport(true)}
            className="h-10 bg-sky-600 hover:bg-sky-700 text-white px-4 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-sm"
          >
            Importera SIE
          </button>

          <button
            onClick={handleExportSIE}
            className="h-10 bg-gray-900 hover:bg-black text-white px-4 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-sm"
          >
            Exportera SIE
          </button>
        </>
      )}

      {['dashboard', 'ne-bilaga', 'NE-Bilaga', 'ne'].includes(activeTab) && (
        <div className="h-10 flex items-center gap-3 bg-white px-3 rounded-xl border border-gray-200 shadow-sm">
          <span className="text-[10px] font-black uppercase text-gray-400 italic">
            Skatt
          </span>

          <input
            type="range"
            min={25}
            max={55}
            step={1}
            value={taxRate}
            onChange={(e) => setTaxRate(Number(e.target.value))}
            className="w-20 accent-emerald-500 cursor-pointer"
          />

          <span className="text-sm font-black text-emerald-600 w-8 tabular-nums text-right">
            {taxRate}%
          </span>
        </div>
      )}
    </div>
  </div>
</div>

      {activeTab === 'dashboard' ? (
        <>
          <OverviewCards
            data={data}
            taxRate={taxRate}
            transactions={transactions}
            journalMap={journalMap}
            setActiveModal={setActiveModal}
            activeModal={activeModal}
          />

          {isYearLocked && (
            <div className="flex items-center gap-3 bg-amber-50 border-2 border-amber-300 rounded-[2rem] px-6 py-4 mb-4 shadow-sm animate-in fade-in duration-200">
              <span className="text-xl">🔒</span>
              <div>
                <p className="text-[11px] font-black uppercase tracking-widest text-amber-700">
                  Räkenskapsår {selectedYear} är låst
                </p>
                <p className="text-[10px] font-bold text-amber-600 mt-0.5">
                  Detta räkenskapsår är låst och kan inte ändras enligt god redovisningssed.
                </p>
              </div>
            </div>
          )}

          <div id="transaction-form-section">
            <TransactionForm
              userId={user.id}
              vatStatus={profile?.vat_status ?? 'unknown'}
              companyVatProfileResult={companyVatProfileResult}
              formData={formData}
              setFormData={setFormData}
              kontoplan={kontoplan}
              isYearLocked={isYearLocked}
              editingId={editingId}
              editingBooked={editingBooked}
              uploading={uploading}
              periodisera={periodisera}
              setPeriodisera={setPeriodisera}
              periodMonth={periodMonth}
              setPeriodMonth={setPeriodMonth}
              onSubmit={handleAddTransaction}
              onVatV2Submit={handleVatV2RuntimeBooking}
              onCancelEdit={cancelEdit}
              lastSubmitted={lastSubmitted}
              onSaveFavorite={handleFavorite}
              onDismissFavorite={() => setLastSubmitted(null)}
            />
          </div>

          {!dataLoading && transactions.length === 0 ? (
  <EmptyBookkeepingState
    selectedYear={selectedYear}
    onImportSIE={() => setShowSieImport(true)}
  />
) : (
  <TransactionTable
    transactions={transactions}
    journalMap={journalMap}
    kontoplan={kontoplan}
    isYearLocked={isYearLocked}
    editingId={editingId}
    selectedYear={selectedYear}
    onEdit={handleEdit}
    onDelete={handleDelete}
    onFavorite={handleFavorite}
  />
)}        </>
      ) : activeTab === 'kontoplan' ? (
        <Kontoplan onAccountCreated={loadKontoplanOptions} />
      ) : activeTab === 'moms' ? (
        <SubscriptionGuard
          user={user}
          profile={profile}
          requiredLevel="paid"
          fallback={<Paywall feature="Momsrapport" user={user} />}
        >
          <Momsrapport profile={profile} onBookkeepingRefresh={refreshDataWithStatus} />
        </SubscriptionGuard>
      ) : activeTab === 'faq' ? (
        <FAQ />
      ) : activeTab === 'profil' ? (
        <ProfileSettings 
          user={user} 
          profile={profile} 
          onProfileUpdate={(updated) => setProfile(updated)} 
          onUpdatePassword={updatePassword}
          onBookkeepingChanged={refreshData}
        />
      ) : activeTab === 'admin' && isAdmin ? (
        <AdminPanel />
      ) : (
        <SubscriptionGuard
          user={user}
          profile={profile}
          requiredLevel="paid"
          fallback={<Paywall feature="NE-Bilaga" user={user} />}
        >
          <NEBilaga
            neData={neData}
            selectedYear={selectedYear}
            isYearLocked={isYearLocked}
            onLockYear={handleLockYear}
          />
        </SubscriptionGuard>
      )}
    </Layout>
  )
}
````````

==================================================

==================================================
FILE: src/components/Momsrapport.tsx
==================================================

````typescript
'use client'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'
import {
  closeVatPeriod,
  declareVatPeriod,
  ensureVatPeriods,
  getTaxAccountEventsForPeriod,
  getTaxAccountMovementsForPeriod,
  getVatPeriods,
  recordTaxAccountMovement,
  recordVatSettlement,
  type CloseVatPeriodResult,
  type DeclareVatPeriodResult,
  type TaxAccountEvent,
  type TaxAccountMovement,
  type VatPeriod,
  type VatPeriodSource,
  type VatPeriodStatus,
  type VatPeriodType,
} from '@/lib/accountingService'
import { getVatReportForPeriod } from '@/lib/vatReportService'
import {
  buildVatReportPresentation,
  vatReportBlockedMessage,
  type VatReportPresentation,
} from '@/lib/vatReportPresentation'
import {
  CONFIRM_DECLARATION_BUTTON_LABEL,
  DECLARATION_ALREADY_SUBMITTED_COPY,
  DECLARATION_DOES_NOT_SUBMIT_COPY,
  DECLARATION_SUBMITTED_ON_LABEL,
  VAT_RECLASSIFIED_NOT_SETTLED_COPY,
  formatLocalDateOnly,
  isValidSkvSubmittedOnDate,
  isVatReportRequestCurrent,
  skvSubmittedOnValidationMessage,
  shouldAutoLoadVatReport,
  vatClosingObligationText,
  vatDeclarationStatusText,
} from '@/lib/vatLifecycleUi'
import {
  EMPTY_SETTLEMENT_IDEMPOTENCY_STATE,
  canStartVatSettlementSubmit,
  clearSettlementIdempotency,
  deriveVatSettlementReadModel,
  isVatSettlementSubmitContextCurrent,
  payableOrRefundHeading,
  prepareSettlementIdempotencyKey,
  settlementActionLabel,
  settlementAmountLabel,
  settlementEventText,
  settlementQuestion,
  settlementStateText,
  validateVatSettlementInput,
  type VatSettlementIdempotencyState,
} from '@/lib/vatSettlementUi'
import {
  vatSettlementSubmissionErrorMessage,
  vatSettlementSubmissionFailureKind,
} from '@/lib/vatSettlementErrors'
import {
  EMPTY_TAX_ACCOUNT_MOVEMENT_IDEMPOTENCY_STATE,
  TAX_ACCOUNT_MOVEMENT_MIXED_TRANSFER_COPY,
  TAX_ACCOUNT_MOVEMENT_UNSURE_COPY,
  canStartTaxAccountMovementSubmit,
  clearTaxAccountMovementIdempotency,
  clearTaxAccountMovementIdempotencyStorage,
  deriveTaxAccountMovementReadModel,
  isTaxAccountMovementSubmitContextCurrent,
  nextTaxAccountMovementChoiceForContext,
  prepareTaxAccountMovementIdempotencyKey,
  readTaxAccountMovementIdempotencyFromStorage,
  taxAccountMovementActionLabel,
  taxAccountMovementAmountLabel,
  taxAccountMovementHistoryText,
  taxAccountMovementKindForChoice,
  taxAccountMovementQuestion,
  taxAccountMovementStateText,
  validateTaxAccountMovementInput,
  writeTaxAccountMovementIdempotencyToStorage,
  type TaxAccountMovementChoice,
  type TaxAccountMovementDirection,
  type TaxAccountMovementIdempotencyState,
} from '@/lib/taxAccountMovementUi'
import {
  taxAccountMovementSubmissionErrorMessage,
  taxAccountMovementSubmissionFailureKind,
} from '@/lib/taxAccountMovementErrors'
import type { AccountingRefreshResult } from '@/hooks/useAccountingData'
import type { AuthProfile } from '@/hooks/useAuth'

function fmt(n: number) {
  return Math.abs(n).toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(date: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date
  return new Date(date).toLocaleDateString('sv-SE')
}

function periodTypeLabel(type: VatPeriodType) {
  const labels: Record<VatPeriodType, string> = {
    month: 'Månad',
    quarter: 'Kvartal',
    year: 'Helår',
  }
  return labels[type]
}

function statusLabel(status: VatPeriodStatus) {
  const labels: Record<VatPeriodStatus, string> = {
    open: 'Öppen',
    closed: 'Stängd',
    declared: 'Deklarerad',
  }
  return labels[status]
}

function statusClass(status: VatPeriodStatus) {
  const classes: Record<VatPeriodStatus, string> = {
    open: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    closed: 'bg-amber-50 text-amber-600 border-amber-100',
    declared: 'bg-sky-50 text-sky-600 border-sky-100',
  }
  return classes[status]
}

function sourceLabel(source: VatPeriodSource) {
  const labels: Record<VatPeriodSource, string> = {
    sololedger: 'SoloLedger',
    imported_history: 'Importerad historik',
  }
  return labels[source]
}

function periodLabel(period: VatPeriod) {
  return `${fmtDate(period.period_start)} – ${fmtDate(period.period_end)}`
}

function closingAmountText(period: VatPeriod) {
  return vatClosingObligationText(period, fmt)
}

function declaredAtText(period: VatPeriod) {
  return vatDeclarationStatusText(period, fmtDate)
}

function soloLedgerDeclarationAuditText(period: VatPeriod) {
  if (period.status !== 'declared' || !period.declared_at) return null
  return `Bekräftad i SoloLedger ${new Date(period.declared_at).toLocaleString('sv-SE', {
    dateStyle: 'short',
    timeStyle: 'short',
  })}`
}

type MomsrapportProps = {
  profile: AuthProfile
  onBookkeepingRefresh?: () => Promise<AccountingRefreshResult>
}

export default function Momsrapport({ profile, onBookkeepingRefresh }: MomsrapportProps) {
  const currentYear = new Date().getFullYear()
  const todayIso = formatLocalDateOnly(new Date())
  const ensuredKeysRef = useRef<Set<string>>(new Set())
  const closeInFlightRef = useRef(false)
  const declareInFlightRef = useRef(false)
  const settlementInFlightRef = useRef(false)
  const movementInFlightRef = useRef(false)
  const reportRequestSeqRef = useRef(0)
  const settlementRequestSeqRef = useRef(0)
  const movementRequestSeqRef = useRef(0)
  const selectionContextRef = useRef<{ periodId: string; contextKey: string | null }>({
    periodId: '',
    contextKey: null,
  })
  const movementChoiceContextRef = useRef<{
    contextKey: string | null
    direction: TaxAccountMovementDirection | null
  }>({
    contextKey: null,
    direction: null,
  })
  const [year, setYear]                     = useState(currentYear)
  const [availableYears, setAvailableYears] = useState<number[]>([currentYear])
  const [vatPeriods, setVatPeriods]         = useState<VatPeriod[]>([])
  const [selectedPeriodId, setSelectedPeriodId] = useState('')
  const [periodsLoading, setPeriodsLoading] = useState(false)
  const [periodError, setPeriodError]       = useState<string | null>(null)
  const [loading, setLoading]               = useState(false)
  const [closing, setClosing]               = useState(false)
  const [declaring, setDeclaring]           = useState(false)
  const [fetched, setFetched]               = useState(false)
  const [vatReport, setVatReport] = useState<VatReportPresentation | null>(null)
  const [reportPeriodId, setReportPeriodId] = useState<string | null>(null)
  const [reportContextKey, setReportContextKey] = useState<string | null>(null)
  const [reportError, setReportError] = useState<string | null>(null)
  const [reportErrorPeriodId, setReportErrorPeriodId] = useState<string | null>(null)
  const [reportErrorContextKey, setReportErrorContextKey] = useState<string | null>(null)
  const [declarationSubmittedOn, setDeclarationSubmittedOn] = useState(todayIso)
  const [settlementEvents, setSettlementEvents] = useState<TaxAccountEvent[]>([])
  const [settlementEventsPeriodId, setSettlementEventsPeriodId] = useState<string | null>(null)
  const [settlementEventsContextKey, setSettlementEventsContextKey] = useState<string | null>(null)
  const [settlementLoading, setSettlementLoading] = useState(false)
  const [settlementSubmitting, setSettlementSubmitting] = useState(false)
  const [settlementLoadError, setSettlementLoadError] = useState<string | null>(null)
  const [settlementSubmitError, setSettlementSubmitError] = useState<string | null>(null)
  const [settlementEventDate, setSettlementEventDate] = useState(todayIso)
  const [settlementAmountText, setSettlementAmountText] = useState('')
  const [settlementIdempotency, setSettlementIdempotency] =
    useState<VatSettlementIdempotencyState>(EMPTY_SETTLEMENT_IDEMPOTENCY_STATE)
  const [taxAccountMovements, setTaxAccountMovements] = useState<TaxAccountMovement[]>([])
  const [taxAccountMovementsPeriodId, setTaxAccountMovementsPeriodId] = useState<string | null>(null)
  const [taxAccountMovementsContextKey, setTaxAccountMovementsContextKey] = useState<string | null>(null)
  const [movementLoading, setMovementLoading] = useState(false)
  const [movementSubmitting, setMovementSubmitting] = useState(false)
  const [movementLoadError, setMovementLoadError] = useState<string | null>(null)
  const [movementSubmitError, setMovementSubmitError] = useState<string | null>(null)
  const [movementDate, setMovementDate] = useState(todayIso)
  const [movementAmountText, setMovementAmountText] = useState('')
  const [movementChoice, setMovementChoice] =
    useState<TaxAccountMovementChoice>('not_yet')
  const [movementIdempotency, setMovementIdempotency] =
    useState<TaxAccountMovementIdempotencyState>(
      EMPTY_TAX_ACCOUNT_MOVEMENT_IDEMPOTENCY_STATE
    )

  const selectedPeriod = useMemo(
    () => vatPeriods.find(p => p.id === selectedPeriodId) ?? null,
    [selectedPeriodId, vatPeriods]
  )

  const vatStatus = profile?.vat_status
  const vatPeriodType = profile?.vat_period_type
  const vatManagementFrom = profile?.vat_management_from
  const profileKey = `${vatStatus ?? ''}|${vatPeriodType ?? ''}|${vatManagementFrom ?? ''}`
  const canEnsurePeriods =
    vatStatus === 'registered' &&
    Boolean(vatPeriodType) &&
    Boolean(vatManagementFrom)
  const selectedPeriodContextKey = selectedPeriod
    ? `${year}|${profileKey}|${selectedPeriod.id}`
    : null
  const hasCurrentReport =
    Boolean(selectedPeriod) &&
    fetched &&
    !loading &&
    vatReport !== null &&
    reportPeriodId === selectedPeriod?.id &&
    reportContextKey === selectedPeriodContextKey
  const hasCurrentReportError =
    Boolean(selectedPeriod) &&
    !loading &&
    reportError !== null &&
    reportErrorPeriodId === selectedPeriod?.id &&
    reportErrorContextKey === selectedPeriodContextKey
  const hasCurrentSettlementEvents =
    Boolean(selectedPeriod) &&
    settlementEventsPeriodId === selectedPeriod?.id &&
    settlementEventsContextKey === selectedPeriodContextKey
  const hasCurrentTaxAccountMovements =
    Boolean(selectedPeriod) &&
    taxAccountMovementsPeriodId === selectedPeriod?.id &&
    taxAccountMovementsContextKey === selectedPeriodContextKey
  const selectedPeriodIsFuture = selectedPeriod ? selectedPeriod.period_end > todayIso : false
  const lifecycleCanCloseSelectedPeriod =
    Boolean(selectedPeriod) &&
    selectedPeriod?.source === 'sololedger' &&
    selectedPeriod?.status === 'open' &&
    !selectedPeriodIsFuture &&
    vatStatus === 'registered'
  const lifecycleCanDeclareSelectedPeriod =
    Boolean(selectedPeriod) &&
    selectedPeriod?.source === 'sololedger' &&
    selectedPeriod?.status === 'closed'
  const declarationSubmittedOnValue = declarationSubmittedOn
  const declarationSubmittedOnValidation = selectedPeriod
    ? skvSubmittedOnValidationMessage({
        submittedOn: declarationSubmittedOnValue,
        periodEnd: selectedPeriod.period_end,
        todayIso,
      })
    : null
  const declarationSubmittedOnIsValid = selectedPeriod
    ? isValidSkvSubmittedOnDate({
        submittedOn: declarationSubmittedOnValue,
        periodEnd: selectedPeriod.period_end,
        todayIso,
      })
    : false
  const canCloseSelectedPeriod = lifecycleCanCloseSelectedPeriod && hasCurrentReport
  const canDeclareSelectedPeriod =
    lifecycleCanDeclareSelectedPeriod &&
    hasCurrentReport &&
    declarationSubmittedOnIsValid
  const autoLoadCurrentReport = shouldAutoLoadVatReport({
    selectedPeriod,
    hasCurrentReport,
    hasCurrentReportError,
    loading,
    periodsLoading,
  })

  useEffect(() => {
    selectionContextRef.current = {
      periodId: selectedPeriodId,
      contextKey: selectedPeriodContextKey,
    }
  }, [selectedPeriodContextKey, selectedPeriodId])

  // Hämtar tillgängliga år en gång vid montering. År som bara finns i
  // vat_periods läggs till av periodladdningen nedan.
  const loadAvailableYears = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('journal_entries')
        .select('date')
        .eq('user_id', user.id)
        .not('date', 'is', null)
        .order('date', { ascending: false })

      if (error) throw error

      const { data: periodData, error: periodError } = await supabase
        .from('vat_periods')
        .select('period_start, period_end')
        .eq('user_id', user.id)

      if (periodError) throw periodError

      const yearsSet = new Set<number>()
      yearsSet.add(currentYear)

      data?.forEach(row => {
        if (row.date) {
          const y = new Date(row.date).getFullYear()
          if (!isNaN(y)) yearsSet.add(y)
        }
      })

      periodData?.forEach(row => {
        if (row.period_start) {
          const y = new Date(row.period_start).getFullYear()
          if (!isNaN(y)) yearsSet.add(y)
        }
        if (row.period_end) {
          const y = new Date(row.period_end).getFullYear()
          if (!isNaN(y)) yearsSet.add(y)
        }
      })

      const sortedYears = Array.from(yearsSet).sort((a, b) => b - a)
      setAvailableYears(sortedYears)
    } catch (err) {
      console.error('Kunde inte hämta tillgängliga år:', err)
    }
  }, [currentYear])

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const loadVatPeriods = useCallback(async (
    preferredPeriodId?: string,
    options: { ensure?: boolean; preserveReport?: boolean; preservePeriodsOnError?: boolean } = {}
  ): Promise<VatPeriod[] | null> => {
    const shouldEnsure = options.ensure ?? true
    const preserveReport = options.preserveReport ?? false
    const preservePeriodsOnError = options.preservePeriodsOnError ?? false
    setPeriodsLoading(true)
    setPeriodError(null)
    if (!preserveReport) {
      setFetched(false)
      setVatReport(null)
      setReportPeriodId(null)
      setReportContextKey(null)
      setReportError(null)
      setReportErrorPeriodId(null)
      setReportErrorContextKey(null)
      setSettlementEvents([])
      setSettlementEventsPeriodId(null)
      setSettlementEventsContextKey(null)
      setSettlementLoadError(null)
      setSettlementSubmitError(null)
      setTaxAccountMovements([])
      setTaxAccountMovementsPeriodId(null)
      setTaxAccountMovementsContextKey(null)
      setMovementLoadError(null)
      setMovementSubmitError(null)
    }

    const yearStart = `${year}-01-01`
    const yearEnd = `${year}-12-31`
    const selectedYearStartsInFuture = year > currentYear

    try {
      let ensuredThisRun = false

      if (shouldEnsure && canEnsurePeriods && !selectedYearStartsInFuture) {
        const ensureKey = [
          year,
          vatStatus,
          vatPeriodType,
          vatManagementFrom,
        ].join('|')

        if (!ensuredKeysRef.current.has(ensureKey)) {
          await ensureVatPeriods(yearEnd)
          ensuredKeysRef.current.add(ensureKey)
          ensuredThisRun = true
        }
      }

      const periods = await getVatPeriods(yearStart, yearEnd)
      setVatPeriods(periods)
      setSelectedPeriodId(current => {
        const targetPeriodId = preferredPeriodId ?? current
        return periods.some(p => p.id === targetPeriodId)
          ? targetPeriodId
          : periods.some(p => p.id === current)
          ? current
          : periods[0]?.id ?? ''
      })

      setAvailableYears(current => {
        const periodYears = new Set<number>(current)
        periods.forEach(p => {
          periodYears.add(new Date(p.period_start).getFullYear())
          periodYears.add(new Date(p.period_end).getFullYear())
        })
        return Array.from(periodYears).sort((a, b) => b - a)
      })

      if (ensuredThisRun) {
        void loadAvailableYears()
      }

      return periods
    } catch (err) {
      if (!preservePeriodsOnError) {
        setVatPeriods([])
        setSelectedPeriodId('')
      }
      setPeriodError(err instanceof Error ? err.message : String(err))
      return null
    } finally {
      setPeriodsLoading(false)
    }
  }, [
    canEnsurePeriods,
    currentYear,
    loadAvailableYears,
    vatManagementFrom,
    vatPeriodType,
    vatStatus,
    year,
  ])

  const reloadDeclaredPeriodMetadata = useCallback(async (
    periodId: string,
    contextAtStart: string | null
  ): Promise<{ periods: VatPeriod[]; refreshedPeriod: VatPeriod } | null> => {
    if (
      selectionContextRef.current.periodId !== periodId ||
      selectionContextRef.current.contextKey !== contextAtStart
    ) {
      return null
    }

    setPeriodsLoading(true)
    setPeriodError(null)

    const yearStart = `${year}-01-01`
    const yearEnd = `${year}-12-31`

    try {
      const periods = await getVatPeriods(yearStart, yearEnd)

      if (
        selectionContextRef.current.periodId !== periodId ||
        selectionContextRef.current.contextKey !== contextAtStart
      ) {
        return null
      }

      const refreshedPeriod = periods.find(p => p.id === periodId)
      if (!refreshedPeriod) return null

      setVatPeriods(periods)
      setSelectedPeriodId(current => (
        periods.some(p => p.id === current) ? current : periodId
      ))
      setAvailableYears(current => {
        const periodYears = new Set<number>(current)
        periods.forEach(p => {
          periodYears.add(new Date(p.period_start).getFullYear())
          periodYears.add(new Date(p.period_end).getFullYear())
        })
        return Array.from(periodYears).sort((a, b) => b - a)
      })

      return { periods, refreshedPeriod }
    } catch (err) {
      if (
        selectionContextRef.current.periodId === periodId &&
        selectionContextRef.current.contextKey === contextAtStart
      ) {
        setPeriodError(err instanceof Error ? err.message : String(err))
      }
      return null
    } finally {
      setPeriodsLoading(false)
    }
  }, [year])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAvailableYears()
  }, [loadAvailableYears])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadVatPeriods()
  }, [loadVatPeriods])

  const currentVatReport = hasCurrentReport ? vatReport : null
  const skaBetalas = (currentVatReport?.netVat ?? 0) > 0
  const closingText = selectedPeriod ? closingAmountText(selectedPeriod) : null
  const declarationText = selectedPeriod ? declaredAtText(selectedPeriod) : null
  const declarationAuditText = selectedPeriod ? soloLedgerDeclarationAuditText(selectedPeriod) : null
  const settlementReadModel = deriveVatSettlementReadModel(
    selectedPeriod,
    hasCurrentSettlementEvents ? settlementEvents : []
  )
  const taxAccountMovementReadModel = deriveTaxAccountMovementReadModel(
    selectedPeriod,
    hasCurrentTaxAccountMovements ? taxAccountMovements : []
  )
  const selectedMovementKind = taxAccountMovementKindForChoice(
    taxAccountMovementReadModel.direction,
    movementChoice
  )
  const settlementValidation = validateVatSettlementInput({
    eventDate: settlementEventDate,
    amountText: settlementAmountText,
    todayIso,
    remainingAmount: settlementReadModel.remainingAmount,
  })
  const canSubmitSettlement =
    settlementReadModel.actionable &&
    settlementReadModel.state !== 'fully_settled' &&
    hasCurrentSettlementEvents &&
    !settlementLoading &&
    !settlementSubmitting &&
    !settlementLoadError &&
    settlementValidation.ok
  const movementValidation = validateTaxAccountMovementInput({
    movementDate,
    amountText: movementAmountText,
    todayIso,
    remainingAmount: taxAccountMovementReadModel.remainingAmount,
  })
  const canSubmitTaxAccountMovement =
    taxAccountMovementReadModel.actionable &&
    taxAccountMovementReadModel.state !== 'fully_moved' &&
    selectedMovementKind !== null &&
    hasCurrentTaxAccountMovements &&
    !movementLoading &&
    !movementSubmitting &&
    !movementLoadError &&
    movementValidation.ok

  // Beräkna moms för vald DB-verifierad momsperiod via den auktoritativa
  // rapporttjänsten. Komponenten presenterar bara färdiga SKV-fält.
  async function fetchMomsForPeriod(periodForFetch: VatPeriod, contextForFetch: string) {
    const requestSeq = reportRequestSeqRef.current + 1
    reportRequestSeqRef.current = requestSeq
    setLoading(true)
    setFetched(false)
    setVatReport(null)
    setReportPeriodId(null)
    setReportContextKey(null)
    setReportError(null)
    setReportErrorPeriodId(null)
    setReportErrorContextKey(null)
    try {
      const result = await getVatReportForPeriod(
        periodForFetch.period_start,
        periodForFetch.period_end
      )

      if (
        reportRequestSeqRef.current !== requestSeq ||
        !isVatReportRequestCurrent(selectionContextRef.current, {
          periodId: periodForFetch.id,
          contextKey: contextForFetch,
        })
      ) {
        return
      }

      if (result.status === 'blocked') {
        console.error('Momsrapporten kunde inte beräknas säkert:', result.errors)
        setVatReport(null)
        setReportError(vatReportBlockedMessage(result.errors))
        setReportErrorPeriodId(periodForFetch.id)
        setReportErrorContextKey(contextForFetch)
        setFetched(false)
        return
      }

      setVatReport(buildVatReportPresentation(result.report))
      setReportPeriodId(periodForFetch.id)
      setReportContextKey(contextForFetch)
      setFetched(true)
    } catch (err) {
      if (
        reportRequestSeqRef.current !== requestSeq ||
        !isVatReportRequestCurrent(selectionContextRef.current, {
          periodId: periodForFetch.id,
          contextKey: contextForFetch,
        })
      ) {
        return
      }

      console.error('Fel vid hämtning av momsrapport:', err)
      setVatReport(null)
      setReportError('Momsrapporten kunde inte hämtas just nu. Inga belopp visas förrän rapporten kan beräknas säkert.')
      setReportErrorPeriodId(periodForFetch.id)
      setReportErrorContextKey(contextForFetch)
      setFetched(false)
    } finally {
      if (reportRequestSeqRef.current === requestSeq) {
        setLoading(false)
      }
    }
  }

  async function fetchMoms() {
    if (!selectedPeriod || !selectedPeriodContextKey) return
    await fetchMomsForPeriod(selectedPeriod, selectedPeriodContextKey)
  }

  async function loadSettlementEventsForPeriod(
    periodForFetch: VatPeriod,
    contextForFetch: string
  ) {
    const requestSeq = settlementRequestSeqRef.current + 1
    settlementRequestSeqRef.current = requestSeq
    setSettlementLoading(true)
    setSettlementLoadError(null)

    try {
      const events = await getTaxAccountEventsForPeriod(periodForFetch.id)

      if (
        settlementRequestSeqRef.current !== requestSeq ||
        !isVatReportRequestCurrent(selectionContextRef.current, {
          periodId: periodForFetch.id,
          contextKey: contextForFetch,
        })
      ) {
        return null
      }

      setSettlementEvents(events)
      setSettlementEventsPeriodId(periodForFetch.id)
      setSettlementEventsContextKey(contextForFetch)
      return events
    } catch (err) {
      if (
        settlementRequestSeqRef.current !== requestSeq ||
        !isVatReportRequestCurrent(selectionContextRef.current, {
          periodId: periodForFetch.id,
          contextKey: contextForFetch,
        })
      ) {
        return null
      }

      console.error('Kunde inte hämta avräkningar från skattekontot:', err)
      setSettlementEvents([])
      setSettlementEventsPeriodId(periodForFetch.id)
      setSettlementEventsContextKey(contextForFetch)
      setSettlementLoadError('Avräkningar från skattekontot kunde inte hämtas just nu.')
      return null
    } finally {
      if (settlementRequestSeqRef.current === requestSeq) {
        setSettlementLoading(false)
      }
    }
  }

  async function loadTaxAccountMovementsForPeriod(
    periodForFetch: VatPeriod,
    contextForFetch: string
  ) {
    const requestSeq = movementRequestSeqRef.current + 1
    movementRequestSeqRef.current = requestSeq
    setMovementLoading(true)
    setMovementLoadError(null)

    try {
      const movements = await getTaxAccountMovementsForPeriod(periodForFetch.id)

      if (
        movementRequestSeqRef.current !== requestSeq ||
        !isVatReportRequestCurrent(selectionContextRef.current, {
          periodId: periodForFetch.id,
          contextKey: contextForFetch,
        })
      ) {
        return null
      }

      setTaxAccountMovements(movements)
      setTaxAccountMovementsPeriodId(periodForFetch.id)
      setTaxAccountMovementsContextKey(contextForFetch)
      return movements
    } catch (err) {
      if (
        movementRequestSeqRef.current !== requestSeq ||
        !isVatReportRequestCurrent(selectionContextRef.current, {
          periodId: periodForFetch.id,
          contextKey: contextForFetch,
        })
      ) {
        return null
      }

      console.error('Kunde inte hämta överföringar till eller från skattekontot:', err)
      setTaxAccountMovements([])
      setTaxAccountMovementsPeriodId(periodForFetch.id)
      setTaxAccountMovementsContextKey(contextForFetch)
      setMovementLoadError('Överföringar till eller från skattekontot kunde inte hämtas just nu.')
      return null
    } finally {
      if (movementRequestSeqRef.current === requestSeq) {
        setMovementLoading(false)
      }
    }
  }

  function resetSettlementIntent() {
    setSettlementIdempotency(clearSettlementIdempotency())
  }

  function movementStorage() {
    return typeof window === 'undefined' ? null : window.sessionStorage
  }

  function resetMovementIntent() {
    setMovementIdempotency(clearTaxAccountMovementIdempotency())
    clearTaxAccountMovementIdempotencyStorage(movementStorage())
  }

  function closeErrorMessage(message: string) {
    if (message.includes('Importerad historik') || message.includes('Endast SoloLedger')) {
      return 'Importerad momshistorik kan inte stängas som en SoloLedger-period.'
    }
    if (message.includes('redan deklarerad')) {
      return 'Momsperioden är redan deklarerad och kan inte stängas igen.'
    }
    if (message.includes('Framtida momsperioder')) {
      return 'Framtida momsperioder kan inte stängas.'
    }
    if (message.includes('räkenskapsår') && message.includes('är låst')) {
      return 'Momsperioden ligger i ett låst räkenskapsår och kan inte stängas.'
    }
    if (message.includes('aktivitet på 265x')) {
      return 'Perioden innehåller aktivitet på 265x och behöver manuell kontroll före stängning.'
    }
    if (message.includes('alla relevanta momskonton är redan noll')) {
      return 'Perioden har momsaktivitet men relevanta momskonton är redan noll. Kontrollera perioden manuellt.'
    }
    if (message.includes('hittades inte') || message.includes('tillhör inte dig')) {
      return 'Momsperioden kunde inte hittas för ditt konto.'
    }
    return 'Momsperioden kunde inte stängas. Kontrollera perioden och försök igen.'
  }

  function closeSuccessMessage(result: CloseVatPeriodResult) {
    if (result.already_closed) {
      return 'Momsperioden var redan stängd. Statusen har uppdaterats.'
    }
    if (result.transaction_created) {
      return result.ver_nr
        ? `Momsperioden stängdes och systemverifikation VER-${result.ver_nr} skapades.`
        : 'Momsperioden stängdes och en systemverifikation skapades.'
    }
    return 'Momsperioden stängdes. Ingen systemverifikation behövdes eftersom perioden saknade momsaktivitet.'
  }

  function declareErrorMessage(message: string) {
    if (message.includes('Importerad historik') || message.includes('Endast SoloLedger') || message.includes('source')) {
      return 'Importerad momshistorik kan inte markeras som deklarerad i SoloLedgers deklarationsflöde.'
    }
    if (message.includes('måste vara stängd') || message.includes('status') || message.includes('closed')) {
      return 'Endast stängda SoloLedger-momsperioder kan markeras som deklarerade.'
    }
    if (message.includes('hittades inte') || message.includes('tillhör inte dig') || message.includes('not found')) {
      return 'Momsperioden kunde inte hittas för ditt konto.'
    }
    if (message.includes('framtiden') || message.includes('future')) {
      return 'Datumet för inlämning kan inte vara i framtiden.'
    }
    if (message.includes('periodens slut') || message.includes('period_end')) {
      return 'Datumet för inlämning kan inte vara före momsperiodens slut.'
    }
    if (message.includes('annat inlämningsdatum') || message.includes('redan deklarerad')) {
      return 'Momsperioden är redan bekräftad med ett annat inlämningsdatum. Ändring behöver hanteras separat.'
    }
    return 'Momsperioden kunde inte markeras som deklarerad. Kontrollera perioden och försök igen.'
  }

  function declareSuccessMessage(result: DeclareVatPeriodResult) {
    if (result.already_declared) {
      return 'Momsdeklarationen var redan bekräftad i SoloLedger.'
    }
    return 'Inlämnad momsdeklaration bekräftades i SoloLedger.'
  }

  async function handleRecordSettlement() {
    if (!canStartVatSettlementSubmit({
      hasSelectedPeriod: Boolean(selectedPeriod),
      hasSelectedContext: Boolean(selectedPeriodContextKey),
      canSubmitSettlement,
      amount: settlementValidation.amount,
      inFlight: settlementInFlightRef.current,
    })) {
      return
    }

    if (!selectedPeriod || !selectedPeriodContextKey || !settlementValidation.amount) return

    const direction = settlementReadModel.direction
    if (!direction) return

    const amount = settlementValidation.amount
    const confirmed = window.confirm(
      `${settlementActionLabel(direction)}?\n\n` +
      `Datum på skattekontot: ${fmtDate(settlementEventDate)}\n` +
      `Belopp: ${fmt(amount)} kr\n\n` +
      'Detta registrerar händelsen som visas på ditt skattekonto hos Skatteverket. En banköverföring hanteras inte här.'
    )
    if (!confirmed) return

    const periodId = selectedPeriod.id
    const contextAtStart = selectedPeriodContextKey
    const prepared = prepareSettlementIdempotencyKey(
      settlementIdempotency,
      {
        periodId,
        eventDate: settlementEventDate,
        amount,
      },
      () => crypto.randomUUID()
    )

    setSettlementIdempotency(prepared.state)
    settlementInFlightRef.current = true
    setSettlementSubmitting(true)
    setSettlementSubmitError(null)

    try {
      const result = await recordVatSettlement(
        periodId,
        settlementEventDate,
        amount,
        prepared.key
      )
      const centralRefreshResult = await onBookkeepingRefresh?.()
      const centralRefreshFailed = centralRefreshResult?.ok === false

      if (
        !isVatSettlementSubmitContextCurrent(selectionContextRef.current, {
          periodId,
          contextKey: contextAtStart,
        })
      ) {
        return
      }

      const metadataRefresh = await reloadDeclaredPeriodMetadata(
        periodId,
        contextAtStart
      )
      if (!metadataRefresh) return

      await loadSettlementEventsForPeriod(
        metadataRefresh.refreshedPeriod,
        contextAtStart
      )
      await fetchMomsForPeriod(metadataRefresh.refreshedPeriod, contextAtStart)
      setSettlementAmountText('')
      resetSettlementIntent()

      const refreshWarning = centralRefreshFailed
        ? '\n\nAvräkningen registrerades, men delar av bokföringsvyn kunde inte uppdateras automatiskt. Ladda om sidan om verifikationen inte syns.'
        : ''
      const replayText = result.idempotent_replay
        ? 'Avräkningen var redan registrerad och visades igen.'
        : result.ver_nr
        ? `Avräkningen registrerades som VER-${result.ver_nr}.`
        : 'Avräkningen registrerades.'

      alert(replayText + refreshWarning)
    } catch (err) {
      const kind = vatSettlementSubmissionFailureKind(err)
      if (kind === 'authoritative_rejection') {
        resetSettlementIntent()
      }
      setSettlementSubmitError(vatSettlementSubmissionErrorMessage(kind))
    } finally {
      settlementInFlightRef.current = false
      setSettlementSubmitting(false)
    }
  }

  async function handleRecordTaxAccountMovement() {
    if (!canStartTaxAccountMovementSubmit({
      hasSelectedPeriod: Boolean(selectedPeriod),
      hasSelectedContext: Boolean(selectedPeriodContextKey),
      canSubmitMovement: canSubmitTaxAccountMovement,
      amount: movementValidation.amount,
      movementKind: selectedMovementKind,
      inFlight: movementInFlightRef.current,
    })) {
      return
    }

    if (
      !selectedPeriod ||
      !selectedPeriodContextKey ||
      !movementValidation.amount ||
      !selectedMovementKind
    ) {
      return
    }

    const amount = movementValidation.amount
    const confirmed = window.confirm(
      `${taxAccountMovementActionLabel(selectedMovementKind)}?\n\n` +
      `Datum: ${fmtDate(movementDate)}\n` +
      `Belopp: ${fmt(amount)} kr\n\n` +
      'Detta kopplar pengaflytten till den valda momsperiodens momsbelopp. Om överföringen också gäller andra skatter ska du inte registrera hela beloppet här utan tydligt underlag.'
    )
    if (!confirmed) return

    const periodId = selectedPeriod.id
    const contextAtStart = selectedPeriodContextKey
    const intent = {
      periodId,
      movementKind: selectedMovementKind,
      movementDate,
      amount,
    }
    const storedIdempotency =
      readTaxAccountMovementIdempotencyFromStorage(movementStorage())
    const seedIdempotency =
      movementIdempotency.key ? movementIdempotency : storedIdempotency
    const prepared = prepareTaxAccountMovementIdempotencyKey(
      seedIdempotency,
      intent,
      () => crypto.randomUUID()
    )

    setMovementIdempotency(prepared.state)
    writeTaxAccountMovementIdempotencyToStorage(movementStorage(), prepared.state)
    movementInFlightRef.current = true
    setMovementSubmitting(true)
    setMovementSubmitError(null)

    try {
      const result = await recordTaxAccountMovement(
        selectedMovementKind,
        movementDate,
        amount,
        periodId,
        prepared.key
      )
      const centralRefreshResult = await onBookkeepingRefresh?.()
      const centralRefreshFailed = centralRefreshResult?.ok === false

      if (
        !isTaxAccountMovementSubmitContextCurrent(selectionContextRef.current, {
          periodId,
          contextKey: contextAtStart,
        })
      ) {
        return
      }

      const metadataRefresh = await reloadDeclaredPeriodMetadata(
        periodId,
        contextAtStart
      )
      if (!metadataRefresh) return

      await loadTaxAccountMovementsForPeriod(
        metadataRefresh.refreshedPeriod,
        contextAtStart
      )
      await fetchMomsForPeriod(metadataRefresh.refreshedPeriod, contextAtStart)
      setMovementAmountText('')
      resetMovementIntent()

      const refreshWarning = centralRefreshFailed
        ? '\n\nÖverföringen registrerades, men delar av bokföringsvyn kunde inte uppdateras automatiskt. Ladda om sidan om verifikationen inte syns.'
        : ''
      const replayText = result.idempotent_replay
        ? 'Överföringen var redan registrerad och visades igen.'
        : result.ver_nr
        ? `Överföringen registrerades som VER-${result.ver_nr}.`
        : 'Överföringen registrerades.'

      alert(replayText + refreshWarning)
    } catch (err) {
      const kind = taxAccountMovementSubmissionFailureKind(err)
      if (kind === 'authoritative_rejection') {
        resetMovementIntent()
      }
      setMovementSubmitError(taxAccountMovementSubmissionErrorMessage(err))
    } finally {
      movementInFlightRef.current = false
      setMovementSubmitting(false)
    }
  }

  async function handleClosePeriod() {
    if (!selectedPeriod || !canCloseSelectedPeriod || closeInFlightRef.current || declareInFlightRef.current) return

    const confirmed = window.confirm(
      `Stäng momsperioden ${periodLabel(selectedPeriod)}?\n\n` +
      'SoloLedger kommer att stänga momsperioden och, vid behov, skapa en systemverifikation som nollar periodens relevanta momskonton mot 2650.\n\n' +
      'Efter stängning låses perioden för vanlig momsrelaterad bokföring enligt befintlig serverlogik.'
    )
    if (!confirmed) return

    const periodId = selectedPeriod.id
    closeInFlightRef.current = true
    setClosing(true)
    setPeriodError(null)

    try {
      const result = await closeVatPeriod(periodId)

      const centralRefreshResult = await onBookkeepingRefresh?.()
      const centralRefreshFailed = centralRefreshResult?.ok === false

      const periods = await loadVatPeriods(periodId, { ensure: false })
      let periodRefreshFailed = false
      if (!periods) {
        periodRefreshFailed = true
      } else {
        const refreshedPeriod = periods.find(p => p.id === periodId)
        if (refreshedPeriod) {
          await fetchMomsForPeriod(refreshedPeriod, `${year}|${profileKey}|${refreshedPeriod.id}`)
        }
      }

      const refreshWarning = centralRefreshFailed && periodRefreshFailed
        ? '\n\nStängningen lyckades, men vyn kunde inte uppdateras korrekt. Ladda om sidan för att se periodstatus och eventuell systemverifikation.'
        : centralRefreshFailed
        ? '\n\nStängningen lyckades, men delar av bokföringsvyn kunde inte uppdateras automatiskt. Ladda om sidan om systemverifikationen inte syns.'
        : periodRefreshFailed
        ? '\n\nStängningen lyckades, men periodstatus kunde inte uppdateras automatiskt. Ladda om sidan.'
        : ''

      alert(closeSuccessMessage(result) + refreshWarning)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      alert(closeErrorMessage(message))
    } finally {
      closeInFlightRef.current = false
      setClosing(false)
    }
  }

  async function handleDeclarePeriod() {
    if (!selectedPeriod || !canDeclareSelectedPeriod || declareInFlightRef.current || closeInFlightRef.current) return

    const confirmed = window.confirm(
      `${CONFIRM_DECLARATION_BUTTON_LABEL}?\n\n` +
      `${DECLARATION_DOES_NOT_SUBMIT_COPY}\n\n` +
      `${DECLARATION_ALREADY_SUBMITTED_COPY}\n\n` +
      `${DECLARATION_SUBMITTED_ON_LABEL}: ${fmtDate(declarationSubmittedOnValue)}\n` +
      `Period: ${periodLabel(selectedPeriod)}\n\n` +
      'Detta registrerar deklarationen i SoloLedger. Ingen ny bokföringsverifikation eller betalning skapas.'
    )
    if (!confirmed) return

    const periodId = selectedPeriod.id
    const contextAtStart = selectedPeriodContextKey
    declareInFlightRef.current = true
    setDeclaring(true)
    setPeriodError(null)

    try {
      const result = await declareVatPeriod(periodId, declarationSubmittedOnValue)
      const refreshResult = await reloadDeclaredPeriodMetadata(periodId, contextAtStart)
      const periodRefreshFailed = !refreshResult
      const contextStillCurrent =
        selectionContextRef.current.periodId === periodId &&
        selectionContextRef.current.contextKey === contextAtStart

      const refreshWarning = periodRefreshFailed
        ? '\n\nMomsperioden markerades som deklarerad, men vyn kunde inte uppdateras automatiskt. Ladda om sidan för att se aktuell status.'
        : ''

      alert(declareSuccessMessage(result) + refreshWarning)

      if (refreshResult && contextStillCurrent && reportPeriodId === periodId) {
        setReportContextKey(contextAtStart)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      alert(declareErrorMessage(message))
    } finally {
      declareInFlightRef.current = false
      setDeclaring(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (fetched && selectedPeriod) fetchMoms()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPeriodId])

  useEffect(() => {
    if (!autoLoadCurrentReport || !selectedPeriod || !selectedPeriodContextKey) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchMomsForPeriod(selectedPeriod, selectedPeriodContextKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLoadCurrentReport, selectedPeriodId, selectedPeriodContextKey])

  useEffect(() => {
    if (!selectedPeriod || !selectedPeriodContextKey) return
    if (!settlementReadModel.actionable) return
    if (hasCurrentSettlementEvents || settlementLoading) return
    if (settlementLoadError) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSettlementEventsForPeriod(selectedPeriod, selectedPeriodContextKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    hasCurrentSettlementEvents,
    selectedPeriodId,
    selectedPeriodContextKey,
    settlementLoading,
    settlementLoadError,
    settlementReadModel.actionable,
  ])

  useEffect(() => {
    if (!selectedPeriod || !selectedPeriodContextKey) return
    if (!taxAccountMovementReadModel.actionable) return
    if (hasCurrentTaxAccountMovements || movementLoading) return
    if (movementLoadError) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTaxAccountMovementsForPeriod(selectedPeriod, selectedPeriodContextKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    hasCurrentTaxAccountMovements,
    movementLoadError,
    movementLoading,
    selectedPeriodId,
    selectedPeriodContextKey,
    taxAccountMovementReadModel.actionable,
  ])

  useEffect(() => {
    const previous = movementChoiceContextRef.current
    const nextContext = selectedPeriodContextKey
    const nextDirection = taxAccountMovementReadModel.direction
    movementChoiceContextRef.current = {
      contextKey: nextContext,
      direction: nextDirection,
    }
    setMovementChoice(currentChoice =>
      nextTaxAccountMovementChoiceForContext({
        currentChoice,
        previousContextKey: previous.contextKey,
        nextContextKey: nextContext,
        previousDirection: previous.direction,
        nextDirection,
      })
    )
  }, [selectedPeriodContextKey, taxAccountMovementReadModel.direction])

  function handleYearChange(nextYear: number) {
    setFetched(false)
    setVatReport(null)
    setReportPeriodId(null)
    setReportContextKey(null)
    setReportError(null)
    setReportErrorPeriodId(null)
    setReportErrorContextKey(null)
    setSettlementEvents([])
    setSettlementEventsPeriodId(null)
    setSettlementEventsContextKey(null)
    setSettlementLoadError(null)
    setSettlementSubmitError(null)
    setSettlementAmountText('')
    resetSettlementIntent()
    setTaxAccountMovements([])
    setTaxAccountMovementsPeriodId(null)
    setTaxAccountMovementsContextKey(null)
    setMovementLoadError(null)
    setMovementSubmitError(null)
    setMovementAmountText('')
    resetMovementIntent()
    setYear(nextYear)
  }

  function handlePeriodChange(nextPeriodId: string) {
    setFetched(false)
    setVatReport(null)
    setReportPeriodId(null)
    setReportContextKey(null)
    setReportError(null)
    setReportErrorPeriodId(null)
    setReportErrorContextKey(null)
    setSettlementEvents([])
    setSettlementEventsPeriodId(null)
    setSettlementEventsContextKey(null)
    setSettlementLoadError(null)
    setSettlementSubmitError(null)
    setSettlementAmountText('')
    resetSettlementIntent()
    setTaxAccountMovements([])
    setTaxAccountMovementsPeriodId(null)
    setTaxAccountMovementsContextKey(null)
    setMovementLoadError(null)
    setMovementSubmitError(null)
    setMovementAmountText('')
    resetMovementIntent()
    setSelectedPeriodId(nextPeriodId)
  }

  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-8">
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">SKV 4700</p>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-4 sm:p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-4 sm:items-end">
          <div className="flex flex-col gap-1 sm:w-auto">
            <label className="text-[9px] font-black uppercase text-gray-400 ml-1">År</label>
            <select
              value={year}
              onChange={e => handleYearChange(Number(e.target.value))}
              disabled={closing || declaring}
              className="bg-gray-50 rounded-xl px-4 py-2.5 font-black text-sm text-gray-700 outline-none cursor-pointer hover:bg-gray-100 transition-colors border border-transparent focus:border-emerald-300"
            >
              {availableYears.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1 flex-1 sm:min-w-[220px]">
            <label className="text-[9px] font-black uppercase text-gray-400 ml-1">Period</label>
            <select
              value={selectedPeriodId}
              onChange={e => handlePeriodChange(e.target.value)}
              disabled={periodsLoading || closing || declaring || vatPeriods.length === 0}
              className="bg-gray-50 rounded-xl px-4 py-2.5 font-black text-sm text-gray-700 outline-none cursor-pointer hover:bg-gray-100 transition-colors border border-transparent focus:border-emerald-300 disabled:text-gray-300 disabled:cursor-not-allowed"
            >
              {vatPeriods.length === 0 ? (
                <option value="">Ingen DB-verifierad period</option>
              ) : (
                vatPeriods.map(p => (
                  <option key={p.id} value={p.id}>
                    {periodLabel(p)} · {periodTypeLabel(p.period_type)}
                  </option>
                ))
              )}
            </select>
          </div>

          <button
            onClick={fetchMoms}
            disabled={loading || periodsLoading || closing || declaring || !selectedPeriod}
            className="h-[42px] px-6 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black uppercase text-[10px] tracking-wider transition-all shadow-md disabled:bg-gray-300 w-full sm:w-auto"
          >
            {loading ? '...' : 'Beräkna'}
          </button>

          {lifecycleCanCloseSelectedPeriod && (
            <button
              onClick={handleClosePeriod}
              disabled={closing || declaring || periodsLoading || loading || !canCloseSelectedPeriod}
              className="h-[42px] px-6 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-black uppercase text-[10px] tracking-wider transition-all shadow-md disabled:bg-gray-300 w-full sm:w-auto"
            >
              {closing ? 'Stänger...' : 'Stäng momsperiod'}
            </button>
          )}

          {lifecycleCanDeclareSelectedPeriod && (
            <div className="flex flex-col gap-1 w-full sm:w-auto">
              <label className="text-[9px] font-black uppercase text-gray-400 ml-1">
                {DECLARATION_SUBMITTED_ON_LABEL}
              </label>
              <input
                type="date"
                value={declarationSubmittedOnValue}
                min={selectedPeriod?.period_end}
                max={todayIso}
                onChange={e => setDeclarationSubmittedOn(e.target.value)}
                disabled={declaring || closing || periodsLoading || loading}
                className="h-[42px] bg-gray-50 rounded-xl px-4 py-2.5 font-black text-sm text-gray-700 outline-none cursor-pointer hover:bg-gray-100 transition-colors border border-transparent focus:border-sky-300 disabled:text-gray-300 disabled:cursor-not-allowed"
              />
            </div>
          )}

          {lifecycleCanDeclareSelectedPeriod && (
            <button
              onClick={handleDeclarePeriod}
              disabled={declaring || closing || periodsLoading || loading || !canDeclareSelectedPeriod}
              className="h-[42px] px-6 bg-sky-600 hover:bg-sky-700 text-white rounded-xl font-black uppercase text-[10px] tracking-wider transition-all shadow-md disabled:bg-gray-300 w-full sm:w-auto"
            >
              {declaring ? 'Bekräftar...' : CONFIRM_DECLARATION_BUTTON_LABEL}
            </button>
          )}
        </div>

        {selectedPeriod && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-dashed border-gray-100 pt-4">
            <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-lg border ${statusClass(selectedPeriod.status)}`}>
              {statusLabel(selectedPeriod.status)}
            </span>
            <span className="text-[9px] font-black uppercase px-2 py-1 rounded-lg border border-gray-100 bg-gray-50 text-gray-500">
              {sourceLabel(selectedPeriod.source)}
            </span>
            <span className="text-[9px] font-black uppercase px-2 py-1 rounded-lg border border-gray-100 bg-gray-50 text-gray-500">
              {periodTypeLabel(selectedPeriod.period_type)}
            </span>
            {closingText && (
              <span className="text-[9px] font-black uppercase px-2 py-1 rounded-lg border border-violet-100 bg-violet-50 text-violet-600">
                {closingText}
              </span>
            )}
            {declarationText && (
              <span className="text-[9px] font-black uppercase px-2 py-1 rounded-lg border border-sky-100 bg-sky-50 text-sky-600">
                {declarationText}
              </span>
            )}
            {declarationAuditText && (
              <span className="text-[9px] font-bold text-gray-400">
                {declarationAuditText}
              </span>
            )}
            {selectedPeriod.status !== 'open' && selectedPeriod.closing_transaction_id === null && (
              <span className="text-[9px] font-bold text-gray-400">
                Ingen avslutsverifikation behövdes för perioden.
              </span>
            )}
          </div>
        )}

        {selectedPeriod && selectedPeriod.status === 'closed' && (
          <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-amber-700">
              Stängd momsperiod
            </p>
            <p className="text-[11px] font-bold text-amber-700 mt-1">
              {VAT_RECLASSIFIED_NOT_SETTLED_COPY}
            </p>
          </div>
        )}

        {selectedPeriod && selectedPeriod.status === 'declared' && (
          <div className="mt-4 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-sky-700">
              Inlämnad momsdeklaration bekräftad
            </p>
            <p className="text-[11px] font-bold text-sky-700 mt-1">
              {VAT_RECLASSIFIED_NOT_SETTLED_COPY}
            </p>
          </div>
        )}

        {selectedPeriod &&
          taxAccountMovementReadModel.actionable &&
          taxAccountMovementReadModel.direction && (
            <div className="mt-4 rounded-2xl border border-cyan-100 bg-white px-4 py-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-cyan-700">
                    Pengar till/från skattekontot
                  </p>
                  <p className="text-sm font-black text-gray-700 mt-1">
                    {taxAccountMovementQuestion(taxAccountMovementReadModel.direction)}
                  </p>
                  <p className="text-[11px] font-bold text-gray-400 mt-1">
                    Detta gäller bara pengaflytten som hör till den valda momsperioden.
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-black text-gray-800 tabular-nums whitespace-nowrap">
                    {fmt(taxAccountMovementReadModel.totalAmount)} kr
                  </p>
                  <p className="text-[10px] font-black uppercase text-cyan-600 mt-1">
                    {taxAccountMovementStateText(taxAccountMovementReadModel.state)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4">
                <div className="bg-gray-50 rounded-xl px-3 py-2">
                  <p className="text-[8px] font-black uppercase text-gray-400">
                    Momsbelopp
                  </p>
                  <p className="text-sm font-black text-gray-700 tabular-nums">
                    {fmt(taxAccountMovementReadModel.totalAmount)} kr
                  </p>
                </div>
                <div className="bg-gray-50 rounded-xl px-3 py-2">
                  <p className="text-[8px] font-black uppercase text-gray-400">
                    Pengar registrerade
                  </p>
                  <p className="text-sm font-black text-gray-700 tabular-nums">
                    {fmt(taxAccountMovementReadModel.registeredAmount)} kr
                  </p>
                </div>
                <div className="bg-gray-50 rounded-xl px-3 py-2">
                  <p className="text-[8px] font-black uppercase text-gray-400">
                    Kvar att koppla
                  </p>
                  <p className="text-sm font-black text-gray-700 tabular-nums">
                    {fmt(taxAccountMovementReadModel.remainingAmount)} kr
                  </p>
                </div>
              </div>

              {taxAccountMovementReadModel.state !== 'fully_moved' && (
                <div className="mt-4 border-t border-dashed border-gray-100 pt-4">
                  <p className="text-xs font-black text-gray-700">
                    {taxAccountMovementQuestion(taxAccountMovementReadModel.direction)}
                  </p>
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {taxAccountMovementReadModel.direction === 'payable' ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setMovementChoice('business_account')
                            setMovementSubmitError(null)
                          }}
                          className={`min-h-[46px] rounded-xl border px-3 py-2 text-left text-[11px] font-black transition-colors ${
                            movementChoice === 'business_account'
                              ? 'border-cyan-300 bg-cyan-50 text-cyan-700'
                              : 'border-gray-100 bg-gray-50 text-gray-500 hover:bg-gray-100'
                          }`}
                        >
                          Från företagets konto
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMovementChoice('owner_private')
                            setMovementSubmitError(null)
                          }}
                          className={`min-h-[46px] rounded-xl border px-3 py-2 text-left text-[11px] font-black transition-colors ${
                            movementChoice === 'owner_private'
                              ? 'border-cyan-300 bg-cyan-50 text-cyan-700'
                              : 'border-gray-100 bg-gray-50 text-gray-500 hover:bg-gray-100'
                          }`}
                        >
                          Med privata pengar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMovementChoice('not_yet')
                            setMovementSubmitError(null)
                          }}
                          className={`min-h-[46px] rounded-xl border px-3 py-2 text-left text-[11px] font-black transition-colors ${
                            movementChoice === 'not_yet'
                              ? 'border-gray-300 bg-white text-gray-700'
                              : 'border-gray-100 bg-gray-50 text-gray-500 hover:bg-gray-100'
                          }`}
                        >
                          Inte än
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMovementChoice('unsure')
                            setMovementSubmitError(null)
                          }}
                          className={`min-h-[46px] rounded-xl border px-3 py-2 text-left text-[11px] font-black transition-colors ${
                            movementChoice === 'unsure'
                              ? 'border-gray-300 bg-white text-gray-700'
                              : 'border-gray-100 bg-gray-50 text-gray-500 hover:bg-gray-100'
                          }`}
                        >
                          Osäker
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setMovementChoice('tax_account_only')
                            setMovementSubmitError(null)
                          }}
                          className={`min-h-[46px] rounded-xl border px-3 py-2 text-left text-[11px] font-black transition-colors ${
                            movementChoice === 'tax_account_only'
                              ? 'border-gray-300 bg-white text-gray-700'
                              : 'border-gray-100 bg-gray-50 text-gray-500 hover:bg-gray-100'
                          }`}
                        >
                          Kvar på skattekontot
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMovementChoice('business_account')
                            setMovementSubmitError(null)
                          }}
                          className={`min-h-[46px] rounded-xl border px-3 py-2 text-left text-[11px] font-black transition-colors ${
                            movementChoice === 'business_account'
                              ? 'border-cyan-300 bg-cyan-50 text-cyan-700'
                              : 'border-gray-100 bg-gray-50 text-gray-500 hover:bg-gray-100'
                          }`}
                        >
                          Till företagets konto
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMovementChoice('owner_private')
                            setMovementSubmitError(null)
                          }}
                          className={`min-h-[46px] rounded-xl border px-3 py-2 text-left text-[11px] font-black transition-colors ${
                            movementChoice === 'owner_private'
                              ? 'border-cyan-300 bg-cyan-50 text-cyan-700'
                              : 'border-gray-100 bg-gray-50 text-gray-500 hover:bg-gray-100'
                          }`}
                        >
                          Uttaget privat
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMovementChoice('unsure')
                            setMovementSubmitError(null)
                          }}
                          className={`min-h-[46px] rounded-xl border px-3 py-2 text-left text-[11px] font-black transition-colors ${
                            movementChoice === 'unsure'
                              ? 'border-gray-300 bg-white text-gray-700'
                              : 'border-gray-100 bg-gray-50 text-gray-500 hover:bg-gray-100'
                          }`}
                        >
                          Osäker
                        </button>
                      </>
                    )}
                  </div>

                  {(movementChoice === 'unsure' || movementChoice === 'not_yet' || movementChoice === 'tax_account_only') && (
                    <p className="mt-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-[10px] font-bold text-gray-500">
                      {movementChoice === 'unsure'
                        ? `${TAX_ACCOUNT_MOVEMENT_MIXED_TRANSFER_COPY} ${TAX_ACCOUNT_MOVEMENT_UNSURE_COPY}`
                        : 'Ingen bokföring skapas för det här valet.'}
                    </p>
                  )}
                </div>
              )}

              {taxAccountMovementReadModel.state !== 'fully_moved' && selectedMovementKind && (
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 sm:items-end">
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-black uppercase text-gray-400 ml-1">
                      Datum för överföringen
                    </label>
                    <input
                      type="date"
                      value={movementDate}
                      max={todayIso}
                      onChange={e => {
                        setMovementDate(e.target.value)
                        setMovementSubmitError(null)
                      }}
                      disabled={movementSubmitting || movementLoading}
                      className="h-[42px] bg-gray-50 rounded-xl px-4 py-2.5 font-black text-sm text-gray-700 outline-none cursor-pointer hover:bg-gray-100 transition-colors border border-transparent focus:border-cyan-300 disabled:text-gray-300 disabled:cursor-not-allowed"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-black uppercase text-gray-400 ml-1">
                      {taxAccountMovementAmountLabel(taxAccountMovementReadModel.direction)}
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={movementAmountText}
                      onChange={e => {
                        setMovementAmountText(e.target.value)
                        setMovementSubmitError(null)
                      }}
                      disabled={movementSubmitting || movementLoading}
                      placeholder={fmt(taxAccountMovementReadModel.remainingAmount)}
                      className="h-[42px] bg-gray-50 rounded-xl px-4 py-2.5 font-black text-sm text-gray-700 outline-none hover:bg-gray-100 transition-colors border border-transparent focus:border-cyan-300 disabled:text-gray-300 disabled:cursor-not-allowed"
                    />
                  </div>

                  <button
                    onClick={handleRecordTaxAccountMovement}
                    disabled={!canSubmitTaxAccountMovement}
                    className="h-[42px] px-6 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl font-black uppercase text-[10px] tracking-wider transition-all shadow-md disabled:bg-gray-300 w-full sm:w-auto"
                  >
                    {movementSubmitting
                      ? 'Registrerar...'
                      : taxAccountMovementActionLabel(selectedMovementKind)}
                  </button>
                </div>
              )}

              {taxAccountMovementReadModel.state !== 'fully_moved' &&
                selectedMovementKind &&
                movementAmountText &&
                !movementValidation.ok && (
                  <p className="mt-3 text-[10px] font-bold text-red-500">
                    {movementValidation.message}
                  </p>
                )}

              {(movementLoadError || movementSubmitError) && (
                <p className="mt-3 text-[10px] font-bold text-red-500">
                  {movementLoadError || movementSubmitError}
                </p>
              )}

              <details className="mt-4 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-[10px] font-bold text-gray-500">
                <summary className="cursor-pointer text-cyan-700">
                  När ska jag använda detta?
                </summary>
                <p className="mt-2">
                  Använd det bara när du tydligt vet vilken del av överföringen som hör till momsen för den valda perioden. {TAX_ACCOUNT_MOVEMENT_MIXED_TRANSFER_COPY} {TAX_ACCOUNT_MOVEMENT_UNSURE_COPY}
                </p>
              </details>

              <div className="mt-4 border-t border-dashed border-gray-100 pt-4">
                <p className="text-[9px] font-black uppercase tracking-wider text-gray-400">
                  Historik
                </p>
                {movementLoading && (
                  <p className="mt-2 text-[10px] font-bold text-gray-400">
                    Hämtar överföringar...
                  </p>
                )}
                {!movementLoading && taxAccountMovementReadModel.movements.length === 0 && (
                  <p className="mt-2 text-[10px] font-bold text-gray-400">
                    Ingen pengaflytt registrerad för den här momsperioden.
                  </p>
                )}
                {!movementLoading && taxAccountMovementReadModel.movements.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {taxAccountMovementReadModel.movements.map(movement => (
                      <div
                        key={movement.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-gray-50 px-3 py-2"
                      >
                        <div>
                          <p className="text-[10px] font-black text-gray-700">
                            {fmtDate(movement.movement_date)}
                          </p>
                          <p className="text-[10px] font-bold text-gray-400">
                            {taxAccountMovementHistoryText(movement.movement_kind)}
                          </p>
                        </div>
                        <p className="text-sm font-black text-gray-700 tabular-nums">
                          {fmt(movement.amount)} kr
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

        {selectedPeriod &&
          selectedPeriod.status === 'declared' &&
          settlementReadModel.actionable &&
          settlementReadModel.direction && (
            <div className="mt-4 rounded-2xl border border-sky-100 bg-white px-4 py-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-sky-700">
                    Avräkning på skattekontot
                  </p>
                  <p className="text-sm font-black text-gray-700 mt-1">
                    {payableOrRefundHeading(settlementReadModel.direction)}
                  </p>
                  <p className="text-[11px] font-bold text-gray-400 mt-1">
                    Den här statusen gäller bara momshändelsen på skattekontot.
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-black text-gray-800 tabular-nums whitespace-nowrap">
                    {fmt(settlementReadModel.totalAmount)} kr
                  </p>
                  <p className="text-[10px] font-black uppercase text-sky-600 mt-1">
                    {settlementStateText(settlementReadModel.state)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4">
                <div className="bg-gray-50 rounded-xl px-3 py-2">
                  <p className="text-[8px] font-black uppercase text-gray-400">
                    {payableOrRefundHeading(settlementReadModel.direction)}
                  </p>
                  <p className="text-sm font-black text-gray-700 tabular-nums">
                    {fmt(settlementReadModel.totalAmount)} kr
                  </p>
                </div>
                <div className="bg-gray-50 rounded-xl px-3 py-2">
                  <p className="text-[8px] font-black uppercase text-gray-400">
                    Registrerat på skattekontot
                  </p>
                  <p className="text-sm font-black text-gray-700 tabular-nums">
                    {fmt(settlementReadModel.registeredAmount)} kr
                  </p>
                </div>
                <div className="bg-gray-50 rounded-xl px-3 py-2">
                  <p className="text-[8px] font-black uppercase text-gray-400">
                    Kvar att registrera
                  </p>
                  <p className="text-sm font-black text-gray-700 tabular-nums">
                    {fmt(settlementReadModel.remainingAmount)} kr
                  </p>
                </div>
              </div>

              {settlementReadModel.legacyMissingDeclarationDate && (
                <p className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-[10px] font-bold text-amber-700">
                  Deklarationsdatum saknas för den här äldre perioden, men avräkning kan registreras om händelsen syns på skattekontot.
                </p>
              )}

              <div className="mt-4 border-t border-dashed border-gray-100 pt-4">
                <p className="text-xs font-black text-gray-700">
                  {settlementQuestion(settlementReadModel.direction)}
                </p>
                <p className="text-[10px] font-bold text-gray-400 mt-1">
                  Använd datumet och beloppet som visas på ditt skattekonto hos Skatteverket.
                </p>
                <details className="mt-2 text-[10px] font-bold text-gray-400">
                  <summary className="cursor-pointer text-sky-600">
                    Var hittar jag detta?
                  </summary>
                  <p className="mt-1">
                    Logga in hos Skatteverket och titta på händelsen på skattekontot. En banköverföring till Skatteverket är en separat händelse och betyder inte i sig att momsen har dragits eller krediterats på skattekontot.
                  </p>
                </details>
              </div>

              {settlementReadModel.state !== 'fully_settled' && (
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 sm:items-end">
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-black uppercase text-gray-400 ml-1">
                      Datum på skattekontot
                    </label>
                    <input
                      type="date"
                      value={settlementEventDate}
                      max={todayIso}
                      onChange={e => {
                        setSettlementEventDate(e.target.value)
                        setSettlementSubmitError(null)
                        resetSettlementIntent()
                      }}
                      disabled={settlementSubmitting || settlementLoading}
                      className="h-[42px] bg-gray-50 rounded-xl px-4 py-2.5 font-black text-sm text-gray-700 outline-none cursor-pointer hover:bg-gray-100 transition-colors border border-transparent focus:border-sky-300 disabled:text-gray-300 disabled:cursor-not-allowed"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-black uppercase text-gray-400 ml-1">
                      {settlementAmountLabel(settlementReadModel.direction)}
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={settlementAmountText}
                      onChange={e => {
                        setSettlementAmountText(e.target.value)
                        setSettlementSubmitError(null)
                        resetSettlementIntent()
                      }}
                      disabled={settlementSubmitting || settlementLoading}
                      placeholder={fmt(settlementReadModel.remainingAmount)}
                      className="h-[42px] bg-gray-50 rounded-xl px-4 py-2.5 font-black text-sm text-gray-700 outline-none hover:bg-gray-100 transition-colors border border-transparent focus:border-sky-300 disabled:text-gray-300 disabled:cursor-not-allowed"
                    />
                  </div>

                  <button
                    onClick={handleRecordSettlement}
                    disabled={!canSubmitSettlement}
                    className="h-[42px] px-6 bg-sky-600 hover:bg-sky-700 text-white rounded-xl font-black uppercase text-[10px] tracking-wider transition-all shadow-md disabled:bg-gray-300 w-full sm:w-auto"
                  >
                    {settlementSubmitting
                      ? 'Registrerar...'
                      : settlementActionLabel(settlementReadModel.direction)}
                  </button>
                </div>
              )}

              {settlementReadModel.state !== 'fully_settled' &&
                settlementAmountText &&
                !settlementValidation.ok && (
                  <p className="mt-3 text-[10px] font-bold text-red-500">
                    {settlementValidation.message}
                  </p>
                )}

              {(settlementLoadError || settlementSubmitError) && (
                <p className="mt-3 text-[10px] font-bold text-red-500">
                  {settlementLoadError || settlementSubmitError}
                </p>
              )}

              <div className="mt-4 border-t border-dashed border-gray-100 pt-4">
                <p className="text-[9px] font-black uppercase tracking-wider text-gray-400">
                  Historik
                </p>
                {settlementLoading && (
                  <p className="mt-2 text-[10px] font-bold text-gray-400">
                    Hämtar avräkningar...
                  </p>
                )}
                {!settlementLoading && settlementReadModel.events.length === 0 && (
                  <p className="mt-2 text-[10px] font-bold text-gray-400">
                    Inget registrerat på skattekontot än.
                  </p>
                )}
                {!settlementLoading && settlementReadModel.events.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {settlementReadModel.events.map(event => (
                      <div
                        key={event.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-gray-50 px-3 py-2"
                      >
                        <div>
                          <p className="text-[10px] font-black text-gray-700">
                            {fmtDate(event.event_date)}
                          </p>
                          <p className="text-[10px] font-bold text-gray-400">
                            {settlementEventText(event.event_kind)}
                          </p>
                        </div>
                        <p className="text-sm font-black text-gray-700 tabular-nums">
                          {fmt(event.amount)} kr
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

        {periodError && (
          <p className="mt-4 text-[10px] font-bold text-red-500">
            {periodError}
          </p>
        )}

        {!periodError && (lifecycleCanCloseSelectedPeriod || lifecycleCanDeclareSelectedPeriod) && !hasCurrentReport && !loading && (
          <p className="mt-4 text-[10px] font-bold text-gray-400">
            Beräkna aktuell momsrapport innan perioden kan stängas eller deklarationen kan bekräftas.
          </p>
        )}

        {!periodError && lifecycleCanDeclareSelectedPeriod && hasCurrentReport && !declarationSubmittedOnIsValid && (
          <p className="mt-4 text-[10px] font-bold text-red-500">
            {declarationSubmittedOnValidation}
          </p>
        )}

        {!periodError && !periodsLoading && vatPeriods.length === 0 && (
          <p className="mt-4 text-[10px] font-bold text-gray-400">
            {profile?.vat_status === 'not_registered'
              ? 'Företaget är markerat som inte momsregistrerat. Inga SoloLedger-momsperioder genereras.'
              : profile?.vat_status === 'unknown'
              ? 'Momsstatus är inte inställd. SoloLedger gissar inte momsperioder.'
              : 'Inga DB-verifierade momsperioder finns för valt år.'}
          </p>
        )}
      </div>

      {/* Results */}
      {currentVatReport && selectedPeriod && (
        <div className="space-y-4 animate-in fade-in duration-300">
          <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest px-1">
            {periodLabel(selectedPeriod)} / {statusLabel(selectedPeriod.status)} / {sourceLabel(selectedPeriod.source)}
          </p>

          <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-0.5">Ruta 05</p>
                <p className="text-xs font-black uppercase text-gray-600">{currentVatReport.domesticSalesRows[0].label}</p>
                <p className="text-[9px] text-gray-400 font-medium mt-1">
                  {currentVatReport.domesticSalesRows[0].description}
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-black text-gray-700 tabular-nums whitespace-nowrap">
                  {fmt(currentVatReport.domesticSalesBase)} kr
                </p>
                <p className="text-[9px] font-bold text-gray-300 uppercase mt-0.5">Exkl. moms</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-5 pt-4 border-t border-dashed border-gray-100">
              <div className="bg-gray-50 rounded-xl px-3 py-2">
                <p className="text-[8px] font-black uppercase text-gray-400">25 % underlag</p>
                <p className="text-sm font-black text-gray-600 tabular-nums">{fmt(currentVatReport.domesticSalesBase25)} kr</p>
              </div>
              <div className="bg-gray-50 rounded-xl px-3 py-2">
                <p className="text-[8px] font-black uppercase text-gray-400">12 % underlag</p>
                <p className="text-sm font-black text-gray-600 tabular-nums">{fmt(currentVatReport.domesticSalesBase12)} kr</p>
              </div>
              <div className="bg-gray-50 rounded-xl px-3 py-2">
                <p className="text-[8px] font-black uppercase text-gray-400">6 % underlag</p>
                <p className="text-sm font-black text-gray-600 tabular-nums">{fmt(currentVatReport.domesticSalesBase6)} kr</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-5 sm:p-7">
            <div className="mb-4">
              <p className="text-xs font-black uppercase text-gray-600">Utgående moms på svensk försäljning</p>
              <p className="text-[9px] text-gray-400 font-medium mt-1">
                Fördelad enligt momssats
              </p>
            </div>

            <div className="space-y-3">
              {currentVatReport.ordinaryOutputRows.map((row, index) => (
                <div
                  key={row.field}
                  className={`flex items-center justify-between gap-3 ${index === currentVatReport.ordinaryOutputRows.length - 1 ? '' : 'border-b border-gray-100 pb-3'}`}
                >
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Ruta {row.field}</p>
                    <p className="text-xs font-black uppercase text-gray-600">{row.label}</p>
                  </div>
                  <p className="text-xl font-black text-red-500 tabular-nums whitespace-nowrap">
                    {fmt(row.amount)} kr
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-5 sm:p-7">
            <div className="mb-4">
              <p className="text-xs font-black uppercase text-gray-600">Inköp från andra EU-länder</p>
              <p className="text-[9px] text-gray-400 font-medium mt-1">
                Inköp där du själv redovisar svensk moms
              </p>
            </div>
            <div className="space-y-3">
              {currentVatReport.euPurchaseRows.map((row, index) => (
                <div
                  key={row.field}
                  className={`flex items-center justify-between gap-3 ${index === currentVatReport.euPurchaseRows.length - 1 ? '' : 'border-b border-gray-100 pb-3'}`}
                >
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Ruta {row.field}</p>
                    <p className="text-xs font-black uppercase text-gray-600">{row.label}</p>
                  </div>
                  <p className={`text-xl font-black tabular-nums whitespace-nowrap ${row.field === '30' ? 'text-red-500' : 'text-gray-700'}`}>
                    {fmt(row.amount)} kr
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-0.5">Ruta 48</p>
                <p className="text-xs font-black uppercase text-gray-600">{currentVatReport.inputRows[0].label}</p>
                <p className="text-[9px] text-gray-400 font-medium mt-1">Samlad avdragsgill ingående moms</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-black text-emerald-600 tabular-nums whitespace-nowrap">
                  {fmt(currentVatReport.deductibleInputVat)} kr
                </p>
                <p className="text-[9px] font-bold text-gray-300 uppercase mt-0.5">Avdrag</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 px-2">
            <div className="flex-1 border-t border-dashed border-gray-200" />
            <p className="text-[9px] font-black uppercase text-gray-300 tracking-widest whitespace-nowrap">
              {fmt(currentVatReport.totalOutputVat)} - {fmt(currentVatReport.deductibleInputVat)}
            </p>
            <div className="flex-1 border-t border-dashed border-gray-200" />
          </div>

          <div className={`rounded-[2rem] border-2 shadow-sm p-5 sm:p-7 ${
            skaBetalas
              ? 'bg-red-50 border-red-200'
              : 'bg-emerald-50 border-emerald-200'
          }`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className={`text-[9px] font-black uppercase tracking-widest mb-0.5 ${skaBetalas ? 'text-red-400' : 'text-emerald-500'}`}>
                  Ruta 49 (netto)
                </p>
                <p className={`text-xs font-black uppercase ${skaBetalas ? 'text-red-700' : 'text-emerald-700'}`}>
                  {currentVatReport.netRows[0].label}
                </p>
                <p className={`text-[9px] font-medium mt-1 ${skaBetalas ? 'text-red-400' : 'text-emerald-500'}`}>
                  {skaBetalas
                    ? 'Ska betalas till Skatteverket'
                    : 'Återbetalas från Skatteverket'}
                </p>
              </div>
              <div className="text-right">
                <p className={`text-3xl font-black italic tabular-nums whitespace-nowrap ${skaBetalas ? 'text-red-500' : 'text-emerald-600'}`}>
                  {skaBetalas ? '' : '+'}{fmt(Math.abs(currentVatReport.netVat))} kr
                </p>
                <p className={`text-[10px] font-black uppercase mt-1 ${skaBetalas ? 'text-red-400' : 'text-emerald-500'}`}>
                  {skaBetalas ? 'Skuld' : 'Fordran'}
                </p>
              </div>
            </div>
          </div>

          <p className="text-[9px] text-gray-300 font-bold text-center px-4 pb-2">
            Beloppen är beräknade ur bokförda verifikationer, exklusive interna momsombokningar. Kontrollera alltid mot Skatteverkets e-tjänst innan inlämning.
          </p>
        </div>
      )}

      {hasCurrentReportError && (
        <div className="rounded-[2rem] border border-red-100 bg-red-50 p-5 sm:p-7 text-red-700">
          <p className="text-[9px] font-black uppercase tracking-widest text-red-400 mb-2">Momsrapport stoppad</p>
          <p className="text-sm font-black">
            {reportError}
          </p>
          <p className="text-[10px] font-bold text-red-400 mt-2">
            Inga rapportbelopp visas för den valda perioden förrän underlaget kan kontrolleras säkert.
          </p>
        </div>
      )}

      {/* Empty state */}
      {!currentVatReport && !hasCurrentReportError && !loading && (
        <div className="text-center py-16 text-gray-300">
          <p className="text-4xl mb-3">Moms</p>
          <p className="font-black uppercase text-xs tracking-widest">
            {periodsLoading
              ? 'Hämtar momsperioder'
              : selectedPeriod
              ? 'Välj period och klicka Beräkna'
              : 'Ingen momsperiod vald'}
          </p>
        </div>
      )}
    </div>
  )
}
````````

==================================================

==================================================
FILE: src/components/ProfileSettings.tsx
==================================================

````typescript
'use client'
import { useState, useEffect } from 'react' // 🌟 Importerat useEffect för synkning
import { supabase } from '@/lib/supabaseClient'
import type {
  DeductionEntitlement,
  DomesticSalesVatTreatment,
  ForeignPurchaseReporting,
} from '@/lib/vatDomain'

type PersistedDefaultDeductionEntitlement = Exclude<DeductionEntitlement, 'partial'>

interface Props {
  user: any
  profile: any
  onProfileUpdate: (updated: any) => void
  onUpdatePassword: (newPassword: string) => Promise<{ success: true } | { success: false; error: string }>
  onBookkeepingChanged?: () => Promise<void> | void
}

interface SieImportBatch {
  id: string
  filename: string
  fiscal_year: number | null
  status: string
  verification_count: number
  imported_count: number
  completed_at: string | null
  undone_at: string | null
}

export default function ProfileSettings({ user, profile, onProfileUpdate, onUpdatePassword, onBookkeepingChanged }: Props) {
  const [companyName, setCompanyName] = useState(profile?.company_name || '')
  const [orgNr, setOrgNr] = useState(profile?.org_nr || '')
  const [vatStatus, setVatStatus] = useState<'registered' | 'not_registered' | 'unknown'>(profile?.vat_status || 'unknown')
  const [vatPeriodType, setVatPeriodType] = useState<'month' | 'quarter' | 'year' | ''>(profile?.vat_period_type || '')
  const [vatManagementFrom, setVatManagementFrom] = useState(profile?.vat_management_from || '')
  const [domesticSalesVatTreatment, setDomesticSalesVatTreatment] = useState<DomesticSalesVatTreatment>(profile?.domestic_sales_vat_treatment || 'unknown')
  const [foreignPurchaseReporting, setForeignPurchaseReporting] = useState<ForeignPurchaseReporting>(profile?.foreign_purchase_reporting || 'unknown')
  const [defaultDeductionEntitlement, setDefaultDeductionEntitlement] = useState<PersistedDefaultDeductionEntitlement>(profile?.default_deduction_entitlement || 'unknown')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [portalLoading, setPortalLoading] = useState(false)
  const [sieImports, setSieImports] = useState<SieImportBatch[]>([])
  const [sieImportsLoading, setSieImportsLoading] = useState(true)
  const [sieImportsError, setSieImportsError] = useState<string | null>(null)
  const [undoingImportId, setUndoingImportId] = useState<string | null>(null)
  const [sieUndoNotice, setSieUndoNotice] = useState<{ type: 'error' | 'success'; text: string } | null>(null)

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordNotice, setPasswordNotice] = useState<{ type: 'error' | 'success'; text: string } | null>(null)

  const savedVatStatus = profile?.vat_status || 'unknown'
  const savedVatPeriodType = profile?.vat_period_type || ''
  const savedVatManagementFrom = profile?.vat_management_from || ''
  const savedDomesticSalesVatTreatment = profile?.domestic_sales_vat_treatment || 'unknown'
  const savedForeignPurchaseReporting = profile?.foreign_purchase_reporting || 'unknown'
  const savedDefaultDeductionEntitlement = profile?.default_deduction_entitlement || 'unknown'

  const hasChanges =
    companyName !== (profile?.company_name || '') ||
    orgNr !== (profile?.org_nr || '') ||
    domesticSalesVatTreatment !== savedDomesticSalesVatTreatment ||
    foreignPurchaseReporting !== savedForeignPurchaseReporting ||
    defaultDeductionEntitlement !== savedDefaultDeductionEntitlement ||
    vatStatus !== savedVatStatus ||
    (vatStatus === 'registered' && (
      vatPeriodType !== savedVatPeriodType ||
      vatManagementFrom !== savedVatManagementFrom
    ))

  // 🌟 Synka lokala states när profildatan har landat från Supabase
  useEffect(() => {
    if (profile?.company_name) setCompanyName(profile.company_name)
    if (profile?.org_nr) setOrgNr(profile.org_nr)
    setVatStatus(profile?.vat_status || 'unknown')
    setVatPeriodType(profile?.vat_period_type || '')
    setVatManagementFrom(profile?.vat_management_from || '')
    setDomesticSalesVatTreatment(profile?.domestic_sales_vat_treatment || 'unknown')
    setForeignPurchaseReporting(profile?.foreign_purchase_reporting || 'unknown')
    setDefaultDeductionEntitlement(profile?.default_deduction_entitlement || 'unknown')
  }, [profile])

  useEffect(() => {
    if (!user?.id) {
      setSieImports([])
      setSieImportsLoading(false)
      return
    }

    let cancelled = false

    async function loadSieImports() {
      setSieImportsLoading(true)
      setSieImportsError(null)

      const { data, error } = await supabase
        .from('import_batches')
        .select('id, filename, fiscal_year, status, verification_count, imported_count, completed_at, undone_at')
        .eq('user_id', user.id)
        .order('completed_at', { ascending: false, nullsFirst: false })

      if (cancelled) return

      if (error) {
        setSieImports([])
        setSieImportsError('Kunde inte ladda SIE-importhistoriken.')
      } else {
        setSieImports((data || []) as SieImportBatch[])
      }

      setSieImportsLoading(false)
    }

    loadSieImports()

    return () => {
      cancelled = true
    }
  }, [user?.id])


  async function handleUndoSieImport(item: SieImportBatch) {
    if (item.status !== 'completed') return

    const ok = window.confirm(
      `Ångra SIE-importen "${item.filename}"?\n\n` +
      `${item.imported_count ?? item.verification_count ?? 0} importerade verifikationer kommer att rättas automatiskt med KORRVER. ` +
      `Originalverifikationerna ligger kvar för spårbarhet.\n\n` +
      `Ångringen kan stoppas om räkenskapsåret är låst eller om någon importerad verifikation redan har korrigerats.`
    )

    if (!ok) return

    setUndoingImportId(item.id)
    setSieUndoNotice(null)

    try {
      const { data, error } = await supabase.rpc('undo_sie_import_atomic', {
        p_import_batch_id: item.id,
      })

      if (error) throw error
      if (!data?.success) throw new Error('Ångringen misslyckades av okänd anledning.')

      setSieImports((current) =>
        current.map((batch) =>
          batch.id === item.id
            ? { ...batch, status: 'undone', undone_at: data.undone_at ?? new Date().toISOString() }
            : batch
        )
      )

      // Uppdatera även bokföringsdata/NE/dashboard direkt så användaren
      // slipper göra en hard refresh efter en lyckad SIE-ångring.
      await onBookkeepingChanged?.()

      setSieUndoNotice({
        type: 'success',
        text: `✓ Importen "${item.filename}" är ångrad. ${data.correction_count ?? 0} rättelseverifikationer skapades automatiskt.`,
      })
    } catch (err: any) {
      setSieUndoNotice({
        type: 'error',
        text: err?.message || 'Kunde inte ångra SIE-importen.',
      })
    } finally {
      setUndoingImportId(null)
    }
  }

  async function handleSave(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!user?.id) return
    if (vatStatus === 'registered' && (!vatPeriodType || !vatManagementFrom)) {
      alert('Välj hur ofta företaget redovisar moms och från vilket datum SoloLedger ska hantera momsen.')
      return
    }
    if (vatStatus !== 'registered' && foreignPurchaseReporting === 'required') {
      alert('Utländska inköp kan bara markeras som deklarationspliktiga när företaget är momsregistrerat.')
      return
    }

    setSaving(true)
    setSaved(false)

    const vatSettings = vatStatus === 'registered'
      ? {
          vat_status: vatStatus,
          vat_period_type: vatPeriodType,
          vat_management_from: vatManagementFrom,
        }
      : {
          vat_status: vatStatus,
          vat_period_type: null,
          vat_management_from: null,
        }

    const vatV2ProfileSettings = {
      domestic_sales_vat_treatment: domesticSalesVatTreatment,
      foreign_purchase_reporting: foreignPurchaseReporting,
      default_deduction_entitlement: defaultDeductionEntitlement,
    }

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ company_name: companyName, org_nr: orgNr, ...vatSettings, ...vatV2ProfileSettings })
        .eq('id', user.id)

      if (error) throw error

      onProfileUpdate({ ...profile, company_name: companyName, org_nr: orgNr, ...vatSettings, ...vatV2ProfileSettings })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err: any) {
      alert('Kunde inte spara: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault()
    setPasswordNotice(null)

    if (newPassword.length < 6) {
      setPasswordNotice({ type: 'error', text: 'Lösenordet måste vara minst 6 tecken.' })
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordNotice({ type: 'error', text: 'Lösenorden matchar inte.' })
      return
    }

    setPasswordSaving(true)
    try {
      const result = await onUpdatePassword(newPassword)
      if (result.success) {
        setPasswordNotice({ type: 'success', text: '✓ Lösenordet är uppdaterat.' })
        setNewPassword('')
        setConfirmPassword('')
      } else {
        setPasswordNotice({ type: 'error', text: result.error })
      }
    } finally {
      setPasswordSaving(false)
    }
  }

  async function handlePortal() {
    setPortalLoading(true)
    try {
      // Skickar inte längre userId i body - servern hämtar och verifierar
      // identiteten själv ur access-token (se /api/portal).
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        alert('Din session har gått ut. Ladda om sidan och försök igen.')
        setPortalLoading(false)
        return
      }

      const res = await fetch('/api/portal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        alert('Kunde inte öppna kundportalen: ' + (data.error || 'Okänt fel'))
      }
    } catch (err: any) {
      alert('Fel: ' + err.message)
    } finally {
      setPortalLoading(false)
    }
  }

  const subscriptionKey = (profile?.subscription_type || 'free') as 'free' | 'trial' | 'paid' | 'admin'

  const subscriptionLabel = {
    free: 'Gratisplan',
    trial: 'Testperiod (14 dagar)',
    paid: 'Premium',
    admin: 'Administratör'
  }[subscriptionKey] ?? 'Gratisplan'

  const subscriptionColor = {
    free: 'text-gray-500 bg-gray-50 border-gray-200',
    trial: 'text-amber-700 bg-amber-50 border-amber-200',
    paid: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    admin: 'text-purple-700 bg-purple-50 border-purple-200'
  }[subscriptionKey] ?? 'text-gray-500 bg-gray-50 border-gray-200'

  return (
    <div className="max-w-7xl mx-auto space-y-6">

      {/* Kontoinformation */}
      <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-5 sm:p-8">
        <h2 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-6">Kontoinformation</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">E-postadress</label>
            <p className="text-sm font-bold text-gray-700 bg-gray-50 rounded-xl px-4 py-3">{user?.email || 'Ingen e-post'}</p>
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">Prenumerationsplan</label>
            <span className={`inline-block text-xs font-black uppercase tracking-wider px-3 py-1.5 rounded-full border ${subscriptionColor}`}>
              {subscriptionLabel}
            </span>
            {profile?.subscription_end && (
              <p className="text-[10px] text-gray-400 font-bold mt-1">
                {profile.subscription_type === 'trial' ? 'Testperiod slutar' : 'Förnyas'}: {new Date(profile.subscription_end).toLocaleDateString('sv-SE')}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Företagsinformation */}
      <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-5 sm:p-8">
        <h2 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-6">Företagsinformation</h2>
        <p className="text-[10px] text-gray-400 font-bold mb-6">Används i SIE-exporten och på rapporter.</p>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">Företagsnamn</label>
            <input
              type="text"
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
              placeholder="Din Firma AB"
              className="w-full bg-gray-50 rounded-xl px-4 py-3 text-sm font-medium outline-none border border-transparent focus:border-emerald-300 transition-colors"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">Organisationsnummer</label>
            <input
              type="text"
              value={orgNr}
              onChange={e => setOrgNr(e.target.value)}
              placeholder="556000-0000"
              className="w-full bg-gray-50 rounded-xl px-4 py-3 text-sm font-medium outline-none border border-transparent focus:border-emerald-300 transition-colors"
            />
          </div>

          <div className="border-t border-gray-100 pt-5 mt-5 space-y-4">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">Momsregistrering</label>
              <p className="text-[10px] text-gray-400 font-bold mb-3">Välj det som gäller för företaget hos Skatteverket.</p>
              <select
                value={vatStatus}
                onChange={e => {
                  const value = e.target.value as 'registered' | 'not_registered' | 'unknown'
                  setVatStatus(value)
                  if (value !== 'registered') {
                    setVatPeriodType('')
                    setVatManagementFrom('')
                    if (foreignPurchaseReporting === 'required') {
                      setForeignPurchaseReporting('unknown')
                    }
                  }
                }}
                className="w-full bg-gray-50 rounded-xl px-4 py-3 text-sm font-medium outline-none border border-transparent focus:border-emerald-300 transition-colors"
              >
                <option value="unknown">Inte angivet ännu</option>
                <option value="registered">Ja, företaget är momsregistrerat</option>
                <option value="not_registered">Nej, företaget är inte momsregistrerat</option>
              </select>
            </div>

            {vatStatus === 'registered' && (
              <>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">Hur ofta redovisar företaget moms?</label>
                  <p className="text-[10px] text-gray-400 font-bold mb-3">Välj den redovisningsperiod som företaget är registrerat för hos Skatteverket.</p>
                  <select
                    value={vatPeriodType}
                    onChange={e => setVatPeriodType(e.target.value as 'month' | 'quarter' | 'year' | '')}
                    className="w-full bg-gray-50 rounded-xl px-4 py-3 text-sm font-medium outline-none border border-transparent focus:border-emerald-300 transition-colors"
                  >
                    <option value="">Välj redovisningsperiod</option>
                    <option value="month">Varje månad</option>
                    <option value="quarter">Varje kvartal</option>
                    <option value="year">En gång per år</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">SoloLedger hanterar momsperioder från</label>
                  <p className="text-[10px] text-gray-400 font-bold mb-3">Från detta datum får SoloLedger skapa och guida nya momsperioder. Importerad historik ändras inte.</p>
                  <input
                    type="date"
                    value={vatManagementFrom}
                    onChange={e => setVatManagementFrom(e.target.value)}
                    className="w-full bg-gray-50 rounded-xl px-4 py-3 text-sm font-medium outline-none border border-transparent focus:border-emerald-300 transition-colors"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">Inhemsk försäljning och moms</label>
              <p className="text-[10px] text-gray-400 font-bold mb-3">Välj hur företagets svenska försäljning normalt ska bedömas. Detta är en företagsfaktauppgift och bokar inga transaktioner.</p>
              <select
                value={domesticSalesVatTreatment}
                onChange={e => setDomesticSalesVatTreatment(e.target.value as DomesticSalesVatTreatment)}
                className="w-full bg-gray-50 rounded-xl px-4 py-3 text-sm font-medium outline-none border border-transparent focus:border-emerald-300 transition-colors"
              >
                <option value="unknown">Inte angivet ännu</option>
                <option value="taxable">Vanlig momspliktig försäljning</option>
                <option value="small_business_exempt">Momsbefriad enligt småföretagarregeln</option>
                <option value="exempt_other">Annan momsbefriad försäljning</option>
                <option value="mixed">Blandad försäljning</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">Utländska inköp i momsdeklarationen</label>
              <p className="text-[10px] text-gray-400 font-bold mb-3">Ange bara om företaget enligt Skatteverket ska redovisa stödda utländska inköp, till exempel EU-tjänster med omvänd beskattning.</p>
              <select
                value={foreignPurchaseReporting}
                onChange={e => setForeignPurchaseReporting(e.target.value as ForeignPurchaseReporting)}
                className="w-full bg-gray-50 rounded-xl px-4 py-3 text-sm font-medium outline-none border border-transparent focus:border-emerald-300 transition-colors"
              >
                <option value="unknown">Inte angivet ännu</option>
                <option value="required" disabled={vatStatus !== 'registered'}>Ja, ska redovisas</option>
                <option value="not_required">Nej, ska inte redovisas</option>
              </select>
              {vatStatus !== 'registered' && (
                <p className="mt-2 text-[9px] font-bold text-gray-400">
                  Deklarationspliktiga utländska inköp kräver att momsregistrering är angiven.
                </p>
              )}
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">Normal avdragsrätt för ingående moms</label>
              <p className="text-[10px] text-gray-400 font-bold mb-3">Detta är bara en standardfaktauppgift för kommande momsflöden. Välj inte full avdragsrätt om inköpen normalt saknar avdragsrätt.</p>
              <select
                value={defaultDeductionEntitlement}
                onChange={e => setDefaultDeductionEntitlement(e.target.value as PersistedDefaultDeductionEntitlement)}
                className="w-full bg-gray-50 rounded-xl px-4 py-3 text-sm font-medium outline-none border border-transparent focus:border-emerald-300 transition-colors"
              >
                <option value="unknown">Inte angivet ännu</option>
                <option value="full">Full avdragsrätt</option>
                <option value="none">Ingen avdragsrätt</option>
              </select>
            </div>

            {vatStatus === 'not_registered' && (
              <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
                <p className="text-[11px] font-bold text-blue-700">Företaget är markerat som inte momsregistrerat. I nästa steg kopplar vi denna inställning till bokföringen så att nya vanliga bokningar inte skapar moms.</p>
              </div>
            )}

            {vatStatus === 'unknown' && (
              <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
                <p className="text-[11px] font-bold text-amber-700">SoloLedger vet ännu inte företagets momsstatus. Bokföringen ändras inte av denna inställning förrän momsflödet kopplas in i nästa steg.</p>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={saving || !hasChanges}
            className={`w-full rounded-xl py-3 text-xs font-black uppercase tracking-widest transition-all shadow-sm disabled:cursor-not-allowed ${
              hasChanges
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50'
                : 'bg-gray-100 text-gray-400 shadow-none'
            }`}
          >
            {saving
              ? 'Sparar...'
              : saved
                ? '✓ Sparat!'
                : hasChanges
                  ? 'Spara ändringar'
                  : 'Inga ändringar att spara'}
          </button>
        </form>
      </div>

      {/* SIE-importhistorik */}
      <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-5 sm:p-8">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xs font-black uppercase tracking-widest text-gray-400">SIE-importer</h2>
            <p className="text-[10px] text-gray-400 font-bold mt-1">Historik över SIE-filer som importerats till ditt konto.</p>
          </div>
          {!sieImportsLoading && sieImports.length > 0 && (
            <span className="shrink-0 text-[10px] font-black text-gray-500 bg-gray-100 rounded-full px-2.5 py-1">
              {sieImports.length} {sieImports.length === 1 ? 'import' : 'importer'}
            </span>
          )}
        </div>

        {sieUndoNotice && (
          <div className={`mb-4 rounded-xl px-4 py-3 text-[11px] font-bold ${
            sieUndoNotice.type === 'error'
              ? 'bg-red-50 text-red-600 border border-red-200'
              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          }`}>
            {sieUndoNotice.text}
          </div>
        )}

        {sieImportsLoading ? (
          <p className="text-[11px] text-gray-400 font-bold">Laddar importhistorik...</p>
        ) : sieImportsError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[11px] font-bold text-red-600">
            {sieImportsError}
          </div>
        ) : sieImports.length === 0 ? (
          <div className="rounded-xl bg-gray-50 px-4 py-4">
            <p className="text-[11px] font-bold text-gray-500">Inga SIE-filer har importerats ännu.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sieImports.map((item) => (
              <div key={item.id} className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-gray-700 truncate" title={item.filename}>
                      {item.filename || 'SIE-fil'}
                    </p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-[10px] font-bold text-gray-400">
                      <span>Räkenskapsår: {item.fiscal_year ?? '—'}</span>
                      <span>{item.imported_count ?? item.verification_count ?? 0} verifikationer</span>
                      {item.completed_at && (
                        <span>Importerad {new Date(item.completed_at).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })}</span>
                      )}
                      {item.status === 'undone' && item.undone_at && (
                        <span>Ångrad {new Date(item.undone_at).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })}</span>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2 self-start sm:self-auto">
                    <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border ${
                      item.status === 'completed'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : item.status === 'undone'
                          ? 'bg-gray-100 text-gray-600 border-gray-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                      {item.status === 'completed' ? 'Importerad' : item.status === 'undone' ? 'Ångrad' : item.status}
                    </span>

                    {item.status === 'completed' && (
                      <button
                        type="button"
                        onClick={() => handleUndoSieImport(item)}
                        disabled={undoingImportId !== null}
                        className="text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {undoingImportId === item.id ? 'Ångrar...' : 'Ångra import'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-[10px] text-gray-400 font-bold mt-4">
          En ångrad import ligger kvar i historiken. SoloLedger skapar automatiska rättelseverifikationer i stället för att radera bokföring.
        </p>
      </div>

      {/* Byt lösenord */}
      <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-5 sm:p-8">
        <h2 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-6">Byt lösenord</h2>

        {passwordNotice && (
          <div className={`mb-4 rounded-xl px-4 py-3 text-[11px] font-bold ${
            passwordNotice.type === 'error'
              ? 'bg-red-50 text-red-600 border border-red-200'
              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          }`}>
            {passwordNotice.text}
          </div>
        )}

        <form onSubmit={handleUpdatePassword} className="space-y-4">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">Nytt lösenord</label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="Minst 6 tecken"
              className="w-full bg-gray-50 rounded-xl px-4 py-3 text-sm font-medium outline-none border border-transparent focus:border-emerald-300 transition-colors"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">Bekräfta nytt lösenord</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Upprepa lösenordet"
              className="w-full bg-gray-50 rounded-xl px-4 py-3 text-sm font-medium outline-none border border-transparent focus:border-emerald-300 transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={passwordSaving || !newPassword || !confirmPassword}
            className="w-full bg-gray-800 hover:bg-gray-900 text-white rounded-xl py-3 text-xs font-black uppercase tracking-widest transition-all shadow-sm disabled:opacity-50"
          >
            {passwordSaving ? 'Uppdaterar...' : 'Byt lösenord'}
          </button>
        </form>
      </div>

      {/* Prenumerationshantering */}
      {(profile?.subscription_type === 'trial' || profile?.subscription_type === 'paid') && (
        <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-5 sm:p-8">
          <h2 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Hantera prenumeration</h2>
          <p className="text-[10px] text-gray-400 font-bold mb-6">Avsluta, byt betalmetod eller se fakturahistorik via Stripes säkra kundportal.</p>

          <button
            onClick={handlePortal}
            disabled={portalLoading}
            className="w-full sm:w-auto bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl px-6 py-3 text-xs font-black uppercase tracking-widest transition-all disabled:opacity-50"
          >
            {portalLoading ? 'Öppnar...' : 'Hantera prenumeration →'}
          </button>
        </div>
      )}

    </div>
  )
}
````````

==================================================

==================================================
FILE: src/components/SieImportModal.tsx
==================================================

````typescript
'use client'
import { useState, useRef, useCallback } from 'react'
import { decodeSieBuffer, parseSieFile } from '@/lib/sieParser'
import type { SieParseResult } from '@/lib/sieParser'
import { importSieBatch, SieImportError } from '@/lib/sieImport'
import type { ImportSieBatchResult } from '@/lib/sieImport'
import { canCreateTransactions, getFreeTransactionUsage } from '@/lib/subscriptionLimits'

interface SieImportModalProps {
  isOpen: boolean
  onClose: () => void
  refreshData: () => void | Promise<void>
  userId: string
  profile: {
    subscription_type: string
    subscription_end: string | null
  } | null
  onLimitReached: () => void
  onUsageChanged: () => void | Promise<void>
}

type Step = 'select' | 'parsing' | 'preview' | 'importing' | 'done'

export default function SieImportModal({
  isOpen,
  onClose,
  refreshData,
  userId,
  profile,
  onLimitReached,
  onUsageChanged
}: SieImportModalProps) {
  
  const [step, setStep] = useState<Step>('select')
  const [isDragging, setIsDragging] = useState(false)
  const [filename, setFilename] = useState<string>('')
  const [encoding, setEncoding] = useState<string>('')
  const [decodeWarnings, setDecodeWarnings] = useState<string[]>([])
  const [parseResult, setParseResult] = useState<SieParseResult | null>(null)
  const [importResult, setImportResult] = useState<ImportSieBatchResult | null>(null)
  const [importErrorMessage, setImportErrorMessage] = useState<string | null>(null)
  const [importErrorIsInfo, setImportErrorIsInfo] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setStep('select')
    setFilename('')
    setEncoding('')
    setDecodeWarnings([])
    setParseResult(null)
    setImportResult(null)
    setImportErrorMessage(null)
    setImportErrorIsInfo(false)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleFile = useCallback(async (file: File) => {
    setFilename(file.name)
    setStep('parsing')
    try {
      const buffer = await file.arrayBuffer()
      const decoded = decodeSieBuffer(buffer)
      const result = parseSieFile(decoded.content)
      setEncoding(decoded.encoding)
      setDecodeWarnings(decoded.warnings)
      setParseResult(result)
      setStep('preview')
    } catch (err) {
      setImportErrorMessage(
        'Filen kunde inte läsas: ' + (err instanceof Error ? err.message : 'okänt fel.')
      )
      setImportErrorIsInfo(false)
      setStep('done')
    }
  }, [])

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  const handleImport = async () => {
    if (!parseResult) return
    setStep('importing')
    setImportErrorMessage(null)
    setImportErrorIsInfo(false)

    try {
      // Gratisgränsen gäller totalt över alla år.
      // Varje #VER i SIE-filen räknas som en riktig verifikation.
      // #IB räknas inte, eftersom den skapas separat som teknisk ingående balans.
      const currentUsage = await getFreeTransactionUsage(userId)
      const allowed = canCreateTransactions(
        profile ?? { subscription_type: 'free', subscription_end: null },
        currentUsage,
        parseResult.verificationCount
      )

      if (!allowed) {
        reset()
        onLimitReached()
        return
      }

      const result = await importSieBatch(parseResult, filename)
      setImportResult(result)
      await refreshData()
      await onUsageChanged()
      setStep('done')
    } catch (err) {
      if (err instanceof SieImportError) {
        setImportErrorMessage(err.message)
        setImportErrorIsInfo(err.code === 'ALREADY_IMPORTED')
      } else {
        setImportErrorMessage(
          'Importen misslyckades: ' + (err instanceof Error ? err.message : 'okänt fel.')
        )
        setImportErrorIsInfo(false)
      }
      setStep('preview')
    }
  }

  const hasBlockingErrors = (parseResult?.errors.length ?? 0) > 0

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[85vh] overflow-y-auto bg-white rounded-t-[2rem] sm:rounded-[2rem] shadow-xl border border-gray-100">

        {/* ── HEADER ── */}
        <div className="sticky top-0 bg-white/95 backdrop-blur-sm border-b border-gray-100 p-6 sm:p-8 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wide text-sky-500">SIE-import</p>
            <h2 className="text-xl font-black text-gray-800">Importera bokföring</h2>
          </div>
          <button
            onClick={handleClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-gray-300 hover:text-gray-600 hover:bg-gray-50 transition-colors text-lg font-bold"
            aria-label="Stäng"
          >
            ✕
          </button>
        </div>

        <div className="p-6 sm:p-8">

          {/* ── STEG 1: VÄLJ FIL ── */}
          {step === 'select' && (
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`rounded-2xl border-2 border-dashed p-10 sm:p-14 text-center cursor-pointer transition-colors ${
                isDragging
                  ? 'border-sky-400 bg-sky-50'
                  : 'border-gray-200 hover:border-sky-300 hover:bg-gray-50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".se,.sie"
                onChange={handleFileInputChange}
                className="hidden"
              />
              <p className="text-3xl mb-3">📄</p>
              <p className="font-bold text-gray-700 mb-1">
                Släpp din SIE-fil här, eller klicka för att välja
              </p>
              <p className="text-sm text-gray-400">
                Stöder .se och .sie-filer (SIE Typ 4)
              </p>
            </div>
          )}

          {/* ── PARSAR ── */}
          {step === 'parsing' && (
            <div className="py-16 text-center">
              <div className="w-8 h-8 mx-auto mb-4 border-[3px] border-sky-200 border-t-sky-500 rounded-full animate-spin" />
              <p className="font-bold text-gray-500">Läser {filename}...</p>
            </div>
          )}

          {/* ── STEG 2: FÖRHANDSGRANSKNING ── */}
          {step === 'preview' && parseResult && (
            <div className="space-y-6">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wide text-gray-400 mb-1">Fil</p>
                <p className="font-bold text-gray-700">{filename}</p>
              </div>

              {/* Statgrid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <StatCard label="Företag" value={parseResult.companyName ?? '–'} />
                <StatCard label="Org.nr" value={parseResult.orgNr ?? '–'} />
                <StatCard label="Räkenskapsår" value={parseResult.year ? String(parseResult.year) : '–'} />
                <StatCard label="Verifikationer" value={String(parseResult.verificationCount)} />
                <StatCard label="Konton" value={String(parseResult.accountCount)} />
                <StatCard label="Kodning" value={encoding.toUpperCase()} />
              </div>

              {/* Fel (blockerande) */}
              {parseResult.errors.length > 0 && (
                <MessageList
                  tone="error"
                  title={`${parseResult.errors.length} fel hittades – importen är blockerad`}
                  items={parseResult.errors}
                />
              )}

              {/* Varningar (icke-blockerande) */}
              {(parseResult.warnings.length > 0 || decodeWarnings.length > 0) && (
                <MessageList
                  tone="warning"
                  title={`${parseResult.warnings.length + decodeWarnings.length} varningar`}
                  items={[...decodeWarnings, ...parseResult.warnings]}
                />
              )}

              {parseResult.errors.length === 0 && parseResult.warnings.length === 0 && (
                <p className="text-sm text-emerald-600 font-bold">
                  ✓ Filen ser bra ut — inga fel eller varningar.
                </p>
              )}

              {/* Info/redan-importerad-meddelande om ett tidigare försök stötte på det */}
              {importErrorMessage && (
                <MessageList
                  tone={importErrorIsInfo ? 'info' : 'error'}
                  title={importErrorIsInfo ? 'Redan importerad' : 'Importen misslyckades'}
                  items={[importErrorMessage]}
                />
              )}

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  onClick={reset}
                  className="flex-1 h-12 rounded-2xl bg-gray-50 hover:bg-gray-100 text-gray-500 font-black text-sm transition-colors"
                >
                  Välj annan fil
                </button>
                <button
                  onClick={handleImport}
                  disabled={hasBlockingErrors}
                  title={hasBlockingErrors ? 'Åtgärda felen i källfilen och försök igen' : undefined}
                  className={`flex-1 h-12 rounded-2xl font-black text-sm transition-colors ${
                    hasBlockingErrors
                      ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                      : 'bg-sky-500 hover:bg-sky-600 text-white'
                  }`}
                >
                  Importera {parseResult.verificationCount} verifikationer
                </button>
              </div>
            </div>
          )}

          {/* ── STEG 3: IMPORTERAR ── */}
          {step === 'importing' && (
            <div className="py-16 text-center">
              <div className="w-8 h-8 mx-auto mb-4 border-[3px] border-sky-200 border-t-sky-500 rounded-full animate-spin" />
              <p className="font-bold text-gray-500">Importerar bokföring...</p>
              <p className="text-xs text-gray-400 mt-1">Detta kan ta en liten stund för stora filer.</p>
            </div>
          )}

          {/* ── RESULTAT ── */}
          {step === 'done' && (
            <div className="space-y-6">
              {importResult ? (
                <>
                  <div className="text-center py-4">
                    <p className="text-3xl mb-2">✓</p>
                    <p className="font-black text-lg text-gray-800">Importen lyckades</p>
                    <p className="text-sm text-gray-400 mt-1">
                      {importResult.importedCount} av {importResult.verificationCount} verifikationer importerade
                    </p>
                  </div>
                  <button
                    onClick={handleClose}
                    className="w-full h-12 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-sm transition-colors"
                  >
                    Stäng
                  </button>
                </>
              ) : (
                <>
                  <MessageList
                    tone="error"
                    title="Filen kunde inte importeras"
                    items={[importErrorMessage ?? 'Ett okänt fel uppstod.']}
                  />
                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={reset}
                      className="flex-1 h-12 rounded-2xl bg-gray-50 hover:bg-gray-100 text-gray-500 font-black text-sm transition-colors"
                    >
                      Försök igen
                    </button>
                    <button
                      onClick={handleClose}
                      className="flex-1 h-12 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-500 font-black text-sm transition-colors"
                    >
                      Stäng
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

// ── Delkomponenter ──────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
      <p className="text-[9px] font-black uppercase tracking-wide text-gray-400 mb-0.5">{label}</p>
      <p className="font-bold text-gray-700 text-sm truncate">{value}</p>
    </div>
  )
}

function MessageList({
  tone,
  title,
  items,
}: {
  tone: 'error' | 'warning' | 'info'
  title: string
  items: string[]
}) {
  const styles = {
    error: 'bg-red-50 border-red-100 text-red-500',
    warning: 'bg-amber-50 border-amber-100 text-amber-600',
    info: 'bg-sky-50 border-sky-100 text-sky-600',
  }[tone]

  return (
    <div className={`rounded-2xl border p-4 ${styles}`}>
      <p className="text-[10px] font-black uppercase tracking-wide mb-2">{title}</p>
      <ul className="space-y-1 max-h-40 overflow-y-auto text-xs font-medium pr-1">
        {items.map((item, i) => (
          <li key={i} className="leading-snug">• {item}</li>
        ))}
      </ul>
    </div>
  )
}
````````

==================================================

==================================================
FILE: src/components/TransactionForm.tsx
==================================================

````typescript
'use client'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import FavoriteChips, { Favorite } from './FavoriteChips'
import type { CompanyVatProfileAdapterResult } from '@/lib/vatProfileAdapter'
import type {
  VatCalculationRateInput,
  VatGoodsOrService,
  VatYesNoUnknown,
} from '@/lib/vatDomain'
import {
  buildVatV2TransactionPreflight,
  describeVatV2PreflightError,
  VAT_V2_SUPPLIER_COUNTRIES,
  type VatV2SupplierCountryInput,
  type VatV2TransactionFacts,
} from '@/lib/vatTransactionPreflight'
import {
  getConfiguredPaymentAccountRoles,
  setConfiguredPaymentAccountRole,
  type ConfiguredPaymentAccountRole,
  type PaymentAccountRole,
} from '@/lib/paymentAccountRoles'
import {
  buildVatV2BookingReadiness,
  getVatV2PaymentSourceOption,
  resolveVatV2PaymentSourceConfiguration,
  VAT_V2_PAYMENT_SOURCE_CHOICES,
  type VatV2PaymentSourceChoice,
} from '@/lib/vatPaymentSource'
import {
  buildVatV2RuntimeBookingRequest,
  createVatV2RuntimeSubmitGuard,
  describeVatV2RuntimeBookingError,
  shouldRequireOrdinaryV1AmountForVatV2Form,
  shouldShowOrdinaryV1FieldsForVatV2Form,
  type VatV2RuntimeBookingRequest,
} from '@/lib/vatRuntimeBooking'

export interface FormData {
  date: string
  description: string
  amount: string
  type: string
  vatRate: number
  file: File | null
}

interface KontoplanOption {
  id: string
  name: string
  default_vat_rate?: number | string | null
  credit_account?: string | null
}

interface TransactionFormProps {
  formData: FormData
  setFormData: (data: FormData) => void
  kontoplan: KontoplanOption[]
  isYearLocked: boolean
  editingId: string | null
  editingBooked: boolean
  uploading: boolean
  periodisera: boolean
  setPeriodisera: (val: boolean) => void
  periodMonth: string
  setPeriodMonth: (val: string) => void
  onSubmit: (e: FormEvent<HTMLFormElement>) => void
  onVatV2Submit: (
    request: VatV2RuntimeBookingRequest,
    file: File | null
  ) => Promise<void>
  onCancelEdit: () => void
  userId: string
  vatStatus: 'registered' | 'not_registered' | 'unknown'
  companyVatProfileResult: CompanyVatProfileAdapterResult
  lastSubmitted: { type: string; amount: string; vatRate: number } | null
  onSaveFavorite: (name: string) => Promise<void>
  onDismissFavorite: () => void
}

const initialVatV2Facts: VatV2TransactionFacts = {
  enabled: false,
  supplierCountry: 'unknown',
  goodsOrService: 'unknown',
  supplierVatCharged: 'unknown',
  calculationRate: 'unknown',
  acquisitionBaseAmount: '',
}

const VAT_V2_ACCOUNTING_CATEGORY_ID = 'vat_v2_eu_service_purchase'

export default function TransactionForm({
  formData,
  setFormData,
  kontoplan,
  isYearLocked,
  editingId,
  editingBooked,
  uploading,
  periodisera,
  setPeriodisera,
  periodMonth,
  setPeriodMonth,
  onSubmit,
  onVatV2Submit,
  onCancelEdit,
  userId,
  vatStatus,
  companyVatProfileResult,
  lastSubmitted,
  onSaveFavorite,
  onDismissFavorite,
}: TransactionFormProps) {
  const [favName, setFavName] = useState('')
  const [showFavInput, setShowFavInput] = useState(false)
  const [descriptionHighlight, setDescriptionHighlight] = useState(false)
  const [favRefreshKey, setFavRefreshKey] = useState(0)
  const [vatV2Facts, setVatV2Facts] =
    useState<VatV2TransactionFacts>(initialVatV2Facts)
  const [vatV2PaymentSourceChoice, setVatV2PaymentSourceChoice] =
    useState<VatV2PaymentSourceChoice>('business_account')
  const [configuredPaymentRoles, setConfiguredPaymentRoles] =
    useState<ConfiguredPaymentAccountRole[]>([])
  const [paymentRolesLoading, setPaymentRolesLoading] = useState(false)
  const [paymentRolesLoaded, setPaymentRolesLoaded] = useState(false)
  const [paymentRolesLoadedForUser, setPaymentRolesLoadedForUser] =
    useState<string | null>(null)
  const [paymentRolesError, setPaymentRolesError] = useState<string | null>(null)
  const [savingPaymentRole, setSavingPaymentRole] = useState(false)
  const [paymentRoleSaveError, setPaymentRoleSaveError] =
    useState<{ role: PaymentAccountRole; message: string } | null>(null)
  const [vatV2SubmitError, setVatV2SubmitError] = useState<string | null>(null)
  const paymentRoleRequestId = useRef(0)
  const paymentRoleSaveRequestId = useRef(0)
  const paymentRoleSaveInFlight = useRef(false)
  const vatV2SubmitGuard = useRef<ReturnType<
    typeof createVatV2RuntimeSubmitGuard
  > | null>(null)
  const componentMounted = useRef(true)
  const activeUserId = useRef(userId)
  const isNotVatRegistered = vatStatus === 'not_registered'
  const showVatV2Assessment = !editingId && !editingBooked
  const vatV2AssessmentEnabled =
    showVatV2Assessment && vatV2Facts.enabled
  const showOrdinaryV1Fields = shouldShowOrdinaryV1FieldsForVatV2Form({
    assessmentActive: vatV2AssessmentEnabled,
  })
  const ordinaryV1AmountRequired = shouldRequireOrdinaryV1AmountForVatV2Form({
    assessmentActive: vatV2AssessmentEnabled,
  })
  const vatV2Preflight = buildVatV2TransactionPreflight({
    companyProfile: companyVatProfileResult.profile,
    transaction: {
      ...vatV2Facts,
      enabled: vatV2AssessmentEnabled,
    },
    date: formData.date,
    description: formData.description,
    accountingCategoryId: vatV2AssessmentEnabled
      ? VAT_V2_ACCOUNTING_CATEGORY_ID
      : formData.type,
    ordinaryAmount: formData.amount,
  })
  const vatV2PaymentSource = resolveVatV2PaymentSourceConfiguration(
    vatV2PaymentSourceChoice,
    configuredPaymentRoles
  )
  const paymentRolesLoadedForCurrentUser =
    paymentRolesLoaded && paymentRolesLoadedForUser === userId
  const vatV2PaymentRoleConfigurationState =
    !vatV2AssessmentEnabled
      ? 'inactive'
      : paymentRolesError
      ? 'error'
      : paymentRolesLoading || !paymentRolesLoadedForCurrentUser
      ? 'loading'
      : 'loaded'
  const vatV2BookingReadiness = buildVatV2BookingReadiness({
    treatmentReady: vatV2Preflight.status === 'ready',
    roleConfigurationState: vatV2PaymentRoleConfigurationState,
    paymentSource: vatV2PaymentSource,
  })
  const vatV2RuntimeBooking = buildVatV2RuntimeBookingRequest({
    assessmentActive: vatV2AssessmentEnabled,
    transactionEvent: 'purchase',
    preflight: vatV2Preflight,
    bookingReadiness: vatV2BookingReadiness,
    date: formData.date,
    description: formData.description,
  })
  const selectedVatV2PaymentSourceOption =
    getVatV2PaymentSourceOption(vatV2PaymentSourceChoice)
  const currentPaymentRoleSaveError =
    paymentRoleSaveError?.role === vatV2PaymentSource.role
      ? paymentRoleSaveError.message
      : null

  useEffect(() => {
    activeUserId.current = userId
  }, [userId])

  useEffect(() => {
    return () => {
      componentMounted.current = false
      paymentRoleRequestId.current += 1
      paymentRoleSaveRequestId.current += 1
      paymentRoleSaveInFlight.current = false
    }
  }, [])

  function updateVatV2Facts(update: Partial<VatV2TransactionFacts>) {
    setVatV2SubmitError(null)
    setVatV2Facts(prev => ({
      ...prev,
      ...update,
    }))
  }

  async function loadPaymentRoleConfiguration() {
    const requestId = paymentRoleRequestId.current + 1
    const requestedUserId = userId
    paymentRoleRequestId.current = requestId
    setPaymentRolesLoading(true)
    setPaymentRolesLoaded(false)
    setPaymentRolesLoadedForUser(null)
    setPaymentRolesError(null)
    setConfiguredPaymentRoles([])

    try {
      const roles = await getConfiguredPaymentAccountRoles()

      if (
        componentMounted.current &&
        paymentRoleRequestId.current === requestId
      ) {
        if (activeUserId.current === requestedUserId) {
          setConfiguredPaymentRoles(roles)
          setPaymentRolesLoaded(true)
          setPaymentRolesLoadedForUser(requestedUserId)
        } else {
          setConfiguredPaymentRoles([])
          setPaymentRolesLoaded(false)
          setPaymentRolesLoadedForUser(null)
        }
      }
    } catch (error) {
      if (
        componentMounted.current &&
        paymentRoleRequestId.current === requestId
      ) {
        setConfiguredPaymentRoles([])
        setPaymentRolesLoaded(false)
        setPaymentRolesLoadedForUser(null)
        if (activeUserId.current === requestedUserId) {
          setPaymentRolesError(
            error instanceof Error
              ? error.message
              : 'Kunde inte hämta sparade betalningskonton.'
          )
        }
      }
    } finally {
      if (
        componentMounted.current &&
        paymentRoleRequestId.current === requestId
      ) {
        setPaymentRolesLoading(false)
      }
    }
  }

  function handleVatV2Toggle(enabled: boolean) {
    paymentRoleRequestId.current += 1
    paymentRoleSaveRequestId.current += 1
    paymentRoleSaveInFlight.current = false
    vatV2SubmitGuard.current = null
    setVatV2SubmitError(null)
    setVatV2Facts(
      enabled
        ? { ...initialVatV2Facts, enabled: true }
        : initialVatV2Facts
    )
    setVatV2PaymentSourceChoice('business_account')
    setConfiguredPaymentRoles([])
    setPaymentRolesLoading(false)
    setPaymentRolesLoaded(false)
    setPaymentRolesLoadedForUser(null)
    setPaymentRolesError(null)
    setSavingPaymentRole(false)
    setPaymentRoleSaveError(null)
    if (enabled) {
      setPeriodisera(false)
    }

    if (enabled) {
      void loadPaymentRoleConfiguration()
    }
  }

  async function handleSavePaymentRoleSuggestion() {
    if (
      paymentRoleSaveInFlight.current ||
      !vatV2AssessmentEnabled ||
      paymentRolesLoading ||
      paymentRolesError
    ) {
      return
    }

    const sourceAtRequest = vatV2PaymentSource
    if (sourceAtRequest.status === 'configured') {
      return
    }

    const requestId = paymentRoleSaveRequestId.current + 1
    const requestedUserId = userId
    paymentRoleSaveRequestId.current = requestId
    paymentRoleSaveInFlight.current = true
    setSavingPaymentRole(true)
    setPaymentRoleSaveError(null)

    try {
      const saved = await setConfiguredPaymentAccountRole(
        sourceAtRequest.role,
        sourceAtRequest.recommendation.accountNumber
      )

      if (
        componentMounted.current &&
        paymentRoleSaveRequestId.current === requestId
      ) {
        if (activeUserId.current === requestedUserId) {
          setConfiguredPaymentRoles(prev => [
            ...prev.filter(role => role.role !== saved.role),
            saved,
          ])
          setPaymentRolesLoaded(true)
          setPaymentRolesLoadedForUser(requestedUserId)
        }
      }
    } catch (error) {
      if (
        componentMounted.current &&
        paymentRoleSaveRequestId.current === requestId &&
        activeUserId.current === requestedUserId
      ) {
        setPaymentRoleSaveError({
          role: sourceAtRequest.role,
          message:
            error instanceof Error
              ? error.message
              : 'Kunde inte spara betalningskontot.',
        })
      }
    } finally {
      if (
        componentMounted.current &&
        paymentRoleSaveRequestId.current === requestId
      ) {
        paymentRoleSaveInFlight.current = false
        setSavingPaymentRole(false)
      }
    }
  }

  async function handleVatV2Submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    e.stopPropagation()

    setVatV2SubmitError(null)

    if (vatV2RuntimeBooking.status !== 'ready') {
      setVatV2SubmitError(
        vatV2RuntimeBooking.errors
          .map(describeVatV2RuntimeBookingError)
          .join(' ')
      )
      return
    }

    if (!vatV2SubmitGuard.current) {
      vatV2SubmitGuard.current = createVatV2RuntimeSubmitGuard()
    }

    try {
      const result = await vatV2SubmitGuard.current.run(() =>
        onVatV2Submit(vatV2RuntimeBooking.request, formData.file)
      )

      if (result.status === 'blocked_duplicate') {
        setVatV2SubmitError('Bokningen behandlas redan.')
        return
      }

      setVatV2Facts(initialVatV2Facts)
      setVatV2PaymentSourceChoice('business_account')
      setConfiguredPaymentRoles([])
      setPaymentRolesLoaded(false)
      setPaymentRolesLoadedForUser(null)
      setPaymentRolesError(null)
      setPaymentRoleSaveError(null)
    } catch (error) {
      setVatV2SubmitError(
        error instanceof Error
          ? error.message
          : 'VAT V2-bokningen misslyckades.'
      )
    }
  }

  function handleFavoriteSelect(fav: Favorite) {
    setFormData({
      ...formData,
      type: fav.type,
      amount: fav.amount.toString(),
      vatRate: isNotVatRegistered ? 0 : fav.vat_rate,
      description: '',
    })
    setDescriptionHighlight(true)
    setTimeout(() => setDescriptionHighlight(false), 2000)
  }

  async function handleSaveFav() {
    if (!favName.trim()) return
    await onSaveFavorite(favName.trim())
    setFavName('')
    setShowFavInput(false)
    setFavRefreshKey(k => k + 1)
  }

  return (
    <div
      className={`bg-white rounded-[2.5rem] border p-4 sm:p-8 mb-6 shadow-sm transition-all ${
        editingId
          ? 'border-amber-300 shadow-amber-100'
          : 'border-gray-100'
      }`}
    >
      {/* Favorit-chips — visas bara när man inte redigerar */}
      {!editingId && (
        <FavoriteChips
          userId={userId}
          onSelect={handleFavoriteSelect}
          refreshKey={favRefreshKey}
        />
      )}

      <form onSubmit={vatV2AssessmentEnabled ? handleVatV2Submit : onSubmit}>
        {editingBooked ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-100 bg-amber-50/60 px-5 py-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wide text-amber-600">
                Hantera bilaga
              </p>

              <p className="mt-1 text-[10px] font-medium text-gray-500">
                Verifikationen är bokförd och låst. Här kan du komplettera eller byta bilaga.
              </p>
            </div>

            {/* Avbryt här uppe — endast desktop */}
            <button
              type="button"
              onClick={onCancelEdit}
              className="hidden lg:block text-[10px] font-black uppercase text-gray-400 hover:text-gray-600 transition-colors"
            >
              Avbryt
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-12 gap-3 items-end mb-4">

            {/* Datum */}
            <div className="lg:col-span-2 flex flex-col gap-1">
              <label className="text-[9px] font-black text-gray-500 uppercase ml-1">
                Datum
              </label>

              <input
                type="date"
                value={formData.date}
                disabled={editingBooked || isYearLocked}
                onChange={e =>
                  setFormData({
                    ...formData,
                    date: e.target.value,
                  })
                }
                className={`p-3 rounded-xl outline-none font-bold text-xs ${
                  editingBooked || isYearLocked
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-gray-50'
                } ${isYearLocked ? 'opacity-40' : ''}`}
                required
              />
            </div>

            {showOrdinaryV1Fields && (
              <div className="lg:col-span-3 flex flex-col gap-1">
                <label className="text-[9px] font-black text-gray-500 uppercase ml-1">
                  Kategori
                </label>

                <select
                  value={formData.type}
                  onChange={e => {
                    const acc = kontoplan.find(
                      k => k.id === e.target.value
                    )

                    setFormData({
                      ...formData,
                      type: e.target.value,
                      vatRate: isNotVatRegistered
                        ? 0
                        : Number(acc?.default_vat_rate) || 0,
                    })
                  }}
                  disabled={editingBooked || isYearLocked}
                  className={`p-3 rounded-xl outline-none font-bold text-xs ${
                    editingBooked || isYearLocked
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-gray-50 cursor-pointer'
                  } ${isYearLocked ? 'opacity-40' : ''}`}
                >
                  {(() => {
                    const income = kontoplan.filter(
                      k =>
                        k.credit_account?.startsWith('3')
                    )

                    const special = kontoplan.filter(
                      k =>
                        k.id === 'ingående_balans' ||
                        k.id === 'skattekonto_default' ||
                        k.id === 'egen_insättning' ||
                        k.id === 'eget_uttag' ||
                        k.id === 'periodisering'
                    )

                    const costs = kontoplan.filter(
                      k =>
                        !income.includes(k) &&
                        !special.includes(k)
                    )

                    return (
                      <>
                        <optgroup label="── Intäkter ──">
                          {income.map(item => (
                            <option
                              key={item.id}
                              value={item.id}
                            >
                              {item.name}
                            </option>
                          ))}
                        </optgroup>

                        <optgroup label="── Kostnader ──">
                          {costs.map(item => (
                            <option
                              key={item.id}
                              value={item.id}
                            >
                              {item.name}
                            </option>
                          ))}
                        </optgroup>

                        <optgroup label="── Övrigt ──">
                          {special.map(item => (
                            <option
                              key={item.id}
                              value={item.id}
                            >
                              {item.name}
                            </option>
                          ))}
                        </optgroup>
                      </>
                    )
                  })()}
                </select>
              </div>
            )}

            {/* Beskrivning */}
            <div className={`col-span-2 flex flex-col gap-1 ${
              vatV2AssessmentEnabled ? 'lg:col-span-6' : 'lg:col-span-3'
            }`}>
              <label className="text-[9px] font-black text-gray-500 uppercase ml-1">
                Beskrivning
              </label>

              <input
                type="text"
                value={formData.description}
                disabled={isYearLocked}
                onChange={e =>
                  setFormData({
                    ...formData,
                    description: e.target.value,
                  })
                }
                className={`p-3 bg-gray-50 rounded-xl outline-none font-bold text-xs transition-all ${
                  isYearLocked
                    ? 'opacity-40 cursor-not-allowed'
                    : ''
                } ${
                  descriptionHighlight
                    ? 'ring-2 ring-amber-400 bg-amber-50 animate-pulse'
                    : ''
                }`}
                placeholder={
                  descriptionHighlight
                    ? '← Fyll i beskrivning!'
                    : ''
                }
                required
              />
            </div>

            {showOrdinaryV1Fields && (
              <>
                {/* Moms % */}
                <div className="lg:col-span-1 flex flex-col gap-1">
                  <label className="text-[9px] font-black text-gray-500 uppercase ml-1">
                    Moms %
                  </label>

                  <select
                    value={formData.vatRate}
                    onChange={e =>
                      setFormData({
                        ...formData,
                        vatRate: Number(e.target.value),
                      })
                    }
                    disabled={editingBooked || isYearLocked || isNotVatRegistered}
                    className={`p-3 rounded-xl outline-none font-bold text-xs ${
                      editingBooked || isYearLocked || isNotVatRegistered
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-gray-50 cursor-pointer'
                    } ${isYearLocked ? 'opacity-40' : ''}`}
                    title={isNotVatRegistered ? 'Företaget är markerat som inte momsregistrerat.' : undefined}
                  >
                    <option value={25}>25%</option>
                    <option value={12}>12%</option>
                    <option value={6}>6%</option>
                    <option value={0}>0%</option>
                  </select>
                </div>

                {/* Belopp */}
                <div className="lg:col-span-2 flex flex-col gap-1">
                  <label className="text-[9px] font-black text-gray-500 uppercase ml-1">
                    {isNotVatRegistered ? 'Belopp' : 'Belopp inkl. moms'}
                  </label>

                  <input
                    type="number"
                    step="0.01"
                    value={formData.amount}
                    onChange={e =>
                      setFormData({
                        ...formData,
                        amount: e.target.value,
                      })
                    }
                    disabled={editingBooked || isYearLocked}
                    className={`p-3 rounded-xl outline-none font-black text-sm ${
                      editingBooked || isYearLocked
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-gray-50'
                    } ${isYearLocked ? 'opacity-40' : ''}`}
                    required={ordinaryV1AmountRequired}
                  />
                </div>
              </>
            )}

            {/* Submit / Cancel — endast desktop */}
            <div className={`hidden lg:flex lg:flex-col gap-1 ${
              vatV2AssessmentEnabled ? 'lg:col-span-4' : 'lg:col-span-1'
            }`}>
              {editingId && (
                <label className="text-[9px] font-black text-amber-400 uppercase ml-1">
                  Redigerar
                </label>
              )}

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={uploading || isYearLocked}
                  className={`flex-1 h-[42px] rounded-xl font-black uppercase text-[9px] shadow-md transition-all text-white ${
                    uploading
                      ? 'bg-gray-400'
                      : isYearLocked
                      ? 'bg-gray-300 opacity-40 cursor-not-allowed'
                      : vatV2AssessmentEnabled
                      ? 'bg-indigo-500 hover:bg-indigo-600'
                      : editingId
                      ? 'bg-amber-500 hover:bg-amber-600'
                      : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  {uploading
                    ? '...'
                    : vatV2AssessmentEnabled
                    ? 'Bokför VAT V2'
                    : editingId
                    ? 'Spara'
                    : 'Bokför'}
                </button>

                {editingId && (
                  <button
                    type="button"
                    onClick={onCancelEdit}
                    className="h-[42px] px-3 rounded-xl text-gray-400 hover:text-gray-600 font-bold text-sm transition-colors"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
            {isNotVatRegistered && (
              <div className="col-span-2 lg:col-span-12 -mt-1 px-1">
                <p className="text-[9px] font-bold text-gray-400">
                  Företaget är markerat som inte momsregistrerat. Nya bokningar görs därför med 0 % moms.
                </p>
              </div>
            )}
          </div>
        )}

        {showVatV2Assessment && (
          <div
            className={`mb-4 rounded-2xl border-2 transition-all ${
              vatV2Facts.enabled
                ? 'border-indigo-200 bg-indigo-50/50'
                : 'border-gray-100 bg-gray-50/40'
            } ${isYearLocked ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            <label className="flex items-center gap-3 px-5 py-3.5 cursor-pointer select-none">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={vatV2Facts.enabled}
                  disabled={isYearLocked}
                  onChange={e =>
                    handleVatV2Toggle(e.target.checked)
                  }
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-200 peer-checked:bg-indigo-500 rounded-full transition-colors duration-200" />
                <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 peer-checked:translate-x-4" />
              </div>

              <div>
                <span className="text-[10px] font-black uppercase text-gray-600 tracking-wide">
                  Utlandsinköp
                </span>
                <p className="text-[9px] text-gray-400 font-medium mt-0.5">
                  Bedöm utlandsinköpet och bokför den stödda EU-tjänstvägen.
                </p>
              </div>
            </label>

            {vatV2Facts.enabled && !isYearLocked && (
              <div className="px-5 pb-4 border-t border-indigo-100">
                <div className="grid grid-cols-2 lg:grid-cols-12 gap-3 pt-4 items-end">
                  <div className="col-span-2 lg:col-span-3 flex flex-col gap-1">
                    <label className="text-[9px] font-black text-indigo-500 uppercase ml-1">
                      Leverantörsland
                    </label>
                    <select
                      value={vatV2Facts.supplierCountry}
                      onChange={e =>
                        updateVatV2Facts({
                          supplierCountry: e.target.value as VatV2SupplierCountryInput,
                        })
                      }
                      className="p-3 bg-white border border-indigo-100 rounded-xl outline-none font-bold text-xs text-indigo-700 focus:border-indigo-300 transition-colors"
                    >
                      <option value="unknown">Välj land</option>
                      {VAT_V2_SUPPLIER_COUNTRIES.map(country => (
                        <option key={country.code} value={country.code}>
                          {country.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-span-2 lg:col-span-2 flex flex-col gap-1">
                    <label className="text-[9px] font-black text-indigo-500 uppercase ml-1">
                      Vara/tjänst
                    </label>
                    <select
                      value={vatV2Facts.goodsOrService}
                      onChange={e =>
                        updateVatV2Facts({
                          goodsOrService: e.target.value as VatGoodsOrService,
                        })
                      }
                      className="p-3 bg-white border border-indigo-100 rounded-xl outline-none font-bold text-xs text-indigo-700 focus:border-indigo-300 transition-colors"
                    >
                      <option value="unknown">Välj</option>
                      <option value="service">Tjänst</option>
                      <option value="goods">Vara</option>
                    </select>
                  </div>

                  <div className="col-span-2 lg:col-span-2 flex flex-col gap-1">
                    <label className="text-[9px] font-black text-indigo-500 uppercase ml-1">
                      Moms på fakturan
                    </label>
                    <select
                      value={vatV2Facts.supplierVatCharged}
                      onChange={e =>
                        updateVatV2Facts({
                          supplierVatCharged: e.target.value as VatYesNoUnknown,
                        })
                      }
                      className="p-3 bg-white border border-indigo-100 rounded-xl outline-none font-bold text-xs text-indigo-700 focus:border-indigo-300 transition-colors"
                    >
                      <option value="unknown">Okänt</option>
                      <option value="no">Nej</option>
                      <option value="yes">Ja</option>
                    </select>
                  </div>

                  <div className="col-span-2 lg:col-span-2 flex flex-col gap-1">
                    <label className="text-[9px] font-black text-indigo-500 uppercase ml-1">
                      Beräknad moms
                    </label>
                    <select
                      value={vatV2Facts.calculationRate}
                      onChange={e =>
                        updateVatV2Facts({
                          calculationRate:
                            e.target.value === 'unknown'
                              ? 'unknown'
                              : Number(e.target.value) as VatCalculationRateInput,
                        })
                      }
                      className="p-3 bg-white border border-indigo-100 rounded-xl outline-none font-bold text-xs text-indigo-700 focus:border-indigo-300 transition-colors"
                    >
                      <option value="unknown">Välj</option>
                      <option value={25}>25%</option>
                      <option value={12}>12%</option>
                      <option value={6}>6%</option>
                      <option value={0}>0%</option>
                    </select>
                  </div>

                  <div className="col-span-2 lg:col-span-3 flex flex-col gap-1">
                    <label className="text-[9px] font-black text-indigo-500 uppercase ml-1">
                      Inköpsbelopp för moms
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={vatV2Facts.acquisitionBaseAmount}
                      onChange={e =>
                        updateVatV2Facts({
                          acquisitionBaseAmount: e.target.value,
                        })
                      }
                      className="p-3 bg-white border border-indigo-100 rounded-xl outline-none font-black text-sm text-indigo-700 focus:border-indigo-300 transition-colors"
                      placeholder="Beskattningsunderlag"
                    />
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-indigo-100 bg-white px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase text-indigo-700">
                        Betalningskälla
                      </p>
                      <p className="mt-1 text-[10px] font-bold text-indigo-500">
                        Välj hur inköpet betalades. Kontot måste sparas explicit innan bokning kan kopplas in.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => void loadPaymentRoleConfiguration()}
                      disabled={paymentRolesLoading || savingPaymentRole}
                      className="rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-[9px] font-black uppercase text-indigo-600 transition-colors hover:bg-indigo-100 disabled:opacity-50"
                    >
                      Uppdatera
                    </button>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {VAT_V2_PAYMENT_SOURCE_CHOICES.map(choice => {
                      const option = getVatV2PaymentSourceOption(choice)
                      const selected = choice === vatV2PaymentSourceChoice

                      return (
                        <button
                          key={choice}
                          type="button"
                          onClick={() => {
                            setVatV2PaymentSourceChoice(choice)
                            setPaymentRoleSaveError(null)
                          }}
                          className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                            selected
                              ? 'border-indigo-300 bg-indigo-50 text-indigo-800'
                              : 'border-gray-100 bg-gray-50 text-gray-500 hover:border-indigo-100 hover:bg-indigo-50/50'
                          }`}
                        >
                          <span className="block text-[10px] font-black uppercase">
                            {option.label}
                          </span>
                          <span className="mt-1 block text-[9px] font-bold">
                            {option.summary}
                          </span>
                        </button>
                      )
                    })}
                  </div>

                  <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                    {paymentRolesLoading ? (
                      <p className="text-[10px] font-bold text-gray-500">
                        Kontrollerar sparad betalningskonfiguration...
                      </p>
                    ) : paymentRolesError ? (
                      <p className="text-[10px] font-bold text-red-600">
                        {paymentRolesError}
                      </p>
                    ) : vatV2PaymentSource.status === 'configured' ? (
                      <div>
                        <p className="text-[10px] font-black uppercase text-emerald-700">
                          Konfigurerad betalningskälla
                        </p>
                        <p className="mt-1 text-[10px] font-bold text-emerald-700">
                          {selectedVatV2PaymentSourceOption.label} använder konto {vatV2PaymentSource.accountNumber}. Detta sparade val styr före SoloLedgers systemförslag.
                        </p>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-[180px] flex-1">
                          <p className="text-[10px] font-black uppercase text-amber-700">
                            {vatV2PaymentSource.status === 'invalid_configuration'
                              ? 'Ogiltig betalningskonfiguration'
                              : 'Betalningskonto saknas'}
                          </p>
                          <p className="mt-1 text-[10px] font-bold text-amber-700">
                            SoloLedger föreslår {vatV2PaymentSource.recommendation.accountNumber} ({vatV2PaymentSource.recommendation.label}) för {selectedVatV2PaymentSourceOption.label.toLowerCase()}, men förslaget sparas inte utan din bekräftelse.
                          </p>
                          <p className="mt-1 text-[9px] font-bold text-amber-600">
                            {vatV2PaymentSource.recommendation.summary}
                          </p>
                          {currentPaymentRoleSaveError && (
                            <p className="mt-2 text-[10px] font-bold text-red-600">
                              {currentPaymentRoleSaveError}
                            </p>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => void handleSavePaymentRoleSuggestion()}
                          disabled={savingPaymentRole}
                          className="rounded-xl bg-amber-600 px-4 py-2.5 text-[9px] font-black uppercase text-white shadow-sm transition-colors hover:bg-amber-700 disabled:opacity-50"
                        >
                          {savingPaymentRole ? 'Sparar...' : 'Spara förslag'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div
                  className={`mt-4 rounded-xl border px-4 py-3 ${
                    vatV2RuntimeBooking.status === 'ready'
                      ? 'border-emerald-100 bg-emerald-50'
                      : 'border-amber-100 bg-amber-50'
                  }`}
                >
                  {vatV2Preflight.status === 'ready' ? (
                    <div>
                      <p className="text-[10px] font-black uppercase text-emerald-700">
                        Momsbedömning klar
                      </p>
                      <p className="mt-1 text-[10px] font-bold text-emerald-700">
                        Underlag {vatV2Preflight.treatment.taxableBase} kr,
                        utgående moms {vatV2Preflight.treatment.outputVat.amount} kr,
                        beräknad ingående moms {vatV2Preflight.treatment.deductibleInputVat.amount} kr.
                      </p>
                      <p className="mt-1 text-[10px] font-bold text-emerald-700">
                        {vatV2RuntimeBooking.status === 'ready'
                          ? `Redo att bokföra via konto ${vatV2RuntimeBooking.request.paymentAccountNumber}.`
                          : 'Bokning hålls stängd tills alla uppgifter och betalningskällan är säkra.'}
                      </p>
                      {vatV2RuntimeBooking.status === 'blocked' && (
                        <ul className="mt-2 space-y-1">
                          {vatV2RuntimeBooking.errors.map((runtimeError, index) => (
                            <li
                              key={`${runtimeError.code}-${index}`}
                              className="text-[10px] font-bold text-amber-700"
                            >
                              {describeVatV2RuntimeBookingError(runtimeError)}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : (
                    <div>
                      <p className="text-[10px] font-black uppercase text-amber-700">
                        Kan inte bedömas säkert ännu
                      </p>
                      <ul className="mt-1 space-y-1">
                        {vatV2Preflight.validation.errors.map((preflightError, index) => (
                          <li
                            key={`${preflightError.code}-${preflightError.path}-${index}`}
                            className="text-[10px] font-bold text-amber-700"
                          >
                            {describeVatV2PreflightError(preflightError)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {vatV2SubmitError && (
                    <p className="mt-3 text-[10px] font-bold text-red-600">
                      {vatV2SubmitError}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Bilaga */}
        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-gray-50">
          <span className="text-[9px] font-black text-gray-500 uppercase whitespace-nowrap">
            Bilaga:
          </span>

          <label
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-wide transition-all shadow-sm ${
              isYearLocked
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed opacity-50'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer hover:shadow-md'
            }`}
          >
            <span>＋</span>
            <span>Välj fil</span>

            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              disabled={isYearLocked}
              onChange={e =>
                setFormData({
                  ...formData,
                  file: e.target.files?.[0] || null,
                })
              }
              className="hidden"
            />
          </label>

          <span
            className={`text-[10px] font-medium truncate max-w-[220px] sm:max-w-md ${
              formData.file
                ? 'text-emerald-600 font-bold'
                : 'text-gray-400'
            }`}
          >
            {formData.file ? (
              <>
                {formData.file.name}{' '}
                <span className="text-emerald-500">
                  ✓
                </span>
              </>
            ) : (
              'Ingen fil vald'
            )}
          </span>
        </div>

        {/* Bokförd transaktion — spara bilaga */}
        {editingBooked && (
          <div className="mt-4 flex gap-2 justify-end">

            {/* Avbryt — endast mobil */}
            <button
              type="button"
              onClick={onCancelEdit}
              className="lg:hidden h-[42px] px-5 rounded-xl font-black uppercase text-[9px] border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 transition-all"
            >
              Avbryt
            </button>

            <button
              type="submit"
              disabled={uploading || isYearLocked}
              className={`h-[42px] px-5 rounded-xl font-black uppercase text-[9px] shadow-md transition-all text-white ${
                uploading
                  ? 'bg-gray-400'
                  : isYearLocked
                  ? 'bg-gray-300 opacity-40 cursor-not-allowed'
                  : 'bg-amber-500 hover:bg-amber-600'
              }`}
            >
              {uploading ? '...' : 'Spara bilaga'}
            </button>
          </div>
        )}

        {/* Periodisering — visas bara när man inte redigerar */}
        {!editingId && !vatV2AssessmentEnabled && (
          <div
            className={`mt-4 rounded-2xl border-2 transition-all duration-200 ${
              periodisera
                ? 'border-blue-300 bg-blue-50/60'
                : 'border-gray-100 bg-gray-50/40'
            } ${
              isYearLocked
                ? 'opacity-40 cursor-not-allowed'
                : ''
            }`}
          >
            <label className="flex items-center gap-3 px-5 py-3.5 cursor-pointer select-none">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={periodisera}
                  disabled={isYearLocked}
                  onChange={e =>
                    setPeriodisera(e.target.checked)
                  }
                  className="sr-only peer"
                />

                <div className="w-9 h-5 bg-gray-200 peer-checked:bg-blue-500 rounded-full transition-colors duration-200" />
                <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 peer-checked:translate-x-4" />
              </div>

              <div>
                <span className="text-[10px] font-black uppercase text-gray-600 tracking-wide">
                  Periodisera till nästa räkenskapsår
                </span>

                <p className="text-[9px] text-gray-400 font-medium mt-0.5">
                  Kostnaden avser ett annat år — parkeras på konto 1790 och aktiveras automatiskt.
                </p>
              </div>
            </label>

            {periodisera && !isYearLocked && (
              <div className="px-5 pb-4 flex flex-wrap items-end gap-6 border-t border-blue-100">
                <div className="flex flex-col gap-1 mt-3">
                  <label className="text-[9px] font-black text-blue-500 uppercase ml-1">
                    Kostnaden avser (år/månad)
                  </label>

                  <input
                    type="month"
                    value={periodMonth}
                    onChange={e =>
                      setPeriodMonth(e.target.value)
                    }
                    className="p-2.5 bg-white border border-blue-200 rounded-xl outline-none font-bold text-xs text-blue-700 focus:border-blue-400 transition-colors"
                  />
                </div>

                <div className="mt-3 text-[9px] leading-relaxed text-blue-600 font-bold bg-blue-100/60 rounded-xl px-4 py-2.5 border border-blue-200">
                  <p className="font-black uppercase mb-1 text-blue-700">
                    Vad händer?
                  </p>

                  <p>
                    📅 <strong>År 1 (idag):</strong>{' '}
                    Bank krediteras.{' '}
                    {isNotVatRegistered
                      ? 'Hela beloppet → konto 1790.'
                      : 'Moms bokas direkt. Netto → konto 1790.'}
                  </p>

                  <p>
                    🔄{' '}
                    <strong>
                      År 2 ({periodMonth}-01):
                    </strong>{' '}
                    1790 krediteras → kostnadskonto
                    debiteras.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Submit / Cancel — endast mobil */}
        {!editingBooked && (
          <div className="lg:hidden mt-4 pt-4 border-t border-gray-100">
            {editingId && (
              <p className="mb-2 text-[9px] font-black text-amber-400 uppercase tracking-wide">
                Redigerar
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={uploading || isYearLocked}
                className={`flex-1 h-[42px] rounded-xl font-black uppercase text-[9px] shadow-md transition-all text-white ${
                  uploading
                    ? 'bg-gray-400'
                    : isYearLocked
                    ? 'bg-gray-300 opacity-40 cursor-not-allowed'
                    : vatV2AssessmentEnabled
                    ? 'bg-indigo-500 hover:bg-indigo-600'
                    : editingId
                    ? 'bg-amber-500 hover:bg-amber-600'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {uploading
                  ? '...'
                  : vatV2AssessmentEnabled
                  ? 'Bokför VAT V2'
                  : editingId
                  ? 'Spara'
                  : 'Bokför'}
              </button>

              {editingId && (
                <button
                  type="button"
                  onClick={onCancelEdit}
                  className="h-[42px] px-4 rounded-xl text-gray-400 hover:text-gray-600 font-bold text-sm transition-colors"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        )}
      </form>

      {/* ⭐ Favorit-banner — dyker upp efter att en transaktion bokförts */}
      {lastSubmitted && !editingId && (
        <div className="mt-4 flex flex-wrap items-center gap-y-2 gap-x-3 bg-emerald-50 border border-emerald-100 rounded-2xl px-5 py-3 animate-in fade-in duration-300">
          <span className="text-base">⭐</span>

          <p className="text-[10px] font-black uppercase text-emerald-600 tracking-wide flex-1 min-w-[110px]">
            Spara som favorit?
          </p>

          {showFavInput ? (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <input
                type="text"
                value={favName}
                onChange={e =>
                  setFavName(e.target.value)
                }
                onKeyDown={e =>
                  e.key === 'Enter' &&
                  handleSaveFav()
                }
                placeholder="Namn på favorit..."
                autoFocus
                className="text-xs font-bold bg-white border border-emerald-200 rounded-lg px-3 py-1.5 outline-none focus:border-emerald-400 transition-colors flex-1 min-w-0 sm:flex-none"
              />

              <button
                onClick={handleSaveFav}
                className="text-[10px] font-black uppercase bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg transition-colors"
              >
                Spara
              </button>

              <button
                onClick={() => {
                  setShowFavInput(false)
                  setFavName('')
                }}
                className="text-gray-300 hover:text-gray-500 font-bold text-sm transition-colors"
              >
                ✕
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  setShowFavInput(true)
                }
                className="text-[10px] font-black uppercase bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg transition-colors"
              >
                Ja, spara ⭐
              </button>

              <button
                onClick={onDismissFavorite}
                className="text-[10px] font-bold text-gray-300 hover:text-gray-400 transition-colors"
              >
                Nej tack
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
````````

==================================================

==================================================
FILE: src/components/TransactionTable.tsx
==================================================

````typescript
'use client'

import { Fragment, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import {
  getTransactionSourceUiPolicy,
  shouldOfferGenericTransactionCorrection,
  shouldOfferGenericTransactionEdit,
} from '@/lib/transactionSourceUi'

interface TransactionTableProps {
  transactions: any[]
  journalMap: any
  kontoplan: any[]
  isYearLocked: boolean
  editingId: string | null
  selectedYear: number
  onEdit: (tx: any) => void
  onDelete: (tx: any) => void
  onFavorite: (tx: any) => void
}

export default function TransactionTable({
  transactions,
  journalMap,
  kontoplan,
  isYearLocked,
  editingId,
  selectedYear,
  onEdit,
  onDelete,
  onFavorite,
}: TransactionTableProps) {
  // Paginering sker på VISUELLA rader. En ångrad SIE-import med t.ex.
  // 50 tekniska KORRVER räknas alltså som en rad tills den fälls ut.
  const [visibleCount, setVisibleCount] = useState(50)
  const [expandedUndoBatches, setExpandedUndoBatches] = useState<Set<string>>(new Set())

  const neutralizedVerNrs = new Set(
    transactions
      .filter(tx => tx.is_correction && tx.corrects_ver_nr != null)
      .map(tx => tx.corrects_ver_nr)
  )

  async function handleOpenAttachment(fileUrl: string) {
    try {
      const { data } = await supabase.storage
        .from('attachments')
        .createSignedUrl(fileUrl, 60)

      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank')
      } else {
        alert('Kunde inte hämta bilagan. Kontrollera att du har behörighet.')
      }
    } catch {
      alert('Något gick fel vid hämtning av bilagan. Försök igen.')
    }
  }

  function toggleUndoBatch(batchId: string) {
    setExpandedUndoBatches(prev => {
      const next = new Set(prev)
      if (next.has(batchId)) next.delete(batchId)
      else next.add(batchId)
      return next
    })
  }

  function getUndoFilename(description: string | null | undefined) {
    if (!description) return 'SIE-import'

    // Beskrivningen från undo-RPC:n kan innehålla olika typer av bindestreck
    // beroende på tidigare/testad version, t.ex.
    // "Ångrad SIE-import: fil.se -- korrigering av VER-12"
    // eller "Ångrad SIE-import: fil.se — korrigering av VER-12".
    const match = description.match(
      /Ångrad SIE-import:\s*(.*?)\s*(?:—|–|--|-)\s*korrigering/i
    )

    return match?.[1]?.trim() || 'SIE-import'
  }

  const enriched = transactions.map((tx) => {
    const journal = journalMap[tx.id] || []
    const isCorrection = tx.is_correction === true
    const verNr = journal[0]?.ver_nr
    const isNeutralized = !isCorrection && verNr != null && neutralizedVerNrs.has(verNr)

    const isImported = tx.source === 'sie_import'
    const isOpeningBalance = tx.source === 'sie_opening_balance'
    const isSieUndo = tx.source === 'sie_import_undo'
    const sourceUiPolicy = getTransactionSourceUiPolicy(tx)
    const isVatClosing = sourceUiPolicy.kind === 'vat_closing'
    const isVatV2 = sourceUiPolicy.kind === 'vat_v2'
    const isVatSettlement = sourceUiPolicy.kind === 'vat_settlement'
    const isTaxAccountMovement = sourceUiPolicy.kind === 'tax_account_movement'
    const isSystemManaged = sourceUiPolicy.systemManaged
    const offerGenericEdit = shouldOfferGenericTransactionEdit(tx)
    const offerGenericCorrection = shouldOfferGenericTransactionCorrection(tx)
    const accountDef = kontoplan.find(k => k.id === tx.type)

    // H5: historisk visning ska bygga på det som faktiskt bokfördes,
    // inte på hur kategorin ser ut i dagens kontoplan.
    const isIncome =
      !isImported &&
      !isOpeningBalance &&
      !isSieUndo &&
      !isVatClosing &&
      !isVatSettlement &&
      !isTaxAccountMovement &&
      (
        journal.some((e: any) =>
          String(e.account_number || '').startsWith('3') && Number(e.credit) > 0
        ) ||
        tx.type === 'egen_insättning'
      )

    // En KORRVER är i sig en giltig ny bokföringspost. Därför stryks inte
    // korrigeringsraden längre över. Det är ORIGINALVERIFIKATIONEN som
    // markeras neutraliserad och genomstruken.
    const rowClass = isCorrection
      ? 'bg-amber-50/55 hover:bg-amber-50/80'
      : isNeutralized
      ? 'bg-gray-50 opacity-60'
      : editingId === tx.id
      ? 'bg-amber-50/50'
      : isVatV2
      ? 'bg-indigo-50/40 hover:bg-indigo-50/65'
      : isVatClosing
      ? 'bg-violet-50/45 hover:bg-violet-50/70'
      : isVatSettlement
      ? 'bg-sky-50/45 hover:bg-sky-50/70'
      : isTaxAccountMovement
      ? 'bg-cyan-50/45 hover:bg-cyan-50/70'
      : (isImported || isOpeningBalance)
      ? 'bg-sky-50/40 hover:bg-sky-50/60'
      : 'hover:bg-emerald-50/30'

    const textClass = isCorrection
      ? 'text-amber-700'
      : isNeutralized
      ? 'text-gray-400 line-through'
      : isVatV2
      ? 'text-indigo-900'
      : isVatClosing
      ? 'text-violet-900'
      : isVatSettlement
      ? 'text-sky-900'
      : isTaxAccountMovement
      ? 'text-cyan-900'
      : (isImported || isOpeningBalance)
      ? 'text-sky-900'
      : 'text-gray-700'

    const verClass = isCorrection
      ? 'text-amber-500'
      : isNeutralized
      ? 'text-gray-300 line-through'
      : isVatV2
      ? 'text-indigo-500'
      : isVatClosing
      ? 'text-violet-500'
      : isVatSettlement
      ? 'text-sky-500'
      : isTaxAccountMovement
      ? 'text-cyan-500'
      : (isImported || isOpeningBalance)
      ? 'text-sky-500'
      : 'text-emerald-600'

    const amountClass = isCorrection
      ? 'text-amber-600'
      : isNeutralized
      ? 'text-gray-400 line-through'
      : isVatV2
      ? 'text-indigo-600'
      : isVatClosing
      ? 'text-violet-600'
      : isVatSettlement
      ? 'text-sky-700'
      : isTaxAccountMovement
      ? 'text-cyan-700'
      : (isImported || isOpeningBalance)
      ? 'text-sky-700'
      : isIncome
      ? 'text-emerald-600'
      : 'text-rose-600'

    const badgeClass = isCorrection
      ? 'bg-amber-50 border-amber-200 text-amber-600'
      : isNeutralized
      ? 'bg-gray-50 border-gray-100 text-gray-300'
      : isVatV2
      ? 'bg-indigo-50 border-indigo-100 text-indigo-600'
      : isVatClosing
      ? 'bg-violet-50 border-violet-100 text-violet-600'
      : isVatSettlement
      ? 'bg-sky-50 border-sky-100 text-sky-600'
      : isTaxAccountMovement
      ? 'bg-cyan-50 border-cyan-100 text-cyan-600'
      : (isImported || isOpeningBalance)
      ? 'bg-sky-50 border-sky-100 text-sky-600'
      : 'bg-gray-50 border-gray-100 text-gray-500'

    const sortedJournal = [...journal].sort(
      (a: any, b: any) => (Number(b.debit) > 0 ? -1 : 1)
    )

    return {
      tx,
      journal: sortedJournal,
      isCorrection,
      verNr,
      isNeutralized,
      isImported,
      isOpeningBalance,
      isSieUndo,
      isVatClosing,
      isVatV2,
      isVatSettlement,
      isTaxAccountMovement,
      isSystemManaged,
      offerGenericEdit,
      offerGenericCorrection,
      accountDef,
      isIncome,
      rowClass,
      textClass,
      verClass,
      amountClass,
      badgeClass,
    }
  })

  // Gruppindelning för AUTOMATISKA rättelser efter "Ångra SIE-import".
  // Vanliga KORRVER flyttas inte: de ligger kvar i datum-/VER-ordning så
  // bokföringens tidslinje och verifikationsföljd fortfarande är tydlig.
  const undoGroups = new Map<string, typeof enriched>()
  for (const item of enriched) {
    if (!item.isSieUndo || !item.tx.import_batch_id) continue
    const id = String(item.tx.import_batch_id)
    const existing = undoGroups.get(id) || []
    existing.push(item)
    undoGroups.set(id, existing)
  }

  type DisplayItem =
    | { kind: 'transaction'; item: (typeof enriched)[number] }
    | { kind: 'sieUndoGroup'; batchId: string; items: typeof enriched }

  const displayItems: DisplayItem[] = []
  const emittedUndoBatches = new Set<string>()

  for (const item of enriched) {
    if (item.isSieUndo && item.tx.import_batch_id) {
      const batchId = String(item.tx.import_batch_id)
      if (emittedUndoBatches.has(batchId)) continue
      emittedUndoBatches.add(batchId)
      displayItems.push({
        kind: 'sieUndoGroup',
        batchId,
        items: undoGroups.get(batchId) || [item],
      })
    } else {
      displayItems.push({ kind: 'transaction', item })
    }
  }

  if (transactions.length === 0) {
    return (
      <div className="bg-white rounded-[2.5rem] border border-gray-100 overflow-hidden shadow-sm">
        <p className="p-12 text-center text-gray-300 italic font-medium">
          Inga transaktioner bokförda för {selectedYear}
        </p>
      </div>
    )
  }

  const visibleItems = displayItems.slice(0, visibleCount)

  return (
    <>
      {/* ══════════════════════ DESKTOP ══════════════════════ */}
      <div className="hidden md:block bg-white rounded-[2.5rem] border border-gray-100 overflow-hidden shadow-sm">
        <table className="w-full text-left">
          <thead className="bg-gray-50 text-[9px] font-black uppercase text-gray-400 tracking-widest border-b">
            <tr>
              <th className="p-8">Datum / Ver</th>
              <th className="p-8">Händelse</th>
              <th className="p-8 text-right">Belopp</th>
              <th className="p-8">Bokföring</th>
              <th className="p-8 text-right pr-12">Åtgärd</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {visibleItems.map((displayItem) => {
              if (displayItem.kind === 'sieUndoGroup') {
                const { batchId, items } = displayItem
                const first = items[0]
                const verNrs = items
                  .map(i => Number(i.verNr))
                  .filter(n => Number.isFinite(n))
                  .sort((a, b) => a - b)
                const minVer = verNrs[0]
                const maxVer = verNrs[verNrs.length - 1]
                const expanded = expandedUndoBatches.has(batchId)
                const filename = getUndoFilename(first?.tx?.description)

                return (
                  <Fragment key={`undo-${batchId}`}>
                    <tr className="bg-amber-50/60 hover:bg-amber-50/90 transition-colors">
                      <td className="p-8 font-bold text-amber-600 text-sm">
                        {first?.tx?.date}
                        {verNrs.length > 0 && (
                          <p className="text-[10px] font-black italic text-amber-500">
                            {minVer === maxVer ? `VER-${minVer}` : `VER-${minVer}–${maxVer}`}
                          </p>
                        )}
                      </td>

                      <td className="p-8">
                        <p className="text-[10px] font-black text-amber-600 uppercase mb-1">
                          ↩ Ångrad SIE-import
                        </p>
                        <p className="font-bold text-amber-800">
                          {filename}
                        </p>
                        <p className="text-[10px] text-amber-600/70 font-bold mt-1">
                          {items.length} rättelseverifikationer skapades automatiskt
                        </p>
                      </td>

                      <td className="p-8 text-right">
                        <span className="text-[10px] font-black uppercase text-amber-500">
                          Neutraliserad
                        </span>
                      </td>

                      <td className="p-8">
                        <span className="inline-flex items-center border rounded-lg px-2 py-1 font-mono text-[10px] font-bold bg-amber-50 border-amber-200 text-amber-600">
                          {items.length} KORRVER
                        </span>
                      </td>

                      <td className="p-8 text-right pr-12">
                        <button
                          onClick={() => toggleUndoBatch(batchId)}
                          className="text-[10px] font-black uppercase tracking-wide text-amber-600 hover:text-amber-800 transition-colors"
                        >
                          {expanded ? 'Dölj detaljer ↑' : 'Visa detaljer ↓'}
                        </button>
                      </td>
                    </tr>

                    {expanded && (
                      <tr className="bg-amber-50/25">
                        <td colSpan={5} className="px-8 py-5">
                          <div className="rounded-2xl border border-amber-100 bg-white/70 overflow-hidden divide-y divide-amber-50">
                            {items.map((detail) => (
                              <div
                                key={detail.tx.id}
                                className="grid grid-cols-[120px_1fr_auto] gap-4 items-center px-5 py-3"
                              >
                                <div>
                                  <p className="text-[10px] font-black text-amber-500">
                                    VER-{detail.verNr ?? '–'}
                                  </p>
                                  <p className="text-[9px] text-gray-400 font-bold">
                                    korrigerar VER-{detail.tx.corrects_ver_nr ?? '–'}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs font-bold text-gray-600">
                                    {String(detail.tx.description || '').replace(/^↩\s*/, '')}
                                  </p>
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {detail.journal.map((e: any) => (
                                      <span
                                        key={e.id}
                                        className="border border-amber-100 bg-amber-50 text-amber-600 rounded-md px-1.5 py-0.5 font-mono text-[9px] font-bold"
                                      >
                                        {e.account_number} {Number(e.debit) > 0 ? 'D' : 'K'}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                                <p className="font-black text-sm text-amber-600 whitespace-nowrap">
                                  {Number(detail.tx.amount || 0).toLocaleString('sv-SE')} kr
                                </p>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              }

              const {
                tx,
                journal,
                isCorrection,
                verNr,
                isNeutralized,
                isImported,
                isOpeningBalance,
                isVatClosing,
                isVatV2,
                isVatSettlement,
                isTaxAccountMovement,
                isSystemManaged,
                offerGenericEdit,
                offerGenericCorrection,
                accountDef,
                isIncome,
                rowClass,
                textClass,
                verClass,
                amountClass,
                badgeClass,
              } = displayItem.item

              return (
                <tr key={tx.id} className={`group transition-all duration-150 ${rowClass}`}>
                  <td className="p-8 font-bold text-gray-400 text-sm">
                    <span className={isCorrection ? 'text-amber-600' : isNeutralized ? 'text-gray-400' : ''}>
                      {tx.date}
                    </span>
                    {verNr && (
                      <p className={`text-[10px] font-black italic ${verClass}`}>
                        VER-{verNr}
                      </p>
                    )}
                    {isImported && (
                      <p className="text-[9px] font-bold uppercase tracking-wide text-sky-400">
                        SIE {tx.source_ver_series}{tx.source_ver_number}
                      </p>
                    )}
                  </td>

                  <td className="p-8">
                    <div className="flex items-center flex-wrap gap-2 mb-1">
                      {isCorrection ? (
                        <p className="text-[10px] font-black text-amber-600 uppercase">
                          ↩ Korrigering
                        </p>
                      ) : isNeutralized ? (
                        <p className="text-[10px] font-black text-gray-300 uppercase line-through">
                          {accountDef?.name || tx.type}
                        </p>
                      ) : isOpeningBalance ? (
                        <p className="text-[10px] font-black text-sky-500 uppercase">
                          Ingående balans
                        </p>
                      ) : isVatClosing ? (
                        <p className="text-[10px] font-black text-violet-600 uppercase">
                          Momsavslut
                        </p>
                      ) : isVatV2 ? (
                        <p className="text-[10px] font-black text-indigo-600 uppercase">
                          VAT V2 utlandsinköp
                        </p>
                      ) : isVatSettlement ? (
                        <p className="text-[10px] font-black text-sky-600 uppercase">
                          Momsavräkning
                        </p>
                      ) : isTaxAccountMovement ? (
                        <p className="text-[10px] font-black text-cyan-600 uppercase">
                          Skattekontorörelse
                        </p>
                      ) : isImported ? (
                        <p className="text-[10px] font-black text-sky-500 uppercase">
                          Importerad verifikation
                        </p>
                      ) : (
                        <p className="text-[10px] font-black text-emerald-500 uppercase">
                          {accountDef?.name || tx.type}
                        </p>
                      )}

                      {!isCorrection && !isNeutralized && !isSystemManaged && (
                        <span className="text-[8px] font-black uppercase bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-md border border-gray-200">
                          Moms: {tx.vat_rate}%
                        </span>
                      )}

                      {tx.booked && !isCorrection && !isNeutralized && (
                        <span className="text-[8px] font-black uppercase text-gray-300 border border-gray-200 px-1.5 py-0.5 rounded-md">
                          Låst
                        </span>
                      )}
                    </div>

                    <p className={`font-bold ${
                      isCorrection
                        ? 'text-amber-700 text-xs pl-4 border-l-2 border-amber-200'
                        : textClass
                    }`}>
                      {isCorrection ? tx.description.replace('↩ ', '') : tx.description}
                    </p>

                    {isCorrection && tx.corrects_ver_nr != null && (
                      <p className="text-[9px] text-amber-500/80 font-bold mt-1 pl-4">
                        Rättar VER-{tx.corrects_ver_nr}
                      </p>
                    )}

                    {tx.file_url && !isNeutralized && !isVatClosing && (
                      <button
                        onClick={() => handleOpenAttachment(tx.file_url)}
                        className="text-emerald-400 text-xs mt-1 inline-block hover:text-emerald-600 transition-colors cursor-pointer"
                      >
                        📎 Visa bilaga
                      </button>
                    )}
                  </td>

                  <td className={`p-8 text-right font-black text-lg whitespace-nowrap ${amountClass}`}>
                    {isVatClosing ? (
                      <span className="text-[10px] font-black uppercase tracking-wide text-violet-500">
                        Systembokning
                      </span>
                    ) : isVatV2 ? (
                      <span>
                        {Number(tx.amount || 0).toLocaleString('sv-SE')} kr
                      </span>
                    ) : isVatSettlement ? (
                      <span>
                        {Number(tx.amount || 0).toLocaleString('sv-SE')} kr
                      </span>
                    ) : isTaxAccountMovement ? (
                      <span>
                        {Number(tx.amount || 0).toLocaleString('sv-SE')} kr
                      </span>
                    ) : (
                      <>
                        {!isCorrection && !isNeutralized && !isImported && !isOpeningBalance && (isIncome ? '+ ' : '- ')}
                        {Number(tx.amount || 0).toLocaleString('sv-SE')} kr
                      </>
                    )}
                  </td>

                  <td className="p-8">
                    <div className="flex flex-wrap gap-1.5">
                      {journal.map((e: any) => {
                        const isDebit = Number(e.debit) > 0
                        return (
                          <span
                            key={e.id}
                            className={`inline-flex items-center gap-0.5 border rounded-lg px-2 py-1 font-mono text-[10px] font-bold ${badgeClass}`}
                          >
                            {e.account_number}
                            <span className={
                              isNeutralized
                                ? 'text-gray-300'
                                : isDebit
                                ? 'text-emerald-500'
                                : 'text-orange-400'
                            }>
                              {isDebit ? ' D' : ' K'}
                            </span>
                          </span>
                        )
                      })}
                    </div>
                  </td>

                  <td className="p-8 text-right pr-12">
                    <div className="flex items-center justify-end gap-1">
                      {!isCorrection && !isNeutralized && offerGenericEdit && !isYearLocked && (
                        <button
                          onClick={() => onEdit(tx)}
                          className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-300 hover:bg-emerald-50 hover:text-emerald-600 transition-all"
                          title={tx.booked ? "Hantera bilaga" : "Redigera"}
                        >
                          ✎
                        </button>
                      )}
                      {!isCorrection && !isNeutralized && offerGenericCorrection && !isYearLocked && (
                        <button
                          onClick={() => onDelete(tx)}
                          className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-300 hover:bg-red-50 hover:text-red-500 transition-all font-bold"
                          title="Korrigera"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ══════════════════════ MOBIL ══════════════════════ */}
      <div className="md:hidden flex flex-col gap-3">
        {visibleItems.map((displayItem) => {
          if (displayItem.kind === 'sieUndoGroup') {
            const { batchId, items } = displayItem
            const first = items[0]
            const verNrs = items
              .map(i => Number(i.verNr))
              .filter(n => Number.isFinite(n))
              .sort((a, b) => a - b)
            const minVer = verNrs[0]
            const maxVer = verNrs[verNrs.length - 1]
            const expanded = expandedUndoBatches.has(batchId)
            const filename = getUndoFilename(first?.tx?.description)

            return (
              <div
                key={`mobile-undo-${batchId}`}
                className="rounded-[1.75rem] border border-amber-100 bg-amber-50/70 p-5 shadow-sm"
              >
                <div className="flex justify-between items-start gap-3">
                  <div>
                    <p className="font-bold text-sm text-amber-600">{first?.tx?.date}</p>
                    {verNrs.length > 0 && (
                      <p className="text-[10px] font-black italic text-amber-500">
                        {minVer === maxVer ? `VER-${minVer}` : `VER-${minVer}–${maxVer}`}
                      </p>
                    )}
                  </div>
                  <span className="text-[9px] font-black uppercase text-amber-600 border border-amber-200 rounded-lg px-2 py-1">
                    {items.length} KORRVER
                  </span>
                </div>

                <p className="text-[10px] font-black text-amber-600 uppercase mt-3">
                  ↩ Ångrad SIE-import
                </p>
                <p className="font-bold text-amber-800 mt-1">{filename}</p>
                <p className="text-[10px] text-amber-600/70 font-bold mt-1">
                  {items.length} rättelseverifikationer skapades automatiskt
                </p>

                <button
                  onClick={() => toggleUndoBatch(batchId)}
                  className="w-full h-10 mt-4 rounded-xl bg-white/70 border border-amber-100 text-amber-600 font-black text-[10px] uppercase tracking-wide"
                >
                  {expanded ? 'Dölj detaljer ↑' : 'Visa detaljer ↓'}
                </button>

                {expanded && (
                  <div className="mt-3 rounded-xl border border-amber-100 bg-white/70 divide-y divide-amber-50 overflow-hidden">
                    {items.map(detail => (
                      <div key={detail.tx.id} className="p-3">
                        <div className="flex justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-black text-amber-500">
                              VER-{detail.verNr ?? '–'} · rättar VER-{detail.tx.corrects_ver_nr ?? '–'}
                            </p>
                            <p className="text-xs font-bold text-gray-600 mt-1">
                              {String(detail.tx.description || '').replace(/^↩\s*/, '')}
                            </p>
                          </div>
                          <p className="font-black text-xs text-amber-600 whitespace-nowrap">
                            {Number(detail.tx.amount || 0).toLocaleString('sv-SE')} kr
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          }

          const {
            tx,
            journal,
            isCorrection,
            verNr,
            isNeutralized,
            isImported,
            isOpeningBalance,
            isVatClosing,
            isVatV2,
            isVatSettlement,
            isTaxAccountMovement,
            isSystemManaged,
            offerGenericEdit,
            offerGenericCorrection,
            accountDef,
            isIncome,
            textClass,
            verClass,
            amountClass,
            badgeClass,
          } = displayItem.item

          return (
            <div
              key={tx.id}
              className={`rounded-[1.75rem] border p-5 shadow-sm transition-colors ${
                isCorrection
                  ? 'bg-amber-50/60 border-amber-100'
                  : isNeutralized
                  ? 'bg-gray-50 border-gray-100 opacity-70'
                : editingId === tx.id
                ? 'bg-amber-50/50 border-amber-200'
                : isVatV2
                ? 'bg-indigo-50/40 border-indigo-100'
                : isVatClosing
                ? 'bg-violet-50/45 border-violet-100'
                : isVatSettlement
                ? 'bg-sky-50/45 border-sky-100'
                : isTaxAccountMovement
                ? 'bg-cyan-50/45 border-cyan-100'
                : (isImported || isOpeningBalance)
                ? 'bg-sky-50/40 border-sky-100'
                  : 'bg-white border-gray-100'
              }`}
            >
              <div className="flex justify-between items-start gap-3 mb-3">
                <div>
                  <p className={`font-bold text-sm ${isCorrection ? 'text-amber-600' : isNeutralized ? 'text-gray-400' : 'text-gray-500'}`}>
                    {tx.date}
                  </p>
                  {verNr && (
                    <p className={`text-[10px] font-black italic ${verClass}`}>
                      VER-{verNr}
                    </p>
                  )}
                  {isImported && (
                    <p className="text-[9px] font-bold uppercase tracking-wide text-sky-400">
                      SIE {tx.source_ver_series}{tx.source_ver_number}
                    </p>
                  )}
                </div>

                {isVatClosing ? (
                  <p className="font-black text-[10px] uppercase tracking-wide text-violet-500 text-right">
                    Systembokning
                  </p>
                ) : isVatV2 ? (
                  <p className={`font-black text-lg text-right whitespace-nowrap ${amountClass}`}>
                    {Number(tx.amount || 0).toLocaleString('sv-SE')} kr
                  </p>
                ) : isVatSettlement ? (
                  <p className={`font-black text-lg text-right whitespace-nowrap ${amountClass}`}>
                    {Number(tx.amount || 0).toLocaleString('sv-SE')} kr
                  </p>
                ) : isTaxAccountMovement ? (
                  <p className={`font-black text-lg text-right whitespace-nowrap ${amountClass}`}>
                    {Number(tx.amount || 0).toLocaleString('sv-SE')} kr
                  </p>
                ) : (
                  <p className={`font-black text-lg text-right whitespace-nowrap ${amountClass}`}>
                    {!isCorrection && !isNeutralized && !isImported && !isOpeningBalance && (isIncome ? '+ ' : '- ')}
                    {Number(tx.amount || 0).toLocaleString('sv-SE')} kr
                  </p>
                )}
              </div>

              <div className="flex items-center flex-wrap gap-2 mb-1.5">
                {isCorrection ? (
                  <p className="text-[10px] font-black text-amber-600 uppercase">↩ Korrigering</p>
                ) : isNeutralized ? (
                  <p className="text-[10px] font-black text-gray-300 uppercase line-through">
                    {accountDef?.name || tx.type}
                  </p>
                ) : isOpeningBalance ? (
                  <p className="text-[10px] font-black text-sky-500 uppercase">Ingående balans</p>
                ) : isVatClosing ? (
                  <p className="text-[10px] font-black text-violet-600 uppercase">Momsavslut</p>
                ) : isVatV2 ? (
                  <p className="text-[10px] font-black text-indigo-600 uppercase">VAT V2 utlandsinköp</p>
                ) : isVatSettlement ? (
                  <p className="text-[10px] font-black text-sky-600 uppercase">Momsavräkning</p>
                ) : isTaxAccountMovement ? (
                  <p className="text-[10px] font-black text-cyan-600 uppercase">Skattekontorörelse</p>
                ) : isImported ? (
                  <p className="text-[10px] font-black text-sky-500 uppercase">Importerad verifikation</p>
                ) : (
                  <p className="text-[10px] font-black text-emerald-500 uppercase">
                    {accountDef?.name || tx.type}
                  </p>
                )}

                {!isCorrection && !isNeutralized && !isSystemManaged && (
                  <span className="text-[8px] font-black uppercase bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-md border border-gray-200">
                    Moms: {tx.vat_rate}%
                  </span>
                )}
              </div>

              <p className={`font-bold text-sm mb-2 ${
                isCorrection
                  ? 'text-amber-700 text-xs pl-3 border-l-2 border-amber-200'
                  : textClass
              }`}>
                {isCorrection ? tx.description.replace('↩ ', '') : tx.description}
              </p>

              {isCorrection && tx.corrects_ver_nr != null && (
                <p className="text-[9px] text-amber-500/80 font-bold mb-2 pl-3">
                  Rättar VER-{tx.corrects_ver_nr}
                </p>
              )}

              {tx.file_url && !isNeutralized && !isVatClosing && (
                <button
                  onClick={() => handleOpenAttachment(tx.file_url)}
                  className="text-emerald-400 text-xs mb-2 inline-block hover:text-emerald-600 transition-colors cursor-pointer"
                >
                  📎 Visa bilaga
                </button>
              )}

              <div className="flex flex-wrap gap-1.5 mb-3">
                {journal.map((e: any) => {
                  const isDebit = Number(e.debit) > 0
                  return (
                    <span
                      key={e.id}
                      className={`inline-flex items-center gap-0.5 border rounded-lg px-2 py-1 font-mono text-[10px] font-bold ${badgeClass}`}
                    >
                      {e.account_number}
                      <span className={
                        isNeutralized
                          ? 'text-gray-300'
                          : isDebit
                          ? 'text-emerald-500'
                          : 'text-orange-400'
                      }>
                        {isDebit ? ' D' : ' K'}
                      </span>
                    </span>
                  )
                })}
              </div>

              {!isCorrection && !isNeutralized && (offerGenericEdit || offerGenericCorrection) && !isYearLocked && (
                <div className="flex gap-2 pt-3 border-t border-gray-100">
                  {offerGenericEdit && (
                    <button
                      onClick={() => onEdit(tx)}
                      className="flex-1 h-10 rounded-xl bg-gray-50 text-gray-500 hover:bg-emerald-50 hover:text-emerald-600 font-black text-[10px] uppercase tracking-wide transition-colors"
                    >
                      ✎ {tx.booked ? "Hantera bilaga" : "Redigera"}
                    </button>
                  )}
                  {offerGenericCorrection && (
                    <button
                      onClick={() => onDelete(tx)}
                      className="flex-1 h-10 rounded-xl bg-gray-50 text-gray-500 hover:bg-red-50 hover:text-red-500 font-black text-[10px] uppercase tracking-wide transition-colors"
                    >
                      ✕ Korrigera
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {displayItems.length > visibleCount && (
        <div className="flex justify-center pt-6 pb-2">
          <button
            onClick={() => setVisibleCount(prev => prev + 50)}
            className="px-8 h-11 rounded-2xl bg-gray-50 hover:bg-gray-100 text-gray-500 font-black text-[10px] uppercase tracking-wider transition-colors border border-gray-100"
          >
            Visa fler ({displayItems.length - visibleCount} kvar)
          </button>
        </div>
      )}
    </>
  )
}
````````

==================================================

==================================================
FILE: src/hooks/useAuth.ts
==================================================

````typescript
'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type {
  DeductionEntitlement,
  DomesticSalesVatTreatment,
  ForeignPurchaseReporting,
} from '@/lib/vatDomain'

export type AuthProfile = {
  subscription_type: string
  subscription_end: string | null
  company_name: string | null
  org_nr: string | null
  vat_status: 'registered' | 'not_registered' | 'unknown'
  vat_period_type: 'month' | 'quarter' | 'year' | null
  vat_management_from: string | null
  domestic_sales_vat_treatment: DomesticSalesVatTreatment
  foreign_purchase_reporting: ForeignPurchaseReporting
  default_deduction_entitlement: Exclude<DeductionEntitlement, 'partial'>
  role?: string
  email?: string
} | null

export type AuthCredentials = {
  email: string
  password: string
  isRegistering: boolean
}

export type AuthNotice = { type: 'error' | 'success'; text: string } | null

// Supabase-felmeddelanden kommer på engelska rakt av — vi översätter
// de vanligaste till svenska för en snyggare upplevelse. Okända
// meddelanden visas oöversatta som fallback (bättre än att tappa info).
function translateAuthError(message: string): string {
  const map: Record<string, string> = {
    'Invalid login credentials': 'Fel e-postadress eller lösenord.',
    'User already registered': 'Det finns redan ett konto med den e-postadressen.',
    'Email not confirmed': 'Du behöver bekräfta din e-postadress innan du kan logga in.',
    'Password should be at least 6 characters': 'Lösenordet måste vara minst 6 tecken.',
  }
  return map[message] || message
}

// Hämtar profilen med en timeout. Används både för det initiala,
// snabba försöket och för det bakgrundsförsök som görs om det första
// tar för lång tid.
async function fetchProfileWithTimeout(userId: string, timeoutMs: number) {
  const { data } = await Promise.race([
    supabase
      .from('profiles')
      .select('subscription_type, subscription_end, company_name, org_nr, vat_status, vat_period_type, vat_management_from, domestic_sales_vat_treatment, foreign_purchase_reporting, default_deduction_entitlement, role, email')
      .eq('id', userId)
      .maybeSingle(),
    new Promise<any>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), timeoutMs)
    )
  ]) as any
  return data
}

export function useAuth() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<AuthProfile>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [profileError, setProfileError] = useState(false)
  const [authNotice, setAuthNotice] = useState<AuthNotice>(null)
  const [passwordRecoveryMode, setPasswordRecoveryMode] = useState(false)

  useEffect(() => {
    let isMounted = true
    let hasTriggered = false

    const fallbackTimer = setTimeout(() => {
      if (isMounted && !hasTriggered) {
        setAuthLoading(false)
      }
    }, 2000)

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!isMounted) return
        hasTriggered = true
        clearTimeout(fallbackTimer)

        // Supabase skickar detta event specifikt när sessionen kommer
        // från en klickad återställningslänk. Vi flaggar det så att
        // page.tsx kan visa en "Sätt nytt lösenord"-skärm direkt,
        // istället för att tyst släppa in användaren i vanliga appen.
        if (_event === 'PASSWORD_RECOVERY') {
          setPasswordRecoveryMode(true)
        }

        const currentUser = session?.user ?? null
        setUser((prev: any) => prev?.id === currentUser?.id ? prev : currentUser)

        if (currentUser) {
          setProfileError(false)
          const applyProfile = (data: AuthProfile) => {
            if (!isMounted) return
            setProfile((prev: AuthProfile) =>
              JSON.stringify(prev) === JSON.stringify(data) ? prev : data
            )
          }

          try {
            // Snabbt första försök — hinner det inte inom 3s går vi vidare
            // och gör ett bakgrundsförsök med mer tålamod (istället för
            // att blockera sidan längre än nödvändigt).
            const data = await fetchProfileWithTimeout(currentUser.id, 3000)
            applyProfile(data)
          } catch (err) {
            fetchProfileWithTimeout(currentUser.id, 8000)
              .then(applyProfile)
              .catch((bgErr) => {
                // Båda försöken misslyckades. Vi GISSAR INTE på en
                // prenumerationsstatus (kan felaktigt visa en betalande
                // kund som gratisanvändare) — istället visar UI:t ett
                // tydligt felläge med möjlighet att försöka igen.
                console.error('Fel vid profilhämtning:', bgErr)
                if (isMounted) setProfileError(true)
              })
          }
        } else {
          setProfile(null)
        }

        if (isMounted) setAuthLoading(false)
      }
    )

    return () => {
      isMounted = false
      hasTriggered = true
      clearTimeout(fallbackTimer)
      subscription.unsubscribe()
    }
  }, [])

  const handleAuth = useCallback(async (e: React.FormEvent, credentials: AuthCredentials) => {
    e.preventDefault()
    setAuthLoading(true)
    setAuthNotice(null)
    try {
      if (credentials.isRegistering) {
        const { error } = await supabase.auth.signUp({
          email: credentials.email,
          password: credentials.password,
        })
        if (error) throw error
        setAuthNotice({ type: 'success', text: 'Konto skapat! Du loggas nu in.' })
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: credentials.email,
          password: credentials.password,
        })
        if (error) throw error
      }
    } catch (err: any) {
      setAuthNotice({ type: 'error', text: translateAuthError(err.message) })
    } finally {
      setAuthLoading(false)
    }
  }, [])

  // Skickar ett återställningsmail. Länken i mailet loggar in användaren
  // med en tillfällig "recovery"-session — de landar då i appen redan
  // inloggade och kan sätta ett nytt lösenord via Profil → Byt lösenord.
  const resetPassword = useCallback(async (email: string) => {
    setAuthNotice(null)
    if (!email) {
      setAuthNotice({ type: 'error', text: 'Fyll i din e-postadress för att återställa lösenordet.' })
      return
    }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
      })
      if (error) throw error
      setAuthNotice({
        type: 'success',
        text: 'Vi har skickat en återställningslänk. Kolla din inkorg (och skräpposten).',
      })
    } catch (err: any) {
      setAuthNotice({ type: 'error', text: translateAuthError(err.message) })
    }
  }, [])

  // Sätter ett nytt lösenord för den inloggade användaren (används i
  // Profilinställningar). Kräver ingen kännedom om det gamla lösenordet
  // eftersom Supabase redan vet att sessionen är autentiserad.
  const updatePassword = useCallback(async (newPassword: string) => {
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      return { success: true as const }
    } catch (err: any) {
      return { success: false as const, error: translateAuthError(err.message) }
    }
  }, [])

  const dismissAuthNotice = useCallback(() => setAuthNotice(null), [])
  const exitPasswordRecoveryMode = useCallback(() => setPasswordRecoveryMode(false), [])

  const handleLogout = useCallback(async () => {
    try {
      localStorage.removeItem('taxRate')
      await supabase.auth.signOut()
    } catch (err) {
      console.error('Utloggning misslyckades:', err)
    } finally {
      setUser(null)
      setProfile(null)
      window.location.reload()
    }
  }, [])

  const retryProfile = useCallback(async () => {
    if (!user?.id) return
    setProfileError(false)
    try {
      const data = await fetchProfileWithTimeout(user.id, 5000)
      setProfile((prev: AuthProfile) =>
        JSON.stringify(prev) === JSON.stringify(data) ? prev : data
      )
    } catch (err) {
      console.error('Fel vid profilhämtning (manuellt försök):', err)
      setProfileError(true)
    }
  }, [user])

  const updateProfile = useCallback((updated: AuthProfile) => {
    setProfile(updated)
  }, [])

  return {
    user,
    profile,
    authLoading,
    profileError,
    retryProfile,
    authNotice,
    dismissAuthNotice,
    resetPassword,
    updatePassword,
    passwordRecoveryMode,
    exitPasswordRecoveryMode,
    handleAuth,
    handleLogout,
    setProfile: updateProfile,
  }
}
````````

==================================================

==================================================
FILE: src/hooks/useAccountingData.ts
==================================================

````typescript
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { getAccountBalances, getBalanceSheetBalances, getNEData, isYearClosed, getMomsBreakdown } from '@/lib/accountingService'
import { setupDefaultAccounts } from '@/lib/setupDefaultAccounts'

// Sorterar transaktioner: nyaste datum överst, och vid samma datum
// nyaste ver_nr överst (annars saknas sekundärsortering helt och
// Supabase/Postgres returnerar likadana datum i en godtycklig — och
// därför skenbart "slumpad" — ordning).
function sortTransactionsByDateAndVer(transactions: any[], jMap: any) {
  return [...transactions].sort((a, b) => {
    const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime()
    if (dateDiff !== 0) return dateDiff
    const verA = jMap[a.id]?.[0]?.ver_nr ?? 0
    const verB = jMap[b.id]?.[0]?.ver_nr ?? 0
    return verB - verA
  })
}

export type AccountingRefreshResult =
  | { ok: true }
  | { ok: false; reason: 'error' | 'stale_year'; error?: unknown }

// Äger laddning av: transactions, balances, neData, journalMap, kontoplan, isYearLocked.
export function useAccountingData(user: any, selectedYear: number, subscriptionType: string | undefined) {
  const [dataLoading, setDataLoading] = useState(false)
  const [isYearLocked, setIsYearLocked] = useState(false)
  const [transactions, setTransactions] = useState<any[]>([])
  const [balances, setBalances] = useState<any>({})
  const [balanceSheetBalances, setBalanceSheetBalances] = useState<any>({})
  const [neData, setNeData] = useState<any>(null)
  const [journalMap, setJournalMap] = useState<any>({})
  const [kontoplan, setKontoplan] = useState<any[]>([])
  const [momsBreakdown, setMomsBreakdown] = useState({ utgaendeMoms: 0, ingaendeMoms: 0, momsNetto: 0 })

  // Håller alltid det SENAST valda året, oavsett hur gammal closure ett
  // pågående async-anrop (load() eller refreshData()) bär med sig. Sätts
  // vid varje render - en vanlig variabel/closure hade istället frusit
  // vid det ögonblick funktionen skapades, vilket är precis det som
  // orsakade stale-data-buggen (år 2028:s svar skrev över 2027:s state).
  const latestYearRef = useRef(selectedYear)
  latestYearRef.current = selectedYear

  async function loadKontoplanOptionsInternal(): Promise<AccountingRefreshResult> {
    try {
      const { data, error } = await supabase
        .from('accounts')
        .select('id, name, default_vat_rate, credit_account')
        .eq('user_id', user.id)
        .order('name')
      if (error) throw error
      if (data) {
        const sorted = [...data].sort((a, b) => {
          // Intäktskonton (kredit på 3xxx) alltid överst
          const aIsIncome = a.credit_account?.startsWith('3')
          const bIsIncome = b.credit_account?.startsWith('3')
          if (aIsIncome && !bIsIncome) return -1
          if (!aIsIncome && bIsIncome) return 1
          // Ingående balans och z-konton alltid nederst
          const aIsZ = a.id === 'ingående_balans' || a.id.toLowerCase().startsWith('z')
          const bIsZ = b.id === 'ingående_balans' || b.id.toLowerCase().startsWith('z')
          if (aIsZ && !bIsZ) return 1
          if (!aIsZ && bIsZ) return -1
          return a.name.localeCompare(b.name, 'sv')
        })
        setKontoplan(sorted)
      }
      return { ok: true }
    } catch (err) {
      console.error('Fel vid laddning av kontoplan:', err)
      return { ok: false, reason: 'error', error: err }
    }
  }

  async function loadKontoplanOptions() {
    await loadKontoplanOptionsInternal()
  }

  async function refreshDataInternal(): Promise<AccountingRefreshResult> {
    // Vilket år detta anrop startades för - jämförs mot latestYearRef.current
    // strax innan vi skriver till state, så ett gammalt anrop (t.ex. för
    // 2028) aldrig kan skriva över nyare state efter att användaren redan
    // bytt till ett annat år (t.ex. 2027).
    const startedYear = selectedYear
    try {
      const startDate = `${selectedYear}-01-01`
      const endDate = `${selectedYear}-12-31`
      const [txData, balanceData, balanceSheetData, neRes, momsRes] = await Promise.all([
        supabase.from('transactions').select('*')
          .eq('user_id', user.id)
          .gte('date', startDate).lte('date', endDate)
          .order('date', { ascending: false }),
        getAccountBalances(selectedYear),
        getBalanceSheetBalances(selectedYear),
        getNEData(selectedYear),
        getMomsBreakdown(startDate, endDate)
      ])
      if (txData.error) throw txData.error
      const txIds = txData.data?.map((t: any) => t.id) || []
      let jMap: any = {}
      if (txIds.length > 0) {
        const { data: yearJournal, error: jError } = await supabase
          .from('journal_entries').select('*').in('transaction_id', txIds).eq('user_id', user.id)
        if (jError) throw jError
        yearJournal?.forEach((row: any) => {
          if (!jMap[row.transaction_id]) jMap[row.transaction_id] = []
          jMap[row.transaction_id].push(row)
        })
      }

      // Skriv bara till state om det året vi hämtade för fortfarande är
      // det aktuella valda året.
      if (startedYear !== latestYearRef.current) {
        return { ok: false, reason: 'stale_year' }
      }

      setTransactions(sortTransactionsByDateAndVer(txData.data || [], jMap))
      setBalances(balanceData || {})
      setBalanceSheetBalances(balanceSheetData || {})
      setJournalMap(jMap)
      setNeData(neRes)
      setMomsBreakdown(momsRes || { utgaendeMoms: 0, ingaendeMoms: 0, momsNetto: 0 })

      // Uppdaterar även kontoplanen globalt vid refresh
      const kontoplanResult = await loadKontoplanOptionsInternal()
      if (!kontoplanResult.ok) return kontoplanResult

      return { ok: true }
    } catch (err) {
      console.error('Fel vid laddning av data:', err)
      return { ok: false, reason: 'error', error: err }
    }
  }

  async function refreshData() {
    await refreshDataInternal()
  }

  async function refreshDataWithStatus() {
    return refreshDataInternal()
  }

  // Ladda data när user eller år ändras
  useEffect(() => {
    if (!user) return
    let cancelled = false
    setDataLoading(true)

    async function load() {
      if (!user?.id) return
      // Samma princip som i refreshData(): vilket år detta load()-anrop
      // startades för. Läggs till utöver det befintliga cancelled-skyddet
      // nedan, inte istället för det.
      const startedYear = selectedYear
      try {
        const { data, error } = await supabase
          .from('accounts')
          .select('id')
          .eq('user_id', user.id)
          .limit(1)

        if (error) throw error

        if (!data || data.length === 0) {
          await setupDefaultAccounts(user.id)
        }

        if (cancelled) return

        const startDate = `${selectedYear}-01-01`
        const endDate   = `${selectedYear}-12-31`

        const [txData, balanceData, balanceSheetData, neRes, momsRes] = await Promise.all([
          supabase.from('transactions').select('*')
            .eq('user_id', user.id)
            .gte('date', startDate).lte('date', endDate)
            .order('date', { ascending: false }),
          getAccountBalances(selectedYear),
          getBalanceSheetBalances(selectedYear),
          getNEData(selectedYear),
          getMomsBreakdown(startDate, endDate)
        ])

        if (cancelled) return

        if (txData.error) throw txData.error

        const txIds = txData.data?.map((t: any) => t.id) || []
        let jMap: any = {}

        if (txIds.length > 0) {
          const { data: yearJournal, error: jError } = await supabase
            .from('journal_entries').select('*').in('transaction_id', txIds).eq('user_id', user.id)
          if (jError) throw jError
          yearJournal?.forEach((row: any) => {
            if (!jMap[row.transaction_id]) jMap[row.transaction_id] = []
            jMap[row.transaction_id].push(row)
          })
        }

        if (cancelled) return

        // Extra lager utöver cancelled: skriv bara om det här fortfarande
        // är det senast valda året.
        if (startedYear !== latestYearRef.current) return

        setTransactions(sortTransactionsByDateAndVer(txData.data || [], jMap))
        setBalances(balanceData || {})
        setBalanceSheetBalances(balanceSheetData || {})
        setJournalMap(jMap)
        setNeData(neRes)
        setMomsBreakdown(momsRes || { utgaendeMoms: 0, ingaendeMoms: 0, momsNetto: 0 })
        loadKontoplanOptions()
      } catch (err) {
        if (!cancelled) console.error('Fel vid laddning av data:', err)
      } finally {
        // Alltid av loading – annars fryser sidan
        setDataLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [user, selectedYear, subscriptionType])

  // Kontrollera om räkenskapsåret är låst
  useEffect(() => {
    async function checkYearLock() {
      if (!user) return
      try {
        const locked = await isYearClosed(selectedYear)
        setIsYearLocked(locked)
      } catch (err) {
        console.error(err)
        setIsYearLocked(false)
      }
    }
    checkYearLock()
  }, [selectedYear, user])

  return {
    transactions,
    balances,
    balanceSheetBalances,
    neData,
    journalMap,
    kontoplan,
    dataLoading,
    isYearLocked, setIsYearLocked,
    refreshData,
    refreshDataWithStatus,
    loadKontoplanOptions,
    momsBreakdown,
  }
}
````````

==================================================

