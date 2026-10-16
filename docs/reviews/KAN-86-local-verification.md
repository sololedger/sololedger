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
