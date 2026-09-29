-- KAN-21 prerequisite: central transaction source taxonomy for VAT lifecycle guards.
--
-- Scope:
--   * Local review migration only. Do not apply to live Supabase without approval.
--   * Adds source classification helpers used by DB-side guards.
--   * Keeps the active transactions.source constraint unchanged. In particular,
--     vat_settlement is classified as a reserved future source but remains
--     impossible to insert until a later approved migration explicitly allows it.
--   * Replaces the VAT V2-only generic-correction trigger with a source-policy
--     trigger that preserves today's VAT V2 and VAT closing protection.
--     The existing create_correction_transaction_atomic vat_closing fast-fail
--     is retained for behavior/error-path compatibility; this trigger is the
--     authoritative defense-in-depth guard against direct generic correction
--     inserts for disallowed sources.
--   * Routes update_transaction_safe source protection through the same policy.

CREATE OR REPLACE FUNCTION public.transaction_source_classification(p_source text)
RETURNS TABLE (
  source text,
  is_current_source boolean,
  is_reserved_future_source boolean,
  is_system_managed boolean,
  is_controlled_vat_lifecycle_source boolean,
  allows_generic_correction boolean,
  allows_generic_update boolean,
  is_ordinary_vat_guard_activity boolean
)
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $function$
  SELECT
    p_source AS source,
    coalesce(p_source = ANY (ARRAY[
      'manual',
      'sie_import',
      'sie_opening_balance',
      'sie_import_undo',
      'vat_closing',
      'vat_v2'
    ]::text[]), false) AS is_current_source,
    coalesce(p_source = 'vat_settlement', false) AS is_reserved_future_source,
    coalesce(p_source = ANY (ARRAY[
      'sie_import',
      'sie_opening_balance',
      'sie_import_undo',
      'vat_closing',
      'vat_v2',
      'vat_settlement'
    ]::text[]), false) AS is_system_managed,
    coalesce(p_source = ANY (ARRAY[
      'vat_closing',
      'vat_settlement'
    ]::text[]), false) AS is_controlled_vat_lifecycle_source,
    CASE p_source
      WHEN 'manual' THEN true
      WHEN 'sie_import' THEN true
      WHEN 'sie_opening_balance' THEN true
      WHEN 'sie_import_undo' THEN true
      ELSE false
    END AS allows_generic_correction,
    CASE p_source
      WHEN 'manual' THEN true
      WHEN 'sie_import' THEN true
      WHEN 'sie_opening_balance' THEN true
      WHEN 'sie_import_undo' THEN true
      WHEN 'vat_v2' THEN true
      ELSE false
    END AS allows_generic_update,
    CASE p_source
      WHEN 'manual' THEN true
      WHEN 'sie_import' THEN true
      WHEN 'sie_opening_balance' THEN true
      WHEN 'sie_import_undo' THEN true
      WHEN 'vat_v2' THEN true
      ELSE false
    END AS is_ordinary_vat_guard_activity;
$function$;

