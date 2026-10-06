# SoloLedger Project State

Last updated: 2026-10-06

## Current Baseline

- Repository: `C:\Users\Familjedator\Desktop\Sololedger Multi User App\sololedger_multi_user`
- Branch: `main`
- Remote: `https://github.com/sololedger/sololedger.git`
- Origin/Production `main`: `28868fa`
  (`docs: record KAN-14 production DB gate`).
- Production is verified on `28868fa` after the accumulated KAN-46 + KAN-14
  rollout. Vercel deployment
  `dpl_EK2hQxEMwMXNsAirgGnHtgNbXVQA`
  (`sololedger-hxq6vopry-sololedger1.vercel.app`) is `Ready` and aliased to
  `https://sololedger.vercel.app`.
- Production path: GitHub `sololedger/sololedger` `main` -> Vercel team
  `sololedger1`, project `sololedger`, domain `https://sololedger.vercel.app`.
- Push to `main` auto-deploys Vercel Production. Treat any future push to
  `main` as a production deploy requiring explicit approval for that risk.

## Vercel Fast Path

- Team: `sololedger1`; project: `sololedger`; Production alias:
  `sololedger.vercel.app`.
- After an approved push, normal deploy verification should not rediscover
  team/project. Verify only that:
  1. `origin/main` equals the exact approved commit,
  2. the corresponding Production deployment is `Ready`,
  3. `sololedger.vercel.app` points/responds on that deployment.
- Read build/runtime logs or do broader Vercel diagnostics only if deployment
  fails or Production behaves unexpectedly.

## Durable Truth

- `AGENTS.md` is the permanent rulebook.
- `PROJECT_STATE.md` is the current handoff/checkpoint.
- `PROJECT_ARCHIVE.md` holds compact completed history/evidence.
- `Architecture.md` is the current technical map.
- Jira is the work queue/status/backlog, not source of truth for code or DB.
- Chat history is not sufficient project truth for a new session.

## External Connections

- Jira cloud ID: `42c6216d-73c5-4777-a644-c41ef9bc6a1a`
- Jira project: `KAN` / `Sololedger`, project ID `10001`
- Supabase production project ref: `wbaxmuvudpnkvuliicuy`
- Supabase staging/E2E project ref: `fzxqiqenqjzhlyxxpvhg`
  (`sololedger-staging`). It is isolated from Production and contains schema
  from the repo migration chain only; no Production data was copied.
- Future work packages should reuse these verified refs/configs and avoid
  Supabase/Vercel listing or Playwright-auth rediscovery unless something
  indicates the stored information is stale.
- Live Supabase Production migration head documented/verified after the KAN-14
  Production DB-only step: `20261006120000`. The Production frontend is now
  deployed from Git commit `28868fa`.
- Supabase staging/E2E migration head verified after KAN-46 Block 3B:
  `20261005213000`.
- Established Supabase CLI entry point: `npx --yes supabase@latest`.
- `supabase/.temp/` may exist as generated Supabase CLI state only. Do not
  read/display secrets and do not add this directory to Git.

## Jira Status Snapshot

Verified from Jira on 2026-10-05:

- Done: KAN-3, KAN-13, KAN-21, KAN-29, KAN-30, KAN-31, KAN-32, KAN-33,
  KAN-37, KAN-38, KAN-39, KAN-40, KAN-42, KAN-43, KAN-45.
- In Review: KAN-14, KAN-46.
- To Do: KAN-9, KAN-10, KAN-11, KAN-22, KAN-23, KAN-24, KAN-25,
  KAN-34, KAN-35, KAN-36, KAN-41.
- KAN-29-KAN-33 are External Audit #1 completion work and are Done.
- KAN-37 is completed/pushed/deployed/IRL-verified by Pontus.
- KAN-36 is future inventory/depreciation product work.
- KAN-38 is completed, live-migrated, Production-deployed, and IRL-accepted by
  Pontus on a separate test account.
- KAN-39 is completed, pushed, Production-deployed, smoke-tested, and Done.
- KAN-40, KAN-42, KAN-43, and KAN-45 are completed, Production-rolled out,
  smoke-verified, and Done in Jira.

## Product Acceptance Direction

- Primary acceptance path remains a real small Swedish enskild firma without
  employees. When facts are missing, SoloLedger asks, blocks, or explains; it
  must not guess.
- Parked real Adobe EU-service scenario remains blocked from live data changes
  until the Skatteverket/Adobe outcome is known.

## Current Active Work

- KAN-46 Block 1 is implemented, staging-migrated, Codex-verified, and in
  Jira `In Review` assigned to Pontus. It adds external customer invoice facts,
  invoice booking links, RPCs for invoice registration/payment/year-end
  receivable/receivable settlement, a `close_year_atomic` unpaid-invoice guard,
  controlled `customer_invoice` transaction source handling, account 1510, and
  delete-user/admin parity. Production was not migrated, pushed, or deployed.
