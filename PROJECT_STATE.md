# SoloLedger Project State

Last updated: 2026-10-06

## Current Baseline

- Repository: `C:\Users\Familjedator\Desktop\Sololedger Multi User App\sololedger_multi_user`
- Branch: `main`
- Remote: `https://github.com/sololedger/sololedger.git`
- Origin/Production `main`: `0162654e08d24780ef8ab5da8118dcfd04463fec`
  (`docs: record KAN-49 production release`).
- Production is verified on the accumulated KAN-46 + KAN-14 + KAN-49
  release.
- Vercel Production deployment:
  `dpl_35vXDLXKjkY7QgRv2XmCeaUmKraU`
  (`sololedger-gfm0d7o75-sololedger1.vercel.app`) is `Ready` and aliased to
  `https://sololedger.vercel.app`.
- Supabase Production ref: `wbaxmuvudpnkvuliicuy`; migration head:
  `20261006143000` after KAN-49 Production DB release.
- Supabase staging/E2E ref: `fzxqiqenqjzhlyxxpvhg`; migration head:
  `20261006143000` after KAN-49 staging migration.
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

Verified on 2026-10-06:

- Done includes KAN-14, KAN-46, and KAN-49 after Pontus Production acceptance.
- KAN-50 is active local work: Profile information hierarchy/readability polish.
  It must not change VAT policy logic, accounting behavior, profile persistence,
  or schema.
- KAN-47/KAN-48 remain future work and must not be started unless Pontus
  selects them.

## Completed Release

- KAN-14 and KAN-46 are closed: Production DB migrations are live, frontend is
  deployed, automated non-destructive Production smoke passed, and Pontus manual
  Production acceptance passed.
- KAN-49 is closed: Production migration `20261006143000` is live, the
  Production frontend is deployed, and Pontus manually verified the VAT-number
  field saves, persists after reload, and leaves VAT-policy settings intact.
- Jessika Foto & Media's real Production profile now represents:
  VAT registered, annual VAT reporting, SoloLedger VAT-period handling from
  `2026-06-02`, domestic sales small-business exempt, foreign-purchase VAT
  reporting required, and no normal input-VAT deduction.
- Manual Production verification confirmed ordinary Swedish
  `Försäljning (Intäkt)` is locked to `0%` VAT for that profile and explains
  the small-business exemption. KAN-46 `Registrera kundfaktura` and
  `Utlandsinköp` entry points are present. No Production test bookkeeping
  transaction was created.
- Detailed release evidence has been moved to `PROJECT_ARCHIVE.md`.

## Open Follow-Ups

- KAN-50 Profile UX polish is in progress locally. Scope: visual hierarchy,
  spacing, section separation, and neutral VAT help text only. Do not run
  Playwright/E2E or use staging DB for layout verification.
- Jessika's two historical customer invoices predate KAN-46 and are not yet
  represented in the Fakturor registry. Any future backfill must link/preserve
  existing bookkeeping and must not create duplicate revenue/VAT.
- Historical Adobe invoices remain a separate unresolved correction task. Do
  not change them without a selected/approved work item.
- KAN-47/KAN-48 remain future work.
- KAN-34 remains future UX for completing VAT facts on ambiguous legacy/SIE
  rows.
- KAN-35 remains low-priority UI transaction-history completeness follow-up.
- KAN-36 remains future inventory/depreciation product work.
- KAN-41 remains the VAT dashboard/momskort label/scope follow-up.
- Full repo lint still has older unrelated debt.

## Git / Local Files

- `origin/main` is the deployed Production code at `0162654`.
- Local `main` has the KAN-50 Profile UX polish checkpoint above `origin/main`.
  Do not push without explicit approval because pushing `main` deploys
  Production.
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

1. Pontus should manually visually review the KAN-50 Profile UX polish locally.
2. Do not push `main` without explicit approval because it deploys Production.
3. Do not start invoice backfill, Adobe corrections, KAN-47, or KAN-48 unless
   Pontus explicitly starts that work.
