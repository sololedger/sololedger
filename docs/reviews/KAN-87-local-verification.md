# KAN-87 – local implementation and verification, 2026-10-17

## Scope and approval boundary

Pontus approved the limited KAN-84 presentation adapter, positive refund display and neutral reclassification display for local implementation only. Base: origin/main 7467143e3221b012b3d0e49397e2b0c8d3b6f445. Isolated branch codex/KAN-87-history-presentation. No commit, push, merge, deploy, migration or hosted write is authorized or performed.

## Result

- Four reclassifications: short Adobe title, amber Bokföringsrättelse badge, neutral Omfört 285 kr and Ingen ny bankbetalning, with corroborated original VER reference.
- October payment: Adobe – bankbetalning oktober 2026; original outgoing amount presentation retained.
- Five VAT V2 purchases: Adobe – EU-tjänst juni/juli/augusti/september/oktober 2026, using the verified service month, not the common booking date.
- Five refunds: Adobe – återbetalning, +57 kr in green, Inbetalning till bank. The existing isIncome classification is unchanged.
- Original payments remain original and searchable. The synthetic complete fixture finds all 19 relevant entries on Adobe, including the five EU purchases. Full original descriptions, VER and accounts remain searchable.
- Same presentation metadata and detail component in desktop, mobile and expanded attachment groups. Full original text is available in a native details disclosure. Journal, attachment signing, row actions, grouping, sort and pagination retain original identities/behavior.

## Provenance / fail-closed contract

This is deliberately not a general supplier or correction detector. The adapter requires one explicit owner across loaded history, unique transaction IDs, all 15 members of one KAN-84 generator batch, one exact owner-folder PDF reference, the four original verifications, exact technical categories/sources, dates, stored magnitudes, VAT rates, journal membership/ownership/dates/VER/accounts/debit/credit and the validated generator grammar. Invoice and credit-group consistency are checked. Existing corrections targeting these verifications disable the adapter. It does not embed real user IDs, transaction UUIDs, batch UUIDs, paths or invoice numbers.

The historical contract is intentionally limited to the inspected 2026 KAN-84 VER-18–32 and originals VER-10/12/13/15. Labels are not inferred from free description words, an amount or shared attachment alone. No tx.is_correction, corrects_ver_nr, source, category or booking object is modified. Missing/inconsistent evidence returns original presentation for the batch. This means a later changed/incomplete/corrected package can lose the short display; it never silently acquires a guessed interpretation.

## Root cause and accounting integration impact

The pre-existing ordinary table renderer prepends + or - based on isIncome; isIncome is based on credit to a 3xxx account or owner-deposit category. A refund debiting 1930 and crediting 1680 is not sales income, so it received a red minus despite its positive stored magnitude. The new amount label is independent of that classification.

Earlier read-only Production analysis verified positive refund magnitudes/journals and existing live balance-RPC definitions. Current implementation reused the preserved read-only KAN-84 snapshot locally: exactly 15 classifications (4 reclassifications, 1 payment, 5 EU purchases, 5 refunds). No new live call or sensitive fixture copy was needed. No real IDs or source documents were written to the repository.

Integration surface remains unchanged: journal entries/RPC writes, sources/metadata, VAT periods/declarations/aggregation/dashboard VAT, result/NE/balance/year-end, bank calculations/safe withdrawal, receivables/payments/settlements, correction and undo mechanisms, locked periods and SIE import/export. The helper only supplies display/search metadata. No new source value is introduced. The pure immutable-fixture test checks bank/result/account balances before and after presentation/group/filter operations. Existing VAT, NE, dashboard, SIE and lifecycle regression tests pass. Broad accounting/write E2E is not applicable to this display-only change.

## Verification

