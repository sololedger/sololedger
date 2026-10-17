# KAN-85 / KAN-64 / KAN-67 / KAN-68 — local review

Date: 2026-10-17. Pontus accepted historical risk B, closed the old-worktree investigation and approved the local checkpoint. No publication authorized. Earlier STOP sections below are retained history, superseded by the final accepted checkpoint/Preview plan.

## Identity and approval boundary

- Worktree: C:/Users/Familjedator/.codex/worktrees/kan85-68-ui/sololedger_multi_user.
- Branch: codex/KAN-85-64-67-68-ui. Exact HEAD/base: 172f3a138874e587122ba500c8791a2ab9ac3a45.
- GitHub main was rechecked and matches the approved base. Remote staging remains 5809094dd3ce808dba35986c65e772b842f0d0e1; never used as source.
- New managed worktree, exact requested name, initially clean. No code borrowed from dirty overlays. Other identified dirty paths remain present, subject to the inventory discrepancy below.
- Read AGENTS.md, inherited PROJECT_STATE.md, latest KAN-87 worktree state, relevant Architecture/source/migrations and bundled Next 16.2.6 use-client guide before coding.
- Jira read: KAN-87 Done / Pontus; KAN-85/64/67/68 initially To Do. Verified per-issue transition 21 moved only KAN-85/67/68 to In Progress. KAN-64 remains To Do. No other Jira write/comment/assignment/status action.

## KAN-85 — PASS locally

- TransactionForm recognizes existing canonical and legacy owner-deposit IDs through isOwnerDepositCategoryId.
- Shows Belopp; hides the invoice VAT selector only for this category.
- Category changes and favorite selection force 0%, including deliberately stale favorite/category defaults. Changing back to a cost retains the existing cost VAT default.
- A stale injected nonzero deposit VAT value blocks ordinary form submission and explains how to reselect the category; no silent submission or historical mutation.
- Actual local book_transaction_atomic for 100 kr at 0% produces exactly 1930 debit 100 / 2018 credit 100. VAT/result unchanged; bank +100.
- No other category, account mapping or RPC changed.
- Pontus: check ordinary and legacy deposit/favorite on desktop/mobile, Belopp/no VAT selector, then a normal cost and sale.

## KAN-64 — PASS existing behavior; no product fix

- Rendered real TransactionForm at 1440/390 for full/none/unknown/missing profile x 25/0% invoice VAT.
- Full + positive VAT shows full-profile guidance and the individual opt-out. Selecting none changes the displayed deduction to zero and submits inputVatDeduction=none.
- Full + 0% correctly omits the unnecessary deduction panel. None/unknown/missing retain their correct explanation at 0% as well as 25%.
- Unknown/missing explain that no automatic deduction is made and identify Profil as the missing source. None describes no deductible VAT. Neither exposes a full-profile option.
- Existing behavior comes from KAN-55 commits 4dba2b4 and f6696fa. No deduction message/calculation/visibility rule was modified in this round.
- Leader accepted this as already working, with no new product code. Jira verification comment records the evidence; status remains To Do, no Done performed.

## KAN-67 — PASS local UI/flow preservation gate, with separate baseline limitation

- Both January-15-next-year fallbacks removed. A new invoice payment field starts empty.
- Local payment form validates the visible SwedishDateInput, including custom validity and required, before the handler. The handler separately validates its ISO date through existing parseSvDateToIso.
- No shared SwedishDateInput change. Full-width mobile date input, visible label, full invoice payment amount, and explanation of the existing record/settle distinction.
- Date cleared on successful payment, so undo does not silently reuse the previous payment date.
- Real-component tests on desktop/mobile: empty, nonexistent date, arbitrary text, valid -> invalid -> click, valid -> clear -> click all produce zero payment calls. Exact valid dates choose the same existing record/settle service paths. Both undo paths remain reachable and restore an empty date.
- Actual existing local RPCs verified for same-year payment/undo, year-end receivable, next-year settlement/undo, and exempt year-end/settlement. No new sales/VAT at settlement; original invoice policy snapshot fields unchanged.
- Actual local journal rows feed production VAT report service, dashboard VAT adapter/calculateDashboard and real getNEData with captured balance-RPC responses. Checks include annual/cumulative balances, B7/B9, NE balance identity, original-year report invariance, safe withdrawal and restored receivable after undo.
- Local rollback removes all synthetic users, invoices, bookings, transactions and journal rows; pre/post counts match.
- This proves unchanged scoped behavior, NOT blanket accounting correctness: see the separate exempt-invoice NE finding below.
- Pontus: verify date entry, removal/invalid edit, calendar, amount and the same-year/after-year-end explanations on Preview. Hosted write acceptance needs separate approval.

