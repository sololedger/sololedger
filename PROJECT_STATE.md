# SoloLedger Project State

Last updated: 2026-09-26

## Repository State

- Worktree: `C:\Users\Familjedator\Desktop\Sololedger Multi User App\sololedger_multi_user`
- Branch: `main`
- Git remote/origin verified as `https://github.com/sololedger/sololedger.git`
- Current base verified: `HEAD == origin/main == 53b6810e59dd9f8f20e6ef3803472f2fb0a3a389`
- Latest committed subject: `KAN-19 record live 2645 migration state`
- KAN-19 Slice 1 checkpoint: `6d2ebd9034aba49877c3a58e352f67389e24b4e4`
- KAN-19 Slice 2 checkpoint: `7039ea4e3ee4385e3dce56b91e0bb0749dd37d77`
- KAN-19 exact-2645 classifier checkpoint: `a98538477dd1aeedce9fa20190c5895cce1bd5b1`
- KAN-19 live-2645 documentation checkpoint: `53b6810e59dd9f8f20e6ef3803472f2fb0a3a389`
- Working tree is intentionally dirty only for the verified KAN-19 persistence candidate and this state update:
  - `src/lib/accountingService.ts`
  - `supabase/migrations/20260926174535_add_vat_v2_reverse_charge_booking.sql`
  - `supabase/tests/kan19_vat_v2_reverse_charge_persistence_candidate.sql`
  - `PROJECT_STATE.md`

## External Connections

- Jira cloud ID: `42c6216d-73c5-4777-a644-c41ef9bc6a1a`
- Jira project: `KAN` / `Sololedger`, project ID `10001`
- Jira KAN-19 verified 2026-09-26: Story, status `In Progress`, assignee empty.
- Live Supabase read-only verification 2026-09-26 confirms exact `2645` is now P1=true, P2=true, P3=false.

## Current Objective

- KAN-19 `VAT V2-4 - VAT-aware booking RPC` remains active/in progress, not complete.
- Exact-2645 VAT account-classification prerequisite slice is implemented, checkpointed, applied live, migration-history repaired, and verified.
- Live migration artifact: `supabase/migrations/20260926132107_add_2645_vat_account_classification.sql`
- Migration artifact SHA-256: `449D23FE0BCE93471BF028D3B8B7EB32D88E814BE7F6DDC7B309D8381355AA11`
- Live semantics for exact `2645`:
  - P1 period guard/concurrency: true
  - P2 VAT close balance participant: true
  - P3 close manual review: false
- Preserved semantics: 261x/262x/263x unchanged, exact `2641` unchanged, 265x unchanged, and other 264x remain outside (`2640`, `2646`, `26410`, `26450` false/false/false).
- KAN-19 persistence candidate is implemented locally and verified, but is NOT LIVE:
  - Candidate migration: `supabase/migrations/20260926174535_add_vat_v2_reverse_charge_booking.sql`
  - Adds `transactions.source = 'vat_v2'` only when applied.
  - Adds `public.vat_audit_snapshots` only when applied.
  - Adds `book_vat_v2_eu_service_reverse_charge_atomic(jsonb)` only when applied.
  - Live Supabase does not yet have this RPC, table, or source value.
- Supported candidate path remains ONLY `EU_SERVICE_REVERSE_CHARGE`, `25%`, full deduction.
- Candidate server-derived journal:
  - Dr `4535` base
  - Dr `2645` calculated input VAT
  - Cr `2614` calculated output VAT
  - Cr supplied valid payment/payable account base
- Candidate VAT report semantics: field `21` = base, field `30` = output VAT, field `48` = deductible calculated input VAT.
- Candidate audit/security boundary: authenticated client has SELECT-only snapshot access; mutation remains server/RPC-side; client-supplied trusted `journal_rows` or `audit_snapshot` is rejected.
- Candidate correction boundary: generic correction of `source='vat_v2'` is intentionally blocked pending a VAT V2-aware correction flow.
- Verified regression preserves existing VAT V1 booking/correction behavior.

## KAN-19 Verification