- KAN-46 Block 2 minimal UI is implemented, staging-E2E verified, and manually
  accepted by Pontus for the December invoice scenario.
- KAN-46 Block 3 product UX is implemented and staging-E2E verified. Bokföring
  no longer preselects a category; ordinary booking is blocked until a category
  is chosen. Selecting `Försäljning` explains direct paid sale vs customer
  invoice. A dedicated `Fakturor` tab handles customer invoice registration,
  mandatory PDF/image attachment upload, unpaid/paid status, separate
  bokslut-status, collective year-end inclusion, attachment opening, and later
  payment. The accounting engine still uses the Block 1 RPCs; no client-side
  accounting duplication was added.
- KAN-46 Block 3 manual acceptance polish is implemented locally and UI-E2E
  verified: user-facing date entry now uses Swedish `dd/mm/åååå`, year-end copy
  explains why unpaid 31/12 invoices must be included, invoice rows have an
  explicit `Visa detaljer` affordance, the summary metric says what remains
  before year end, and the UI no longer offers already-handled 2026 invoices as
  2027 year-end work.
- KAN-46 Block 3B corrective integrity work is implemented and staging-migrated.
  It fixes server-side invoice fiscal-year scoping, adds controlled
  `Ångra registrerad betalning`, and adds `Redigera faktura` only for unpaid
  invoices with no `customer_invoice_bookings`. Original customer-invoice
  accounting history remains append-only: undo creates a traceable correction
  booking and never deletes/replaces the original payment or legitimate 31/12
  receivable. Server-side editing rejects any invoice that has already created
  accounting. The 2027 two-invoice root cause was real year-scope behavior:
  older 2026 unpaid E2E invoices with existing 2026 receivable bookings were
  incorrectly considered for 2027 because backend guards previously only checked
  "unpaid up to selected 31/12" plus selected-year booking absence.
- KAN-46 final UI polish after manual Block 3B acceptance is implemented
  locally. It restores a calendar/date-picker affordance while keeping Swedish
  `dd/mm/åååå` visible date entry, makes expanded invoice rows visually grouped,
  and replaces the native browser confirm for payment undo with an in-app
  Swedish confirmation dialog. No accounting RPC, schema, migration, or backend
  logic was changed in this polish pass. Future TransactionTable search/filter
  work was split out to Jira `KAN-47`.
- KAN-46 Production DB-only release step is complete: the four approved,
  staging-verified migrations `20261005193000`, `20261005203000`,
  `20261005210000`, and `20261005213000` were applied to Supabase Production
  `wbaxmuvudpnkvuliicuy` and verified read-only. The accumulated KAN-46 +
  KAN-14 frontend was later pushed to GitHub `main` and deployed to Vercel
  Production on commit `28868fa`; Pontus final acceptance remains pending.
- KAN-14 minimal Jessika VAT profile support is implemented locally,
  migrated to Supabase staging, and DB-migrated to Supabase Production only.
  UI direct-sale VAT now uses
  `domestic_sales_vat_treatment` instead of assuming that VAT registration means
  taxable Swedish sales. The direct-sale guard now covers ordinary manual
  domestic income categories by existing 3xxx credit-account taxonomy rather
  than only exact category id `forsaljning`, while excluding non-manual
  correction/import/customer-invoice/system sources. Customer invoice VAT
  defaults can safely preselect exempt when the profile says Swedish sales are
  exempt. VAT V2 EU-service
  reverse charge now supports `default_deduction_entitlement = none`: field 21
  base and field 30 output VAT are reported, field 48 remains 0/null, and no
  2645 input VAT is booked. The same local migration adds a DB trigger guard so
  ordinary Swedish direct sales fail closed when the domestic sales VAT profile
  is unknown/mixed and cannot bypass exempt-sales 0% VAT in client code. Local
  migration
  `20261006120000_kan14_vat_v2_no_deduction.sql` was applied to staging
  `fzxqiqenqjzhlyxxpvhg` and Production `wbaxmuvudpnkvuliicuy` after separate
  explicit approvals on 2026-10-06. Production head is verified as
  `20261006120000`. GitHub `main` was pushed to `28868fa` and Vercel deployed
  the accumulated KAN-46/KAN-14 frontend release.
- For KAN-46 customer invoices, full PDF generation, partial payments, credit
  invoices, foreign customers, EU/omvänd moms, and Adobe/VAT V2 remain out of
  scope.
- KAN-40 implementation and Codex verification are complete and deployed to
  Production. Technical acceptance is PASS, including the 2330/B13 Playwright
  acceptance in staging.