## KAN-68 — PASS locally

- Explains that a receivable is money owed by the customer; unpaid invoices are booked at year end for their applicable year.
- Explains sales and eventual VAT at receivable booking, then actual-date payment settling the receivable without a new sale/VAT.
- Explicitly describes exempt invoices as without VAT. Existing unknown-VAT and locked-period/year controls retained.
- Banner and payment help verified with taxable/exempt synthetic invoices, desktop/mobile and no horizontal overflow.
- Wording reference: https://www.skatteverket.se/foretag/moms/deklararamoms/narskajagdeklararamoms.4.6d02084411db6e252fe80008988.html (read during preceding analysis).

## Separate baseline finding — leader decision, no repair in this scope

- Synthetic exempt customer invoice for 1000 kr creates 1510 debit / 3010 credit at year end. Current resultEngine/getNEData maps 3010 to R1; R2 increases by zero.
- This is existing behavior: unchanged deployed Staging year-end function, same local definition, unchanged main resultEngine. It is not introduced by date validation/help text.
- Total result, VAT, bank, receivable and balance identity are preserved. Expected R1/R2 classification for these exact business facts is EJ FASTSTÄLLT until relevant rule material and the actual reason for exemption are verified.
- General reference to investigate (not a verified rule decision for this fixture): https://www.skatteverket.se/foretagorganisationer/inkomstdeklaration/enskildanaringsidkare.4.133ff59513d6f9ee2ebf00.html . The fixture uses a taxable registered profile and explicitly exempt transaction facts without modeling the specific reason for exemption. Separate accounting scope must verify the relevant rule and same-year/year-end/history/report effects before any fix.
- Superseding leader approval authorized Jira creation after renewed duplicate checks. KAN-88 created as Bug, To Do/unassigned/Medium: https://sololedger.atlassian.net/browse/KAN-88 . Broader momsfri/momsfria/R2/3010/NE-klassificering and NE/customer-invoice searches, plus full KAN-77/KAN-66 review, found no corresponding duplicate.
- Leader accepted KAN-67 for Staging preparation with this explicit known limitation. KAN-88 records exact reproduction and observed versus unestablished expected classification. No accounting repair or declaration of complete NE correctness inferred.

## Accounting integration impact map

- Journal/write boundary: existing book_transaction_atomic and invoice record/year-end/settle/undo remain authoritative; payload shape/source/accounting metadata unchanged. Deposit UI enforces its existing zero VAT intent. Payment date becomes explicit rather than guessed.
- VAT/periods: no aggregation, period close/declare or dashboard VAT code changes. Date still controls existing booking period; positive-VAT same-year/year-end and zero-VAT settlement verified locally.
- NE/result/balance/year end: no engine or close logic changed; real getNEData and captured actual balance RPCs tested, with exempt R2 limitation disclosed.
- Dashboard/bank/safe withdrawal: existing calculations tested with real synthetic journal outputs, no new sources or fallbacks.
- Receivable/payment: same-year and cross-year paths and unchanged policy snapshots verified. Unknown VAT retains existing blockers.
- Corrections/undo/SIE/locks: existing payment undo tested. No correction, SIE or year-lock implementation changes; existing safe regression covers relevant consumers. No new transaction source.
- KAN-64/68 alone are presentation/verification scopes and do not require fresh bookkeeping writes. KAN-85/67 received the focused local accounting checklist above.

## Verification results and limits

