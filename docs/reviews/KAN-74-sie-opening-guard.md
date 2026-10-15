> HISTORISK RAPPORT: efter denna rapport godkände ledarchatten en konservativ ettårspolicy.
> Aktuell kandidat och verifiering: [KAN-74 single-year guard](KAN-74-single-year-guard.md).
> Tidigare BLOCKED/STOP och acceptansfall nedan avser föregående kandidat.

# KAN-74 – minimal SIE opening-balance guard, independent review

**SUPERSEDED STATUS 2026-10-15: BLOCKED.** The independent-review P1 reproduces
in the candidate. See [P1 blocker and stop decision](KAN-74-P1-blocker.md).
The original checks below do not establish safety for opening balances sent as
ordinary #VER. No hosted migration/publication is approved; no P1 product fix
has been made. The new required regression remains RED.

2026-10-15. Local, uncommitted candidate on codex/KAN-74-sie-opening-guard,
base 1d297c1fd387be2f3f6cd54a780b8c58c2901732. No hosted apply or release.

## Problem and resulting behavior

Full opening balances for two imported years currently accumulate. The candidate
rejects unsafe imports atomically rather than changing balances, NE, SIE export,
year closing, or existing journal history. A safe first opening still imports.
Later movement-only imports remain allowed when they do not precede an opening.

The owner confirms the sole real Production user has no SIE imports; other
accounts are test/admin. No further Production user inventory or data repair is
part of this scope. This statement supersedes the analysis's inventory question.

## Change and review points

Migration: supabase/migrations/20261015120000_kan74_sie_opening_balance_guard.sql.
Only public.import_sie_batch(jsonb) is replaced. Its existing executable SQL is
retained, including auth/tenant checks, VAT locks/guards, year locks, original
same-year IB/hash protection and result-bridge validation. No new table,
persistent domain, grant, RLS policy, deletion lifecycle, or backfill.

1. All imports, including files without IB, take a transaction-scoped per-user
   advisory lock after all VAT-month locks and before the existing IB-day lock.
   Protected history reads occur after lock acquisition, before the first write.
2. Reject new IB if any existing transaction or journal row predates it, if a
   recognized opening has a different date, or if its own payload has older rows.
3. Reject any incoming movement preceding an existing recognized opening. This
   also covers older files without IB and both import orders.
4. Include both transaction dates (balance RPCs) and journal dates (year closing).
   Recognize modern source=sie_opening_balance and the existing explicit legacy
   source=sie_import / description=Öppningsbalans marker, without heuristic guesses.
5. Do not exclude undone originals: later dated mirrors preserve old history.
   Therefore a net-zero undo does not authorize a new annual opening automatically.
6. Require READ COMMITTED. A repeatable-read snapshot could miss a lock winner's
   newly committed history. Stronger snapshots fail closed before writing (25001).
   Other booking RPCs and their isolation behavior are unchanged.
7. Conflicts return P2074. The existing client error adapter maps that to
   OPENING_BALANCE_CONFLICT; the modal's current error rendering displays the
   Swedish explanation. Example: “Importen stoppades för att undvika dubbel
   ingående balans. ... Ingen bokföring har importerats.” No component redesign.

This is deliberately conservative, not full multi-year import support. Manual
bookings are not serialized by the new SIE-only lock or otherwise modified.
Existing earlier manual history can cause a new IB import to be refused, while
ordinary later manual movements do not. No new restriction on manual booking,
invoice, payment or VAT RPCs is introduced. KAN-75 concurrency remains separate.
Duplicate ordinary verifications in overlapping files without IB remain the
separate previously reported risk; this candidate does not claim to solve it.

## Verification

- 22 local rollback scenarios: safe first IB, same file/same year, multiple years
  both orders, files without IB both orders, safe later no-IB, payload date
  crossing, non-VAT journal dates, existing manual rows, legacy openings,
  actual undo, tenants, closed VAT, locked years, invalid dates and #RES/2019.
- P2074 cases preserve transactions, journals, batches, numbering, VAT and year
  state. Temporary non-transactional sequence witnesses prove no insert/update
  was even attempted before rejection, rather than merely rolled back.
