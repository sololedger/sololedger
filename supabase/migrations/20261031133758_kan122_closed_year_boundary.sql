-- KAN-122: protect cumulative locked-year balances at the common write boundary.
-- No data rewrite, new table, role, policy or client-side accounting logic.
BEGIN;
DO $preimage$
BEGIN
 IF md5(replace(pg_get_functiondef('public.close_year_atomic(integer)'::regprocedure),chr(13),'')) <> 'f66c82e4ddc636d00f406d419b8cb9bd'
 OR md5(replace(pg_get_functiondef('public.lock_accounting_year_boundary(uuid,boolean)'::regprocedure),chr(13),'')) <> '11282f888e3bc863ab03f69813c83750'
 THEN RAISE EXCEPTION 'KAN-122: unexpected deployed year-lock definitions; inspect before applying.'; END IF;
END $preimage$;

-- Internal only: trigger owners execute this, never untrusted RPC callers.
CREATE FUNCTION public.assert_accounting_dates_open(p_user_id uuid,p_dates date[])
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_year integer;
BEGIN
  PERFORM public.lock_accounting_year_boundary(p_user_id,false);
  -- A separate SQL command AFTER any gate wait gets a fresh READ COMMITTED snapshot.
  SELECT max(year) INTO v_year FROM public.closed_years WHERE user_id=p_user_id;
  IF p_dates IS NULL OR cardinality(p_dates)=0 OR array_position(p_dates,NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Bokföringsdatum saknas. Underlaget behöver granskas innan bokföring.' USING ERRCODE='23514';
  END IF;
  IF v_year IS NOT NULL AND EXISTS(SELECT 1 FROM unnest(p_dates) d WHERE d<=make_date(v_year,12,31)) THEN
    RAISE EXCEPTION 'Bokföringsdatum till och med 31 december % skyddas av årslåset för %. Välj ett senare öppet bokföringsår. Äldre historik ändras inte.',v_year,v_year
      USING ERRCODE='23514';
  END IF;
END $function$;
REVOKE ALL ON FUNCTION public.assert_accounting_dates_open(uuid,date[]) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.guard_journal_closed_year_boundary()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_parent_date date; v_parent_user uuid; v_old_parent_date date;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF ROW(NEW.user_id,NEW.transaction_id,NEW.date,NEW.account_number,NEW.debit,NEW.credit)
      IS NOT DISTINCT FROM ROW(OLD.user_id,OLD.transaction_id,OLD.date,OLD.account_number,OLD.debit,OLD.credit) THEN RETURN NEW; END IF;
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'Bokförda journalposter får inte byta ägare.' USING ERRCODE='23514';
    END IF;
  END IF;
  -- Same first lock domain as all supported posting RPCs, before parent/inventory locks.
  PERFORM public.lock_accounting_year_boundary(NEW.user_id,false);
  -- Serialize with parent date moves, including privileged direct writes. Do not
  -- trust transactions.booked: imported/legacy rows may carry inconsistent flags.
  SELECT date,user_id INTO v_parent_date,v_parent_user FROM public.transactions
    WHERE id=NEW.transaction_id FOR SHARE;
  IF NOT FOUND OR v_parent_user IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'Journalpost och transaktion måste tillhöra samma användare.' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' THEN
    SELECT date INTO v_old_parent_date FROM public.transactions
      WHERE id=OLD.transaction_id AND user_id=OLD.user_id FOR SHARE;
    PERFORM public.assert_accounting_dates_open(OLD.user_id,ARRAY[OLD.date,v_old_parent_date]);
  END IF;
  PERFORM public.assert_accounting_dates_open(NEW.user_id,ARRAY[NEW.date,v_parent_date]);
  RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION public.guard_journal_closed_year_boundary() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.guard_transaction_closed_year_boundary()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_journal_date date;
BEGIN
  IF ROW(NEW.date,NEW.user_id,NEW.id) IS NOT DISTINCT FROM ROW(OLD.date,OLD.user_id,OLD.id) THEN RETURN NEW; END IF;
  PERFORM public.lock_accounting_year_boundary(OLD.user_id,false);
  IF NOT EXISTS(SELECT 1 FROM public.journal_entries WHERE transaction_id=OLD.id) THEN RETURN NEW; END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'En transaktion med journalposter får inte byta ägare eller identitet.' USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM public.journal_entries WHERE transaction_id=OLD.id AND (user_id<>OLD.user_id OR date IS NULL)) THEN
    RAISE EXCEPTION 'Journalunderlaget behöver granskas innan datum kan ändras.' USING ERRCODE='23514';
  END IF;
  SELECT min(date) INTO v_journal_date FROM public.journal_entries WHERE transaction_id=OLD.id;
  PERFORM public.assert_accounting_dates_open(OLD.user_id,ARRAY[OLD.date,NEW.date,v_journal_date]);
  RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION public.guard_transaction_closed_year_boundary() FROM PUBLIC,anon,authenticated,service_role;

