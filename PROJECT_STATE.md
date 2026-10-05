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
- Live Supabase migration head documented/verified after KAN-38:
  `20261004152057`.
- Established Supabase CLI entry point: `npx --yes supabase@latest`.
- `supabase/.temp/` may exist as generated Supabase CLI state only. Do not
  read/display secrets and do not add this directory to Git.

## Jira Status Snapshot

Verified from Jira on 2026-10-05:

- Done: KAN-3, KAN-13, KAN-21, KAN-29, KAN-30, KAN-31, KAN-32, KAN-33,
  KAN-37, KAN-38, KAN-39.
- In Review: KAN-40.
- To Do: KAN-9, KAN-10, KAN-11, KAN-14, KAN-22, KAN-23, KAN-24, KAN-25,
  KAN-34, KAN-35, KAN-36, KAN-41.
- KAN-29-KAN-33 are External Audit #1 completion work and are Done.
- KAN-37 is completed/pushed/deployed/IRL-verified by Pontus.
- KAN-36 is future inventory/depreciation product work.
- KAN-38 is completed, live-migrated, Production-deployed, and IRL-accepted by
  Pontus on a separate test account.
- KAN-39 is completed, pushed, Production-deployed, smoke-tested, and Done.

## Product Acceptance Direction

- Primary acceptance path remains a real small Swedish enskild firma without
  employees. When facts are missing, SoloLedger asks, blocks, or explains; it
  must not guess.
- Parked real Adobe EU-service scenario remains blocked from live data changes
  until the Skatteverket/Adobe outcome is known.

## Current Active Work

- KAN-40 implementation and Codex verification are complete locally. Awaiting
  Pontus IRL testing before any push/deploy decision.
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

## Next Safe Step

1. Pontus IRL-tests KAN-40: create or use a safe test year where 1930 goes
   negative, open NE/förenklat årsbokslut, verify that SoloLedger warns about
   unclassified negative kassa/bank instead of silently balancing it as a debt.
2. Also verify a normal positive bank scenario still balances in NE, and a
   real credit/debt account such as 2330 appears in B13.
3. Do not push `main` without explicit approval because it deploys Production.
