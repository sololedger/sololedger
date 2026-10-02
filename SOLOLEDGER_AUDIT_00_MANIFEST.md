# SoloLedger External Audit #1 - Manifest

| Field | Value |
|---|---|
| Audit name | SoloLedger External Audit #1 |
| Snapshot creation date | 2026-09-30 |
| Repository | `https://github.com/sololedger/sololedger.git` / local `C:\Users\Familjedator\Desktop\Sololedger Multi User App\sololedger_multi_user` |
| Branch | `main` |
| Commit SHA | $head |
| Commit message | `KAN-28 record production IRL acceptance` |
| HEAD / origin/main / remote main | All verified as $expectedHead before generation. |
| Worktree state before generation | No tracked or staged changes; only expected untracked generated `supabase/.temp/*` files. |
| Original source file count | 83 |
| Approximate original bytes | 1417612 |
| Approximate original lines | 38252 |
| Source excerpts | None. Every approved file is included as full source. |

## Purpose And Audit Scope

This package is a canonical sanitized source snapshot for SoloLedger External Audit #1. It is intended for Microsoft 365 Copilot and Claude to receive identical files for independent review of the actual repo checkpoint, focused on VAT V2 and VAT lifecycle architecture across KAN-20, KAN-21, KAN-26, KAN-27, and KAN-28 integration surfaces.

Review focus includes VAT V2 aggregation, legacy/V1 interaction, close, declaration, VAT settlement, tax-account money movement, transaction source taxonomy, payment account roles, correction/update guards, idempotency/retry behavior, user isolation, RLS, grants, RPC boundaries, migrations/schema, frontend/backend contracts, tests, and SIE/import data shape through the write boundary.

This package represents actual repository state at the verified commit. It is not the project source of truth. The repository, durable project state, and relevant live Supabase state where necessary remain authoritative. External reviewer findings are hypotheses requiring independent verification.

## KAN-21 Jira Discrepancy

Jira currently reports KAN-21 as `To Do`, while this repo snapshot contains KAN-21 implementation/test artifacts that are included in Audit #1. This manifest documents the discrepancy without attempting to resolve it. Jira was not modified.

## Generated Audit Markdown Files

| File | Bytes | KiB | Lines | SHA-256 |
|---|---:|---:|---:|---|
| $pkgName | 318735 | 311.3 | 6931 | CF854F6C75F90D95A75AA72CF2603F27D6B19DBBBDF8A7F6DE3F93B2EC92686A |
| $pkgName | 291309 | 284.5 | 8733 | 44A17A1F16BB482B04675695818B61C6DE917989969C51836BDF8E627CE18764 |
| $pkgName | 348299 | 340.1 | 9349 | 11CB719327314B7E9F296DEFFC16320CD0E01DE14E7E6C98C664936EB26BD4C2 |
| $pkgName | 480017 | 468.8 | 13749 | 0CFDF118CCA92EA737384289FE5C78ED239990D0F7CA22401E8CBEB3DA19D779 |

The manifest contains SHA-256 hashes for files 01 through 04 only. The final SHA-256 for this manifest is reported separately after finalization to avoid a self-referential manifest hash problem.

## Original File To Audit File Mapping

