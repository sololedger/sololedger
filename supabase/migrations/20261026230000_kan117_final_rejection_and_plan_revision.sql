-- KAN-117 P1: final business rejection, no PostgREST 14 serialization retry.
-- No table, grant, accounting calculation or existing period data changes.
DO $preimage$
BEGIN
  IF md5(replace(pg_get_functiondef('public.kan117_vat_period_plan(integer)'::regprocedure),chr(13),'')) IS DISTINCT FROM '60669a03d903e7f7067d11bf1e34f458' THEN
    RAISE EXCEPTION 'KAN-117 P1: unexpected kan117_vat_period_plan definition; inspect before applying.';
  END IF;
  IF md5(replace(pg_get_functiondef('public.create_missing_vat_periods(integer,text)'::regprocedure),chr(13),'')) IS DISTINCT FROM '12c2da804201efe864daa1de71efb092' THEN
    RAISE EXCEPTION 'KAN-117 P1: unexpected create_missing_vat_periods definition; inspect before applying.';
  END IF;
END;
$preimage$;

CREATE OR REPLACE FUNCTION public.kan117_vat_period_plan(p_year integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  p public.profiles%ROWTYPE;
  v_profile_json jsonb;
  v_profile_revision text;
  v_today date := (clock_timestamp() AT TIME ZONE 'Europe/Stockholm')::date;
  v_start date;
  v_end date;
  v_step interval;
  v_period public.vat_periods%ROWTYPE;
  v_expected jsonb := '[]';
  v_missing jsonb := '[]';
  v_rows jsonb;
  v_first_periods jsonb;
  v_locked boolean;
  v_state text := 'complete';
  v_message text := '';
  v_basis text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Du måste vara inloggad.' USING ERRCODE='28000'; END IF;
  IF p_year IS NULL OR p_year < 1900 OR p_year > 9998 THEN
    RAISE EXCEPTION 'Ogiltigt år för momsperioder.' USING ERRCODE='22023';
  END IF;
  -- Read values and row version in one snapshot; committed A->B->A is not the same preview.
  SELECT to_jsonb(pr),pr.xmin::text INTO v_profile_json,v_profile_revision
    FROM public.profiles pr WHERE id=v_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'Företagsprofilen saknas.' USING ERRCODE='23514'; END IF;
  p:=jsonb_populate_record(NULL::public.profiles,v_profile_json);
  SELECT coalesce(jsonb_agg(to_jsonb(vp)||jsonb_build_object('row_revision',vp.xmin::text) ORDER BY vp.period_start,vp.id),'[]') INTO v_rows
    FROM public.vat_periods vp WHERE vp.user_id=v_user
      AND vp.period_start<=make_date(p_year,12,31) AND vp.period_end>=make_date(p_year,1,1);
  -- Internal partial periods are previously fixed first-period evidence, regardless of selected year.
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',vp.id,'start',vp.period_start,
    'end',vp.period_end,'type',vp.period_type,'source',vp.source,'row_revision',vp.xmin::text) ORDER BY vp.period_start,vp.id),'[]')
    INTO v_first_periods FROM public.vat_periods vp
    WHERE vp.user_id=v_user AND vp.source='sololedger'
      AND vp.period_start<>date_trunc(vp.period_type,vp.period_start)::date;
  SELECT EXISTS(SELECT 1 FROM public.closed_years WHERE user_id=v_user AND year=p_year) INTO v_locked;
  v_basis := md5(jsonb_build_object('version',1,'owner',v_user,'year',p_year,'today',v_today,
    'status',p.vat_status,'type',p.vat_period_type,'from',p.vat_management_from,
    'profile_revision',v_profile_revision,'periods',v_rows,'first_periods',v_first_periods,'locked',v_locked)::text);
  IF p.vat_status='not_registered' AND p.vat_period_type IS NULL AND p.vat_management_from IS NULL THEN
    v_state:='not_applicable'; v_message:='Företaget är inte momsregistrerat. Inga nya momsperioder skapas.';
  ELSIF p.vat_status IS DISTINCT FROM 'registered' OR p.vat_period_type IS NULL
    OR p.vat_period_type NOT IN ('month','quarter','year') OR p.vat_management_from IS NULL THEN
    v_state:='blocked'; v_message:='Kontrollera momsregistrering, redovisningsperiod och startdatum i Profil. SoloLedger gissar inte.';
  ELSIF EXISTS(SELECT 1 FROM jsonb_array_elements(v_first_periods) e
    WHERE (e->>'start')::date IS DISTINCT FROM p.vat_management_from
      OR e->>'type' IS DISTINCT FROM p.vat_period_type
      OR (e->>'end')::date IS DISTINCT FROM
        (date_trunc(e->>'type',(e->>'start')::date)
          + CASE e->>'type' WHEN 'month' THEN interval '1 month'
            WHEN 'quarter' THEN interval '3 months' ELSE interval '1 year' END
          - interval '1 day')::date) THEN
    v_state:='blocked'; v_message:='Momsprofilen motsäger en redan fastställd första delperiod, även om den ligger i ett annat år. Kontrollera Profil och registreringsunderlaget; inga perioder skapas.';
  ELSIF p_year>extract(year FROM v_today)::integer THEN
    v_state:='not_applicable'; v_message:='Momsperioder för framtida år skapas inte ännu.';
  ELSIF p.vat_management_from>least(make_date(p_year,12,31),v_today) THEN
    v_state:='not_applicable'; v_message:='Momshanteringen har inte börjat för det valda året. Kontrollera startdatum i Profil om det inte stämmer.';
  ELSE
    v_start:=greatest(make_date(p_year,1,1),p.vat_management_from);
    v_step:=CASE p.vat_period_type WHEN 'month' THEN interval '1 month' WHEN 'quarter' THEN interval '3 months' ELSE interval '1 year' END;
    WHILE v_start<=least(make_date(p_year,12,31),v_today) LOOP
      v_end:=(date_trunc(p.vat_period_type,v_start)+v_step-interval '1 day')::date;
      v_expected:=v_expected||jsonb_build_array(jsonb_build_object('start',v_start,'end',v_end,'type',p.vat_period_type));
      SELECT * INTO v_period FROM public.vat_periods
        WHERE user_id=v_user AND period_start=v_start AND period_end=v_end;
      IF FOUND THEN
        IF v_period.period_type<>p.vat_period_type OR v_period.source<>'sololedger' THEN
          v_state:='blocked'; v_message:='Befintlig periodtyp eller importerad historik behöver granskas mot Profil. Inga perioder ändras.';
        END IF;
      ELSE
        v_missing:=v_missing||jsonb_build_array(jsonb_build_object('start',v_start,'end',v_end,'type',p.vat_period_type));
        IF v_start<>date_trunc(p.vat_period_type,v_start)::date THEN
          v_state:='blocked'; v_message:='Första delperioden behöver styrkas mot registreringsunderlaget. Kontrollera Profil; SoloLedger skapar ingen gissad delperiod.';
        ELSIF v_locked THEN
          v_state:='blocked'; v_message:='En momsperiod saknas i ett låst år. Historiken behöver utredas; inga nya perioder kan skapas här.';
        END IF;
      END IF;
      IF (SELECT count(*) FROM public.vat_periods WHERE user_id=v_user AND period_start<=v_end AND period_end>=v_start)
        > (CASE WHEN v_period.id IS NULL THEN 0 ELSE 1 END) THEN
        v_state:='blocked'; v_message:='Befintliga momsperioder överlappar eller motsäger Profil. Utred datumen innan något skapas.';
      END IF;
      v_start:=v_end+1;
    END LOOP;
    -- Also detect profile changes which place earlier managed periods outside the plan.
    IF EXISTS(SELECT 1 FROM public.vat_periods vp WHERE vp.user_id=v_user AND vp.source='sololedger'
      AND vp.period_start<=make_date(p_year,12,31) AND vp.period_end>=make_date(p_year,1,1)
      AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_expected) e
        WHERE (e->>'start')::date=vp.period_start AND (e->>'end')::date=vp.period_end AND e->>'type'=vp.period_type)) THEN
      v_state:='blocked'; v_message:='Befintliga momsperioder stämmer inte med årets profilinställningar. Kontrollera Profil och historiken.';
    END IF;
    IF v_state='complete' AND jsonb_array_length(v_missing)>0 THEN v_state:='missing'; END IF;
  END IF;
  RETURN jsonb_build_object('version',1,'owner',v_user,'year',p_year,'today',v_today,
    'profile_revision',v_profile_revision,'state',v_state,'message',v_message,'expected',v_expected,'missing',v_missing,'basis',v_basis);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_missing_vat_periods(p_year integer, p_expected_basis text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_plan jsonb; v_item jsonb; v_count integer:=0;
BEGIN
  -- Exclusive owner gate: serializes with all supported accounting/period writers.
  -- Follow with profile lock, preventing a profile save between comparison and INSERT.
  PERFORM public.lock_accounting_year_boundary(auth.uid(),true);
  PERFORM 1 FROM public.profiles WHERE id=auth.uid() FOR UPDATE;
  v_plan:=public.kan117_vat_period_plan(p_year);
  IF p_expected_basis IS NULL OR p_expected_basis IS DISTINCT FROM v_plan->>'basis' THEN
    RAISE EXCEPTION 'Uppgifterna har ändrats. Granska momsperioderna på nytt och bekräfta den nya förhandsgranskningen.' USING ERRCODE='23514';
  END IF;
  IF v_plan->>'state' <> 'missing' THEN
    RAISE EXCEPTION 'Inga perioder kan skapas från denna förhandsgranskning. Läs in aktuell periodstatus igen.' USING ERRCODE='23514';
  END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_plan->'missing') LOOP
    -- Defence in depth; table's unique key is preserved as well.
    IF EXISTS(SELECT 1 FROM public.vat_periods WHERE user_id=auth.uid()
      AND period_start<=(v_item->>'end')::date AND period_end>=(v_item->>'start')::date) THEN
      RAISE EXCEPTION 'Perioderna har ändrats eller överlappar. Granska på nytt.' USING ERRCODE='23514';
    END IF;
    INSERT INTO public.vat_periods(user_id,period_start,period_end,period_type,status,source)
      VALUES(auth.uid(),(v_item->>'start')::date,(v_item->>'end')::date,v_item->>'type','open','sololedger');
    v_count:=v_count+1;
  END LOOP;
  RETURN jsonb_build_object('success',true,'created_count',v_count,'year',p_year);
END;
$function$
;