- RED proof: these new assertions fail on the old RPC. GREEN on the candidate.
- Eight observed two-session races: IB forward/reverse, no-IB→IB, IB→older no-IB,
  safe later no-IB, same year, disjoint VAT months, and first transaction rollback.
  Actual advisory waits were observed; loser imports leave no rows/batches or
  numbering increments. REPEATABLE READ and SERIALIZABLE rejection tested too.
- Existing KAN-71 SQL suites all PASS: sie_vat_period_guard,
  generic_sie_correction_guard, legacy_sie_history_guard. Only their dedicated
  local database-name guard was adapted in memory to the new KAN-74 DB name.
  Assertions and fixture logic unchanged. KAN-72 ordinary booking and KAN-63
  customer invoice VAT SQL suites also PASS, with migrations skipped.
- TypeScript PASS; targeted ESLint PASS; static DB invariants PASS; real client
  adapter tests PASS and included in test:domain; full domain suite PASS.
- Public local Playwright smoke 2/2 PASS. The initial regression command's smoke
  stage hit Turbopack's external node_modules-junction restriction. A bounded
  environment fix replaced this task-created junction with npm ci --offline
  --ignore-scripts; only smoke was rerun. Package-lock and dependency versions
  unchanged. Safe regression components are green; the first combined command
  itself exited with that infrastructure failure.
- All existing function bodies except import, owners and ACLs compared unchanged
  in the local schema clone, including after the regression fixtures. Original
  13 worktrees/heads/dirty states, held KAN-62/65 branches and local docs commit
  11d8306 preserved. Report/result/export/calculation/parser/page files unchanged.

Test DB: sololedger_kan74_guard_20261015, verified localhost/::1:5432. Created from
schema only of the existing 41-migration local production-derived test schema;
no existing user data copied. Sequential fixtures rollback. Clearly synthetic
race fixtures remain only in this new dedicated local database. Prior DBs untouched.

Re-run after provisioning the schema and applying the candidate ONLY locally:
set process-local SOLOLEDGER_LOCAL_TEST_DATABASE_URL to the dedicated localhost
database and use the existing PGPASSFILE, then npm run test:kan74:db. The runner
denies Production, Staging and ordinary/non-dedicated local databases before
write-capable tests. No credentials belong in this file, Git, or command logs.

Not run at this original checkpoint: hosted write E2E, Staging/Production migration or deployment, production
build, or full-repository lint. Focused lint/type/domain/SQL/smoke checks were used;
the known unrelated full-lint debt is not claimed resolved. Manual acceptance of
the blocked import in the browser remains for the approved Staging phase.

## Mandatory gate before any hosted migration

The established direct read-only connection still failed before SQL execution.
The owner explicitly approved using the deployed definition verified on
2026-10-14 as the LOCAL implementation base. A fresh pg_get_functiondef/schema/
ACL comparison is mandatory before any separately approved hosted apply. The
current candidate must not overwrite an unseen function change.

Use a new exact-version official CLI migration flow after that gate; do not
replay old migrations or use a timestamp-changing MCP apply_migration shortcut.
No live data inventory, historical correction, or historic balance recomputation
is required or authorized by this task. Hosted apply, commit, push and deploy
still need separate explicit approval. No Jira mutation performed; not Done.

Before Staging and Production: review the exact migration; safe first import →
balanced journal → expected unchanged balance/NE/dashboard/export; block the
second IB with no changed data; permit a valid later no-IB; verify open/closed
VAT and undo behavior. Payment/receivable/result calculations have no changed
write/read path; targeted existing domain/invoice/booking regressions passed.

Evidence outside Git:
C:/Users/Familjedator/.codex/visualizations/2026/10/15/01a13dfa-6f68-7063-b1dc-9ca3f87c2006/kan74/
guard-verification.json, guard-red-proof.log, guard-sequential.log,
regression-*.log, guard-db-before.json, guard-db-after.json,
implementation-scope.json. No actual user records or credentials in evidence.
