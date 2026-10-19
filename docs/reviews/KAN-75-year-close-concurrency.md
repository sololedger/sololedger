# KAN-75 – transaction-scoped year-close concurrency

## Scope and mechanism

Base: Production application commit `ca6f5ca7b38cdbb1fa494ead73e2bf6e618591ea`.
Work branch: `codex/KAN-75-year-close-concurrency`. No application formulas,
transaction sources, NE/result classification, SIE interpretation or KAN-96
changes. KAN-95's sequential three-year evidence is reused, not rerun.

Migration: `20261019120000_kan75_year_close_concurrency.sql`.

The private `lock_accounting_year_boundary(uuid,boolean)` helper uses one
transaction advisory key per owner. Writers acquire a shared lock as the first
executable statement. `close_year_atomic` and the existing service-only atomic
deletion acquire an exclusive lock for the actual target owner. Locks last until
transaction end, including when standard-booking RPCs return a confirmed rejection.
The helper is not callable by PUBLIC, anon, authenticated or service_role; existing
SECURITY DEFINER entry points invoke it as their unchanged owner.

Order: owner gate -> existing advisory-lock order -> existing row-lock order ->
protected year checks/writes. This adds one common outer domain and leaves existing
VAT/idempotency ordering and accounting validation intact. The helper rejects
non-READ-COMMITTED transactions (avoids stale snapshots after waiting) and rejects
shared-to-exclusive upgrades (avoids upgrade deadlocks in compound SQL transactions).
Existing normal API requests use a separate READ COMMITTED transaction per RPC.

Exact retries retain their original receipt even after year/VAT close. A new attempt
that waited for year close executes its existing year guard against a fresh snapshot
and rejects if its actual posting/reversal year was locked.

## Covered entry points (25)

- Ordinary: `book_transaction_atomic`, `book_periodized_transaction_atomic`,
  `create_correction_transaction_atomic`, `update_transaction_safe`.
- Year close: `close_year_atomic`.
- VAT/tax: `ensure_vat_periods`, `initialize_first_vat_year_period`,
  `close_vat_period_atomic`, `declare_vat_period_atomic`,
  `record_tax_account_movement_atomic`, `record_vat_settlement_atomic`,
  `book_vat_v2_eu_service_reverse_charge_atomic`.
- Invoices: `create_customer_invoice_atomic`, `update_customer_invoice_unbooked_atomic`,
  `record_customer_invoice_payment_atomic`, `settle_customer_invoice_receivable_atomic`,
  `undo_customer_invoice_payment_atomic`, `book_customer_invoice_year_end_receivable_atomic`.
- Existing assets: `book_fixed_asset_acquisition_atomic`,
  `book_fixed_asset_depreciation_atomic`, `retire_fixed_asset_atomic`. No KAN-62/65
  logic or hold decision changes.
- Compatibility: `import_sie_batch`, `undo_sie_import_atomic` get only the outer
  synchronization call. Their SIE rules and internal statement order are unchanged.
- Report decisions: `review_ne_legacy_sale` (writes an existing NE classification;
  no change to its decision or calculation logic).
- Lifecycle: `delete_user_data_atomic` uses the exclusive target-owner gate, so it
  cannot delete a close/booking basis concurrently. Existing deletion ordering,
  validation, count shape and privileges are unchanged; no new persistent table.

Unchanged private helpers and journal/classification triggers execute inside these
protected entry transactions. Authenticated users have no direct INSERT/UPDATE/DELETE
privileges on the relevant journal, transaction, year, VAT, invoice, asset or NE
classification tables. The remaining direct user-owned writes (account configuration,
payment-account roles, favorites, profile columns) do not rewrite booked journals or
the tables queried by close_year_atomic. Receipt registration writes only a pending
import input, not the year-close basis. Unrestricted administrative SQL/service-role
access remains an administrative boundary, not an end-user bypass guarantee.

Two missing invoice guards are necessary for the close-first outcome: creation
must reject a locked invoice fiscal year, and an unbooked invoice cannot be moved
out of an already locked original fiscal year. The existing invoice fiscal-year
classifier and target-year guard are reused; no VAT treatment is inferred.