- Typecheck PASS after final product layout change.
- TransactionForm lint clean. CustomerInvoicesPanel has exactly the baseline two react-hooks/set-state-in-effect errors, no new normalized diagnostics. New test scripts and changed existing test file lint clean. Full lint is not green and unrelated debt is not repaired.
- test:ui-round PASS: actual React components at 1440/390, all four issue scopes, no remote requests or runtime errors; screenshots reviewed under ignored test-results/ui-round.
- test:ui-round:lifecycle PASS preservation assertions plus explicit KNOWN BASELINE LIMIT. Uses only localhost and allowlisted sololedger_kan84_operator_20261015, PGPASSFILE supplied without reading credentials. One BEGIN/ROLLBACK, no persistent schema/data change.
- Staging comparison was read-only/TLS with default_transaction_read_only=on and identical backend PID before/after. Six whitespace-normalized deployed function hashes match the local DB: create invoice, ordinary booking, record payment, year-end receivable, settle and undo. No Production DB call.
- Safe regression: domain, grouping, presentation, eight history UI scenarios, presentation UI and new UI-round tests PASS. Standard wrapper stopped at public-smoke Turbopack startup because the external dependency junction leaves its filesystem root. One bounded webpack retry passed the same public-auth Chromium tests 2/2. Original wrapper exit 1 (startup timeout after the Turbopack error); do not call it green.
- Existing kan46-staging-write test has only stale visible wording expectations updated; it was NOT run against hosted Staging. No hosted/write E2E, deploy, build, migrations or live bookkeeping mutation.
- No dependency install/change; reused ignored node_modules junction. package-lock unchanged. The test harness is not imported into product routes/build.

## Original UI manifest (nine files; approved AGENTS rule makes final checkpoint ten)

1. src/components/TransactionForm.tsx — KAN-85 product.
2. src/components/CustomerInvoicesPanel.tsx — KAN-67/68 product only.
3. scripts/test-ui-round.mjs — offline real-component regressions; KAN-64 verification.
4. scripts/test-ui-round-lifecycle.mjs — explicit local rollback-only lifecycle checks.
5. tests/e2e/kan46-staging-write.spec.ts — existing wording expectations only, not hosted-run.
6. package.json — new test scripts; offline component tests included in safe regression.
7. docs/reviews/KAN-85-64-67-68-local-verification.md — this report.
8. PROJECT_STATE.md — active scope/next safe step.
9. PROJECT_ARCHIVE.md — compact completed KAN-87 evidence; earlier history preserved.

Final approved addition: AGENTS.md contains only the new permanent worktree preservation rule. Architecture, shared date component, accounting service/report engine, migrations, environment/auth files, private documents and audit-packages remain outside the change scope.

## Checkpoint investigation — superseding preparation result

- Leader approved local checkpoint ONLY if all safety checks PASS. Worktree ignored-file preservation cannot be certified, so no commit/staging action was taken. This follows the explicit STOP condition; no extra permission inferred.
- GitHub main and local origin/main remain exactly 172f3a138874e587122ba500c8791a2ab9ac3a45. No commits on the candidate branch beyond the base. Remote staging remains 5809094; no staging merge/cherry-pick/overlay included.
- Exact nine-file manifest above rechecked with tracked diff plus untracked non-ignored inventory. Shared date input/parser, ordinary purchase VAT helper, profile adapter, invoice policy/helper, accounting service, result engine and lockfile all match the base. No KAN-64 product edits. KAN-67 changes only local date/amount UI and validation; original accounting-service choices and arguments preserved.
- Product/test manifest fingerprint (six non-Markdown paths, normalized LF, path+NUL+content): 5ccd25c7567384f73d2cafe64db244e9d1e7b5daf2c77a1d99e7e11584d48eb6. No code/test changes or functional retests during this investigation. Static manifest/protected-file/diff checks PASS.
- No unrelated worktree file, held staging commit, migration, environment/auth/secret file or real private attachment in the candidate. Only this report and PROJECT_STATE updated during the investigation; original nine-file scope retained.
- Jira verification comments: KAN-85 11629; KAN-64 11630; KAN-67 11631; KAN-68 11632. Status unchanged (85/67/68 In Progress, 64 To Do) while checkpoint gate is STOP. No Done. KAN-88 created separately under direct approval, with expected R1/R2 EJ FASTSTÄLLT.

## Worktree investigation — actual automatic removal, not registration only

