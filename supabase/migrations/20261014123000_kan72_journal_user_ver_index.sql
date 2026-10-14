-- pg-delta: transaction=false
-- KAN-72: keep full-verification integrity checks fast without blocking journal writes.
-- Verified with Supabase CLI 2.120.0 migration up/db push; not for transactional runners.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_journal_entries_user_id_ver_nr
  ON public.journal_entries USING btree (user_id, ver_nr);

-- IF NOT EXISTS alone would silently accept a name collision or an invalid build.
-- Do not drop/rebuild anything automatically. A failed concurrent build needs review.
DO $kan72_index$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_index AS i
    JOIN pg_catalog.pg_class AS c ON c.oid = i.indexrelid
    JOIN pg_catalog.pg_am AS am ON am.oid = c.relam
    WHERE i.indexrelid = pg_catalog.to_regclass('public.idx_journal_entries_user_id_ver_nr')
      AND i.indrelid = 'public.journal_entries'::regclass
      AND c.relkind = 'i'
      AND am.amname = 'btree'
      AND NOT i.indisunique
      AND i.indisvalid AND i.indisready AND i.indislive
      AND i.indnkeyatts = 2 AND i.indnatts = 2
      AND i.indpred IS NULL AND i.indexprs IS NULL
      AND i.indoption::text = '0 0'
      AND pg_catalog.pg_get_indexdef(i.indexrelid, 1, false) = 'user_id'
      AND pg_catalog.pg_get_indexdef(i.indexrelid, 2, false) = 'ver_nr'
  ) THEN
    RAISE EXCEPTION 'KAN-72 journal index is missing, invalid or has an unexpected definition; inspect before retrying.'
      USING ERRCODE = '55000';
  END IF;
END;
$kan72_index$;