- KAN-43 staging/E2E setup is accepted by leadership chat and checkpointed
  locally. Write-E2E uses `.env.e2e.local`, staging ref allowlist, and the
  dedicated Playwright user. `test:e2e:write` is staging-only and fail-closed
  before browser startup if config is missing, ambiguous, points at Production,
  or uses a non-E2E user. `test:e2e:smoke` remains read-only/non-destructive.
  `test:e2e:safety` verifies the guard, including explicit Production-ref
  denial.
- KAN-42 year-close integrity is implemented and deployed to Production.
  `close_year_atomic` preserves the open SoloLedger VAT period guard and also
  blocks year closing when cumulative NE balance does not balance or 19xx has
  unresolved negative cash/bank. UI disables `LÅS RÄKENSKAPSÅR` with a short
  explanation for those blockers. Production migration head includes
  `20261005105538_kan42_close_year_ne_guard`.
- KAN-45 UI/readability polish is implemented and deployed to Production. It only changes
  Bokföring presentation styles: clearer amount-input affordance, hidden number
  spinners, slightly stronger main-section borders, stronger secondary text and
  table headers, and clearer logged-in email. No accounting logic was changed.
- KAN-41 is a separate backlog bug for the VAT dashboard/momskort label/scope
  mismatch. Do not implement it as part of KAN-40.

## Known Non-Blockers / Debt

- Full repo lint still has older unrelated debt.
- KAN-24 and KAN-25 remain To Do for scoped `page.tsx` technical debt.
- KAN-36 remains future inventory/depreciation product work.
- KAN-34 remains future UX for completing VAT facts on ambiguous legacy/SIE
  rows.
- KAN-35 remains low-priority UI transaction-history completeness follow-up.
- FAQ copy around `Skattekonto (2012)` is identified as potentially confusing:
  it should eventually distinguish private tax/F-tax via 2012 from controlled
  VAT/tax-account lifecycle flows.
- General legacy default-upgrade policy is a future architecture/product topic,
  not implemented.
- KAN-41: Momskort/dashboard VAT breakdown excludes native VAT V2 transactions
  while labels can look like total 261x/264x VAT. Momsrapport VAT V2 behavior
  remains verified separately; this is a UX/product-scope follow-up.

## Git / Local Files

- Checkpoints through `28868fa` are pushed to GitHub `main` and deployed to
  Production.
- Local final release-state docs checkpoint may exist above `origin/main` after
  this handoff update. Do not push it unless Pontus explicitly wants another
  Production deploy from a docs-only commit.
- Supabase CLI local link was switched from Production ref
  `wbaxmuvudpnkvuliicuy` to staging ref `fzxqiqenqjzhlyxxpvhg` before applying
  the Block 3 staging-only bucket migration. `supabase/.temp/` remains
  generated/ignored state.
- Local git-ignored files hold staging E2E env/auth state; do not copy
  credentials into Git, Jira, `PROJECT_STATE.md`, `PROJECT_ARCHIVE.md`, or chat.
- The canonical External Audit #1 files `SOLOLEDGER_AUDIT_*.md` are tracked as
  an immutable historical snapshot.
- `KAN-32-IRL-legacy-reverse-charge.se` was externally archived and is no
  longer present in the repo worktree.
- `supabase/.temp/` remains generated local Supabase CLI state and is ignored.

## Local Test Environment

- Production-derived local PostgreSQL DB `sololedger_kan17c_test` remains the
  preferred safe DB/RPC regression environment when live data writes are not
  approved.
- KAN-46 candidate schema was applied to the isolated local PostgreSQL test DB
  during verification; KAN-46 fixture data was created inside a rollback test
  transaction and was not retained.
- PostgreSQL 17 client may exist at
  `C:\Program Files\PostgreSQL\17\bin\psql.exe`.
- Authorized local credential file for isolated local PostgreSQL verification:
  `C:\SoloLedger\LocalTest\pgpass.conf`.
- Never read/display/copy/hash pgpass contents; use it only through
  process/session-local `PGPASSFILE`.
- Hosted staging/E2E is now the approved target for browser write tests:
  local Next app -> `fzxqiqenqjzhlyxxpvhg` -> dedicated Playwright user.
  Local files `.env.e2e.local` and `tests/e2e/.auth/` are git-ignored.
  Production smoke after deploy should remain read-only/non-destructive.
- For manual local staging testing, start `npm run dev` with `.env.e2e.local`
  loaded and open `http://localhost:3000`. Do not use
  `http://127.0.0.1:3000` for manual browser testing because Next dev HMR can
  cross-origin block `/_next/webpack-hmr`.
- E2E fast path: run `npm run test:e2e:smoke` for read-only smoke,
  `npm run test:e2e:safety` for the fail-safe guard, and
  `npm run test:e2e:write -- <spec>` only for staging write tests.