- Prior path: C:/Users/Familjedator/.codex/worktrees/kan63-staging-base-test/sololedger_multi_user, detached HEAD 13e6a0a8160f7ca2cfd65d204c9b4853562bfaf0 (KAN-48 fix numeric invoice search).
- Checkout directory and Git worktree registration are absent. Parent directory exists with only empty .codex-worktree-name; no restoration/recreation attempted.
- Codex app logs from 2026-10-17 identify the cause: immediately after the new requested worktree became ready, cleanup planned deletion of one older owned worktree (totalWorktrees=17, keepCount=15).
- At 11:25:43.999 CEST the deletion worker started with reason=startup-cleanup; snapshot started 11:25:44.167, succeeded 11:25:44.956, then actual Git removal succeeded 11:25:45.213 and worker completed 11:25:45.216. This was an app side effect of create_worktree, not a user-requested/manual cleanup command.
- Identity independently verified: SHA-1 of native backslash old path is 097d536106874fdb8867e9a86d818f40a1e19c93 (delete worker); slash-normalized path is 4188b821a228a469f229c8ec6a7dbd181b8743a9 (snapshot). Only ordinary path metadata hashed; no credentials/credential files inspected or hashed.
- Saved Git ref refs/codex/snapshots/4188b821a228a469f229c8ec6a7dbd181b8743a9 resolves exactly to original HEAD 13e6a0a8160f7ca2cfd65d204c9b4853562bfaf0. Saved/original tree both efbc659349569454d217f7502658dbee8d07e556, diff empty. Commit still reachable through existing staging branches/history.
- Evidence establishes preserved committed tree and no additional non-ignored source work in the app snapshot. It does NOT establish that no ignored local files existed before deletion. No pre-deletion ignored-file inventory is available; loss of such local data cannot be excluded.
- Outcome: source-tree snapshot PASS; complete local-data preservation STOP. No checkpoint commit under leader condition. No git worktree prune/remove/reset/clean, app archive/restore, settings change or credential inspection was invoked during this investigation.
- Primary log: C:/Users/Familjedator/AppData/Local/Codex/Logs/2026/10/17/codex-desktop-0b74380c-d1b3-4426-b8ea-9f9e0b7d352c-14544-t0-i1-000052-0.log lines 1018–1019; worker log same prefix with t1-i1-082124-0.log lines 9–14. No raw logs copied to repo/Jira.
- Official documentation confirms automatic worktree cleanup and saved snapshots in general: https://learn.chatgpt.com/docs/environments/git-worktrees . Actual incident conclusion relies on the local logs/ref/path/tree checks above, not documentation alone.

## Next safe step

Pontus reviews the remaining ignored-file preservation uncertainty and decides how to handle it before checkpoint. KAN-88 remains a known limitation for KAN-67 acceptance; expected R1/R2 remains unestablished. After that gate is resolved, recheck base/manifest and create the already conditionally approved local commit only if safe. Preview requires a separate new approval. No commit/push/merge/deploy/DB action performed in this investigation.

## Final bounded ignored-file review — classification B (2026-10-17)

Scope limited to the remaining ignored-file uncertainty. Rechecked the exact old parent directory (only empty .codex-worktree-name), the identified app cleanup/snapshot records, saved Git snapshot references and available summaries from original owner chat Analysera momsundantag i kundfaktur. No broader filesystem scan, recovery, fresh worktree, accounting audit or secret-file read.

- The saved source snapshot remains original HEAD 13e6a0a8160f7ca2cfd65d204c9b4853562bfaf0, already reachable through retained history. No known unique uncommitted source is evidenced.
- No preserved pre-deletion ignored-file inventory or backup listing those ignored files was identified in these bounded sources. The cleanup log records success but not ignored-file contents. The old chat summaries supplied no verified inventory establishing such contents. This is a coverage limit, not proof that no ignored files existed.
- No known unique ignored work, environment configuration or test material was identified. No concrete evidence of loss of important work or secrets. Classification C is not supported. Classification A would overstate certainty because ignored-file loss remains possible.
- Classification B: possible loss of ignored files, but no known unique work identified.
- Recommend accepting this as historical local-environment uncertainty, with no identified impact on the current UI candidate. Current kan85-68-ui exists and its exact nine-path manifest/all files were verified present; nothing staged. No further release-candidate audit performed in this narrow review.
- Proposed simple guard: disable automatic worktree deletion during SoloLedger work; any later removal requires explicit review of unique source plus ignored local files and their backup locations. Proposal only, no setting/permanent-rule change.
- Only PROJECT_STATE.md and this existing report updated; candidate remains nine files. No Jira mutation, DB action, migration, commit, push, deploy, new worktree or restoration. Await leader decision before checkpoint/Preview.

