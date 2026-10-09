# SoloLedger Project State

Last updated: 2026-10-09

## Current Baseline

- Repository: `C:\Users\Familjedator\Desktop\Sololedger Multi User App\sololedger_multi_user`
- Branch: `main`
- Remote: `https://github.com/sololedger/sololedger.git`
- Git status at KAN-55 closeout start: `main` and `origin/main` both point to
  `f6696fa88f9ff730732ddc67e362fecf7ae68d68`; working tree was clean before
  this documentation update.
- Production is verified through the completed KAN-55 release.
- Current Production Vercel deployment for `https://sololedger.vercel.app`:
  `dpl_8LXPsmEk6gB9o37iS6JiNpFZUWSn`,
  `sololedger-p9ntxvjzl-sololedger1.vercel.app`, status `Ready`, built from
  `f6696fa`.
- Supabase Production ref: `wbaxmuvudpnkvuliicuy`; KAN-55 migration head
  `20261008175927` is live.
- Supabase staging/E2E ref: `fzxqiqenqjzhlyxxpvhg` (`sololedger-staging`).
- Push to GitHub `main` auto-deploys Vercel Production. Treat any future push
  to `main` as a production deploy requiring explicit approval.

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
- Supabase Production project ref: `wbaxmuvudpnkvuliicuy`
- Supabase staging/E2E project ref: `fzxqiqenqjzhlyxxpvhg`
  (`sololedger-staging`). It is isolated from Production and contains schema
  from the repo migration chain only; no Production data was copied.
- Established Supabase CLI entry point: `npx --yes supabase@latest`.
- Vercel fast path: team `sololedger1`, project `sololedger`, Production alias
  `sololedger.vercel.app`.
- `supabase/.temp/` may exist as generated Supabase CLI state only. Do not
  read/display secrets and do not add this directory to Git.

## Jira Status Snapshot

Verified on 2026-10-09 for KAN-55:

- KAN-55 is `Done`; Pontus performed the final Jira closure after manual
  Production acceptance.

Current open Jira work from read-only JQL on 2026-10-09:

- KAN-44 is `To Do` and assigned to Codex, but it is not active in this session.
- Other open `To Do` items include KAN-9, KAN-10, KAN-11, KAN-24, KAN-25,
  KAN-34, KAN-35, KAN-47, KAN-48, and KAN-53. Do not start them unless Pontus
  selects the work.
- KAN-53 covers future VAT V2 EU-goods support.
- KAN-47/KAN-48 remain future work and must not be started unless Pontus
  selects them.
- KAN-34 remains future UX for completing VAT facts on ambiguous legacy/SIE
  rows.
- KAN-35 remains low-priority UI transaction-history completeness follow-up.
- Historical Adobe invoices remain a separate unresolved correction task. Do
  not change them without a selected/approved work item.
- Future UI/UX consistency pass: consider aligning other Profile areas such as
  `Betalningskonton` with the newer Profile card language. This was explicitly
  out of scope for KAN-50.
- Full repo lint still has older unrelated debt.

## Current Active Work

- No Codex implementation task is currently active after KAN-55 closeout.
- KAN-55 is code-, DB-, release-, smoke-, owner-accepted, and closed in Jira.
- Do not start Adobe corrections, KAN-44, KAN-47, KAN-48, KAN-53, or any new
  Jira work unless Pontus explicitly starts that work.

## Completed Release

- KAN-55 is closed from the Codex/release side. Production release commit:
  `f6696fa88f9ff730732ddc67e362fecf7ae68d68`
  (`KAN-55 keep purchase VAT profile guidance visible`). Production Vercel is
  `Ready`; automated tests, read-only Production smoke, and Pontus manual
  Production acceptance passed.
- KAN-54 is closed: fixed-asset VAT deduction is constrained by the company
  deduction profile in both UI and server-side RPC guard.
- KAN-14, KAN-46, KAN-49, KAN-50, KAN-51, KAN-52, KAN-41, KAN-22, and KAN-23
  are closed with release evidence archived in `PROJECT_ARCHIVE.md`.
- Jessika Foto & Media's real Production profile represents: VAT registered,
  annual VAT reporting, SoloLedger VAT-period handling from `2026-06-02`,
  domestic sales small-business exempt, foreign-purchase VAT reporting
  required, and no normal input-VAT deduction.

## Git / Local Files

- Current documentation-only closeout changes should include only
  `PROJECT_STATE.md` and `PROJECT_ARCHIVE.md`.
- Local git-ignored files hold staging E2E env/auth state; do not copy
  credentials into Git, Jira, `PROJECT_STATE.md`, `PROJECT_ARCHIVE.md`, or chat.
- The canonical External Audit #1 files `SOLOLEDGER_AUDIT_*.md` are tracked as
  an immutable historical snapshot.

## Local Test Environment

- Production-derived local PostgreSQL DB `sololedger_kan17c_test` remains the
  preferred safe DB/RPC regression environment when live data writes are not
  approved.
- PostgreSQL 17 client may exist at
  `C:\Program Files\PostgreSQL\17\bin\psql.exe`.
- Authorized local credential file for isolated local PostgreSQL verification:
  `C:\SoloLedger\LocalTest\pgpass.conf`. Never read/display/copy/hash pgpass
  contents; use it only through process/session-local `PGPASSFILE`.
- Hosted staging/E2E write target: local Next app -> `fzxqiqenqjzhlyxxpvhg` ->
  dedicated Playwright user. Local files `.env.e2e.local` and
  `tests/e2e/.auth/` are git-ignored.
- For manual local staging testing, start `npm run dev` with `.env.e2e.local`
  loaded and open `http://localhost:3000`. Do not use
  `http://127.0.0.1:3000` for manual browser testing because Next dev HMR can
  cross-origin block `/_next/webpack-hmr`.
- E2E fast path: run `npm run test:e2e:smoke` for read-only smoke,
  `npm run test:e2e:safety` for the fail-safe guard, and
  `npm run test:e2e:write -- <spec>` only for staging write tests.

## Next Safe Step

1. If a handoff/checkpoint commit is desired, commit only the documentation
   closeout files after explicit approval.
2. Do not start new bookkeeping/VAT/customer-invoice work without a selected
   Jira issue and explicit instruction.