## Migration review and invariants

The small migration injects the first call into an explicit list of reviewed live
definitions, guarded by MD5 preimages with only CR line endings normalized. It fails
closed if a signature or body differs. It preserves signatures, function owner,
settings and ACL. Historical migration files are not modified. Fresh DB reconstruction
or a different live preimage must be verified; never relax a mismatch blindly.

Local verification compared all 85 original functions: exactly 25 entry calls and
the two explicit invoice guards, all other bodies unchanged. Function ACL, table
grants, RLS policies, triggers and constraints were checked. The schema-only local
restore has a known renderer-only parenthesis difference in three asset AND CHECKs;
the hosted before/after comparison must remain exact.

Integration surface: no new journal source, no new entry shape, and no amount changes.
VAT reports/periods, NE/result/balance and dashboard consumers retain existing queries
and classification. Correction, periodization, invoice receivable/payment and rollback
paths retain atomicity. Following-year balances use the same cumulative journal basis.
No new IB or 8999/2019 postings. No new storage or user-deletion lifecycle obligation.

## Verification and rollout

Original bug deterministically reproduced locally before migration: an open writer
committed 100 SEK profit after close had already committed and observed zero profit.

30 local checks PASS with independent PostgreSQL sessions, including both race orders,
cross-year correction/periodization, rollback, failed close, upgrade rejection, stale
isolation rejection, VAT/idempotency preservation, invoice payment, tax-account movement,
VAT settlement, owner isolation, journal balance, cumulative balance and released locks.
`scripts/test-year-close-concurrency.mjs --local` is available as `npm run test:kan75:db`.
The harness creates fresh synthetic local identities. Hosted mode requires an explicit
Staging approval flag and two fresh Auth users bearing the KAN75 synthetic-purpose marker;
there is no Production target or fallback. It intentionally refuses reusing populated users.

Selected existing regressions passed: durable standard-booking attempts and page handling,
amount/submit browser checks, result engine, NE balance, KAN-93 equity/service/browser,
KAN-94 review/service/browser, VAT aggregation/lifecycle/settlement, tax-account UI/service,
customer-invoice VAT policy, E2E safety, ordinary/periodized recovery browser and focused lint.
Full unrelated suites/build/typecheck are not required for this SQL-only application change.

Staging PASS, 2026-10-19: only this migration was applied via official CLI 2.120.0,
version/name exactly `20261019120000 / kan75_year_close_concurrency`, ledger 52. All 51
old entries are unchanged. Candidate SHA-256:
`832f9ff82cdf518cb0d57af448a0ba915070234296ddcb071bee90fc570fccb8`.
Both psql and the CLI's own read-only SQL session independently verified TLS,
session continuity, and setting/reset values 5000ms lock / 120000ms statement,
including RESET ALL. This CLI build did not emit wire StartupMessage diagnostics;
its SQL DO probe verified actual settings instead. Dry-run/apply selected only KAN-75,
no seeds/roles, no other active writers detected. No old migration replay/repair.

30/30 real separate-session Staging concurrency checks PASS. Seven additional actual
Auth/HTTP service checks PASS: ordinary booking/replay, confirmed locked-year rejection,
RLS isolation and six selected journal/NE/balance snapshots including following-year IB.
Public Playwright smoke 2/2 PASS using webpack startup. Initial Turbopack could not
use the external node_modules junction; one bounded webpack retry resolved this local
test-infrastructure issue without a product configuration change. Existing focused
NE and ordinary/periodized browser regressions also PASS.

Two dedicated synthetic Staging users were preserved for acceptance. Their identifiers
and credentials are kept outside the release candidate in local ignored evidence/config.
Do not rerun the fresh-user suite on these populated users. Existing E2E/KAN-95 users
were not used or changed. No Production data or DDL, Vercel deploy, commit or push.

Final hosted comparison again accounted for all 85 original functions: the exact
25 entry calls and two invoice guards, remaining bodies/ACL, table grants, RLS
policies, triggers and constraints unchanged. No known uncovered supported user
write entry was found. Raw evidence is in the sibling task folder above this source:
`staging-concurrency.json`, `staging-service-result.json`, `staging-function-proof.json`,
`staging-ledger-after.json`, `local-red.json`, `local-green.json`, `selected-regressions.json`,
`dry-run.log`, `migration-apply.log` and `cli-session-probe.sql`.