- PASS npm run typecheck.
- PASS focused ESLint on new helper/component, changed group/filter and all three new test/fixture files.
- TransactionTable ESLint: exactly 13 pre-existing errors and one warning before/after. Messages identical after normalizing shifted diagnostic line numbers. No new finding; full lint is not green.
- PASS test:history-presentation: expected titles, positive refunds, neutral reclassification, original references, badge distinctions, all-19 search, full original/VER/account search, untouched frozen input and unchanged bank/result/account balances. Negative cases include ordinary text/amount/evidence, mixed owners, wrong/missing member/category/source/journal/ownership/account/direction/amount/evidence/month/reference/VER and new corrections.
- PASS test:history-presentation-ui on actual TransactionTable at 1440 and 390 px with real Tailwind and mocked Storage. Validates signs/classes, four badges, five EU month titles, original disclosures, original ordinary cost/income/KORRVER display, all-19 search, 15 expanded group members, private signing arguments, exact action identity, no mutation, no page errors, no HTTP requests and no mobile overflow.
- PASS existing test:domain, test:history-groups and test:history-ui (all eight existing synthetic desktop/mobile scenarios), through the safe regression run.
- Safe-regression runner caveat: npm run test:regression passed every domain/component stage but exited 1 when public smoke startup hit a Turbopack dependency-junction/root error. One bounded environment retry used a local next dev --webpack server and the exact same public-auth.spec.ts/Chromium tests: 2/2 PASS. Thus all safe regression test components have passed; do not describe the standard wrapper's initial exit as zero. No product configuration was changed to work around the environment.
- Final focused UI rerun only adds readable row/group screenshot evidence; no product changes since the safe regression tests.
- Visual inspection: mobile reclassification/refund cards, desktop expanded reclassification and full mobile overview reviewed. Evidence: git-ignored test-results/history-presentation/ (synthetic only).

Test runtime: existing dependencies reused through a local node_modules junction to the preserved KAN-86 worktree. No install or lockfile/env change. Public smoke used dummy process-only Supabase values and localhost; no login or database access. The initial Next process terminated on the root error; the alternate local server is stopped after verification.

## Pontus manual acceptance before publication

1. Verify four neutral Omfört 285 kr entries and amber Bokföringsrättelse badges, correct original references, Ingen ny bankbetalning, and unchanged original payments.
2. Verify five green +57 kr refunds labelled Inbetalning till bank, with original 1930/1680 journals and no correction badge.
3. Search Adobe: all originals plus all 15 new KAN-84 verifications should appear within the selected 2026/all-category view. Check each EU service month, including June despite the October booking date.
4. Open original descriptions and attachments, then toggle grouping and inspect equivalent details on desktop/mobile. Confirm search pauses grouping and ordinary transactions/KORRVER/SIE undo remain familiar.

Jira is handed to Pontus In Review after automated verification, never Done. Publication remains a separate decision; local changes remain uncommitted.

## Isolated Staging Preview preparation, 2026-10-17

**PASS for isolated source delivery preparation. STOP before commit/deploy and before claiming complete KAN-87 acceptance inside Staging.** Pontus approved preparation only. No additional product code or broad test run in this step.

### Candidate and exact delivery manifest

Worktree/branch remain kan87-history-presentation / codex/KAN-87-history-presentation. HEAD and current GitHub main are both **7467143e3221b012b3d0e49397e2b0c8d3b6f445**. GitHub staging remains **5809094dd3ce808dba35986c65e772b842f0d0e1**. No commits exist between main and HEAD, nothing is staged, and no staging merge is needed. Candidate means this base plus exactly these twelve uncommitted files:

1. Architecture.md
2. PROJECT_STATE.md
3. docs/reviews/KAN-87-local-verification.md
4. package.json
5. scripts/fixtures/kan84-presentation.ts
6. scripts/test-transaction-history-presentation.ts
7. scripts/test-transaction-presentation-ui.mjs
8. src/components/AttachmentTransactionGroup.tsx
9. src/components/TransactionPresentation.tsx
10. src/components/TransactionTable.tsx
11. src/lib/transactionHistoryFilters.ts
12. src/lib/transactionHistoryPresentation.ts

The six tracked modifications plus six untracked files exactly match this list. Product/test LF-normalized fingerprint (excluding docs): **4963de36e2eb8f7d54abbc3ba23da2c5213e19027d4e0fb236da5e407fd3bb49**, unchanged during preparation. The complete base source plus these twelve overlays is prepared outside the repo at C:/Users/Familjedator/.codex/visualizations/2026/10/16/01a146e5-91e8-7401-839c-6aa74b5355ef/kan87-preview-preparation/source-lf; its manifest/dry-run receipts are outside the commit scope. It is an uncommitted candidate, not a Git commit or deployment. An initial archive using inherited autocrlf failed byte verification before any dry-run/upload; preserve that local attempt, and use explicit core.autocrlf=false for the verified archive as established in KAN-86. No source change or weakened byte check is needed.

No .env/auth/credential, node_modules junction, .next output, .vercel state, audit-packages, ignored screenshot or unrelated working file may enter that source copy. All other files must match the base Git blobs; changed files must match their Git-clean content. No baselines/migrations are executed. Existing main SQL history is only inherited source, not a request to apply it.

### Database and isolation findings