| Original repo file | Audit Markdown file |
|---|---|
| $path | $([SOLOLEDGER_AUDIT_01_CONTEXT_AND_APP_CONTRACTS.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_01_CONTEXT_AND_APP_CONTRACTS.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_01_CONTEXT_AND_APP_CONTRACTS.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_01_CONTEXT_AND_APP_CONTRACTS.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_01_CONTEXT_AND_APP_CONTRACTS.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_01_CONTEXT_AND_APP_CONTRACTS.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_01_CONTEXT_AND_APP_CONTRACTS.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_01_CONTEXT_AND_APP_CONTRACTS.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_01_CONTEXT_AND_APP_CONTRACTS.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_01_CONTEXT_AND_APP_CONTRACTS.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_01_CONTEXT_AND_APP_CONTRACTS.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_01_CONTEXT_AND_APP_CONTRACTS.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_01_CONTEXT_AND_APP_CONTRACTS.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_02_VAT_DOMAIN_AND_SERVICES.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_02_VAT_DOMAIN_AND_SERVICES.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_02_VAT_DOMAIN_AND_SERVICES.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_02_VAT_DOMAIN_AND_SERVICES.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_02_VAT_DOMAIN_AND_SERVICES.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_02_VAT_DOMAIN_AND_SERVICES.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_02_VAT_DOMAIN_AND_SERVICES.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_02_VAT_DOMAIN_AND_SERVICES.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_02_VAT_DOMAIN_AND_SERVICES.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_02_VAT_DOMAIN_AND_SERVICES.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_02_VAT_DOMAIN_AND_SERVICES.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_02_VAT_DOMAIN_AND_SERVICES.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_02_VAT_DOMAIN_AND_SERVICES.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_02_VAT_DOMAIN_AND_SERVICES.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_02_VAT_DOMAIN_AND_SERVICES.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_02_VAT_DOMAIN_AND_SERVICES.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_02_VAT_DOMAIN_AND_SERVICES.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_02_VAT_DOMAIN_AND_SERVICES.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_02_VAT_DOMAIN_AND_SERVICES.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_02_VAT_DOMAIN_AND_SERVICES.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_02_VAT_DOMAIN_AND_SERVICES.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_02_VAT_DOMAIN_AND_SERVICES.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_02_VAT_DOMAIN_AND_SERVICES.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_02_VAT_DOMAIN_AND_SERVICES.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_02_VAT_DOMAIN_AND_SERVICES.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_02_VAT_DOMAIN_AND_SERVICES.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_02_VAT_DOMAIN_AND_SERVICES.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_03_DATABASE_SCHEMA_RPC_RLS.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_03_DATABASE_SCHEMA_RPC_RLS.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_03_DATABASE_SCHEMA_RPC_RLS.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_03_DATABASE_SCHEMA_RPC_RLS.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_03_DATABASE_SCHEMA_RPC_RLS.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_03_DATABASE_SCHEMA_RPC_RLS.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_03_DATABASE_SCHEMA_RPC_RLS.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_03_DATABASE_SCHEMA_RPC_RLS.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_03_DATABASE_SCHEMA_RPC_RLS.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_03_DATABASE_SCHEMA_RPC_RLS.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_03_DATABASE_SCHEMA_RPC_RLS.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_03_DATABASE_SCHEMA_RPC_RLS.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_03_DATABASE_SCHEMA_RPC_RLS.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_04_TESTS_AND_REGRESSION.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_04_TESTS_AND_REGRESSION.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_04_TESTS_AND_REGRESSION.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_04_TESTS_AND_REGRESSION.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_04_TESTS_AND_REGRESSION.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_04_TESTS_AND_REGRESSION.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_04_TESTS_AND_REGRESSION.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_04_TESTS_AND_REGRESSION.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_04_TESTS_AND_REGRESSION.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_04_TESTS_AND_REGRESSION.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_04_TESTS_AND_REGRESSION.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_04_TESTS_AND_REGRESSION.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_04_TESTS_AND_REGRESSION.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_04_TESTS_AND_REGRESSION.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_04_TESTS_AND_REGRESSION.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_04_TESTS_AND_REGRESSION.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_04_TESTS_AND_REGRESSION.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_04_TESTS_AND_REGRESSION.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_04_TESTS_AND_REGRESSION.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_04_TESTS_AND_REGRESSION.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_04_TESTS_AND_REGRESSION.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_04_TESTS_AND_REGRESSION.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_04_TESTS_AND_REGRESSION.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_04_TESTS_AND_REGRESSION.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_04_TESTS_AND_REGRESSION.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_04_TESTS_AND_REGRESSION.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_04_TESTS_AND_REGRESSION.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_04_TESTS_AND_REGRESSION.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_04_TESTS_AND_REGRESSION.md, System.Object[]].Key) |
| $path | $([SOLOLEDGER_AUDIT_04_TESTS_AND_REGRESSION.md, System.Object[]].Key) |

## Included Original Files