Jira KAN-75 is In Review / Pontus, comment 11660. Manual acceptance: on the synthetic
account book in open 2027, inspect journal/NE, keep a stale tab, close 2027 in another
tab and confirm the stale tab's new 2027 request rejects without a journal. Precise
overlap timing is covered automatically; no need to reproduce milliseconds manually.

Before any future Production rollout: require Pontus approval for the exact migration and
candidate, freshly compare Production preimages (do not run staging-only KAN-62 history),
pause bookkeeping writes and drain old in-flight transactions during replacement. Updating
function definitions cannot retroactively give an already-running old function the new gate.
Then verify ledger/ACL and a short non-destructive smoke. No Production operation is approved
by the local/Staging implementation request.

## Final Production-readiness, 2026-10-19

PASS for the reviewed candidate; this is not release authorization. GitHub main and
READY Vercel Production were read back at the same base `ca6f5ca`. Jira remains
In Review / Pontus. No Production writes, commit, push or deploy were performed.

Fresh read-only Production/Staging snapshots matched all 25 Production preimages.
All 25 signatures, argument/default/result shapes, owners, ACL, SECURITY DEFINER,
search_path/config, volatility, strictness, leakproof/parallel flags and cost/rows
matched the tested Staging properties. Candidate bytes still match the recorded
Staging migration SHA-256, and the stored Staging migration SQL matches the file.

Production has 49 migrations, Staging 52. The isolated Production runner contains
the 49 existing versions plus only KAN-75; versions `20261012123000` and
`20261012153000` are explicitly excluded. Production dry-run selected only KAN-75,
no seeds/roles. Among shared history, KAN-54's stored Production SQL contains one
additional historical REVOKE from service_role compared with Staging; the private
helper's current ACL is identical in both. Do not repair or replay this history.
KAN-62's private acquisition implementation differs as expected; KAN-75 edits only
the unchanged public wrapper and does not import either environment's asset logic.

One missing targeted test was run in an isolated local clone, not on hosted data:
official CLI failure at the final preimage rolled back the new helper, all earlier
RPC changes and the migration version. The exact unmodified migration then applied
to the fresh Production function definitions and all 25 results matched Staging.
No concurrency or full regression suites were repeated.

The release must pause new calls to the 25 write entry points before draining old
transactions. A prepared proposal temporarily revokes caller EXECUTE rights and
restores exactly the original grants afterwards; it is outside this candidate and
requires explicit approval for those temporary Production ACL writes. Direct
privileged operators must remain exclusive during the window. Merely observing zero
active writers without preventing new calls is not a sufficient pause.

After commit approval, record the sole child SHA of the verified base and obtain
Production approval for that exact SHA. During the approved window: recheck target,
preimages, current grants, TLS/timeouts and the one-migration dry-run; apply the
write pause, drain old transactions, apply only KAN-75, verify version 50 and all
function/security/data invariants while paused, restore/verify original grants,
then fast-forward main to the approved SHA. Confirm Vercel Production READY on that
same SHA and perform only non-destructive public/authenticated reads. Do not invoke
ensure_vat_periods through the VAT UI during a read-only smoke.

Stop for any candidate/base/preimage/ACL/plan mismatch, inability to establish the
pause or drain, timeout, unexpected migration state, invariant difference or wrong
Vercel SHA/status. Before a successful migration, a verified atomic failure allows
restoring the original caller grants; if outcome is uncertain, inspect read-only
and keep writes paused until resolved. After a committed migration, do not repair
the ledger, replay old SQL, restore data or automatically revert bookkeeping. A
necessary forward-fix migration requires fresh review/approval. A later Vercel build
failure leaves the previous compatible client running against the verified DB;
stop and report rather than automatically reverting the database.

The paused older GitHub staging branch is intentionally retained under the existing
KAN-62/65 hold decision; never merge its unrelated history into this release.