Scope inspection confirms no changes to supabase/, migrations, RPC calls/implementations, loaders, reports, source values, amount storage, bank/result/NE/VAT logic, payments, SIE/export or next.config.ts/package-lock.json. The display helper has no I/O and the shared component only renders metadata/original text. No database write, migration or bookkeeping change is required by KAN-87 itself. Existing canonical/KAN-84/KAN-86 dirty files remain outside this candidate.

### Vercel target and publication plan — not executed

- Existing project sololedger, ID prj_chkSdedE06ppK2PlsqdtOhZfAKpT, scope sololedger1 / team_0Mrj7LMvSEfpbV8y5juQ5IiL. Read-only metadata confirms Next.js, Node 24.x, no custom root/build/install command and existing SSO protection all_except_custom_domains.
- Preview metadata has non-branch-specific public Supabase variables and a protected sensitive service-role variable. Only the two allowlisted NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY values were retrieved individually through the documented read API. URL is https://fzxqiqenqjzhlyxxpvhg.supabase.co; public Auth settings GET 200. No value was printed or saved, no server credential retrieved, no env/configuration changed.
- Security boundary: an initial full Preview-environment pull was rejected by automatic review because it could retrieve server secrets. It did not execute. The successful alternative reads only metadata and the two browser-public values. Never reuse the earlier KAN-86 full-pull preflight unchanged. Server-key value/project binding is not verified by this preparation. Future deployment effective build/runtime bindings remain to be verified for that exact candidate.
- Official existing Vercel CLI 64.0.2 help confirms deploy --dry inspects source without upload/deployment. Only this non-publishing inventory operation is allowed in preparation; no deployment command without --dry is run.
- After separate exact approval: create only the twelve-file local commit C (suggested message: feat(KAN-87): clarify Adobe transaction presentation), verify its sole parent is the base above, then export a fresh clean Git archive of C. Compare every source blob/overlay with the prepared manifest. No push or staging/main merge is needed.
- After separate deploy approval: use existing CLI/project/scope with explicit --target preview and candidate commit/base metadata, upload source without local dependency links or --prebuilt, and retain the unique protected Preview URL. Do not alter permanent staging aliases, Production or configuration. Verify Ready/Preview/exact source and that the actual browser/server build/runtime URL is Staging before manual use. Stop if any binding is ambiguous; do not inspect a secret or switch to Production as fallback.

### Existing Staging data — read-only findings

Established Session Pooler used with PGPASSFILE only, PGSSLMODE=require and forced read-only transactions. Client conninfo confirms TLS 1.3. Matching pg_backend_pid before/after proves session continuity. pg_stat_ssl for the backend reports false behind the pooler; it is not a measure of this client's TLS connection. No credential contents read, no rows saved to the repo, and no Production data accessed/copied in this preparation.

- Two existing KAN84 Synthetic owners have 20 and 21 transactions in 2026. Both contain four reclassifications VER-6–9, payment VER-10, EU purchases VER-11–15 and refunds VER-16–20; originals VER-2–5 use kan84_seed_original. Correction date is 2026-10-15. Their referenced objects exist.
- Applying the current helper to each dataset in memory returns **zero presentations**. This is expected: the approved contract requires the verified Production layout/date/original category. Do not loosen the rule or rewrite these older fixtures merely to make acceptance light up.
- Dedicated SoloLedger Playwright E2E still has the three KAN-86 members VER-90/91/92 in 2026, one common existing private attachment, dates 2026-10-17–12-31. Useful for normal grouping/private-file regression, not for the KAN-87-specific names/badges/signs.
- Thus no existing checked Staging dataset is suitable for complete positive KAN-87 acceptance. A successful login/group test there must not be reported as positive KAN-87 presentation acceptance.

### Manual acceptance options / leader decision

**Recommended without hosted writes: split the evidence explicitly.** Pontus manually reviews the already established synthetic real-component view locally (same TransactionTable/shared helper/styles, synthetic nineteen-entry package) for four neutral reclassifications, five positive refunds, five service-month names, all-nineteen Adobe search and full originals in desktop/mobile/expanded groups. The existing offline test harness can be served as a separate local acceptance artifact; it is not a new production route/flow and is not yet prepared as an interactive manual page in this step. Its mocked attachment opening cannot establish Storage authorization or real PDF readability. The future Staging Preview uses the existing dedicated E2E account/2026 for genuine login, ordinary rows, VER-90/91/92 grouping/private test PDF and unchanged search/sort behavior. Together these cover different surfaces; this is not a claim that Staging shows the new KAN-87 labels.