- Final read-only review verdict before live apply: `KAN-19 2645 FINAL REVIEW PASSED`.
- Production-derived local rollback regression passed for the exact-2645 candidate.
- KAN-19 persistence final review verdict: `KAN-19 PERSISTENCE FINAL REVIEW PASSED`.
- KAN-19 persistence production-derived local PostgreSQL rollback regression passed.
- KAN-19 persistence checks passed: `npm run test:domain`, `npm run typecheck`, `npx eslint src/lib/accountingService.ts`, `git diff --check`.
- KAN-19 persistence final review findings: 0 CRITICAL, 0 HIGH, 0 MEDIUM, LOW = true two-session concurrency still not empirically proven.
- Current KAN-17C close-classification rollback regression passed.
- Reverse-charge close proof passed: `Dr 4535 228`, `Dr 2645 57`, `Cr 2614 57`, `Cr payment/payable 228` results in `2614=0`, `2645=0`, `2650=0`, `closing_amount=0`.
- Representative VAT V1 `2611`/`2641` close regression passed.
- Zero-activity close remains unchanged.
- `imported_history` close behavior remains unchanged.
- True two-session concurrency has not been empirically proven.
- Historical KAN-17A/KAN-17B candidate tests were independently reviewed and confirmed stale because KAN-17B/KAN-17C intentionally superseded their embedded assertions; they are not current architecture gates.

## Live Migration State

- Initial live apply used Supabase MCP `apply_migration`, which generated remote version `20260926114550` while treating `20260926132107_add_2645_vat_account_classification` as the migration name.
- Official Supabase migration repair subsequently reconciled migration tracking:
  - `20260926132107` is applied.
  - `20260926114550` is no longer applied.
- KAN-19 repo/live identity for this migration is now aligned.
- Older historical migration-list differences unrelated to this KAN-19 migration remain and were not changed or investigated in this checkpoint.

## Preserved Boundaries

- Local service wrapper for the VAT V2 persistence RPC exists in `accountingService.ts`, but no UI wiring exists yet.
- No VAT report V2 implementation exists yet.
- VAT V2 audit persistence candidate exists locally only and has not been applied live.
- No new live DB writes, migration repair, deployment, commit, push, or Jira write has been performed during this persistence checkpoint prep.

## Active VAT V2 Context

- KAN-14 `VAT V2 - Utlandshandel / utländska inköp`: Epic, current Jira status previously verified as `To Do`.
- KAN-15 `VAT V2 recon/design: utländska inköp och utlandsmoms`: Done.
- KAN-16 `VAT V2-1 - Domain/profile model`: implemented and remains the domain/profile foundation.
- KAN-17 `VAT V2-2 - Central VAT account roles`: foundation completed/frozen through KAN-17C; do not reopen unless new evidence proves incompatibility.
- KAN-18 `VAT V2-3 - VAT treatment decision engine`: Done.
- KAN-19 `VAT V2-4 - VAT-aware booking RPC`: active/in progress; exact-2645 prerequisite is live and verified.

## Open VAT V2 Questions

- EXTERNAL ACCOUNTING VERIFICATION REQUIRED: exact journal treatment for self-calculated reverse-charge VAT with no deduction, including BAS/account mapping, cost/acquisition-value handling, and K1/NE implications.
- EXTERNAL VERIFICATION REQUIRED: initial/partial VAT period when `vatReportingFrom` occurs inside a normal month/quarter/year period.
- EXTERNAL VERIFICATION REQUIRED: historical Adobe Ireland invoices with supplier-charged 25% VAT, including tax base, reverse-charge calculation, correction/refund handling, and VAT return correction.

## Next Safe Step

- Wait for Pontus approval before staging, committing, pushing, writing Jira, applying migrations, or starting the next KAN-19 implementation slice.
- Proposed checkpoint commit message: `KAN-19 add VAT V2 persistence boundary`
- If approved to commit, commit exactly:
  - `src/lib/accountingService.ts`
  - `supabase/migrations/20260926174535_add_vat_v2_reverse_charge_booking.sql`
  - `supabase/tests/kan19_vat_v2_reverse_charge_persistence_candidate.sql`
  - `PROJECT_STATE.md`
- Push only if Pontus explicitly approves push.
