-- KAN-111: reuse existing periods in locked years; create only on explicit request.
-- KAN-110: never silently skip an unresolved first partial period.
DO $preimage$
BEGIN
  IF md5(replace(pg_get_functiondef('public.ensure_vat_periods(date)'::regprocedure), E'\r', ''))
      <> '19bfa8c1b448475c65e5175b543f0826' THEN
    RAISE EXCEPTION 'KAN-111: unexpected ensure_vat_periods definition; inspect before applying.';
  END IF;
END $preimage$;

CREATE OR REPLACE FUNCTION public.ensure_vat_periods(p_through_date date DEFAULT CURRENT_DATE)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public
AS $function$
DECLARE
  v_user_id uuid:=auth.uid();
  p public.profiles%ROWTYPE;
  v_through date;
  v_start date;
  v_end date;
  v_calendar_start date;
  v_step interval;
  v_existing public.vat_periods%ROWTYPE;
  v_created integer:=0;
  v_count integer:=0;
BEGIN
  PERFORM public.lock_accounting_year_boundary(v_user_id,false);
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Du måste vara inloggad för att skapa momsperioder.' USING ERRCODE='28000'; END IF;
  SELECT * INTO p FROM public.profiles WHERE id=v_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ingen profil hittades för användaren.' USING ERRCODE='23514'; END IF;
  IF p.vat_status IS DISTINCT FROM 'registered' THEN RAISE EXCEPTION 'Momsperioder kan bara skapas för ett momsregistrerat företag.' USING ERRCODE='23514'; END IF;
  IF p.vat_period_type IS NULL OR p.vat_period_type NOT IN ('month','quarter','year') THEN
    RAISE EXCEPTION 'Företagets momsperiod är inte korrekt inställd.' USING ERRCODE='23514';
  END IF;
  IF p.vat_management_from IS NULL THEN RAISE EXCEPTION 'Startdatum för SoloLedgers momshantering saknas.' USING ERRCODE='23514'; END IF;
  IF p_through_date IS NULL THEN RAISE EXCEPTION 'Slutdatum för generering av momsperioder saknas.' USING ERRCODE='22023'; END IF;
  v_through:=least(p_through_date,current_date);
  v_start:=p.vat_management_from;
  v_step:=CASE p.vat_period_type WHEN 'month' THEN interval '1 month' WHEN 'quarter' THEN interval '3 months' ELSE interval '1 year' END;
  WHILE v_start<=v_through LOOP
    v_calendar_start:=date_trunc(p.vat_period_type,v_start)::date;
    v_end:=(v_calendar_start+v_step-interval '1 day')::date;
    SELECT * INTO v_existing FROM public.vat_periods vp
      WHERE vp.user_id=v_user_id AND vp.period_start=v_start AND vp.period_end=v_end;
    IF FOUND THEN
      IF v_existing.period_type<>p.vat_period_type THEN
        RAISE EXCEPTION 'Befintlig momsperiod % – % har en annan periodtyp än företagets nuvarande momsinställning.',v_start,v_end USING ERRCODE='23514';
      END IF;
      -- Existing state/source/accounting are never rewritten, even in a locked year.
      v_count:=v_count+1;
    ELSE
      IF v_start<>v_calendar_start THEN
        RAISE EXCEPTION 'Första momsperioden % – % behöver utredas eftersom momshanteringen börjar mitt i en period. Kontrollera registreringsunderlag och Profil. SoloLedger skapar ingen gissad delperiod.',v_start,v_end USING ERRCODE='23514';
      END IF;
      IF EXISTS(SELECT 1 FROM public.closed_years cy WHERE cy.user_id=v_user_id AND cy.year=extract(year FROM v_end)::integer) THEN
        RAISE EXCEPTION 'Momsperioden % – % saknas i ett låst räkenskapsår. Historiken behöver utredas; ingen ny period skapades.',v_start,v_end USING ERRCODE='23514';
      END IF;
      IF EXISTS(SELECT 1 FROM public.vat_periods vp WHERE vp.user_id=v_user_id AND vp.period_start<=v_end AND vp.period_end>=v_start) THEN
        RAISE EXCEPTION 'En befintlig momsperiod överlappar perioden % – %. Kontrollera momsinställningarna innan nya perioder skapas.',v_start,v_end USING ERRCODE='23514';
      END IF;
      INSERT INTO public.vat_periods(user_id,period_start,period_end,period_type,status,source)
        VALUES(v_user_id,v_start,v_end,p.vat_period_type,'open','sololedger');
      v_created:=v_created+1;
    END IF;
    v_start:=v_end+1;
  END LOOP;
  RETURN jsonb_build_object('success',true,'created_count',v_created,'existing_count',v_count,
    'period_type',p.vat_period_type,'management_from',p.vat_management_from,'through_date',v_through);
END $function$;
