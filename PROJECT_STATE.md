# SoloLedger Project State

Last updated: 2026-10-07

## Current Baseline

- Repository: `C:\Users\Familjedator\Desktop\Sololedger Multi User App\sololedger_multi_user`
- Branch: `main`
- Remote: `https://github.com/sololedger/sololedger.git`
- Origin/Production `main`: `2040be360ebeea9fdc70d353472535d19f7db54b`
  (`KAN-52 clarify invoice year-end wording`).
- Production is verified on the accumulated KAN-46 + KAN-14 + KAN-49 + KAN-50
  + KAN-51 + KAN-52 release.
- Vercel Production deployment:
  `dpl_FQH754uuhMDZJj4eo6LhF7g8fyj2`
  (`sololedger-oh0tkmg6l-sololedger1.vercel.app`) is `Ready` and aliased to
  `https://sololedger.vercel.app`.
- Supabase Production ref: `wbaxmuvudpnkvuliicuy`; migration head:
  `20261007110000` after KAN-51 Production DB release.
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

Verified on 2026-10-07:

- Done includes KAN-14, KAN-46, KAN-49, KAN-50, KAN-51, and KAN-52 after
  Pontus Production acceptance.
- KAN-41 is implemented locally and ready for leader review. It has not been
  pushed or deployed.
- KAN-47/KAN-48 remain future work and must not be started unless Pontus
  selects them.

## Completed Release

- KAN-14 and KAN-46 are closed: Production DB migrations are live, frontend is
  deployed, automated non-destructive Production smoke passed, and Pontus manual
  Production acceptance passed.
- KAN-49 is closed: Production migration `20261006143000` is live, the
  Production frontend is deployed, and Pontus manually verified the VAT-number
  field saves, persists after reload, and leaves VAT-policy settings intact.
- KAN-50 is closed: Profile UX polish is deployed to Production at `64367a6`
  and Pontus manually accepted the Production visual result.
- KAN-51 is closed: historical customer-invoice linkage support is deployed to
  Production at `9640942`; Production migration `20261007110000` is live; the
  approved one-off repair linked the two historical invoices to existing
  VER-5/VER-7 bookkeeping without creating transactions, journal rows, VAT/tax
  rows, corrections, or verification-number changes; Pontus accepted the
  Production result.
- Jessika Foto & Media's real Production profile now represents:
  VAT registered, annual VAT reporting, SoloLedger VAT-period handling from
  `2026-06-02`, domestic sales small-business exempt, foreign-purchase VAT
  reporting required, and no normal input-VAT deduction.
- Manual Production verification confirmed ordinary Swedish
  `Försäljning (Intäkt)` is locked to `0%` VAT for that profile and explains
  the small-business exemption. KAN-46 `Registrera kundfaktura` and
  `Utlandsinköp` entry points are present. No Production test bookkeeping
  transaction was created.
- KAN-52 is closed: customer-invoice year-end wording is deployed to
  Production at `2040be3`; the UI now says `Kundfordran vid bokslut`,
  `Ingen kundfordran vid bokslut`, and `Bokför kundfordran` for the
  receivable-at-year-end workflow. It was wording/UX only; no accounting,
  schema, RPC, Supabase, VAT, or existing data changed.
- KAN-41 is implemented locally: the dashboard VAT overview now uses the
  authoritative VAT-report aggregation for the selected calendar year, including
  legacy VAT, native VAT V2, and VAT V2 audit snapshots. `Säkert uttag` now uses
  that corrected VAT balance and falls back to a controlled review-required
  state instead of an old legacy-only VAT amount when VAT cannot be trusted.
- Detailed release evidence has been moved to `PROJECT_ARCHIVE.md`.

## Open Follow-Ups

- Future UI/UX consistency pass: consider aligning other Profile areas such as
  `Betalningskonton` with the newer Profile card language. This was explicitly
  out of scope for KAN-50.
- Historical Adobe invoices remain a separate unresolved correction task. Do
  not change them without a selected/approved work item.
- KAN-47/KAN-48 remain future work.
- KAN-34 remains future UX for completing VAT facts on ambiguous legacy/SIE
  rows.
- KAN-35 remains low-priority UI transaction-history completeness follow-up.
- KAN-36 remains future inventory/depreciation product work.
- Full repo lint still has older unrelated debt.

## Git / Local Files

- `origin/main` is the deployed Production code at `2040be3`.
- Local `main` has a docs-only KAN-52 finalization checkpoint plus the local
  KAN-41 implementation checkpoint above `origin/main`. Do not push without
  explicit approval because pushing `main` deploys Production.
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

1. Pontus reviews KAN-41 locally before any push/deploy.
2. Do not push `main` without explicit approval because it deploys Production.
3. Do not start Adobe corrections, KAN-47, or KAN-48 unless Pontus explicitly
   starts that work.
