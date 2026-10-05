# SoloLedger Project State

Last updated: 2026-10-05

## Current Baseline

- Repository: `C:\Users\Familjedator\Desktop\Sololedger Multi User App\sololedger_multi_user`
- Branch: `main`
- Remote: `https://github.com/sololedger/sololedger.git`
- Origin/Production `main`: `bb73964`
  (`KAN-39 clarify blocked VAT V2 submit feedback`).
- Local `main` is intentionally ahead of `origin/main` with unpushed local
  checkpoints:
  - `936b188` docs-only KAN-39 closeout.
  - KAN-40 local checkpoint for NE negative-bank handling.
  - `4047047` KAN-43 staging/E2E safeguards.
  - KAN-42 local checkpoint for authoritative year-close guards.
- Production is verified on `bb73964`.
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
- Live Supabase migration head documented/verified after KAN-38:
  `20261004152057`.
- Established Supabase CLI entry point: `npx --yes supabase@latest`.
- `supabase/.temp/` may exist as generated Supabase CLI state only. Do not
  read/display secrets and do not add this directory to Git.

## Jira Status Snapshot

Verified from Jira on 2026-10-05:

- Done: KAN-3, KAN-13, KAN-21, KAN-29, KAN-30, KAN-31, KAN-32, KAN-33,
  KAN-37, KAN-38, KAN-39, KAN-43.
- In Review: KAN-40, KAN-42.
- To Do: KAN-9, KAN-10, KAN-11, KAN-14, KAN-22, KAN-23, KAN-24, KAN-25,
  KAN-34, KAN-35, KAN-36, KAN-41.
- KAN-29-KAN-33 are External Audit #1 completion work and are Done.
- KAN-37 is completed/pushed/deployed/IRL-verified by Pontus.
- KAN-36 is future inventory/depreciation product work.
- KAN-38 is completed, live-migrated, Production-deployed, and IRL-accepted by
  Pontus on a separate test account.
- KAN-39 is completed, pushed, Production-deployed, smoke-tested, and Done.
- KAN-43 is completed, accepted by leadership chat, and Done in Jira.
- KAN-42 is implemented and Codex-verified, then moved to In Review and
  assigned to Pontus for final testing. Do not set Done before Pontus accepts.

## Product Acceptance Direction

- Primary acceptance path remains a real small Swedish enskild firma without
  employees. When facts are missing, SoloLedger asks, blocks, or explains; it
  must not guess.
- Parked real Adobe EU-service scenario remains blocked from live data changes
  until the Skatteverket/Adobe outcome is known.

## Current Active Work

- KAN-40 implementation and Codex verification are complete locally. Technical
  acceptance is PASS, including the 2330/B13 Playwright acceptance in staging.
- KAN-43 staging/E2E setup is accepted by leadership chat and checkpointed
  locally. Write-E2E uses `.env.e2e.local`, staging ref allowlist, and the
  dedicated Playwright user. `test:e2e:write` is staging-only and fail-closed
  before browser startup if config is missing, ambiguous, points at Production,
  or uses a non-E2E user. `test:e2e:smoke` remains read-only/non-destructive.
  `test:e2e:safety` verifies the guard, including explicit Production-ref
  denial.
- KAN-42 year-close integrity is implemented locally and applied/tested only on
  staging `fzxqiqenqjzhlyxxpvhg`. `close_year_atomic` now preserves the open
  SoloLedger VAT period guard and also blocks year closing when cumulative NE
  balance does not balance or 19xx has unresolved negative cash/bank. UI now
  disables `LÅS RÄKENSKAPSÅR` with a short explanation for those blockers.
  Staging migration head includes `20261005105538_kan42_close_year_ne_guard`;
  Production `wbaxmuvudpnkvuliicuy` has not received this migration.
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

- Working tree should be clean after the KAN-40 local checkpoint commit.
- KAN-38 code checkpoint `8740c4d` is pushed to `main` and deployed to
  Production.
- KAN-38 docs-only closeout checkpoint `64d1132` was formerly local above
  Production; it is now part of pushed `main`.
- KAN-39 checkpoints through `bb73964` are pushed to `main` and deployed to
  Production.
- KAN-39 docs-only closeout checkpoint `936b188` is local-only above
  Production.
- KAN-40 NE negative-bank checkpoint is local-only above Production. It changes
  NE balance calculation/UI and domain tests only; no Supabase write, deploy,
  push, or migration has been performed.
- KAN-43 staging/E2E files are local-only above Production. No push/deploy has
  been performed. Local git-ignored files hold staging E2E env/auth state; do
  not copy credentials into Git, Jira, `PROJECT_STATE.md`, or chat.
- KAN-42 files are local-only above Production: one Supabase migration, one
  NE UI guard change, and one staging write-E2E spec. The migration is applied
  to staging only. No Production migration, push, or deploy has been performed.
- The canonical External Audit #1 files `SOLOLEDGER_AUDIT_*.md` are tracked as
  an immutable historical snapshot.
- `KAN-32-IRL-legacy-reverse-charge.se` was externally archived and is no
  longer present in the repo worktree.
- `supabase/.temp/` remains generated local Supabase CLI state and is ignored.

## Local Test Environment

- Production-derived local PostgreSQL DB `sololedger_kan17c_test` remains the
  preferred safe DB/RPC regression environment when live data writes are not
  approved.
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
- E2E fast path: run `npm run test:e2e:smoke` for read-only smoke,
  `npm run test:e2e:safety` for the fail-safe guard, and
  `npm run test:e2e:write -- <spec>` only for staging write tests.

## Next Safe Step

1. Do not push `main` without explicit approval because it deploys Production.
2. KAN-42 next step is Pontus review/IRL testing. Production rollout requires
   explicit approval for the Production Supabase migration and push/deploy.
3. Next selected work package can reuse the verified staging/E2E fast path
   without rediscovery unless state appears stale.