- KAN-46 Block 2 verification on 2026-10-05:
  `npm run typecheck` passed; `npm run test:e2e:write --
  tests/e2e/kan46-staging-write.spec.ts` passed against hosted staging
  `fzxqiqenqjzhlyxxpvhg`. An earlier sandboxed E2E attempt failed before UI
  execution because local network access to staging Supabase was blocked.
- KAN-46 Block 3 verification on 2026-10-05:
  `npm run typecheck` passed; `npm run test:e2e:write --
  tests/e2e/kan46-staging-write.spec.ts` passed against hosted staging
  `fzxqiqenqjzhlyxxpvhg`. A first Block 3 E2E run exposed that staging lacked
  the documented private `attachments` bucket; migration
  `20261005203000_ensure_attachments_storage_bucket.sql` was applied to staging
  only and then the focused E2E passed. Production was not migrated.
- KAN-46 Block 3 manual acceptance fix verification on 2026-10-05:
  `npm run typecheck` passed; `npm run test:e2e:write --
  tests/e2e/kan46-staging-write.spec.ts` passed. An initial E2E attempt found
  an already-running dev server and was stopped; the immediate rerun passed.
  No full lint was run. Local server-side migration `20261005210000...` is not
  applied to staging yet.
- KAN-46 Block 3B verification on 2026-10-06:
  `20261005210000_fix_customer_invoice_year_end_scope.sql` and
  `20261005213000_allow_customer_invoice_controlled_reversal.sql` were applied
  to staging only after explicit approval. Staging head verified:
  `20261005213000`. `npm run typecheck` passed.
  `npm run test:e2e:write -- tests/e2e/kan46-staging-write.spec.ts` passed
  3/3. `npm run test:e2e:write -- tests/e2e/kan42-staging-write.spec.ts`
  passed 1/1. Full lint was not run.
- KAN-46 final UI polish verification on 2026-10-06:
  `npm run typecheck` passed. `npm run test:e2e:write --
  tests/e2e/kan46-staging-write.spec.ts` passed 3/3. The focused UI E2E
  covers Swedish date typing, native calendar input selection, invalid date
  rejection, the Swedish undo modal cancel/confirm flow, and the existing
  verified undo RPC path. Full lint was not run.
- KAN-14 local verification on 2026-10-06:
  `npm run typecheck` passed. Focused scripts passed:
  `node scripts/test-domestic-sales-vat-policy.ts`,
  `node scripts/test-account-category-ui.ts`,
  `node scripts/test-vat-treatment-decision.ts`,
  `node scripts/test-vat-transaction-preflight.ts`,
  `node scripts/test-vat-runtime-booking.ts`,
  `node scripts/test-vat-journal-plan.ts`,
  `node scripts/test-vat-audit-snapshot.ts`,
  `node scripts/test-vat-report-aggregation.ts`, and
  `node scripts/test-transaction-form-ui.ts`. The pre-staging blocker fix also
  reran `git diff --check`. No staging/Production migration, push, deploy,
  broad lint, or E2E was run for KAN-14.
- KAN-14 staging verification on 2026-10-06:
  staging ref `fzxqiqenqjzhlyxxpvhg` was verified at head `20261005213000`,
  then migration `20261006120000_kan14_vat_v2_no_deduction.sql` was applied;
  staging head verified afterward as `20261006120000`. Focused staging checks
  passed: `npm run test:e2e:write --
  tests/e2e/kan14-staging-write.spec.ts --project=chromium` passed 2/2,
  `npm run test:e2e:write -- tests/e2e/kan46-staging-write.spec.ts
  --project=chromium` passed the two backend/RPC tests and, after stopping a
  stale local Next dev server that caused a loading timeout, rerunning the UI
  test with `-g "handles customer invoice lifecycle through the UI"` passed
  1/1. `npm run typecheck` and `git diff --check` passed afterward. Production
  was not changed, GitHub was not pushed, and Vercel was not deployed.
- KAN-46 + KAN-14 Production frontend release on 2026-10-06:
  GitHub `main` was pushed to `28868fa`. Vercel Production deployment
  `dpl_EK2hQxEMwMXNsAirgGnHtgNbXVQA`
  (`sololedger-hxq6vopry-sololedger1.vercel.app`) built Git commit `28868fa`,
  reached `Ready`, and is aliased to `https://sololedger.vercel.app`.
  Non-destructive Production smoke passed:
  `npx playwright test tests/e2e/public-auth.spec.ts --project=chromium
  --reporter=list` against `https://sololedger.vercel.app` passed 2/2.
  Production backend objects for KAN-46/KAN-14 were verified read-only during
  the DB gates; no Production bookkeeping data was created.

## Next Safe Step

1. Pontus should perform final Production acceptance for KAN-46 and KAN-14.
2. Keep KAN-14 and KAN-46 in Jira `In Review` assigned to Pontus until final
   acceptance; Pontus decides when they move to Done.
3. Do not push `main` again without explicit approval because it deploys
   Production.
