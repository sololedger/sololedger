-- KAN-110: refuse incomplete managed VAT coverage before the existing year close.
-- No history repair, period creation or accounting entries. No new API surface.
DO $preimage$
BEGIN
  IF md5(replace(pg_get_functiondef('public.close_year_atomic(integer)'::regprocedure), E'\r', ''))
      <> '4443ebe746e5a4d25e999aaf148694e5' THEN
    RAISE EXCEPTION 'KAN-110: unexpected close_year_atomic definition; inspect before applying.';
  END IF;
END $preimage$;

CREATE FUNCTION public.assert_vat_year_coverage(p_year integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $coverage$
DECLARE
  v_user uuid := auth.uid();
  p public.profiles%ROWTYPE;
  v_start date;
  v_end date;
  v_calendar_start date;
  v_year_end date;
  v_step interval;
  v_period public.vat_periods%ROWTYPE;
BEGIN
  -- Caller already holds the exclusive KAN-75 owner gate. Do not upgrade locks.
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Du måste vara inloggad för att låsa ett räkenskapsår.' USING ERRCODE='28000';
  END IF;
  IF p_year IS NULL OR p_year < 1900 OR p_year > 9999 THEN
    RAISE EXCEPTION 'Ogiltigt räkenskapsår.' USING ERRCODE='22023';
  END IF;
  SELECT * INTO p FROM public.profiles WHERE id=v_user FOR UPDATE;
  IF NOT FOUND OR p.vat_status IS NULL OR p.vat_status NOT IN ('registered','not_registered') THEN
    RAISE EXCEPTION 'Året kan inte låsas. Kontrollera företagets momsregistrering i Profil. SoloLedger gissar inte.' USING ERRCODE='23514';
  END IF;
  IF p.vat_status='not_registered' THEN RETURN; END IF;
  IF p.vat_period_type IS NULL OR p.vat_period_type NOT IN ('month','quarter','year') OR p.vat_management_from IS NULL THEN
    RAISE EXCEPTION 'Året kan inte låsas. Kontrollera momsperiod och startdatum för momshanteringen i Profil.' USING ERRCODE='23514';
  END IF;
  v_year_end:=make_date(p_year,12,31);
  -- A management date is not proof that earlier booked VAT was handled elsewhere.
  IF EXISTS(SELECT 1 FROM public.journal_entries je
    WHERE je.user_id=v_user AND je.date BETWEEN make_date(p_year,1,1) AND v_year_end
      AND je.date<p.vat_management_from AND je.account_number LIKE '26%') THEN
    RAISE EXCEPTION 'Året kan inte låsas. Bokförd moms finns före SoloLedgers momshanteringsstart. Utred tidigare momshantering och startdatum; inga historiska uppgifter ändras automatiskt.' USING ERRCODE='23514';
  END IF;
  v_start:=greatest(make_date(p_year,1,1),p.vat_management_from);
  v_step:=CASE p.vat_period_type WHEN 'month' THEN interval '1 month' WHEN 'quarter' THEN interval '3 months' ELSE interval '1 year' END;
  WHILE v_start<=v_year_end LOOP
    v_calendar_start:=date_trunc(p.vat_period_type,v_start)::date;
    v_end:=(v_calendar_start+v_step-interval '1 day')::date;
    SELECT * INTO v_period FROM public.vat_periods vp
      WHERE vp.user_id=v_user AND vp.period_start=v_start AND vp.period_end=v_end;
    IF NOT FOUND THEN
      IF v_start<>v_calendar_start THEN
        RAISE EXCEPTION 'Året kan inte låsas. Första momsperioden % – % behöver utredas eftersom momshanteringen börjar mitt i en period. Kontrollera registreringsunderlag och Profil. SoloLedger skapar ingen gissad delperiod.',v_start,v_end USING ERRCODE='23514';
      END IF;
      RAISE EXCEPTION 'Året kan inte låsas. Momsperioden % – % saknas. Öppna Moms, kontrollera perioderna och avsluta dem före årslås.',v_start,v_end USING ERRCODE='23514';
    END IF;
    IF v_period.period_type<>p.vat_period_type OR v_period.source<>'sololedger'
      OR EXISTS(SELECT 1 FROM public.vat_periods vp WHERE vp.user_id=v_user AND vp.id<>v_period.id
        AND vp.period_start<=v_end AND vp.period_end>=v_start) THEN
      RAISE EXCEPTION 'Året kan inte låsas. Momsperioden % – % har osäker eller överlappande historik. Utred momshanteringen; SoloLedger gissar inte.',v_start,v_end USING ERRCODE='23514';
    END IF;
    IF v_period.status NOT IN ('closed','declared') THEN
      RAISE EXCEPTION 'Året kan inte låsas. Momsperioden % – % är fortfarande öppen. Kontrollera och stäng den i Moms.',v_start,v_end USING ERRCODE='23514';
    END IF;
    -- An existing explicit first-year partial period can satisfy coverage; never invent it.
    v_start:=v_end+1;
  END LOOP;
END $coverage$;
REVOKE ALL ON FUNCTION public.assert_vat_year_coverage(integer) FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON FUNCTION public.assert_vat_year_coverage(integer) IS
  'KAN-110 private managed-period coverage check under exclusive accounting-year gate. Existing partial periods are read only; missing/ambiguous history blocks.';

CREATE OR REPLACE FUNCTION public.close_year_atomic(p_year integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public
AS $function$
DECLARE s jsonb;
BEGIN
  PERFORM public.lock_accounting_year_boundary(auth.uid(),true);
  PERFORM public.assert_vat_year_coverage(p_year);
  PERFORM public.lock_inventory_boundary();
  IF EXISTS(SELECT 1 FROM public.fixed_assets WHERE user_id=auth.uid() AND decision_type='capitalized' AND fiscal_year<=p_year)
    OR EXISTS(SELECT 1 FROM public.journal_entries WHERE user_id=auth.uid() AND date<=make_date(p_year,12,31) AND account_number BETWEEN '1220' AND '1249') THEN
    s:=public.inventory_depreciation_state(p_year);
    IF s->>'status'='ready' THEN RAISE EXCEPTION 'Inventarier behöver årsavskrivning innan årslås.' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN public.close_year_unchecked_inventory(p_year);
END $function$;
