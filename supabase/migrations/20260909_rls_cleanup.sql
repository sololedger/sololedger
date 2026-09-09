-- 2026-09-09
-- RLS cleanup for SoloLedger
--
-- Goals:
-- 1) Remove overlapping *_owner ALL policies.
-- 2) For transactions/journal_entries, keep only direct SELECT via RLS.
--    Direct writes are already blocked by table grants and must go through secure RPCs.
-- 3) Keep accounts CRUD policies because Kontoplan intentionally writes directly.
-- 4) Keep closed_years SELECT/INSERT because the app intentionally reads/locks years directly.
--
-- No data is changed by this migration.

-- ─────────────────────────────────────────────────────────────
-- ACCOUNTS
-- Keep the four explicit CRUD policies; remove redundant ALL.
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "accounts_owner" ON public.accounts;

-- ─────────────────────────────────────────────────────────────
-- TRANSACTIONS
-- Client may read its own rows directly.
-- All writes must go through secure RPCs, so old write policies are stale.
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "transactions_owner" ON public.transactions;
DROP POLICY IF EXISTS "Användare skapar bara egna transaktioner" ON public.transactions;
DROP POLICY IF EXISTS "Användare uppdaterar bara egna transaktioner" ON public.transactions;
DROP POLICY IF EXISTS "Användare raderar bara egna transaktioner" ON public.transactions;

-- Keep:
-- "Användare ser bara sina egna transaktioner"

-- ─────────────────────────────────────────────────────────────
-- JOURNAL_ENTRIES
-- Client may read its own rows directly.
-- All writes must go through secure RPCs.
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "journal_entries_owner" ON public.journal_entries;
DROP POLICY IF EXISTS "Användare skapar bara egna journalposter" ON public.journal_entries;
DROP POLICY IF EXISTS "Användare uppdaterar bara egna journalposter" ON public.journal_entries;
DROP POLICY IF EXISTS "Användare raderar bara egna journalposter" ON public.journal_entries;

-- Keep:
-- "Användare ser bara sina egna journalposter"

-- ─────────────────────────────────────────────────────────────
-- CLOSED_YEARS
-- Appen läser och låser år direkt. Ta bara bort redundant ALL-policy.
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "closed_years_owner" ON public.closed_years;

-- Keep:
-- "Användare kan bara låsa sina egna år"
-- "Användare ser bara sina egna låsta år"

-- ─────────────────────────────────────────────────────────────
-- favorites/import_batches
-- Not touched here: they do not have duplicate policies in the current schema.
-- Their grants can be reviewed separately if desired.
-- ─────────────────────────────────────────────────────────────
