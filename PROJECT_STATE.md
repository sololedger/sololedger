# SoloLedger Project State

Updated 2026-10-17: Pontus approved the KAN-67 amount-header supplement, local checkpoint and one updated isolated Staging Preview. Production and all DB writes remain unauthorized.

## Current objective / next safe step

- KAN-85/67/68 implementation and KAN-64 existing-behavior verification accepted for Staging preparation. This local checkpoint contains the exact approved UI/tests/docs plus the requested permanent worktree protection rule.
- NEXT (authorized): checkpoint the four approved paths on codex/KAN-85-64-67-68-ui with sole parent d7825e6918dad83f21e94ea39fd7d31a75d3f7f9, deploy exactly that new commit via clean archive as an isolated Staging Preview, verify READY/code/binding/unchanged Production, then stop for Pontus visual acceptance. No Git push/merge or old staging/KAN-62/65.
- KAN-88 remains separate and unimplemented; observed exempt-invoice 3010 -> R1, expected R1/R2 EJ FASTSTÄLLT until relevant business/rule verification. Explicit known limitation in KAN-67 acceptance.

## Original UI checkpoint identity / exact manifest

- Worktree C:/Users/Familjedator/.codex/worktrees/kan85-68-ui/sololedger_multi_user, branch codex/KAN-85-64-67-68-ui.
- Original checkpoint d7825e6918dad83f21e94ea39fd7d31a75d3f7f9 has sole parent/base 172f3a138874e587122ba500c8791a2ab9ac3a45. The approved supplement is a single child of d7825e6. Its new hash is reported after actual commit; no self-referential hash in committed docs.
- Exactly ten changed paths: original nine UI files plus expressly approved AGENTS.md rule:
  - AGENTS.md
  - PROJECT_ARCHIVE.md
  - PROJECT_STATE.md
  - docs/reviews/KAN-85-64-67-68-local-verification.md
  - package.json
  - scripts/test-ui-round-lifecycle.mjs
  - scripts/test-ui-round.mjs
  - src/components/CustomerInvoicesPanel.tsx
  - src/components/TransactionForm.tsx
  - tests/e2e/kan46-staging-write.spec.ts
- Deployed checkpoint product/test fingerprint (before approved KAN-67 supplement): 5ccd25c7567384f73d2cafe64db244e9d1e7b5daf2c77a1d99e7e11584d48eb6. Checkpoint product edits only in two components; current supplement affects CustomerInvoicesPanel and its existing UI test only. KAN-64 deduction behavior, shared date component/parser, accounting/RPC/report/NE engines and package-lock unchanged. No migrations, credentials/private attachments/audit-packages or other-worktree overlay included.

## Isolated Preview, verified 2026-10-17

- Checkpoint d7825e6918dad83f21e94ea39fd7d31a75d3f7f9; sole parent 172f3a138874e587122ba500c8791a2ab9ac3a45. Exact ten-path delta reverified. Clean git archive matches all 330 committed files byte-for-byte; 329 Vercel uploads (.gitignore omitted) match their hashes.
- Deployment dpl_7eu5z6K5cW1JXisFRhqunccRNgdL READY, explicit target preview in existing SoloLedger project; no Git push/merge. URL above.
- Preview public Supabase URL/key checked against fzxqiqenqjzhlyxxpvhg. Nine observed published client scripts contain Staging ref and no wbaxmuvudpnkvuliicuy. No full env pull/server-secret retrieval; server credential binding not independently verified.
- Production dpl_3qo6dpN7Dqb78BqqeNrj1fzJkMe1, aliases and approved main code unchanged; remote main/staging unchanged. No older staging/KAN-62/65 included.
- Agent Preview check: public login desktop 1440x1000/mobile 390x844 PASS, no horizontal overflow; protected scenarios not manually verified by agent. Subsequent Pontus acceptance is recorded below. KAN-67 invalid-date zero-call remains local synthetic evidence only.
- Detailed evidence: docs/reviews/KAN-85-64-67-68-local-verification.md, Preview section; local artifacts C:/Users/Familjedator/.codex/visualizations/2026/10/17/01a14929-cdaf-7f42-be41-c37f69ea04b4/kan85-68-preview-release/release-result.md.
- Earlier Preview evidence and manual acceptance are preserved in the four-path supplement checkpoint; the old deployment remains d7825e6.

## Pontus manual acceptance / local KAN-67 supplement

- Pontus on d7825e6 Preview: KAN-85 manual UI PASS; KAN-64 no-deduction profile manual UI PASS, other profiles covered by component tests. KAN-67 partial manual PASS for empty payment date/full amount; invalid-date button test not performed. KAN-68 partial manual PASS for already-booked receivable help; other scenarios lacked suitable existing data. Do not imply full hosted lifecycle acceptance.
- New local KAN-67: one neutral Fakturabelopp box beside invoice/customer in expanded details header, below identity/status on mobile. Removed small amount repetition from status line; existing list amount and payment explanation remain subordinate. Same display for paid/unpaid/receivable/exempt.
- Scope proof: all component code before/after this header is identical to d7825e6 after line-ending normalization. No changed state, dates, handlers, RPC, VAT, accounting, NE, status, shared date component or DB. Accounting integration checklist not applicable to this presentation-only supplement; prior lifecycle evidence retained, no DB retest/write.
- Current checks PASS: typecheck; extended test:ui-round at 1440/390 (four invoice states, large decimal amount/long customer, single prominent total, no overflow, zero remote calls); existing invalid/cleared/valid-to-invalid zero-call and record/settle/undo component regressions; invoice filter tests; invoice VAT-policy tests; test lint; diff --check.
- Component lint retains exactly two existing react-hooks/set-state-in-effect errors at 159/166, messages identical to HEAD; no new diagnostics. Full lint/safe regression wrapper/build/DB/hosted tests not repeated for this header-only change.
- Exact approved supplement checkpoint manifest: src/components/CustomerInvoicesPanel.tsx; scripts/test-ui-round.mjs; PROJECT_STATE.md; docs/reviews/KAN-85-64-67-68-local-verification.md. Earlier dirty documentation preserved and extended. Pre-commit HEAD verified d7825e6918dad83f21e94ea39fd7d31a75d3f7f9; remote main rechecked at 172f3a1.
- Fits same UI release with no identified new accounting risk; small visual acceptance remains for new header. Pontus now approved local checkpoint of these four paths and an updated clean-archive Preview from exactly that new SHA, in the existing project with explicit/verified Staging binding. No old staging branch, KAN-62/65 or KAN-88 implementation.