## Final approved local checkpoint / isolated Preview plan (2026-10-17)

### Decision and final scope

- Pontus explicitly accepted class B as historical local-environment risk, with no demonstrated lost product code or other important work. Investigation is closed; no more search/restore needed. Prior uncertainty/evidence remains above and compact closeout is in PROJECT_ARCHIVE.md.
- Exact base remains approved GitHub main 172f3a138874e587122ba500c8791a2ab9ac3a45. Commit this candidate only on codex/KAN-85-64-67-68-ui. No staging branch integration or KAN-62/65 included.
- Original nine-file UI manifest is preserved. Approved tenth file: AGENTS.md, only permanent worktree protection/explicit environment limitation. Final commit is these ten paths, no others.
- Product/test fingerprint remains 5ccd25c7567384f73d2cafe64db244e9d1e7b5daf2c77a1d99e7e11584d48eb6. No new UI/NE/accounting change in finalization. KAN-88 remains separate, expected classification EJ FASTSTÄLLT and an explicit KAN-67 acceptance limitation.
- Worktree protection is a project rule, not a confirmed app configuration fix. No reliable automatic-cleanup-off control is verified; no setting change is made or claimed. Do not create another managed worktree without verified protection.
- Local commit message: feat(KAN-85,KAN-67,KAN-68): checkpoint invoice and deposit UI; verify KAN-64. Its sole parent must be approved base; resolve final hash from git log -1 / HEAD after commit.
- Relevant existing verification remains valid because accepted product/test fingerprint is unchanged. Finalization adds focused type/component/static checks only; no DB lifecycle rerun or hosted write. Full safe regression earlier passed all constituent parts, with original wrapper exit 1 at known dependency-junction Turbopack startup and one bounded same-smoke webpack retry 2/2 PASS. Full lint still has existing debt; no claim of globally clean lint or wrapper exit zero.

### Proposed next publication — separate approval required

1. Approve one isolated Vercel Preview of the exact checkpoint SHA, using the existing SoloLedger project and its existing Staging Preview environment. No Git push or branch merge. Never promote the old staging branch or its held KAN-62/65 code/migrations.
2. Recheck checkpoint SHA, sole parent/base, exact ten-file commit delta and unchanged remote main. Build a clean source archive from that commit; exclude all env/auth/private files, audit-packages, ignored state, node_modules junction and local .next output. Use a fresh cloud install from unchanged lockfile; do not upload a prebuilt local app. No new managed worktree required.
3. Reuse the already verified SoloLedger Vercel project context. Check only allowlisted Preview public Supabase URL/key binding and relevant deployment metadata: build/runtime must target fzxqiqenqjzhlyxxpvhg, never Production wbaxmuvudpnkvuliicuy. Do not pull or display full environment/server secrets or change configuration. If binding cannot be safely confirmed, STOP before deploy.
4. Execute only the separately approved Preview deploy with the clean archive. Verify source identity/Ready, then public login/navigation smoke and actual built Staging binding. Record deployment ID/URL/checkpoint SHA and explicitly distinguish local synthetic evidence from hosted evidence. No Production action.
5. Pontus acceptance: KAN-85 Belopp/no VAT plus canonical/legacy/favorite and switch-back; KAN-64 full/none/unknown/missing including 0% and individual opt-out; KAN-67 empty/cleared/valid-to-invalid date -> zero payment RPCs, exact full amount and record/settle help; KAN-68 receivable/payment order and exempt wording on desktop/mobile. Use synthetic data only; never the existing private PDF with personal data.
6. Positive hosted same-year payment/year-end settlement/undo would write bookkeeping and requires a separate explicit approval for dedicated synthetic Staging fixtures/test user. Current approval does not allow creating such data. Existing local rollback lifecycle is supporting evidence, not a claim that hosted positive writes have passed. Keep KAN-88 visible and expected R1/R2 unestablished.
7. Stop after Preview acceptance for a fresh Production decision on exact commit set. No migration, push/main/staging movement, configuration change or automatic Jira Done is part of this plan.

### Finalization verification boundary

