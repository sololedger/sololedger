# SoloLedger Project State

Updated 2026-10-17: Pontus accepted historical risk B, closed the old-worktree investigation and approved the local UI checkpoint. Preview/Production remain separately approved actions; no publication authorized.

## Current objective / next safe step

- KAN-85/67/68 implementation and KAN-64 existing-behavior verification accepted for Staging preparation. This local checkpoint contains the exact approved UI/tests/docs plus the requested permanent worktree protection rule.
- NEXT: Pontus reviews the checkpoint hash/manifest and authorizes one isolated main-based Staging Preview if desired. Concrete plan: docs/reviews/KAN-85-64-67-68-local-verification.md, final section. No old staging merge and no KAN-62/65.
- KAN-88 remains separate and unimplemented; observed exempt-invoice 3010 -> R1, expected R1/R2 EJ FASTSTÄLLT until relevant business/rule verification. Explicit known limitation in KAN-67 acceptance.

## Checkpoint identity / exact manifest

- Worktree C:/Users/Familjedator/.codex/worktrees/kan85-68-ui/sololedger_multi_user, branch codex/KAN-85-64-67-68-ui.
- Sole parent/base for this checkpoint: 172f3a138874e587122ba500c8791a2ab9ac3a45, reverified against GitHub main. Final checkpoint hash is the branch HEAD after the approved commit; use git log -1, not this file's inherited base. No self-referential hash in the committed state file.
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
- Product/test fingerprint unchanged: 5ccd25c7567384f73d2cafe64db244e9d1e7b5daf2c77a1d99e7e11584d48eb6. Product edits only in two components. KAN-64 deduction behavior, shared date component/parser, accounting/RPC/report/NE engines and package-lock unchanged. No migrations, credentials/private attachments/audit-packages or other-worktree overlay included.

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
- Authorized action is the exact local checkpoint only. No push, merge, deploy, migration, DB/Storage/configuration write, worktree creation/removal/restore or Jira mutation in finalization. Not a published/clean-remote HANDOFF READY declaration.