-- Runs before inventory_journal_boundary; existing inventory and NE triggers stay.
CREATE TRIGGER accounting_closed_year_journal
BEFORE INSERT OR UPDATE ON public.journal_entries FOR EACH ROW
EXECUTE FUNCTION public.guard_journal_closed_year_boundary();
CREATE TRIGGER accounting_closed_year_transaction
BEFORE UPDATE OF date,user_id,id ON public.transactions FOR EACH ROW
EXECUTE FUNCTION public.guard_transaction_closed_year_boundary();

CREATE OR REPLACE FUNCTION public.close_year_atomic(p_year integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE s jsonb; v_first_year integer; v_open_year integer;
BEGIN
  PERFORM public.lock_accounting_year_boundary(auth.uid(),true);
  IF p_year IS NULL OR p_year < 1900 OR p_year > 9999 THEN
    RAISE EXCEPTION 'Ogiltigt räkenskapsår.' USING ERRCODE='22023';
  END IF;
  -- Evaluate AFTER the accounting gate, including a possible lock wait.
  -- No client clock, session timezone or caller-supplied date can bypass this.
  IF p_year >= extract(year FROM clock_timestamp() AT TIME ZONE 'Europe/Stockholm')::integer THEN
    RAISE EXCEPTION 'År % är inte avslutat. Du kan låsa året tidigast den 1 januari % (svensk tid).', p_year, p_year + 1
      USING ERRCODE='23514';
  END IF;
  -- Accounting start is evidence-based, never the account-registration date.
  -- Include both date interpretations, outstanding invoice history, explicit VAT
  -- management, and existing locks. Empty intervening years must close in order.
  SELECT min(y) INTO v_first_year FROM (
    SELECT extract(year FROM least(j.date,t.date))::integer y
      FROM public.journal_entries j JOIN public.transactions t ON t.id=j.transaction_id AND t.user_id=j.user_id
      WHERE j.user_id=auth.uid()
    UNION ALL SELECT extract(year FROM invoice_date)::integer FROM public.customer_invoices
      WHERE user_id=auth.uid() AND payment_status<>'cancelled'
    UNION ALL SELECT extract(year FROM vat_management_from)::integer FROM public.profiles
      WHERE id=auth.uid() AND vat_status='registered'
    UNION ALL SELECT extract(year FROM period_start)::integer FROM public.vat_periods WHERE user_id=auth.uid()
    UNION ALL SELECT year FROM public.closed_years WHERE user_id=auth.uid()
  ) relevant;
  IF v_first_year < 1900 THEN
    RAISE EXCEPTION 'Äldre bokföringsår behöver granskas innan årslås. SoloLedger gissar inte.' USING ERRCODE='23514';
  END IF;
  SELECT y INTO v_open_year FROM generate_series(v_first_year,p_year-1) y
    WHERE NOT EXISTS(SELECT 1 FROM public.closed_years c WHERE c.user_id=auth.uid() AND c.year=y)
    ORDER BY y LIMIT 1;
  IF v_open_year IS NOT NULL THEN
    RAISE EXCEPTION 'Du behöver låsa % först. Bokföringsåret % är fortfarande öppet och behöver avslutas innan du kan låsa %.',
      v_open_year,v_open_year,p_year USING ERRCODE='23514';
  END IF;
  s:=public.get_result_closing_review(p_year);
  IF (s->>'blocked')::boolean THEN
    RAISE EXCEPTION 'År % kan inte låsas: bokslutsposter kan ha nollställt resultatkonton. Kontrollera berörda verifikationer i NE-underlaget mot bokföringsunderlaget och eventuellt externt bokslut. SoloLedger har inget självserviceflöde för att godkänna detta underlag.',p_year
      USING ERRCODE='23514';
  END IF;
  PERFORM public.assert_vat_year_coverage(p_year);
  PERFORM public.lock_inventory_boundary();
  IF EXISTS(SELECT 1 FROM public.fixed_assets WHERE user_id=auth.uid() AND decision_type='capitalized' AND fiscal_year<=p_year)
    OR EXISTS(SELECT 1 FROM public.journal_entries WHERE user_id=auth.uid() AND date<=make_date(p_year,12,31) AND account_number BETWEEN '1220' AND '1249') THEN
    s:=public.inventory_depreciation_state(p_year);
    IF s->>'status'='ready' THEN RAISE EXCEPTION 'Inventarier behöver årsavskrivning innan årslås.' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN public.close_year_unchecked_inventory(p_year);
END $function$
;
-- CREATE OR REPLACE preserves the verified public RPC ACL. Internal helpers above
-- are private even when Supabase default privileges grant service_role access.
COMMIT;
