# KAN-72 journal index: local candidate and rollout

## Definition and scope

Migration: 20261014123000_kan72_journal_user_ver_index.sql.
Index: public.idx_journal_entries_user_id_ver_nr, non-unique B-tree (user_id uuid, ver_nr integer), default ascending order, no WHERE, expressions or INCLUDE fields.

Existing indexes on id, transaction_id, user_id and account_number remain. The integrity query still needs transaction_id for its other OR branch. No index removal, RPC, report, RLS, grant or accounting-rule change. No new persistent data domain/deletion lifecycle. Original migration 20261014100000 is byte-identical.

The migration creates concurrently and validates table, method, key order/count, non-uniqueness, validity/readiness/liveness, no predicate/expression/include and default sort options. IF NOT EXISTS alone is not accepted as sufficient verification. Name collisions and invalid/incomplete builds raise SQLSTATE 55000; no automatic repair/drop.

## Executable SQL

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_journal_entries_user_id_ver_nr
  ON public.journal_entries USING btree (user_id, ver_nr);
```

The actual file starts with -- pg-delta: transaction=false on the absolute first line and also includes the catalog validation DO block. Run the full reviewed file, never a rewritten historical migration.

## Ordinary versus concurrent creation

| Method | Writers | Transaction behavior | Recovery |
|---|---|---|---|
| CREATE INDEX | Blocks writes until its transaction ends | May run in a transaction; tested create + ROLLBACK | Transaction rollback removes an uncommitted build |
| CREATE INDEX CONCURRENTLY | Compatible with ordinary DML; can wait for existing writers/old snapshots and adds CPU/I/O | Cannot run inside BEGIN or a pipeline transaction; tested SQLSTATE 25001 | Not atomic as a whole; interruption can leave an INVALID index |

Original Supabase CLI 2.120.0 index/ledger probes (retained evidence; these did NOT prove the directive was honored):
- Single concurrent statement applied with migration up and recorded exact version.
- Actual two-statement candidate applied using db push --skip-vault.
- Full actual file applied using migration up; later db push was up-to-date.
- Reversed-key collision failed and its migration version was not recorded.
- Concurrent index prebuild followed by original KAN-72 + index migrations preserved the index OID and recorded 20261014100000 then 20261014123000.
- A transactional psql runner was explicitly rejected before persisting the index.

The corrected first-line directive is now verified by real transaction-ID probes for both commands below. Pin npx --yes supabase@2.120.0 for this release; rerun the local protocol tests if the version changes. Supabase GitHub database branching runs files transactionally and does not honor this directive: do NOT use that runner for this migration. Do not use MCP apply_migration or a generic transactional SQL-editor batch.

Primary references:
- [PostgreSQL 17 CREATE INDEX](https://www.postgresql.org/docs/17/sql-createindex.html)
- [Supabase CLI nontransactional workflow](https://supabase.com/docs/guides/local-development/cli-workflows)
- [Supabase branching runner limitation](https://supabase.com/docs/guides/deployment/branching/github-integration)

## Independent-review findings corrected (2026-10-14)

The previous review was PASS WITH NOTES and explicitly NOT commit-ready. Its P2 directive and P3 test findings are now corrected locally; a renewed independent review is still required. No commit/push/merge/deploy/hosted write/Jira change was performed.

P2: moved -- pg-delta: transaction=false from line 3 to the absolute first line, without a BOM or preceding heading. After removing only that directive line, the migration is byte-identical to the pre-fix candidate: the index definition and catalog DO guard are unchanged.

P3: index creation alone was a false positive for the directive contract. CLI 2.120.0 special-cases CREATE INDEX CONCURRENTLY even when the directive is ignored. The new suite copies the actual migration into an isolated fixture and appends two ordinary DO statements that insert txid_current() into a fixture-only table. Distinct persisted transaction IDs prove separate transactions; equal IDs fail the same autocommit assertion. Probe SQL is never added to the release migration.

Both migration up and db push --skip-vault --yes are tested on fresh data-empty local clones, with the CLI pinned to 2.120.0. Negative controls remove the directive or prepend two comments to place it on line 3. All controls still create a valid index and record the migration version, but MUST fail the transaction assertion. A CLI/connection/index failure cannot count as successful mutation detection. If the pinned CLI ignores the actual first-line directive, the positive case fails.

| CLI command | Fixture | Transaction IDs | Autocommit assertion |
|---|---|---|---|
| up | actual | 47761 / 47762 | PASS: separate transactions |
| up | missing | 47770 / 47770 | RED: same transaction |
| up | line3 | 47777 / 47777 | RED: same transaction |
| push | actual | 47785 / 47786 | PASS: separate transactions |
| push | missing | 47794 / 47794 | RED: same transaction |
| push | line3 | 47801 / 47801 | RED: same transaction |

Additionally, the same test script was run against separate SOURCE copies with the directive moved to line 3 or removed. Both processes exited 1 at up_actual (the behavioral assertion, before the first-line check). The line-3 copy recorded 59254 / 59254; the missing copy recorded 59274 / 59274. Original worktree SQL was never temporarily mutated.

Current evidence: C:/Users/Familjedator/.codex/visualizations/2026/10/14/01a13a0a-f224-70a2-8949-b549ce26f191/index-tests/run-1791975469956/directive-contract.json and results.json; C:/Users/Familjedator/.codex/visualizations/2026/10/14/01a13a0a-f224-70a2-8949-b549ce26f191/source-mutation-line3.log and source-mutation-missing.log. The original index file also passes the existing uninstrumented CLI application/ledger/collision checks.

Current verification:
- Full npm run test:db-index PASS: six directive cases, existing index contracts/eight collisions/real invalid-build recovery, CLI ledger/failure checks, twelve ABBA trials and 12,600 successful synthetic bookings. All prior public indexes (definitions/OIDs/flags), RPC definitions/ACLs, table ACL/RLS, policies and constraints are invariant across index creation/removal.
- Full local npm run test:db-regression PASS, eight rollback fixtures with the index installed in s72idx_fixreg_prod_mv8002u5, verified ::1:5432. Zero remaining users/accounts/transactions/journals/numbers. Schema-only local copy; existing tax-reference seed extracted from repo migration 20261007160000. First attempt lacked that seed and stopped at KAN-36; after fixture setup correction, all eight pass. No user data copied.
- npm run test PASS (38 domain scripts, admin-delete dry-run and DB invariants); npm run typecheck PASS; npm run test:e2e:safety PASS.
- npm run test:regression PASS, including public Chromium 2/2. Existing process-only webpack fallback and synthetic loopback Supabase values; no env/source change or hosted request.
- Full lint remains FAIL: baseline and candidate both 86 errors / 6 warnings, identical diagnostics. Lintdiff PASS: zero new diagnostics; changed test script zero errors/warnings.
- git diff --check PASS; app code, all previously committed migrations and package-lock remain unchanged. package.json retains its prior test:db-index addition and was not edited in this remediation.
- Not run: authenticated/write browser E2E, hosted migration/acceptance, production build and cold-cache/hosted load testing. Hosted writes are outside authorization; build is unnecessary for a SQL/test/doc-only correction. Historical Production/Staging/prebuild regression results below are retained evidence, not newly rerun Staging acceptance.

Physical access paths only: no journal contents, sources, amount logic, VAT/NE/result/dashboard/payment/correction/SIE/year-end or deletion behavior is modified. Accounting browser acceptance remains a separate future Staging step for original KAN-72.

## Hosted execution is NOT approved or performed

Operational P3 race risk: catalog validation is an after-check, not a lock against another privileged operator. Permit ONE migration operator at a time, with no simultaneous privileged index/schema changes (including manual DDL and other migration runners). Stop on unexpected identity/definition/flags. Always recheck exact definition plus indisvalid/indisready/indislive after application. An invalid index after interruption requires a separately approved recovery; no automatic cleanup/retry. Ordinary bookkeeping DML can continue under the approved concurrent-build plan.

Recommended path after independent review and exact separate approvals:
1. Read-only reverify target project, ledger, journal metadata/index names, table/row size, active writers/long snapshots and backups. Inspect any pre-existing same-name/equivalent index; stop on collision/invalid flags.
2. Verify the EXACT hosted connection is TLS-protected and maintains session continuity. Use direct Postgres or the established Staging Session Pooler (5432); never the Transaction Pooler. A successful local protocol test does not verify hosted routing/auth/session continuity.
3. Approve operation-specific connection/lock/statement timeout values based on table size and active load; monitor pg_stat_progress_create_index and pg_stat_activity. No unbounded retry or auto-drop. Do not set transaction-local parameters around CONCURRENTLY.
4. Apply using pinned official CLI, explicit verified destination, --skip-vault, without --include-all/--include-seed/--include-roles. Dry-run must show only the exact approved pending versions.
5. Verify the recorded version and stored SQL, exact index definition, indisvalid/indisready/indislive, existing index set and unchanged RPC/RLS/grants; then run separately approved Staging acceptance.

Staging has test data, so direct ordered CLI application of 20261014100000 then 20261014123000 is reasonable when no write acceptance runs during the build. Plain CREATE INDEX would be permissible only in an explicitly approved maintenance window; it is not this candidate's SQL.

Production may be booking while migration 20261014100000 activates the broader integrity checks. To avoid a temporary unindexed interval:
- Separately approve and prebuild the SAME named index with one standalone CREATE INDEX CONCURRENTLY outside a transaction, before activating KAN-72.
- Verify its exact definition/flags.
- Apply the exact two approved files through official CLI in timestamp order. The index file then validates/reuses the already built index and records its original version without rebuilding.
This complete order was simulated locally and passed all eight Staging DB regressions. It requires TWO separately approved hosted steps (prebuild DDL, then official migration application); the local candidate is not authorization for either.

If hosted connection continuity or the installed runner cannot be verified, STOP. No fallback to Production, transactional executor or manual migration-history repair.

## Local tests and reproduction

From the separate codex/KAN-72-journal-user-ver-index worktree:
- Set only the established local PGPASSFILE in the process, without reading/disclosing it.
- npm run test:db-index (full contracts + ABBA performance suite)
- npm run test:db-index -- --directive-contract-only (both CLI commands and all directive controls, without the performance suite)

Requires PostgreSQL 17 tools at C:/Program Files/PostgreSQL/17/bin, the established DATA-EMPTY sololedger_kan72_staging_test template, and Node/npm with pinned CLI available. Connection is hardcoded localhost:5432/postgres; actual server/database preflight rejects anything else. PGHOSTADDR/service overrides are removed. No hosted URL accepted.

Generated scripts/logs/raw JSON default to C:/SoloLedger/LocalTest/kan72-index-evidence/run-<time>/, outside Git. This remediation uses process-only KAN72_INDEX_EVIDENCE_DIR=C:/Users/Familjedator/.codex/visualizations/2026/10/14/01a13a0a-f224-70a2-8949-b549ce26f191/index-tests; see current evidence above. Disposable DBs are uniquely named s72idx_* and retained. Original templates are only read; no user/accounting data copied.

Contracts cover:
- Creation/exact definition/nonunique multiple journal rows, idempotency (same OID).
- Eight name collisions: reversed, unique, partial, INCLUDE, descending, wrong table, hash, table object.
- Real failed concurrent build: local writer lock + timeout -> nonunique INVALID index; rerun fails closed; explicit drop/rebuild recovers.
- Regular CREATE + ROLLBACK; concurrent explicit drop restores original schema.
- Full public RPC definitions/ACLs, table ACL/RLS, policies and constraints unchanged.
- CLI execution, ledger identity and failed-version handling; actual autocommit transaction IDs and mandatory missing/line-3 negative controls for both up and push.

Performance method:
- Both modes use identical approved KAN-72 RPCs; index is the only schema difference.
- 1k/10k/100k owner journal rows plus 1k other-owner rows, fresh clone each trial.
- ABBA order without / with / with / without, two repetitions per mode/size.
- Per trial: 300 ordinary VAT sales, 150 periodizations and four clients x150 mixed VAT-free bookings to isolate counter contention.
- Actual integrity SELECT and RPC EXPLAIN ANALYZE/BUFFERS; raw pgbench timings; observed waiters.
- 35 rollback-only two-row journal INSERT EXPLAIN ANALYZE/BUFFERS/WAL probes; first five discarded to measure isolated write overhead.
- Postchecks: complete balanced verifications, one transaction per verification, contiguous numbering, other-owner counter unchanged, writer-probe rows/counter fully rolled back.
- 12,600 benchmark transactions in the final run, zero failed.

## Original performance results (retained before directive correction)

Raw evidence: C:/SoloLedger/LocalTest/kan72-index-evidence/run-1791972460990/results.json and summary.json. Statistics below pooled from raw logs (600 ordinary /300 periodized /1,200 concurrent samples per size/mode).

| Owner rows | Ordinary mean without -> with ms | Periodized mean without -> with ms | 4-client p95 without -> with ms |
|---|---:|---:|---:|
| 1,000 | 2.096 -> 1.688 | 2.765 -> 2.090 | 28.536 -> 12.440 |
| 10,000 | 4.537 -> 2.235 | 7.388 -> 2.782 | 80.065 -> 15.768 |
| 100,000 | 19.419 -> 1.982 | 36.858 -> 2.094 | 359.514 -> 12.032 |

At 100k: integrity query 15.782-17.876 -> 0.185-0.188 ms, Seq Scan -> BitmapOr; shared buffers 1,554 -> 7. Index size at build: 2,981,888 bytes (~2.84 MiB). Up to three lock waiters without index and two with index; waiting is reduced, not eliminated.

Write cost is real: the controlled two-row journal INSERT median WAL bytes increased 862 -> 1,022 (+160 bytes, ~18.6%). Timing ranges overlap (100k without 0.127/0.241 ms, with 0.139/0.126 ms); no reliable isolated timing penalty demonstrated. Overall booking latency improved substantially. These local warm-cache measurements are not hosted SLOs, cold-cache tests or a long-duration production load simulation.

Original verification (current remediation results are listed above):
- Original npm run test:db-index PASS, but its CLI checks alone missed the directive defect.
- Production-shaped local index DB: all eight original rollback fixtures PASS.
- Staging-shaped local index DB: all eight adapted rollback fixtures PASS.
- Prebuild + official ordered CLI simulation: all eight Staging fixtures PASS.
- npm run test, typecheck, DB invariants, E2E safety PASS.
- Full safe regression: 38 domain scripts + public Chromium smoke 2/2 PASS, established process-only webpack fallback with synthetic loopback.
- New test script lint: zero errors/warnings. No app code changed; inherited full lint findings are unchanged.
- No hosted write acceptance, hosted migration, production build or cold-cache test run.

## Rollback / interrupted build

CONCURRENTLY cannot be undone with transaction ROLLBACK.
- If build/guard fails, read flags and exact relation identity first. Do not rerun IF NOT EXISTS blindly.
- For a confirmed candidate-owned invalid index, separately approve one standalone DROP INDEX CONCURRENTLY public.idx_journal_entries_user_id_ver_nr, then retry the original reviewed migration. Do not touch other indexes.
- A valid applied index should be removed only with a separately approved compensating migration/operation; retain the already-recorded migration history. No repair/delete of ledger rows.
- Removing the index changes performance, not journals/RPC integrity. P2 latency cost returns; keep KAN-72 checks intact.
- Concurrent removal may itself wait for sessions. Reverify destination/timeout/monitoring and rollback acceptance.

## Both release tracks

Original commits remain unchanged:
- Production-based 5ae670c326932abb44a360c10308db3de8c6a371.
- Staging-integrated 920c50ee3ef575877d47872adec5bb9a7fe98ebc.

After separate commit approval, the index commit is additive above the Production-based KAN-72 branch. Bring ONLY that index scope onto a new branch based on 920c50e after separate integration approval; preserve each track's status docs when resolving any conflict. Byte-identical index SQL/version in both tracks. Do not merge Staging wholesale into Production.

Current hosted ledgers: Production 36 versions, Staging 38; both lack KAN-72 20261014100000 and index 20261014123000. Resulting approved sets: Production 38 versions, Staging 40. The two KAN-62 migrations remain Staging-only; KAN-65 product code stays out of Production.

Required future approvals: local index commit; local Staging integration/commit; each environment's exact hosted DDL/migration/cleanup steps; Staging publication and write acceptance; exact Production code release. No Jira mutation is included.