| Original repo file | Bytes | KiB | Lines |
|---|---:|---:|---:|
| $path | 18054 | 17.6 | 185 |
| $path | 5543 | 5.4 | 99 |
| $path | 10152 | 9.9 | 175 |
| $path | 5876 | 5.7 | 94 |
| $path | 1577 | 1.5 | 34 |
| $path | 37624 | 36.7 | 931 |
| $path | 86796 | 84.8 | 1921 |
| $path | 29820 | 29.1 | 573 |
| $path | 14284 | 13.9 | 336 |
| $path | 50493 | 49.3 | 1232 |
| $path | 36832 | 36 | 815 |
| $path | 8841 | 8.6 | 230 |
| $path | 9708 | 9.5 | 225 |
| $path | 40355 | 39.4 | 1058 |
| $path | 16712 | 16.3 | 572 |
| $path | 183 | 0.2 | 9 |
| $path | 7291 | 7.1 | 240 |
| $path | 10967 | 10.7 | 396 |
| $path | 4499 | 4.4 | 134 |
| $path | 4769 | 4.7 | 166 |
| $path | 2322 | 2.3 | 70 |
| $path | 16683 | 16.3 | 534 |
| $path | 3495 | 3.4 | 107 |
| $path | 12581 | 12.3 | 395 |
| $path | 7708 | 7.5 | 253 |
| $path | 1630 | 1.6 | 40 |
| $path | 649 | 0.6 | 18 |
| $path | 8368 | 8.2 | 274 |
| $path | 10120 | 9.9 | 306 |
| $path | 12939 | 12.6 | 468 |
| $path | 2521 | 2.5 | 61 |
| $path | 814 | 0.8 | 21 |
| $path | 14064 | 13.7 | 418 |
| $path | 2175 | 2.1 | 77 |
| $path | 3081 | 3 | 106 |
| $path | 256 | 0.2 | 4 |
| $path | 63539 | 62 | 1937 |
| $path | 784 | 0.8 | 17 |
| $path | 5728 | 5.6 | 142 |
| $path | 30679 | 30 | 745 |
| $path | 231600 | 226.2 | 6286 |
| $path | 4332 | 4.2 | 105 |
| $path | 689 | 0.7 | 21 |
| $path | 12868 | 12.6 | 376 |
| $path | 1984 | 1.9 | 48 |
| $path | 18115 | 17.7 | 489 |
| $path | 2098 | 2 | 55 |
| $path | 2086 | 2 | 44 |
| $path | 857 | 0.8 | 24 |
| $path | 5133 | 5 | 127 |
| $path | 17507 | 17.1 | 399 |
| $path | 21075 | 20.6 | 590 |
| $path | 26225 | 25.6 | 704 |
| $path | 10927 | 10.7 | 366 |
| $path | 4492 | 4.4 | 149 |
| $path | 11376 | 11.1 | 351 |
| $path | 7769 | 7.6 | 256 |
| $path | 14228 | 13.9 | 508 |
| $path | 9894 | 9.7 | 327 |
| $path | 10258 | 10 | 324 |
| $path | 7078 | 6.9 | 215 |
| $path | 6809 | 6.6 | 246 |
| $path | 5339 | 5.2 | 166 |
| $path | 10178 | 9.9 | 401 |
| $path | 6500 | 6.3 | 195 |
| $path | 10384 | 10.1 | 326 |
| $path | 8319 | 8.1 | 295 |
| $path | 15466 | 15.1 | 444 |
| $path | 17152 | 16.8 | 471 |
| $path | 9907 | 9.7 | 408 |
| $path | 10881 | 10.6 | 276 |
| $path | 7503 | 7.3 | 191 |
| $path | 28217 | 27.6 | 684 |
| $path | 33381 | 32.6 | 803 |
| $path | 7024 | 6.9 | 251 |
| $path | 20585 | 20.1 | 633 |
| $path | 29072 | 28.4 | 866 |
| $path | 25157 | 24.6 | 848 |
| $path | 32698 | 31.9 | 718 |
| $path | 38997 | 38.1 | 843 |
| $path | 25918 | 25.3 | 760 |
| $path | 24520 | 23.9 | 601 |
| $path | 22502 | 22 | 644 |

## SQL Migration/Schema Coverage

| Repo-relative path | KiB | Lines | Why needed | Role | Audit areas |
|---|---:|---:|---|---|---|
| `supabase/migrations/20260925000000_pre_kan17_cli_baseline.sql` | 226.2 | 6286 | Active CLI cutover baseline containing current reconstructed core schema/RPC/RLS/grants after legacy manual era. | Establishes baseline/current objects. | core schema, RPC, RLS, grants, close, declaration, correction/update guards, SIE/import guards |
| `supabase/migrations/20260925050113_20260925_add_vat_account_classification.sql` | 4.2 | 105 | Adds VAT account classification helpers used by later guards/close logic. | Later modifies relevant objects. | VAT account taxonomy, close, guard helpers |
| `supabase/migrations/20260925070346_20260925_delegate_vat_concurrency_account.sql` | 0.7 | 21 | Delegates VAT concurrency account behavior. | Later modifies relevant objects. | concurrency, close/booking guard support |
| `supabase/migrations/20260925124023_delegate_vat_close_account_classification.sql` | 12.6 | 376 | Updates VAT close to use classification helpers. | Later modifies relevant objects. | close, RPC, VAT account classification |
| `supabase/migrations/20260926132107_add_2645_vat_account_classification.sql` | 1.9 | 48 | Adds 2645 classification needed by VAT V2 reverse charge. | Later modifies relevant objects. | VAT V2, report/account classification |
| `supabase/migrations/20260926174535_add_vat_v2_reverse_charge_booking.sql` | 17.7 | 489 | Adds native VAT V2 booking persistence and audit snapshot behavior. | Later modifies relevant objects. | VAT V2, RPC, audit snapshots, source taxonomy, correction guards |
| `supabase/migrations/20260927070224_add_vat_profile_runtime_fields.sql` | 2.0 | 55 | Adds runtime VAT profile fields. | Later modifies relevant objects. | frontend/backend profile contract, VAT V2 readiness |
| `supabase/migrations/20260927151231_add_payment_account_roles.sql` | 2.0 | 44 | Adds semantic payment account role table. | Later modifies relevant objects. | payment roles, user isolation |
| `supabase/migrations/20260927174627_harden_payment_account_roles_acl.sql` | 0.8 | 24 | Hardens ACL/grants for payment account roles. | Later modifies relevant objects. | RLS/grants, payment roles |
| `supabase/migrations/20260928193000_add_vat_declaration_submission_date.sql` | 5.0 | 127 | Adds declaration submission date support. | Later modifies relevant objects. | declaration, RPC, frontend/backend contract |
| `supabase/migrations/20260929101500_add_vat_lifecycle_source_taxonomy.sql` | 17.1 | 399 | Adds central transaction source taxonomy and generic update/correction source policy. | Later modifies relevant objects. | source taxonomy, correction guards, update guards, RPC, grants |
| `supabase/migrations/20260929143000_add_vat_settlement_foundation.sql` | 20.6 | 590 | Adds VAT settlement events and RPC. | Later modifies relevant objects. | settlement, tax account event table, RLS, grants, idempotency, source taxonomy |
| `supabase/migrations/20260929183000_add_tax_account_movement.sql` | 25.6 | 704 | Adds semantic tax-account money movement metadata/RPC. | Later modifies relevant objects. | tax-account movement, payment roles, RLS, grants, idempotency, source taxonomy |

