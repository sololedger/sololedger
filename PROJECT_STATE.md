# SoloLedger Project State

Last updated: 2026-10-02

## Current Baseline

- Repository: `C:\Users\Familjedator\Desktop\Sololedger Multi User App\sololedger_multi_user`
- Branch: `main`
- Remote: `https://github.com/sololedger/sololedger.git`
- Current commit: `e925b944c8059fc5f665e8b810fc0b8d8871e252`
  (`docs: refresh architecture overview`)
- Verified before this handoff-doc refresh: `HEAD == origin/main`.
- Production path: GitHub `sololedger/sololedger` `main` -> Vercel team
  `sololedger1`, project `sololedger`, domain `https://sololedger.vercel.app`.
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

Verified read-only from Jira on 2026-10-02:

- Done: KAN-3, KAN-13, KAN-21, KAN-29, KAN-30, KAN-31, KAN-32, KAN-33.
- To Do: KAN-9, KAN-10, KAN-11, KAN-14, KAN-22, KAN-23, KAN-24, KAN-25,
  KAN-34, KAN-35, KAN-36.
- KAN-29-KAN-33 are External Audit #1 completion work and are Done.
- KAN-36 is future product work:
  `Inventarier - anskaffning, avskrivningsplan och årlig avskrivning`.

## Completed Hygiene Since External Audit #1

- External Audit #1 is closed. No known audit finding remains open without an
  explicit non-blocking disposition.
- KAN-3 and KAN-13 were closed during Jira hygiene.
- KAN-21 was closed after leader-approved closeout review; remaining broad
  regression/concurrency hardening belongs under KAN-23, not KAN-21.
- Account-plan UI compatibility for canonical/legacy category IDs is
  implemented and pushed:
  `6997141ad91299d62389c1895c5848b5ab35a15d`
  (`Fix account category UI aliases`).
- `Architecture.md` was fully refreshed and pushed:
  `e925b944c8059fc5f665e8b810fc0b8d8871e252`.

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

- `HEAD == origin/main` was verified at commit
  `e925b944c8059fc5f665e8b810fc0b8d8871e252` before editing this state file.
- The canonical External Audit #1 files `SOLOLEDGER_AUDIT_*.md` are still
  untracked snapshot files and should remain untouched until a separate leader
  decision.
- `KAN-32-IRL-legacy-reverse-charge.se` remains an untracked IRL test fixture
  from the completed KAN-32 verification. Do not delete or commit it without a
  separate decision.
- `supabase/.temp/` remains generated local Supabase CLI state and should not
  be committed.

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

1. Leader review of the `AGENTS.md` and `PROJECT_STATE.md` changes.
2. If approved, commit/push only those handoff docs.
3. Separately decide what to do with `SOLOLEDGER_AUDIT_*.md` and
   `KAN-32-IRL-legacy-reverse-charge.se`.
4. Run final handoff check.
5. Then move to a new leader chat/session if desired.
