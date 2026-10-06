CREATE OR REPLACE FUNCTION public.prevent_disallowed_generic_correction_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
      IF NEW.source = 'customer_invoice'
         AND v_original_source = 'customer_invoice' THEN
        RETURN NEW;
      ELSIF v_original_source = 'vat_v2' THEN
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

COMMENT ON FUNCTION public.prevent_disallowed_generic_correction_insert()
  IS 'Blocks generic correction inserts for transaction sources whose central taxonomy disallows generic correction, while allowing the controlled customer-invoice payment reversal RPC to create traceable customer_invoice corrections.';

REVOKE ALL ON FUNCTION public.prevent_disallowed_generic_correction_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_disallowed_generic_correction_insert() FROM anon;
REVOKE ALL ON FUNCTION public.prevent_disallowed_generic_correction_insert() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_disallowed_generic_correction_insert() TO postgres;
GRANT EXECUTE ON FUNCTION public.prevent_disallowed_generic_correction_insert() TO service_role;
