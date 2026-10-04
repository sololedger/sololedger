# SoloLedger Project State

Last updated: 2026-10-04

## Current Baseline

- Repository: `C:\Users\Familjedator\Desktop\Sololedger Multi User App\sololedger_multi_user`
- Branch: `main`
- Remote: `https://github.com/sololedger/sololedger.git`
- `origin/main`: `db93f2d` (`KAN-37 fix payment account loading race`).
- Current local checkout contains the KAN-38 checkpoint work and must remain
  unpushed until Pontus/leader chat explicitly approves the production risk.
- Production path: GitHub `sololedger/sololedger` `main` -> Vercel team
  `sololedger1`, project `sololedger`, domain `https://sololedger.vercel.app`.
- Push to `main` auto-deploys Vercel Production. Treat any future push to
  `main` as a production deploy requiring explicit approval for that risk.
- This checkout has no `.vercel/project.json`; do not use manual Vercel CLI
  deployment without re-verifying team/project context and explicit approval.

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
- Live Supabase migration head documented/verified from audit closeout:
  `20261001120000`.
- Established Supabase CLI entry point: `npx --yes supabase@latest`.
- `supabase/.temp/` may exist as generated Supabase CLI state only. Do not
  read/display secrets and do not add this directory to Git.

## Jira Status Snapshot

Verified from Jira on 2026-10-04:

- Done: KAN-3, KAN-13, KAN-21, KAN-29, KAN-30, KAN-31, KAN-32, KAN-33,
  KAN-37.
- In Review: KAN-38, assigned to Pontus for review/final testing.
- To Do: KAN-9, KAN-10, KAN-11, KAN-14, KAN-22, KAN-23, KAN-24, KAN-25,
  KAN-34, KAN-35, KAN-36.
- KAN-29-KAN-33 are External Audit #1 completion work and are Done.
- KAN-37 is completed/pushed/deployed/IRL-verified by Pontus.
- KAN-36 is future inventory/depreciation product work.
- KAN-38 implementation is locally verified and waiting for Pontus/leader
  approval before any live Supabase migration or push/deploy.

## Product Acceptance Direction

- Primary acceptance path remains a real small Swedish enskild firma without
  employees. When facts are missing, SoloLedger asks, blocks, or explains; it
  must not guess.
- Parked real Adobe EU-service scenario remains blocked from live data changes
  until the Skatteverket/Adobe outcome is known.

## Current Active Work

- KAN-38 local implementation is complete and not live-applied.
- Scope completed: new migration replaces only
  `public.book_vat_v2_eu_service_reverse_charge_atomic(jsonb)` so new VAT V2
  EU-service bookings send `payment_account_role` and the RPC resolves the
  current account from `company_payment_account_roles` for `auth.uid()`.
- New bookings reject client-supplied `payment_account_number`; successful
  idempotency replay remains before mutable Profile/account/year/VAT guards.
- Audit/idempotency result now records both `paymentAccountRole` and the
  server-resolved `paymentAccountNumber` for the booking-time configuration.
- Existing successful legacy idempotency rows remain replayable with the old
  account-number payload, and old local browser idempotency state is normalized
  to payment role for stable replay after refresh.
- No live Supabase migration/write, deploy, push, or real user-data change has
  been performed for KAN-38.
- Verification completed locally: rollback SQL regression on
  `sololedger_kan17c_test`, VAT V2 runtime test, `npm run typecheck`,
  `npm run test:domain`, targeted ESLint for touched non-`page.tsx` files,
  `npm run build` with approved network access for Google Fonts, and
  `git diff --check`.
- Known non-blocker: including `src/app/page.tsx` in a broader targeted lint
  still exposes older unrelated `page.tsx` debt already tracked under KAN-24 /
  KAN-25.

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

## Git / Local Files

- KAN-38 checkpoint files: `PROJECT_STATE.md`, `PROJECT_ARCHIVE.md`,
  `scripts/test-vat-runtime-booking.ts`, `src/app/page.tsx`,
  `src/lib/accountingService.ts`, `src/lib/vatRuntimeBooking.ts`,
  `supabase/migrations/20261004152057_kan38_vat_v2_payment_role_enforcement.sql`,
  and `supabase/tests/kan38_vat_v2_payment_role_enforcement_candidate.sql`.
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

1. Pontus/leader chat reviews KAN-38 and decides whether to approve live
   Supabase migration application.
2. If approved, apply the KAN-38 migration through the official Supabase CLI
   flow that preserves the repo migration version, then verify the live
   function definition, grants, and exact migration version.
3. Push to `main` only after separate explicit approval, because it triggers
   Vercel Production deploy.
4. Keep KAN-38 out of `Done` until Pontus final testing is complete.
