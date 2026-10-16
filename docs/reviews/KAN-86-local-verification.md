# KAN-86 — local attachment grouping

2026-10-16. Approved scope: option 1, optional presentation-only grouping by exact shared private attachment reference. No database changes or hosted writes. Implementation base: origin/main 8692f0566feab0978976143d51fd5d1ed91daa19. Work branch: codex/KAN-86-shared-attachments.

## Behavior

- Off by default; no persistence or new storage. Only two or more transactions with an explicit identical owner and exactly identical nonblank reference in the existing attachments bucket form a group. References are not trimmed, decoded, case-folded or reduced to filenames. Descriptions/batch text never determine membership.
- Neutral "Gemensamt underlag", minimum/maximum actual transaction date and verification count. Scope is explicitly the selected year, using the unchanged complete history loader.
- Group is placed at the first member in the chosen date order; members retain that order. Groups are indivisible visual rows for existing show-more pagination. The verification count remains the original transaction count, without an economic group sum.
- Search/category filtering pauses only the new attachment grouping: matching transactions remain ordinary visible rows and existing hit counts are preserved. Amount/VER sorting also pauses it. A visible explanation accompanies the still-selected toggle; clearing the filter or returning to date sort restores grouping.
- Existing SIE undo batches have precedence. Their grouping, filter inclusion and expansion state remain unchanged.
- Desktop and mobile use the same new group component. Expansion shows actual VER/date/amount, verbatim original description including newlines, journal account numbers and debit/credit amounts. Existing correction flags are only displayed, never inferred from membership. Per-member edit/correction controls retain existing policy and year-lock gates.
- One shared attachment button uses the existing `handleOpenAttachment` -> attachments `createSignedUrl(path, 60)` routine. Members explicitly refer to that shared attachment. No upload, move, reference update, deletion or public-link conversion occurs.

## Integration impact

This changes only TransactionTable display objects. No transaction source, journal, booked flag, correction link, RPC, data loader, VAT period/report/dashboard, NE/result, bank balance, safe withdrawal, invoice/payment/receivable, year-end, undo or SIE import/export implementation changes. Original objects remain references to loaded data. The full accounting write-E2E checklist is not applicable to this UI-only scope; no accounting fixture or live write is needed.

## Verification

- `npm run test:history-groups`: ownership, exact/nonblank reference, no text inference, singleton behavior, unchanged frozen originals, date ordering, search/category/sort pauses, SIE precedence and pagination boundary.
- `npm run test:history-ui`: real TransactionTable bundled with synthetic frozen data and a replaced Supabase module; real app/Tailwind CSS, Playwright Chromium at 1440 and 390 px. Tests opt-in, collapse/expand, complete description and journal, per-member action identity, exact bucket/path/TTL signed attachment opening, SIE undo expansion, search hit/count, category filter, all sort modes, show-more, and mobile overflow. No real credentials or DB connection. Generated screenshots are ignored test output.
- `npm run typecheck`; focused ESLint for new files. TransactionTable compared with HEAD through ESLint's in-memory API: same 13 existing errors and one warning; zero new diagnostics. Full repository lint is not green and is not claimed.
- PASS final `npm run test:regression` (exit 0): domain tests, both new checks and the existing public localhost smoke tests 2/2, using process-local dummy public configuration and no login/submission. An initial smoke runner stalled; the identified local process tree was stopped and one isolated smoke retry passed. A later expanded SIE test initially matched both the VER range header and child VER; its selector was made exact before the final combined run passed.

No broad accounting/write E2E, live DB check, build/deploy, commit or push is part of this implementation verification.

## Pontus acceptance

1. In transaction history, confirm ordinary rows are unchanged with the toggle off.
2. Enable "Gruppera gemensamma underlag". A selected-year shared reference should show one neutral group with the correct count/date interval. For the previously verified KAN-84 data the expected count is 15 and the interval 2026-10-03–2026-10-16; this is an example, never a code rule, and was not re-read live in implementation.
3. Expand on desktop and mobile. Check VER, real dates, complete descriptions, journal values, and open the shared private PDF once. No duplicate stored file should be created.
4. Search an original description/VER/account, apply a category, and sort by amount/VER: the attachment group pauses and results remain inspectable. Clear filters/choose date sort to restore grouping.
5. Check an existing SIE undo group and show-more. No posting, correction, edit submission or attachment replacement is needed for acceptance.

Limitations: selected-year scope; optional view state only; no custom names, aliases or semantic correction chains. Existing SIE undo behavior remains its own established exception. Real authenticated/private-file acceptance remains Pontus's step after local synthetic verification and any separately approved publication.

## UI follow-up after manual core PASS — 2026-10-16

Pontus reports manual acceptance PASS in the isolated Staging Preview: VER-90/91/92 together, each original date/amount/description and debit/credit readable, common private PDF opens. This is leader-reported acceptance, not a new Codex authenticated inspection. It supersedes the earlier pending core/private-file acceptance above.

Local changes on codex/KAN-86-shared-attachments at HEAD 6b72492:

- Replace the small checkbox with a keyboard-operable button with switch semantics, explicit På/Av, accessible name/description, visible focus and a minimum 44 px target. Still off on mount; no persistence.
- When grouping is active and not paused, count all attachment groups and their member verifications across visual pages. One/multiple groups use correct plural text; no groups has an explicit message and no jump action. Existing selected-year/full-transaction count remains separate. Paused/off modes expose no misleading active-group summary or jump.
- Hoppa till första gruppen reveals complete pages through the first group in the actual display list, accounting for existing SIE undo collapse. After React commits, scroll and keyboard focus move to the visible desktop/mobile section. No reordering, automatic expansion, filter clearing or accounting sum. Repeated jumps never shrink already revealed pages; changing date order changes the first destination correctly.
- Group membership helper, signed attachment routine, original details, accounting/data loaders and SIE undo behavior are unchanged. Accounting write-E2E is not applicable to these display controls.

Verification in this follow-up:

- PASS npm run typecheck; npm run test:history-groups.
- PASS npm run test:history-ui: eight synthetic scenarios, real component and Tailwind, Chromium 1440/390 px; every remote request blocked. Switch default, Space/Enter, accessible description, touch target; one/multiple/zero groups and empty year; first group after 102 ordinary rows plus one collapsed 20-member SIE undo group; correct 50-to-150 pagination; repeated jump, unchanged chronological prefix and remaining show-more; oldest/newest destination; originals, details, exact signed-link path/bucket/TTL, actions, search/filter/sort pause and mobile overflow. Frozen originals unchanged in every scenario.
- PASS focused ESLint on group component/UI test. TransactionTable baseline/current both 13 errors and one warning, identical after normalizing source-location line numbers embedded in diagnostics. Initial raw-message comparison differed only at the moved lines; no source change or lint suppression was needed. Full lint is not green.
- Desktop/mobile control and mobile jump screenshots visually reviewed in ignored test-results/attachment-groups/.
- No broad accounting E2E, hosted access/write, full regression rerun, build, new commit, push, merge or deploy. Previous full safe regression results above apply to the initial commit, not a new broad run.

Pending acceptance after separately approved publication: default Av, switch På with accurate summary (test group contributes three verifications; other groups, if any, are counted too), jump on desktop/mobile, expand/open PDF and briefly check search/sort pause. Exact six-file commit/Preview plan is in KAN-86-isolated-preview-plan.md. No Production authorization.
