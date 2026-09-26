-- H6: prevent deletion of an account/category that is already used
-- by booked transactions.
--
-- UI checks this before DELETE for a friendly message, but this trigger is
-- the authoritative server-side guard and also protects against direct API use.

CREATE OR REPLACE FUNCTION public.prevent_deleting_used_account()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.transactions t
    WHERE t.user_id = OLD.user_id
      AND t.type = OLD.id
      AND t.booked = true
  ) THEN
    RAISE EXCEPTION
      'Kontot "%" används i bokförda transaktioner och kan inte raderas.',
      OLD.id
      USING ERRCODE = '23503';
  END IF;

  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS prevent_deleting_used_account
ON public.accounts;

CREATE TRIGGER prevent_deleting_used_account
BEFORE DELETE ON public.accounts
FOR EACH ROW
EXECUTE FUNCTION public.prevent_deleting_used_account();