If Pontus requires the entire positive case **inside the hosted Preview**, stop for separate approval of an isolated synthetic Staging fixture. It must use fresh synthetic ownership/documents, the exact approved contract (including dates, VER layout and original category), reviewed seed/RPC plan, dedicated credentials and pre/post integrity checks. It must preserve existing fixtures and must not copy any real user IDs, transactions, descriptions, invoices, attachments or Production snapshot. This is a separate database/Storage/Auth write scope and is neither prepared as executable seed nor executed here. Do not introduce test-only production behavior or repurpose Jessika's account.

### Dependency link / build limitation

The local failure was Turbopack refusing node_modules outside its detected root, not a failed product assertion. The clean source candidate excludes node_modules entirely; cloud installation from the unchanged package-lock.json does not contain that local junction. No application/Next configuration change is justified for Preview solely by this local issue. Use a source build, not the local .next/.vercel output or --prebuilt. This removes the known junction cause, but an actual Preview build has not run and cannot be marked PASS yet. No new broad regression/build was run during preparation.

Jira remains In Review / Pontus; no Jira mutation or Done transition in preparation. Next decision: accept the split manual plan or separately authorize a synthetic hosted fixture, then separately approve exact local commit/Preview publication as appropriate.

## Superseding leader approval / publication checkpoint, 2026-10-17

Pontus explicitly approved the split manual test plan, a synthetic local demo, one isolated local commit containing the twelve reviewed paths plus strictly necessary demo code, and one isolated Vercel Preview against Staging. No Git push/merge, Production deployment, environment change, migration, bookkeeping/Storage/database write or broad new regression is approved. Historical STOP/preparation wording above records the earlier decision boundary and is superseded only for these newly approved actions.

### Exact approved commit scope: thirteen files

The twelve-path manifest above remains unchanged, plus **scripts/kan87-demo.mjs**. No package/dependency/lockfile change is needed for the demo. Product/test fingerprint remains 4963de36e2eb8f7d54abbc3ba23da2c5213e19027d4e0fb236da5e407fd3bb49 (demo script and docs excluded). Current GitHub main and candidate parent rechecked as 7467143e3221b012b3d0e49397e2b0c8d3b6f445; staging remains 5809094dd3ce808dba35986c65e772b842f0d0e1. No other commit or staging integration belongs in this candidate.

### Local demonstration

- Run **node scripts/kan87-demo.mjs** from this worktree. Open **http://127.0.0.1:3097/**. The server binds loopback only; Ctrl+C stops it. Build-only option **node scripts/kan87-demo.mjs --build-only** writes an offline HTML file to ignored test-results/kan87-demo/index.html.
- The script extracts the exact already-tested synthetic entry point from test-transaction-presentation-ui.mjs and bundles actual TransactionTable, TransactionPresentation, the presentation helper and real Tailwind. A marker mismatch stops rather than guessing. It adds a manual checklist/banner outside the product component.
- Only synthetic fixture ownership/batch/invoices/original text and existing synthetic ordinary/correction examples are used: 19 relevant Adobe entries plus five unrelated regression examples. No Production snapshot, user document or credential is read.
- Supabase/Storage is replaced at bundle time. Strict CSP blocks remote connections; actions remain synthetic callbacks. Attachment buttons only explain that this is a synthetic demonstration and open no real document. It cannot prove Storage authorization; hosted Staging supplies that separate evidence.
- No Next route or src import references the demo. Generated HTML is ignored and never enters the clean deployment source. The script is test tooling, not an application entry point, public product feature or production build output.
- Focused checks PASS at 1440/390 px: four badges/neutral amounts, five green refunds, five service-month labels, nineteen Adobe search hits, full original disclosure, fifteen-member group, synthetic attachment behavior, no unexpected network or input mutation. New-script ESLint PASS. No broad test rerun or product change.

### Publication execution boundary

Before the approved local commit: verify exactly thirteen paths and no staged unrelated changes. After commit: verify sole parent and complete manifest, export clean source with core.autocrlf=false, compare every Git blob, run non-publishing Vercel inventory and repeat only the allowlisted public Preview URL/key checks. Never perform full env pull or read a protected server secret. Submit exactly one explicit Preview to the existing project/scope, then verify Ready, uploaded source and safely observable Staging behavior. Keep the existing E2E account/private test group; do not seed/copy real or synthetic accounting data.

Post-publication identity/results will be recorded in the local state/evidence without inventing a second commit approval. Jira remains In Review; stop for Pontus final manual acceptance.