## Baseline Relationship

`supabase/baseline/20260911_production_schema_baseline.sql` is an audit/recovery snapshot of an older verified production state. It is not the active CLI migration chain and is excluded to avoid confusing historical recovery material with the current repo implementation snapshot.

`supabase/migrations/20260925000000_pre_kan17_cli_baseline.sql` is the active CLI cutover/reconstruction baseline. It brings the manually applied legacy era into the current migration chain and contains still-relevant current definitions for core tables, RLS, grants, triggers, and major RPCs.

The later active migrations build from that cutover baseline and modify the current VAT V2/lifecycle objects through `20260929183000`. Therefore the current implementation context is covered by the active CLI cutover baseline plus the later active migrations.

## Consciously Excluded Relevant Files And Areas

- `package-lock.json`: excluded because this is not a dependency or supply-chain audit; `package.json` is sufficient for this VAT/accounting/security package.
- `supabase/baseline/20260911_production_schema_baseline.sql`: excluded as older audit/recovery snapshot, not active current migration-chain source.
- `supabase/migration_archive/**`: excluded as historical archive that must not be replayed against current production.
- `src/lib/sieExport.ts`: excluded because it is a read/export path, not a write or lifecycle guard path.
- `src/components/Kontoplan.tsx`: excluded because account-role validation is covered by `accountingKnowledge.ts` and `paymentAccountRoles.ts`; full account UI is not central to this audit scope.
- `src/lib/calculations.ts`, `src/lib/resultEngine.ts`, `src/components/OverviewCards.tsx`, `src/components/NEBilaga.tsx`: excluded as NE/dashboard/result logic outside the selected VAT lifecycle audit subject.
- `src/app/api/checkout/route.ts`, `src/app/api/portal/route.ts`, `src/app/api/webhook/route.ts`: excluded as Stripe/subscription flows outside VAT lifecycle scope.
- `PROJECT_ARCHIVE.md`: excluded as long-term handoff history not needed for current snapshot.

## Sanitization And Exclusion Rules

The package was built from an approved allowlist of legitimate source files. Forbidden path classes were not read or copied into the package: `.env*`, credentials, passwords, access tokens, API keys, secrets, pgpass, pgpass contents, `.git`, `node_modules`, `.next`, `.vercel`, `supabase/.temp`, caches, logs, generated secret-bearing files, and other known local/credential stores.

The generated audit Markdown files are intended to be scanned heuristically for obvious high-risk credential patterns after generation. This heuristic scan cannot prove absence of all secrets.

## Structural Verification Plan

Mechanical Pass-2 validation verifies exactly 83 represented source files, no duplicate source file representation, no missing approved files, no unexpected source files, all 13 active migrations present, `src/lib/sieParser.ts` present, `package-lock.json` absent, no source excerpts, and source block text matching the original files.

## Format Limitations

- Files are Markdown wrappers around verbatim source snapshots, not runnable project source.
- Code fences use long backtick fences to preserve nested Markdown fences inside source files.
- Generated file hashes identify this canonical package for review distribution.
- Copilot and Claude are intended to receive the same five canonical files.
