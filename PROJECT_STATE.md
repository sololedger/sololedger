# SoloLedger Project State

Last updated: 2026-10-08

## Current Baseline

- Repository: `C:\Users\Familjedator\Desktop\Sololedger Multi User App\sololedger_multi_user`
- Branch: `main`
- Remote: `https://github.com/sololedger/sololedger.git`
- Origin/Production `main`: `4e90d1a487098c36f0608849fb315fde8fd61d35`
  (`KAN-54 guard fixed asset VAT deduction`).
- Production is verified on the accumulated KAN-46 + KAN-14 + KAN-49 + KAN-50
  + KAN-51 + KAN-52 + KAN-41 + KAN-22 + KAN-23 + KAN-36 + KAN-54 release.
- Vercel Production deployment:
  `dpl_68zo3FwhLxdNhHqevk8qDPhU91J1`
  (`sololedger-1msukfnht-sololedger1.vercel.app`) is `Ready`, built from
  `4e90d1a`, and aliased to `https://sololedger.vercel.app`.
- Supabase Production ref: `wbaxmuvudpnkvuliicuy`; migration head:
  `20261008173000` after the completed KAN-54 Production DB release.
- Supabase staging/E2E ref: `fzxqiqenqjzhlyxxpvhg`; migration ledger includes
  KAN-36 `20261007160000` and `20261008110000`, plus KAN-54 `20261008170000`
  and `20261008173000`. KAN-51 `20261007110000` and KAN-22 `20261007130000`
  are still not in the staging migration ledger; KAN-36/KAN-54 staging
  migrations were applied through isolated CLI migration chains to avoid
  unrelated pending migrations.
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

Verified on 2026-10-08:

- Done includes KAN-14, KAN-46, KAN-49, KAN-50, KAN-51, KAN-52, KAN-41,
  KAN-22, and KAN-23 after Pontus acceptance and Production release.
- KAN-53 was created as the future VAT V2 EU-goods support issue. Do not
  implement EU-goods accounting inside KAN-23.
- KAN-47/KAN-48 remain future work and must not be started unless Pontus
  selects them.
- KAN-36 is released to Production and remains `In Review`, assigned to Pontus.
  Pontus final product-owner review remains before `Done`.
- KAN-54 is released to Production and remains `In Review`, assigned to Pontus.
  Production release evidence was added as Jira comment `11411`; Pontus final
  product-owner review remains before `Done`.

## Current Active Work

- KAN-54 Production release is live, technically approved, and waiting for
  Pontus product-owner review in Jira `In Review`. Release evidence is archived
  in `PROJECT_ARCHIVE.md`.
- KAN-54 scope now live: Inventarier restricts momsavdrag choices from
  `profiles.default_deduction_entitlement`, and
  `book_fixed_asset_acquisition_atomic(jsonb)` has a server-side guard so
  `full` VAT deduction is allowed only when the profile explicitly says
  `full`. Profiles `none`, `unknown`, missing profile, and unsupported values
  cannot create a new fixed-asset `2641` deduction through the public RPC;
  choosing `none` remains allowed.
- KAN-36 Production release is also live and waiting for Pontus product-owner
  review in Jira `In Review`. Detailed KAN-36 release evidence is archived in
  `PROJECT_ARCHIVE.md`.

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
- KAN-41 is closed: dashboard VAT overview is deployed to Production at
  `c2f4a0e`; it now uses the authoritative VAT-report aggregation for the
  selected calendar year, including legacy VAT, native VAT V2, and VAT V2 audit
  snapshots. `Säkert uttag` now uses that corrected VAT balance and falls back
  to a controlled review-required state instead of an old legacy-only VAT amount
  when VAT cannot be trusted.
- KAN-22 is closed: VAT V2 foreign-purchase fact capture is deployed to
  Production at `020fb09`; Production migration `20261007130000` is live.
  The UI asks for business facts instead of BAS/VAT implementation choices,
  durable `business_facts` are preserved in VAT V2 audit snapshots, and the
  RPC fails closed for missing or contradictory business facts.
- KAN-23 is closed: VAT V1 and native VAT V2 coexistence was accepted and
  released to Production at `a491afb`. Verification covered V1 domestic VAT,
  VAT V2 EU service with no deduction and full deduction, mixed V1+V2 report
  aggregation, no omission/double-counting, KAN-22 business-facts
  persistence/fail-closed validation, dashboard semantics, mixed close/2650,
  declare boundary, missing/broken VAT V2 snapshots fail-closed, unsupported
  EU goods fail-closed, and relevant SIE/correction/undo boundaries. Real
  two-session concurrency remains a documented accepted limitation, not a
  KAN-23 blocker.
- KAN-54 is released to Production and in Jira `In Review`: fixed-asset VAT
  deduction is now constrained by the company deduction profile in both UI and
  server-side RPC guard. Pontus final product-owner review remains before
  `Done`.
- Detailed release evidence has been moved to `PROJECT_ARCHIVE.md`.

## Open Follow-Ups

- KAN-53 covers future EU-goods VAT V2 accounting support.
- KAN-54 follow-up candidate: ordinary Bokföring/V1 may still allow `2641`
  based on VAT rate without checking actual deduction entitlement. Jira search
  found no exact existing issue during KAN-54; KAN-14/KAN-22/KAN-34/KAN-53 are
  related but not the same scope. Do not implement this without a selected
  follow-up issue.
- Future UI/UX consistency pass: consider aligning other Profile areas such as
  `Betalningskonton` with the newer Profile card language. This was explicitly
  out of scope for KAN-50.
- Historical Adobe invoices remain a separate unresolved correction task. Do
  not change them without a selected/approved work item.
- KAN-47/KAN-48 remain future work.
- KAN-34 remains future UX for completing VAT facts on ambiguous legacy/SIE
  rows.
- KAN-35 remains low-priority UI transaction-history completeness follow-up.
- Full repo lint still has older unrelated debt.

## Git / Local Files

- KAN-54 release code was committed and pushed in
  `4e90d1a487098c36f0608849fb315fde8fd61d35`.
- This documentation checkpoint is local-only until Pontus approves a push.
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

1. Pontus product-owner reviews KAN-54 in Production. Keep Jira KAN-54
   `In Review`; Pontus sets `Done` only after final acceptance.
2. Push this documentation checkpoint only after explicit approval. Do not push
   automatically.
3. KAN-36 is also released to Production and remains ready for Pontus
   product-owner review before `Done`.
4. Do not start Adobe corrections, KAN-47, or KAN-48 unless Pontus explicitly
   starts that work.
