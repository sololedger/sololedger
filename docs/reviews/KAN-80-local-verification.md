# KAN-80: verified local candidate, not published

Base: GitHub main af0378ae0935518346360e3492c38175e2c270d2, verified 2026-10-17.
Separate unmanaged clone; no existing checkout or ignored file moved/deleted.
Jira KAN-80 read: Bug, To Do, unassigned. No Jira write authorized/performed.

## Integration map before implementation

- `page.tsx` ordinary/periodized submit -> accountingService -> live `book_transaction_atomic(jsonb)` / `book_periodized_transaction_atomic(jsonb)`.
- Live definitions, ACL, constraints, indexes, RLS, triggers and internal callers inspected read-only using `pg_get_functiondef`; raw schema-only evidence outside repository. No internal function calls these two RPCs. Existing public signatures can require a key without opening a delegate route.
- Journals, VER allocation, transaction source (`manual`), original/reversal grouping, VAT deduction, VAT-month locks, year locks, category visibility and NE classification stay in the existing RPC bodies. Add request lookup before mutable checks and result insert in the same transaction.
- VAT aggregation/lifecycle, NE/result/balance, dashboard/safe withdrawal and SIE read the existing transaction/journal data. No new transaction source or calculation branch. Compare fresh versus replay journals and representative report inputs locally.
- Payments/receivables, invoice settlements and invoice year crossing have independent write paths; no changes. Ordinary periodization retains original and next-year reversal, existing correction path and year-end rules.
- Corrections/history/undo continue referring to original transactions; replay must return saved original result even after later corrections. No change to SIE import/undo.
- New private idempotency table must be explicitly deleted before accounting rows in `delete_user_data_atomic`; service dry-run and residual counts must include it. Clients get no table writes. Owner-scoped lookup always derives `auth.uid()`.
- Browser persistence is per authenticated owner, contains the exact submitted payload and uploaded attachment path, and must succeed before RPC dispatch. Uncertain attempts cannot silently mint a replacement key. Recovery bypasses mutable client preflight; DB remains authoritative. Web Locks serialize same-browser tabs; database lock + unique key serialize all sessions.

## Verification plan

Use a new disposable localhost database, schema only from established local fixture; no real users copied. Compare live and local RPC definitions before candidate application. Exercise lost response/retry, reload persistence, simultaneous calls, payload conflict, separate attempts, owner isolation, rollback/retry, original/reversal, hidden category/profile/year/VAT changes, attachment reuse, deletion/ACL and unchanged journal/report inputs. Run focused client tests, typecheck, domain/regression checks, build when available, and adversarial review. No hosted writes.

Before Staging and Production acceptance: synthetic representative ordinary purchase/sale and periodized purchase; inspect VER/journal, VAT fields/periods, NE and dashboard balances, unchanged receivable state, correction and next-year reversal, lost-response recovery and attachment. Exact candidate and migration approval required separately. Production remains untouched.

## Final implementation and migration

- `src/lib/standardBookingAttempt.ts`: owner-specific durable storage, exact payload/key, strict result parsing, confirmed-rejection versus indeterminate errors. Corrupt/unavailable persistence blocks dispatch. An unresolved attempt cannot be replaced by changed form content.
- `src/app/page.tsx`: Web Locks across tabs; synchronous same-page submit guard; save before booking RPC; visible resume action after reload even when a category/year/profile/subscription gate has since changed. Replay uses the saved payload without reinterpreting current facts. Reuses attachment path; confirmed rejection restores editable values and retains the attachment for the corrected attempt. Confirmed booking, local receipt cleanup, and subsequent data refresh have distinct messages. Favorites and historical metadata edits remain available.
- `src/lib/accountingService.ts`: verified auth owner; fail-closed `get_standard_booking_protocol() = 1` before dispatch. Existing wrappers now require/forward a key and parse the same receipt contract. No new financial write is sent to a pre-migration DB.
- `20261017190000_kan80_standard_booking_idempotency.sql`: private table with `(user_id, idempotency_key)` primary key, FK cascade on Auth user, exact JSONB request, kind, timestamp, success receipt. RLS enabled with no client table privileges/policies; service role SELECT only for deletion inventory. Identity comes only from `auth.uid()`. Same owner/key is serialized across both RPCs by transaction advisory lock; lookup and exact request/kind comparison precede all existing validations. New successful accounting and receipt are saved atomically. Rejection after lookup rolls back the entire inner booking block including VER allocation; raw uniqueness/serialization/deadlock failures remain indeterminate. Existing SQL accounting cores are byte-for-byte preserved. No public delegate was introduced; old no-key requests are rejected.
- `delete_user_data_atomic` explicitly deletes receipts before accounting rows and returns the count. `supabase/functions/delete-user/index.ts`, `src/lib/adminDeleteDryRun.ts` and their existing test include dry-run/residual-count parity. No protected-row trigger is needed on the private table because clients cannot mutate it; the controlled definer functions own writes/deletion. No transaction FK is added; bookkeeping rows remain protected by existing write boundaries and atomic deletion removes the private receipt domain explicitly.
- `package.json`, focused test scripts and the existing amount/service regression exercise the new boundary. Dependency lockfile unchanged. `Architecture.md` and `PROJECT_STATE.md` describe this local candidate. Exact candidate inventory: `KAN-80-candidate-files.json` (excludes its own hash).

## Verified results, 2026-10-17