## Verification / limits

- KAN-85 PASS: Belopp, hidden VAT selector, canonical/legacy IDs and favorites at 0%, nonzero stale value blocked; actual local 100 kr journal 1930 D / 2018 K with zero VAT/result effect.
- KAN-64 PASS already working: real desktop/mobile full/none/unknown/missing x 25/0% and individual opt-out. No product fix. Not Jira Done.
- KAN-67 PASS local date/flow preservation gate: no fallback; required visible-input validity plus ISO guard; empty/cleared/invalid/valid-to-invalid -> zero calls, exact dates, unchanged record/settle/undo choice and full amount. KAN-88 exception above.
- KAN-68 PASS: receivable/year-end/order/after-year-end/exempt help, desktop/mobile visuals and no horizontal overflow. No accounting semantics changed.
- Earlier typecheck, targeted/new test lint and real-component tests PASS. CustomerInvoicesPanel retains exactly two baseline react-hooks/set-state-in-effect errors; no new diagnostics. Full lint is not green.
- Earlier safe regression constituents (domain, grouping, presentation, eight history UI scenarios, presentation UI, UI-round) PASS. Standard wrapper exit 1 at known Turbopack external dependency junction; one bounded webpack retry of same public-auth smoke 2/2 PASS. Do not call original wrapper green.
- Earlier actual local RPC lifecycle: same-year/undo and receivable/settlement/undo, taxable/exempt journal, preserved policy snapshots, VAT/real getNEData/B7/B9/balance identity/dashboard PASS for preservation. Synthetic transaction rolled back; no persisted data. Exempt R1/R2 correctness remains unestablished.
- Six relevant local DB definitions matched read-only Staging deployed definitions. No Production DB call. Hosted write E2E NOT run; old KAN-46 write-test wording updated only. No build/deploy in checkpoint finalization. No repeated DB tests/writes required for unchanged product code.
- Finalization PASS: current typecheck, real UI-round component tests at 1440/390, targeted test lint and unchanged two-component lint baseline. Static diff/base/manifest/product-fingerprint checks PASS. No DB lifecycle or broad regression repeated for unchanged product code. Existing dependencies reused through ignored junction, no install/lockfile change.

## Jira / Production navigation

- Jira read-only rechecked in finalization: KAN-85/67/68 In Progress, KAN-64 To Do, KAN-88 Bug To Do/unassigned. No status/comment/assignment mutation in this checkpoint step.
- Prior verification comments: 85=11629, 64=11630, 67=11631, 68=11632. Status/acceptance remain separate from Git commit; no Jira Done inferred.
- KAN-87 Done / Production PASS at main 172f3a1; completed evidence in PROJECT_ARCHIVE.md and retained review/history. Prior deployment dpl_3qo6dpN7Dqb78BqqeNrj1fzJkMe1 READY is historical release evidence, not a re-audit here.
- Remote staging remains 5809094dd3ce808dba35986c65e772b842f0d0e1 with held KAN-62/65 history; do not synchronize/merge it into this release.

## Preservation / closed risk / approval boundary

- Pontus accepted B as historical local-environment uncertainty: no lost product code/important work demonstrated; ignored-file loss cannot be excluded. Investigation CLOSED; no further investigation/restore needed. Evidence retained in existing review and compact closeout in PROJECT_ARCHIVE.md.
- AGENTS.md now requires explicit approval plus tracked/staged/untracked/ignored inventory before any worktree removal. Automatic cleanup is NOT verified disabled; a repository rule cannot change the app setting. No reliable cleanup-off control verified; do not trigger new managed-worktree creation without verified protection.
- Preserve other worktrees, dirty overlays, local env/auth/credential files, fixtures and evidence. Before/after status/HEAD/file-metadata comparison applies to this local commit. Original Desktop staging 11d8306 keeps its modified state and untracked audit/script paths; KAN-74/84/86/87 and older dirty paths remain out of scope.
- Staging private PDF has personal information; never copy/use it as synthetic evidence. This round does not access it. Preview positives requiring hosted bookkeeping writes need separate exact fixture/write approval.
- Retention: accepted closed worktree investigation condensed into archive, original detailed uncertainty preserved in review. Only new permanent worktree rule in AGENTS; no unrelated rule sync/refactor.
- Prior step performed one expressly approved isolated Preview deploy and read-only public UI/config/source checks. Current approval permits the four-path local checkpoint plus one isolated Staging Preview of exactly that new commit. No push, merge, Production deploy, migration, DB/Storage/configuration write, worktree creation/removal/restore or Jira mutation. Stop after verified new Preview for Pontus visual acceptance; not a clean-remote HANDOFF READY declaration.
