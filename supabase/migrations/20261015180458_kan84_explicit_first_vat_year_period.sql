-- KAN-84: explicit initialization of a newly registered calendar-year VAT period.
-- Ordinary ensure_vat_periods intentionally keeps skipping partial migration/
-- handover periods. No existing profile, period, journal or history is rewritten.
-- Administrative opt-in only, after checking registration evidence.
CREATE FUNCTION public.initialize_first_vat_year_period(
  p_user_id uuid,
  p_expected_management_from date,
  p_expected_period_end date,
  p_confirm_first_registration boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
DECLARE
 p public.profiles%ROWTYPE;
 v_end date;
 v_existing public.vat_periods%ROWTYPE;
 v_id uuid;
 v_months date[];
BEGIN
 IF p_user_id IS NULL OR p_expected_management_from IS NULL
    OR p_confirm_first_registration IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'Första momsregistreringen måste bekräftas mot registreringsunderlag.'
     USING ERRCODE='22023';
 END IF;
 IF p_expected_management_from > current_date THEN
   RAISE EXCEPTION 'Första momsperioden får inte börja i framtiden.' USING ERRCODE='22023';
 END IF;
 v_end:=make_date(extract(year FROM p_expected_management_from)::int,12,31);
 IF p_expected_period_end IS DISTINCT FROM v_end THEN
   RAISE EXCEPTION 'Första periodens slut måste styrkas. Endast kalenderår med slut 31 december samma år stöds här.'
     USING ERRCODE='22023';
 END IF;
 SELECT array_agg(d::date ORDER BY d) INTO v_months
 FROM generate_series(date_trunc('year',p_expected_management_from)::date,v_end,interval '1 month') d;
 -- Same global order as booking/closing: all VAT month locks before row locks.
 -- lock_vat_months verifies owner context even for this administrative call.
 IF auth.uid() IS DISTINCT FROM p_user_id THEN
   RAISE EXCEPTION 'Momsperiodens användarkontext stämmer inte.' USING ERRCODE='42501';
 END IF;
 PERFORM public.lock_vat_months(p_user_id,v_months);
 SELECT * INTO p FROM public.profiles WHERE id=p_user_id FOR UPDATE;
 IF NOT FOUND OR p.vat_status IS DISTINCT FROM 'registered'
    OR p.vat_period_type IS DISTINCT FROM 'year'
    OR p.vat_management_from IS DISTINCT FROM p_expected_management_from THEN
   RAISE EXCEPTION 'Momsprofilen stämmer inte med den granskade första årsperioden.'
     USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM public.closed_years
   WHERE user_id=p_user_id AND year=extract(year FROM v_end)::int) THEN
   RAISE EXCEPTION 'Räkenskapsåret är låst.' USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM public.vat_periods WHERE user_id=p_user_id
      AND period_start < p_expected_management_from) THEN
   RAISE EXCEPTION 'Tidigare momshistorik motsäger första registreringen; ingen period ändrades.'
      USING ERRCODE='23514';
 END IF;
 PERFORM 1 FROM public.vat_periods WHERE user_id=p_user_id
   AND period_start<=v_end AND period_end>=p_expected_management_from ORDER BY id FOR UPDATE;
 SELECT * INTO v_existing FROM public.vat_periods
   WHERE user_id=p_user_id AND period_start=p_expected_management_from AND period_end=v_end;
 IF FOUND THEN
   IF v_existing.period_type<>'year' OR v_existing.source<>'sololedger'
      OR EXISTS(SELECT 1 FROM public.vat_periods WHERE user_id=p_user_id AND id<>v_existing.id
        AND period_start<=v_end AND period_end>=p_expected_management_from) THEN
     RAISE EXCEPTION 'Befintlig momsperiod är tvetydig eller överlappande.' USING ERRCODE='23514';
   END IF;
   RETURN jsonb_build_object('success',true,'already_exists',true,'period_id',v_existing.id,
      'period_start',v_existing.period_start,'period_end',v_existing.period_end,'status',v_existing.status);
 END IF;
 IF EXISTS(SELECT 1 FROM public.vat_periods WHERE user_id=p_user_id
      AND period_start<=v_end AND period_end>=p_expected_management_from) THEN
   RAISE EXCEPTION 'Första momsperioden överlappar befintlig historik. Ingen period ändrades.'
     USING ERRCODE='23514';
 END IF;
 INSERT INTO public.vat_periods(user_id,period_start,period_end,period_type,status,source)
 VALUES(p_user_id,p_expected_management_from,v_end,'year','open','sololedger') RETURNING id INTO v_id;
 RETURN jsonb_build_object('success',true,'already_exists',false,'period_id',v_id,
   'period_start',p_expected_management_from,'period_end',v_end,'status','open');
END;
$function$;
REVOKE ALL ON FUNCTION public.initialize_first_vat_year_period(uuid,date,date,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.initialize_first_vat_year_period(uuid,date,date,boolean) TO service_role;
COMMENT ON FUNCTION public.initialize_first_vat_year_period(uuid,date,date,boolean) IS
'Explicit administrative first-registration initialization, calendar fiscal year only. Confirm registration evidence; never use for bookkeeping migration or change vat_management_from.';
