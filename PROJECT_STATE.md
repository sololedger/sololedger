# SoloLedger Project State

Last updated: 2026-10-04

## Current Baseline

- Repository: `C:\Users\Familjedator\Desktop\Sololedger Multi User App\sololedger_multi_user`
- Branch: `main`
- Remote: `https://github.com/sololedger/sololedger.git`
- Latest pushed checkpoint before this local race-fix follow-up:
  `7e1aef6` (`KAN-37 centralize payment account settings`).
- Before the KAN-37 race-fix work resumed, local `main` and `origin/main`
  pointed to `7e1aef6`.
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
- `supabase/.temp/` may exist as generated Supabase CLI state only. Verified
  filenames currently include `cli-latest`, `gotrue-version`,
  `linked-project.json`, `pooler-url`, `postgres-version`, `project-ref`,
  `rest-version`, `storage-migration`, and `storage-version`. Do not
  read/display secrets and do not add this directory to Git.

## Jira Status Snapshot

Verified from Jira on 2026-10-04:

- Done: KAN-3, KAN-13, KAN-21, KAN-29, KAN-30, KAN-31, KAN-32, KAN-33.
- To Do: KAN-9, KAN-10, KAN-11, KAN-14, KAN-22, KAN-23, KAN-24, KAN-25,
  KAN-34, KAN-35, KAN-36, KAN-38.
- In Review: KAN-37
  `Central konfiguration av betalningskonton i Profil`, assigned to Pontus
  with Codex verification comment.
- KAN-29-KAN-33 are External Audit #1 completion work and are Done.
- KAN-36 is future inventory/depreciation product work.
- KAN-38 is the future follow-up for VAT V2 RPC central payment-role
  enforcement/hardening.

## Current Active Work

- KAN-37 initial implementation was pushed as `7e1aef6` and IRL-tested.
- Current local follow-up fixes the remaining Bokföringssidan loading flash:
  a saved payment-account role no longer becomes `missing_account` while the
  account plan is still unloaded/loading/unavailable.
- Scope completed: central `Betalningskonton` in Profil backed by
  `company_payment_account_roles`; non-blocking Bokföringssidan prompt; VAT V2
  and Momsrapport guidance to Profil; 2013 semantics preserved for private
  withdrawal from tax account; explicit account-plan load state in
  `useAccountingData`.
- IRL verified by Pontus: Profile selection/persistence, Bokföringssidan
  reminder removal, VAT V2 business/private paths, missing-2018 blocking, and
  Momsrapport pre-submit guidance. No tax-account movement was registered in
  IRL testing.
- Follow-up correction: payment-role status now distinguishes account-plan
  `unloaded/loading/error` from loaded + genuinely missing account; dashboard
  reminders require both role state and account-plan state to be evaluable.
- No DB migration, Supabase write, deploy, or push was performed for this
  follow-up. The upcoming checkpoint is local only until Pontus approves push.
- Verification for the local follow-up:
  targeted payment-role race regression test, `npm run typecheck`,
  `npm run test:domain`, relevant targeted lint, `npm run build`,
  `git diff --check`, and adversarial diff review.
  Sandboxed builds fail only when Google Fonts network fetch is blocked; the
  approved network build passed.
- Full/touched-file lint still exposes older repo lint debt in `page.tsx`,
  `ProfileSettings`, and `useAccountingData`. Targeted lint for the changed
  payment-role status/test/Momsrapport surface passed.

## Account-Plan Hygiene

- New canonical users currently get 9 seeded default categories, 14 quick
  suggestions, and 14 system accounts. See `Architecture.md` for the exact
  current model.
- The older real user's legacy account cleanup is completed and verified.
  No further live-data repair is currently planned for that user.
- Do not put identifying user data in project docs.
- There is no general automatic default-upgrade engine. Future design should
  be conservative/fingerprint-aware: never overwrite legitimate user changes
  or historically used category IDs just because defaults changed.

## Inventory / Depreciation

- SoloLedger has partial BAS/knowledge/report support for inventory and
  depreciation: guided 1220 knowledge, 7830 system/report support, NE handling
  for existing 12xx/783x rows, and generic SIE export for used BAS accounts.
- There is no dedicated inventory register, useful-life/depreciation plan, or
  automatic annual depreciation entry flow.
- Future work is captured by KAN-36.

## Known Non-Blockers / Debt

- Full repo lint still has older unrelated debt.
- KAN-24 and KAN-25 remain To Do for scoped `page.tsx` technical debt.
- KAN-34 remains future UX for completing VAT facts on ambiguous legacy/SIE
  rows.
- KAN-35 remains low-priority UI transaction-history completeness follow-up.
- FAQ copy around `Skattekonto (2012)` is identified as potentially confusing:
  it should eventually distinguish private tax/F-tax via 2012 from controlled
  VAT/tax-account lifecycle flows.
- General legacy default-upgrade policy is a future architecture/product topic,
  not implemented.

## Git / Local Files

- This local follow-up checkpoint is expected to change:
  `PROJECT_STATE.md`, `scripts/test-payment-account-role-status.ts`,
  `src/app/page.tsx`, `src/components/Momsrapport.tsx`,
  `src/components/ProfileSettings.tsx`, `src/hooks/useAccountingData.ts`, and
  `src/lib/paymentAccountRoleStatus.ts`.
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

1. Pontus should F5-test localhost for the Bokföringssidan loading flash.
2. Push this KAN-37 follow-up only after explicit approval, treating push to
   `main` as production deploy.
3. Keep KAN-37 in Jira `In Review` for Pontus final process; do not set Done.
4. Keep KAN-38 as separate future DB/RPC hardening work.