CREATE OR REPLACE FUNCTION public.transaction_source_is_current(p_source text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $function$
  SELECT is_current_source
  FROM public.transaction_source_classification(p_source);
$function$;

CREATE OR REPLACE FUNCTION public.transaction_source_is_reserved_future(p_source text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $function$
  SELECT is_reserved_future_source
  FROM public.transaction_source_classification(p_source);
$function$;

CREATE OR REPLACE FUNCTION public.transaction_source_is_system_managed(p_source text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $function$
  SELECT is_system_managed
  FROM public.transaction_source_classification(p_source);
$function$;

CREATE OR REPLACE FUNCTION public.transaction_source_is_controlled_vat_lifecycle(p_source text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $function$
  SELECT is_controlled_vat_lifecycle_source
  FROM public.transaction_source_classification(p_source);
$function$;

CREATE OR REPLACE FUNCTION public.transaction_source_allows_generic_correction(p_source text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $function$
  SELECT allows_generic_correction
  FROM public.transaction_source_classification(p_source);
$function$;

CREATE OR REPLACE FUNCTION public.transaction_source_allows_generic_update(p_source text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $function$
  SELECT allows_generic_update
  FROM public.transaction_source_classification(p_source);
$function$;

CREATE OR REPLACE FUNCTION public.transaction_source_is_ordinary_vat_guard_activity(p_source text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $function$
  SELECT is_ordinary_vat_guard_activity
  FROM public.transaction_source_classification(p_source);
$function$;

COMMENT ON FUNCTION public.transaction_source_classification(text)
  IS 'Central SoloLedger transaction source taxonomy for DB-side VAT lifecycle/source guards. vat_settlement is reserved here but is not an active transactions.source value.';
COMMENT ON FUNCTION public.transaction_source_is_current(text)
  IS 'Returns true for transaction sources currently allowed by transactions_source_check.';
COMMENT ON FUNCTION public.transaction_source_is_reserved_future(text)
  IS 'Returns true for reserved future sources that are classified for guard policy but not yet insertable.';
COMMENT ON FUNCTION public.transaction_source_is_system_managed(text)
  IS 'Returns true for sources created by controlled SoloLedger/system/import flows rather than ordinary manual bookkeeping.';
COMMENT ON FUNCTION public.transaction_source_is_controlled_vat_lifecycle(text)
  IS 'Returns true for controlled VAT lifecycle sources such as VAT closing and reserved future settlement.';
COMMENT ON FUNCTION public.transaction_source_allows_generic_correction(text)
  IS 'Returns whether the generic correction RPC/trigger path may correct transactions from this source.';
COMMENT ON FUNCTION public.transaction_source_allows_generic_update(text)
  IS 'Returns whether update_transaction_safe may process updates for transactions from this source before normal booked/year guards.';
COMMENT ON FUNCTION public.transaction_source_is_ordinary_vat_guard_activity(text)
  IS 'Returns whether a source represents ordinary VAT-period activity for guard-domain purposes.';

REVOKE ALL ON FUNCTION public.transaction_source_classification(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transaction_source_classification(text) FROM anon;
REVOKE ALL ON FUNCTION public.transaction_source_classification(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.transaction_source_classification(text) TO postgres;
GRANT EXECUTE ON FUNCTION public.transaction_source_classification(text) TO service_role;

REVOKE ALL ON FUNCTION public.transaction_source_is_current(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transaction_source_is_current(text) FROM anon;
REVOKE ALL ON FUNCTION public.transaction_source_is_current(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.transaction_source_is_current(text) TO postgres;
GRANT EXECUTE ON FUNCTION public.transaction_source_is_current(text) TO service_role;

REVOKE ALL ON FUNCTION public.transaction_source_is_reserved_future(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transaction_source_is_reserved_future(text) FROM anon;
REVOKE ALL ON FUNCTION public.transaction_source_is_reserved_future(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.transaction_source_is_reserved_future(text) TO postgres;
GRANT EXECUTE ON FUNCTION public.transaction_source_is_reserved_future(text) TO service_role;

REVOKE ALL ON FUNCTION public.transaction_source_is_system_managed(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transaction_source_is_system_managed(text) FROM anon;
REVOKE ALL ON FUNCTION public.transaction_source_is_system_managed(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.transaction_source_is_system_managed(text) TO postgres;
GRANT EXECUTE ON FUNCTION public.transaction_source_is_system_managed(text) TO service_role;

REVOKE ALL ON FUNCTION public.transaction_source_is_controlled_vat_lifecycle(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transaction_source_is_controlled_vat_lifecycle(text) FROM anon;
REVOKE ALL ON FUNCTION public.transaction_source_is_controlled_vat_lifecycle(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.transaction_source_is_controlled_vat_lifecycle(text) TO postgres;
GRANT EXECUTE ON FUNCTION public.transaction_source_is_controlled_vat_lifecycle(text) TO service_role;

REVOKE ALL ON FUNCTION public.transaction_source_allows_generic_correction(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transaction_source_allows_generic_correction(text) FROM anon;
REVOKE ALL ON FUNCTION public.transaction_source_allows_generic_correction(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.transaction_source_allows_generic_correction(text) TO postgres;
GRANT EXECUTE ON FUNCTION public.transaction_source_allows_generic_correction(text) TO service_role;

REVOKE ALL ON FUNCTION public.transaction_source_allows_generic_update(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transaction_source_allows_generic_update(text) FROM anon;
REVOKE ALL ON FUNCTION public.transaction_source_allows_generic_update(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.transaction_source_allows_generic_update(text) TO postgres;
GRANT EXECUTE ON FUNCTION public.transaction_source_allows_generic_update(text) TO service_role;

REVOKE ALL ON FUNCTION public.transaction_source_is_ordinary_vat_guard_activity(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transaction_source_is_ordinary_vat_guard_activity(text) FROM anon;
REVOKE ALL ON FUNCTION public.transaction_source_is_ordinary_vat_guard_activity(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.transaction_source_is_ordinary_vat_guard_activity(text) TO postgres;
GRANT EXECUTE ON FUNCTION public.transaction_source_is_ordinary_vat_guard_activity(text) TO service_role;

CREATE OR REPLACE FUNCTION public.prevent_disallowed_generic_correction_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_original_source text;
BEGIN
  IF coalesce(NEW.is_correction, false)
     AND NEW.corrects_ver_nr IS NOT NULL THEN
    SELECT original_tx.source
      INTO v_original_source
    FROM public.transactions original_tx
    JOIN public.journal_entries original_entry
      ON original_entry.transaction_id = original_tx.id
     AND original_entry.user_id = original_tx.user_id
    WHERE original_tx.user_id = NEW.user_id
      AND original_entry.ver_nr = NEW.corrects_ver_nr
      AND NOT public.transaction_source_allows_generic_correction(original_tx.source)
    ORDER BY original_tx.id
    LIMIT 1;

    IF v_original_source IS NOT NULL THEN
      IF v_original_source = 'vat_v2' THEN
        RAISE EXCEPTION
          'VAT V2-verifikationer kan inte korrigeras med den generiska korrigeringsfunktionen ännu.'
          USING ERRCODE = '23514';
      ELSIF v_original_source = 'vat_closing' THEN
        RAISE EXCEPTION
          'Momsavslut är systemverifikationer och kan inte korrigeras.'
          USING ERRCODE = '42501';
      ELSE
        RAISE EXCEPTION
          'Systemverifikationer från denna källa kan inte korrigeras med den generiska korrigeringsfunktionen.'
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS prevent_vat_v2_correction_insert
  ON public.transactions;

DROP TRIGGER IF EXISTS prevent_disallowed_generic_correction_insert
  ON public.transactions;

CREATE TRIGGER prevent_disallowed_generic_correction_insert
BEFORE INSERT ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.prevent_disallowed_generic_correction_insert();

DROP FUNCTION IF EXISTS public.prevent_vat_v2_correction_insert();

COMMENT ON FUNCTION public.prevent_disallowed_generic_correction_insert()
  IS 'Blocks generic correction inserts for transaction sources whose central taxonomy disallows generic correction. Complements RPC fast-fail checks as defense in depth.';

REVOKE ALL ON FUNCTION public.prevent_disallowed_generic_correction_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_disallowed_generic_correction_insert() FROM anon;
REVOKE ALL ON FUNCTION public.prevent_disallowed_generic_correction_insert() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_disallowed_generic_correction_insert() TO postgres;
GRANT EXECUTE ON FUNCTION public.prevent_disallowed_generic_correction_insert() TO service_role;

CREATE OR REPLACE FUNCTION public.update_transaction_safe(p_tx_id uuid, p_updates jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_tx public.transactions%ROWTYPE;
  v_new_date date;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Ingen giltig eller inloggad användare hittades.'
      USING ERRCODE = '42501';
  END IF;

  IF p_tx_id IS NULL THEN
    RAISE EXCEPTION 'Transaktions-ID saknas.'
      USING ERRCODE = '22023';
  END IF;

  IF p_updates IS NULL OR jsonb_typeof(p_updates) <> 'object' THEN
    RAISE EXCEPTION 'Ogiltig uppdateringsdata.'
      USING ERRCODE = '22023';
  END IF;

  -- Lås raden så att ägarskap/låsstatus och uppdatering bedöms atomiskt.
  SELECT *
  INTO v_tx
  FROM public.transactions
  WHERE id = p_tx_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaktionen hittades inte eller tillhör inte dig.'
      USING ERRCODE = '42501';
  END IF;

  -- Source policy blocks controlled lifecycle/system rows before any otherwise
  -- allowed metadata update can mutate them.
  IF NOT public.transaction_source_allows_generic_update(v_tx.source) THEN
    IF v_tx.source = 'vat_closing' THEN
      RAISE EXCEPTION 'Momsavslut är systemverifikationer och kan inte ändras.'
        USING ERRCODE = '42501';
    END IF;

    RAISE EXCEPTION 'Systemverifikationer från denna källa kan inte ändras här.'
      USING ERRCODE = '42501';
  END IF;

  -- Det år transaktionen ligger i idag måste vara öppet.
  IF EXISTS (
    SELECT 1
    FROM public.closed_years
    WHERE user_id = v_user_id
      AND year = EXTRACT(YEAR FROM v_tx.date)::integer
  ) THEN
    RAISE EXCEPTION 'Räkenskapsår % är låst för ändringar.',
      EXTRACT(YEAR FROM v_tx.date)::integer
      USING ERRCODE = '42501';
  END IF;

  -- Om datum skickas in: validera det och kontrollera att eventuellt nytt år är öppet.
  IF p_updates ? 'date' THEN
    BEGIN
      v_new_date := (p_updates->>'date')::date;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Ogiltigt datum.'
        USING ERRCODE = '22007';
    END;

    IF v_new_date IS NULL THEN
      RAISE EXCEPTION 'Datum får inte vara tomt.'
        USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.closed_years
      WHERE user_id = v_user_id
        AND year = EXTRACT(YEAR FROM v_new_date)::integer
    ) THEN
      RAISE EXCEPTION 'Räkenskapsår % är låst för ändringar.',
        EXTRACT(YEAR FROM v_new_date)::integer
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Bokförd verifikation: bokföringspåverkande fält får aldrig ändras direkt.
  -- Datum och beskrivning jämförs mot befintliga värden eftersom klienten får
  -- skicka med samma värden utan att detta ska räknas som en ändring.
  IF COALESCE(v_tx.booked, false)
     AND (
       (p_updates ? 'date' AND v_new_date IS DISTINCT FROM v_tx.date)
       OR (
         p_updates ? 'description'
         AND (p_updates->>'description') IS DISTINCT FROM v_tx.description
       )
       OR p_updates ? 'amount'
       OR p_updates ? 'type'
       OR p_updates ? 'vat_rate'
     )
  THEN
    RAISE EXCEPTION
      'Bokförda transaktioner får inte ändras i datum, beskrivning, belopp, kategori eller moms. Använd korrigeringsverifikation.'
      USING ERRCODE = '42501';
  END IF;

  -- Whitelist: okända/skadliga fält (t.ex. user_id, booked, ver_nr) ignoreras.
  UPDATE public.transactions
  SET
    date = CASE
      WHEN p_updates ? 'date' THEN v_new_date
      ELSE date
    END,
    description = CASE
      WHEN p_updates ? 'description' THEN p_updates->>'description'
      ELSE description
    END,
    amount = CASE
      WHEN p_updates ? 'amount' THEN (p_updates->>'amount')::numeric
      ELSE amount
    END,
    type = CASE
      WHEN p_updates ? 'type' THEN p_updates->>'type'
      ELSE type
    END,
    vat_rate = CASE
      WHEN p_updates ? 'vat_rate' THEN (p_updates->>'vat_rate')::numeric
      ELSE vat_rate
    END,
    file_url = CASE
      WHEN p_updates ? 'file_url' THEN p_updates->>'file_url'
      ELSE file_url
    END
  WHERE id = p_tx_id
    AND user_id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', p_tx_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.update_transaction_safe(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_transaction_safe(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_transaction_safe(uuid, jsonb) TO postgres;
GRANT EXECUTE ON FUNCTION public.update_transaction_safe(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_transaction_safe(uuid, jsonb) TO service_role;
