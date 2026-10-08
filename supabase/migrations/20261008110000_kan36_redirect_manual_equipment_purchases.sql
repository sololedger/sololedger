BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_manual_equipment_purchase_redirect()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_debit_account text;
BEGIN
  IF coalesce(NEW.source, 'manual') <> 'manual' THEN
    RETURN NEW;
  END IF;

  IF coalesce(NEW.is_correction, false) THEN
    RETURN NEW;
  END IF;

  IF NEW.type IS NULL OR btrim(NEW.type) = '' THEN
    RETURN NEW;
  END IF;

  SELECT a.debit_account
    INTO v_debit_account
  FROM public.accounts a
  WHERE a.user_id = NEW.user_id
    AND a.id = NEW.type;

  IF v_debit_account = '5410' THEN
    RAISE EXCEPTION
      'Utrustning bokförs under Inventarier. Gå till Inventarier så hjälper SoloLedger dig att bokföra köpet rätt, oavsett belopp.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS enforce_manual_equipment_purchase_redirect
  ON public.transactions;

CREATE TRIGGER enforce_manual_equipment_purchase_redirect
BEFORE INSERT OR UPDATE OF type, user_id, source, is_correction
ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.enforce_manual_equipment_purchase_redirect();

COMMENT ON FUNCTION public.enforce_manual_equipment_purchase_redirect() IS
  'KAN-36 guard: new ordinary manual purchases using 5410 are redirected to the fixed-asset flow. Non-manual sources, corrections, imports, and KAN-36 system postings remain outside this guard.';

COMMIT;