Compare other existing worktree HEADs, statuses and changed/untracked-file metadata before and after this local commit. No other worktree edits/removal. Verify the commit tree/delta, empty staging area and clean UI working tree. The commit hash is reported after actual creation; no self-referential hash is written into this commit. No push/deploy authorized.

Final pre-commit checks PASS: npm run typecheck; npm run test:ui-round (1440/390); targeted test lint; Production-base component lint comparison (TransactionForm 0 errors, CustomerInvoicesPanel exactly two pre-existing errors, no new diagnostics); diff/base/manifest/fingerprint checks. No accounting/DB test or public smoke repeated in finalization because product/test code is unchanged; earlier full constituent results/limits remain as documented.


## Approved isolated Staging Preview — 2026-10-17


PASS för deploy, manuell acceptans återstår.

- URL: https://sololedger-n93xjhsj8-sololedger1.vercel.app
- Deployment: dpl_7eu5z6K5cW1JXisFRhqunccRNgdL, READY.
- Commit: d7825e6918dad83f21e94ea39fd7d31a75d3f7f9; parent 172f3a138874e587122ba500c8791a2ab9ac3a45. Exakt tiolfilmanifest verifierat.
- Rent git-arkiv: alla 330 filer motsvarar Git-bytes; Vercel publicerade 329 källfiler (ignorerade .gitignore). Alla uppladdade källhashar verifierade.
- Explicit target preview; befintlig Preview-konfig verifierad mot Supabase Staging. Publik nyckel kontrollerad endast i minne via auth settings GET; ingen full env pull eller serverhemlighet läst.
- Nio observerade publicerade klientskript innehåller Staging-referensen och ingen Production-referens. Hjälptexter och nya UI-vakter finns i kompilerad kod. Detta bevisar inte faktisk rendering efter inloggning.
- Production deployment/alias oförändrade; GitHub main/staging oförändrade. Ingen äldre staging eller KAN-62/65 ingår.
- Inloggningssidan verifierad på dator 1440x1000 och mobil 390x844 utan horisontellt överflöde. Ingen inloggad dedikerad testsession finns i denna Preview-tab.
- KAN-85/64/67/68: tidigare lokal PASS gäller; samtliga skyddade UI-scenarier EJ manuellt verifierade i Preview. KAN-67 ogiltigt datum/noll anrop har endast tidigare syntetisk lokal evidens. Inga betalningsförsök genomfördes.
- KAN-88 kvarstår separat: observerad momsfri 3010 -> R1; förväntad R1/R2 ej fastställd.
- Tidigare full lint/standardregressionswrapper inte gröna; dokumenterade baslinje-/miljöbegränsningar i incheckad lokal rapport.
- Nätverkshistoriken var trunkerad; ingen slutsats om ogiltig betalningsgrind dras från Preview-nätverk.
- Ingen push, merge, Production-deploy, migration, databas-/Storage-/konfigurationsskrivning eller Jira-ändring. Enda publiceringen är denna Preview.

Nästa steg: Pontus testar med befintligt dedikerat Staging-konto och syntetiska befintliga data. Spara/bokför/betala inte. För giltigt datum -> ogiltig text -> betalningsknapp måste inga betalningsanrop ske; avbryt om lämplig obetald testfaktura saknas. Positiva betalningar eller nya fixtures kräver separat godkännande.


## Pontus manual Preview acceptance and KAN-67 amount supplement — 2026-10-17

Pontus reviewed d7825e6: KAN-85 manual UI PASS; KAN-64 manual UI PASS for profile without deduction (other variants retain earlier component evidence); KAN-67 partial manual PASS for empty date/total text, invalid-date submit was NOT tested; KAN-68 partial manual PASS for already-booked receivable explanation, other cases had no suitable existing data. This does not establish full hosted lifecycle acceptance.

Local requested supplement (not yet committed/deployed):
- CustomerInvoicesPanel.tsx: expanded details header shows one neutral Fakturabelopp box beside invoice/customer on desktop and below identity/status on mobile; existing small amount repetition removed from status subtitle. Paid/unpaid and year-end labels preserved. List amount and payment explanation retain subordinate sizing. Existing grossAmount formatter unchanged.
- scripts/test-ui-round.mjs: reuse offline real-component harness with paid/large-decimal/long-customer fixture plus unpaid/receivable/exempt assertions, amount visibility/prominence/containment/status and responsive placement at 1440/390. One visually dominant amount per expanded card. Capture card screenshots in ignored test-results/ui-round.
- PROJECT_STATE.md and this review: preserve prior uncommitted Preview evidence, add manual acceptance, exact manifest, current limits/next step.

