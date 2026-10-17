# SoloLedger Project State

Updated 2026-10-17: permanent product goal and working principles anchored after account switch and read-only KAN-88 investigation. Documentation-only local commit approved; no product implementation or push approved.

## Produktmål och aktuell leveransstatus

- Jessikas fungerande årsflöde är första prioritet. Permanenta mål och samtliga arbetsprinciper finns i [AGENTS.md](AGENTS.md), avsnitten Produktmål och Arbets- och prioriteringsprinciper; hänvisa till dem vid varje handoff.
- Levererat enligt tidigare verifierad Production och Pontus acceptans: KAN-85/64/67/68 Done, release 2423f4b3f090a7f2f7d0e1b19bdc83aeaaf64340. Detta är inte ett intyg om att alla framtida års-/deklarationsfall är färdigverifierade.
- KAN-88: avgränsad skrivskyddad utredning genomförd; exakt fakturas R1/R2 är EJ FASTSTÄLLT eftersom undantagsorsak saknas och särskild NE-anvisning för deklarationen 2027 inte verifierats. Befintliga 81 resultatmotortester passerade; ingen rättning implementerad eller Jira-status ändrad.
- Nästa steg: invänta ledarbeslut. Återanvänd befintlig evidens och begränsa eventuell fortsättning till det beslut som behövs för Jessikas användning.

## Next session: use this existing checkout

- Open C:/Users/Familjedator/.codex/worktrees/kan85-68-ui/sololedger_multi_user (worktree kan85-68-ui), branch codex/KAN-85-64-67-68-ui. Reuse this directory; do not create/restore/remove another worktree for the account switch.
- The original repository/common Git lives at C:/Users/Familjedator/Desktop/Sololedger Multi User App/sololedger_multi_user. That checkout is older local staging at 11d8306442320430557b37d1003c342857d10fc2 with dirty/untracked work; do not use its source or older PROJECT_STATE as the current release/handoff.
- Read in the selected UI checkout: AGENTS.md, PROJECT_STATE.md, Architecture.md; then PROJECT_ARCHIVE.md sections for the UI release/account-switch inventory. Detailed evidence: docs/reviews/KAN-85-64-67-68-local-verification.md. Read Jira KAN-88/KAN-89 only for selection/context; wait for Pontus to choose the next implementation.
- Start read-only: verify cwd, branch, status and HEAD/recent commits. Preserved account-switch checkpoint: 8ebad907cb144da97ccc87a9a79131570b16fb49, directly after Production 2423f4b3f090a7f2f7d0e1b19bdc83aeaaf64340. This documentation update follows that checkpoint; use git log -1 for the new exact SHA. Both documentation checkpoints are local only. Recheck external state only when needed for the next decision.
- Keep all existing worktrees and ignored local environment/auth/test material. No cleanup/reset/prune/archive/removal or new managed-worktree creation is authorized. The AGENTS worktree rule applies; automatic cleanup is NOT verified disabled.

## Current truth / queue

- GitHub Production main / origin/main: 2423f4b3f090a7f2f7d0e1b19bdc83aeaaf64340, verified again for this handoff. Local refs/heads/main is older 0bc166de68f7989f6a3d1483c062f4b4b1570629, untouched; never assume it is current Production.
- Prior verified Vercel Production dpl_HqcZejtMKu2z3SirE2dBeNfnGZmA READY/PROMOTED from exact main SHA. Canonical https://sololedger.vercel.app/ public smoke PASS, Production Supabase wbaxmuvudpnkvuliicuy; no Staging ref in checked client scripts. This handoff does not repeat deploy/DB checks.
- KAN-85 Done; KAN-64 Done (verified existing behavior/no new product code); KAN-67 Done; KAN-68 Done. Pontus final acceptance supersedes the earlier In Review/To Do snapshots in historical evidence. No Jira status was changed during handoff.
- KAN-88 To Do/unassigned: separate unresolved NE investigation, observed exempt 3010 -> R1; expected R1/R2 EJ FASTSTÄLLT. Do not implement a tax/accounting change by assumption.
- KAN-89 To Do/unassigned: new category-visibility task for new bookings only, preserving historical categories/transactions, per-user isolation and safe favorite/default/legacy handling. Not implemented or selected for development yet.
- Remote staging remains 5809094dd3ce808dba35986c65e772b842f0d0e1 with held KAN-62/65 history. It is not the next release base; no synchronization/push is approved. Updated isolated Preview dpl_5cresudSvQUDU9yVfiK5BKcRm24N remains previous accepted evidence.

## Preservation / local checkpoint / limits

- Account-switch checkpoint 8ebad907 included PROJECT_STATE.md, PROJECT_ARCHIVE.md and docs/reviews/KAN-85-64-67-68-local-verification.md. Current approved documentation commit includes only AGENTS.md and PROJECT_STATE.md; no product/test/migration/env/auth/lockfile changes or push. Verify exact commit with git show --stat and git status.
- Historical handoff inventoried 17 worktrees. Post-switch read-only check found 16 registered: Codex startup-cleanup removed kan63-staging-integration on 2026-10-17 around 13:12 Swedish time. Its branch and snapshot retain 30e82adf9d2868e0e1f1c028b433bc11aa9a7ff7; prior inventory was clean, no concrete lost unique work identified, ignored-file preservation uncertain. Other-worktree historical HEAD/status/file-metadata inventories remain in the archive receipt. Nine other worktrees have dirty/untracked work: Desktop staging; kan63-staging-migration-prep; kan71-production-release; kan72-staging-integration; kan74-sie-opening-guard; kan74-staging-release; kan84-adobe-oneoff; kan86-shared-attachments; kan87-history-presentation. Exact inventory is in PROJECT_ARCHIVE.md and the referenced local metadata receipt. Do not sweep their files into this branch.
- Desktop retains modified PROJECT_STATE.md, untracked audit-packages/ and scripts/create-kan63-staging-user.mjs. Migration-prep retains two untracked KAN-62 migrations. Other workstreams retain code/tests/reviews/dirty handoffs; they are not lost merely because this selected checkout is clean.
- Closed worktree-risk B and prevention rule remain documented in AGENTS.md/PROJECT_ARCHIVE.md. No known lost important work; possible ignored-file loss in removed kan63-staging-base-test remains historical uncertainty. Investigation closed by Pontus; no re-audit or restoration needed.
- Ignored environment/auth/pgpass/test material stays in place and is NOT backed up by Git. No credential contents read/copied/hashed. Existing private Staging PDF must never be reused as synthetic evidence. Connector/login access for a different account is not verified; treat future tool/auth failure as access setup, never use Production as fallback.
- Earlier local UI/domain/lifecycle evidence and known two component lint errors/Turbopack regression-wrapper limitation are retained in archived release evidence. Full lint/original wrapper were not green; no product/DB tests repeated for documentation-only handoff.
- Retention completed: released/accepted UI work moved to archive navigation; all earlier detailed review/history preserved. No further product code, DB write, migration, deploy, GitHub push or Jira mutation in this handoff. Local checkpoint only; no clean-remote/full pushed handoff claim.