| Check | Result |
|---|---|
| Fresh schema-only disposable localhost bootstrap | PASS; all three pre-change RPC definitions exactly matched inspected Production |
| Entire final migration on empty local fixture | PASS; no hosted execution |
| Existing accounting cores compared with live definitions | PASS, byte-for-byte |
| Ordinary/periodized journal, balance, dashboard/VAT/SIE inputs, NE summary | PASS, 20 old/new scenarios, rates 0/6/12/25, purchase deduction full/none, sales |
| Real PostgreSQL commit then simulated lost transport result and retry | PASS, same identifiers and unchanged complete accounting/VER/receipt census |
| Real simultaneous identical RPC sessions | PASS, both kinds, observed lock wait and one receipt |
| Changed request fields/attachment/kind with same key | PASS, rejected without new rows |
| Different keys, same content; two owners sharing a key | PASS, separate intentional bookings and isolated results |
| Invalid amount and real journal-trigger error | PASS, no partial rows/VER/receipt; corrected retry works |
| Late periodized reversal failure | PASS, original and reversal and VER allocation all rolled back |
| Changed category visibility, VAT profile, deduction, locked original/future years | PASS, exact replay succeeds while fresh attempts remain blocked |
| Real ordinary/periodized corrections and past VAT-period closing | PASS, replay preserves original receipt; closed period still blocks fresh attempts |
| Adversarial repeatable-read stale snapshot | PASS, cannot misreport prior success as a confirmed rejection |
| Owner/ACL/RLS and atomic deletion count/residuals | PASS, owner B unchanged when A deleted; synthetic fixtures removed |
| Browser storage and actual page-handler regression | PASS, reload, immutable payload, errors, storage failure/corruption, attachment reuse and tabs |
| Actual Home + TransactionForm in Chromium | PASS at 1280/390 px, actual reload, localStorage, Web Locks across two pages; external network intercepted; attachment uploaded once |
| Old/missing/unknown DB protocol | PASS in actual service tests, zero booking dispatches |
| TypeScript and production build | PASS; build used synthetic environment values only |
| Full `npm run test:regression` | PASS including domain, history presentation, UI round, category visibility, new booking browser test and public Playwright smoke 2/2 |
| Admin deletion contract test | PASS |
| Full repository lint | FAIL, existing debt: 86 errors / 7 warnings. Changed-source comparison: zero new diagnostics; page errors 13 -> 11, other changed product TS files 0 |
| `git diff --check` | PASS |

Evidence generated in `test-results/kan80/`: DB result, lint comparison, browser result and desktop/mobile pending/result images. Raw build/regression/DB logs and read-only live-schema evidence are in the parent of this isolated clone. Playwright clears its generated output directory during a regression run; the final DB/lint summaries were regenerated afterward. None of these generated artifacts contain credentials or real accounting data. Visual screenshots were inspected.

## Adversarial review and limits

Self-review plus executable adversarial cases; no subagent or independent reviewer was invoked. Corrected risks: structured errors after an earlier unknown success must not release the attempt; post-confirmation refresh failure must not claim booking failure; changed gates must not block replay; an older DB must not silently ignore the new key; stale transaction snapshots must not return a false confirmed rejection; rejected attachment reuse must remain explicit.

No known unresolved KAN-80 correctness defect was found in the checked surface. This is not a Staging/Production acceptance claim. SQL/service tests and offline browser tests exercise complementary boundaries; a hosted authenticated end-to-end roundtrip and Pontus acceptance remain before release. The general hosted/write E2E suite was not run because no hosted writes are approved. Existing unrelated lint debt remains.

Persistence/recovery is bound to the current browser profile and owner. Manually deleting browser data, changing device/profile or corrupting it cannot recover a lost client key automatically; corruption blocks new booking for manual support. Web Locks and working localStorage are required; unsupported browsers fail closed. Reload before attachment upload has completed can require selecting the file again; no booking RPC is sent before the payload and uploaded reference are durably saved. After a confirmed rejection the restored attachment reference remains in the page until corrected booking/removal; reloading then may require a new file selection. These are not uncertain booked attempts.

## Release boundary and next step

Local branch `codex/KAN-80-booking-idempotency`, HEAD/base `af0378ae0935518346360e3492c38175e2c270d2`, rechecked against GitHub main at completion. All candidate changes remain unstaged/uncommitted. Separate unmanaged clone under the current chat visualization directory; no managed-worktree cleanup, archive or removal invoked. Held Staging KAN-62/65 excluded.

Ready for local commit review, then a separately approved Staging candidate. Suggested commit: `KAN-80: make ordinary and periodized booking attempts durable and idempotent`.

After explicit approval only: publish the exact committed candidate, inspect target ledger/definitions again, prepare the established isolated CLI runner from the target's actual ledger (known missing historical KAN-84 repo migration and held Staging versions remain outside this change), and ensure dry-run proposes only this new migration. Never replay the baseline/history or use include-all/repair. Apply migration first through official CLI preserving version, verify protocol/ACL/definitions/ledger, then deploy matching delete-user Edge inventory and application. Older app tabs then fail safely until reloaded. New app must not be paired with an old DB. App rollback while keeping this migration would stop old no-key booking; do not silently reopen the old unsafe path.

Staging acceptance before Production: dedicated synthetic owner; ordinary purchase + sale and periodized original/reversal, attachment, intentionally lost response/reload, two tabs, journal/VER, VAT report and period, NE, dashboard/balances, receivable state unchanged, correction and next-year behavior. Pontus verifies notices and workflow. Production requires separate exact-commit and exact-migration/deploy approvals and the same scoped non-destructive post-release verification.

Performed: Jira read, GitHub read/fetch into isolated clone, Production schema-only read, local implementation and disposable DB tests. Not performed: Jira mutation, hosted migration/data write/config change, Edge deployment, application deployment, commit or push. No credentials read/displayed/copied/hashed and no real user data used as fixtures.