Verification PASS: npm run typecheck; npm run test:ui-round (all four Jira scenarios including earlier valid-date -> invalid text -> click -> zero calls; record/settle/undo mocked boundaries preserved; zero remote requests); node scripts/test-customer-invoice-filters.ts; node scripts/test-customer-invoice-vat-policy.ts; eslint scripts/test-ui-round.mjs; git diff --check. Component lint compared against d7825e6: same two existing react-hooks/set-state-in-effect errors at 159/166, no new messages. Visual review of synthetic mobile receivable and desktop paid screenshots PASS.

Scope verification: code outside the expanded header is identical to HEAD after line-ending normalization. No state/handler/status/date/formatting/payment/VAT/receivable/undo/report/NE/RPC/DB changes. This is presentation-only, so no accounting lifecycle/DB checks or writes are needed; existing evidence remains. Full lint and standard safe regression wrapper remain subject to the earlier documented baseline/environment limitations and were not rerun. No new build, hosted test or new Preview.

Exact delta from d7825e6: src/components/CustomerInvoicesPanel.tsx; scripts/test-ui-round.mjs; PROJECT_STATE.md; docs/reviews/KAN-85-64-67-68-local-verification.md. No files staged; HEAD unchanged. GitHub main rechecked at approved 172f3a138874e587122ba500c8791a2ab9ac3a45. No other worktree touched, no Jira mutation, commit, push, merge, deploy, migration or DB write.

Recommendation: include in same UI release (no identified new accounting risk; small visual acceptance remains). Obtain approval for a local checkpoint of these four paths, then approval for updated isolated Preview from that exact new SHA. Build via clean git archive and verify READY/upload hashes/Staging public binding/unchanged Production as before. Do not use old staging or KAN-62/65. Existing published d7825e6 Preview does not contain this supplement. KAN-88 remains separate with expected R1/R2 unestablished. Stop for leader decision.


## Supplement checkpoint / updated Preview authorization — 2026-10-17

Pontus explicitly approved the local checkpoint and one updated isolated Staging Preview of precisely the new commit. Four approved paths only (CustomerInvoicesPanel.tsx, scripts/test-ui-round.mjs, PROJECT_STATE.md and this review); preserve prior dirty Preview documentation. Proposed/approved-scope commit message: feat(KAN-67): highlight invoice total in details header. Pre-commit HEAD d7825e6918dad83f21e94ea39fd7d31a75d3f7f9; sole Production ancestor/base 172f3a138874e587122ba500c8791a2ab9ac3a45; remote main/staging unchanged.

Exact source diff reviewed: only expanded invoice-header JSX/classes/text changed; all code outside that block equals prior checkpoint after line-ending normalization. Test diff adds synthetic paid fixture and four-state responsive amount assertions, no external writes. No migration/env/auth/private attachment or unrelated file included. Other 16 worktrees captured before checkpoint using HEAD/status and changed/untracked filename/size/mtime metadata only; no credential contents read. Jira KAN-67 read-only rechecked In Progress; no Jira mutation approved/performed. Retention: all current acceptance/limits remain active; older evidence retained in this review, existing completed history left intact, no fifth file needed.

Recheck typecheck and existing UI-round before committing; earlier targeted filter/VAT-policy/tests lint and unchanged two component lint diagnostics retained. No new product code or broad regression/DB tests needed for unchanged approved supplement. After commit, verify exact parent/manifest/clean UI tree and unchanged other-worktree metadata. Create clean git archive from new SHA with LF Git bytes, verify upload hashes, deploy Preview only with existing verified Staging Preview configuration; no full env pull/server-secret retrieval/config changes. Verify READY/code/Staging client ref/no Production client ref/unchanged Production and GitHub refs. Read-only new header check only if a suitable existing test session is available; otherwise report not manually verified and retain 1440/390 synthetic evidence. No positive payment/booking/fixture writes, push, merge, Production deploy, migration or Jira Done. Stop for visual acceptance.
