-- KAN-74: trusted, short-lived server parser inputs. No accounting writes here.
-- Prepared against approved 2026-10-14 schema snapshot. Fresh live comparison
-- and separate hosted approval remain mandatory. No source file is persisted.
CREATE TABLE public.sie_import_inputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_org_nr text,
  CONSTRAINT sie_import_inputs_profile_fk FOREIGN KEY(user_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  payload jsonb NOT NULL,
  raw_sha256 text NOT NULL CHECK (raw_sha256 ~ '^[0-9a-f]{64}$'),
  parser_version integer NOT NULL DEFAULT 1 CHECK (parser_version = 1),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  CHECK (period_start <= period_end AND extract(year FROM period_start) = extract(year FROM period_end)),
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '10 minutes')
);
ALTER TABLE public.sie_import_inputs OWNER TO postgres;
ALTER TABLE public.sie_import_inputs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sie_import_inputs FROM PUBLIC, anon, authenticated, service_role;
-- Server-only admin counts/residual verification; no direct service writes.
GRANT SELECT ON TABLE public.sie_import_inputs TO service_role;
CREATE POLICY sie_import_inputs_server_counts ON public.sie_import_inputs FOR SELECT TO service_role USING (true);
CREATE INDEX sie_import_inputs_user_id_idx ON public.sie_import_inputs(user_id);
CREATE INDEX sie_import_inputs_expiry_idx ON public.sie_import_inputs(expires_at, id);

CREATE OR REPLACE FUNCTION public.validate_sie_import_period(p_payload jsonb, p_start date, p_end date)
RETURNS void LANGUAGE plpgsql SET search_path TO 'public' AS $function$
DECLARE v jsonb; r jsonb; d date; row_count integer := 0; ib_sum numeric;
BEGIN
  IF p_start IS NULL OR p_end IS NULL OR NOT isfinite(p_start) OR NOT isfinite(p_end) OR p_start > p_end THEN
    RAISE EXCEPTION 'Ogiltig räkenskapsperiod.' USING ERRCODE='22023';
  END IF;
  IF extract(year FROM p_start) <> extract(year FROM p_end) THEN
    RAISE EXCEPTION 'Flerårig SIE-import stöds ännu inte. Ingen bokföring har importerats.' USING ERRCODE='P2074';
  END IF;
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_payload->'verifications') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_payload->'opening_balances') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_payload->'verifications')=0
    OR (p_payload->>'fiscal_year') IS NULL OR (p_payload->>'fiscal_year') !~ '^\d{4}$'
    OR (p_payload->>'fiscal_year')::integer <> extract(year FROM p_start)::integer THEN
    RAISE EXCEPTION 'Ogiltigt verifierat importunderlag.' USING ERRCODE='22023';
  END IF;
  IF jsonb_array_length(p_payload->'opening_balances')>0 AND p_start <> date_trunc('year',p_start)::date THEN
    RAISE EXCEPTION 'Ingående balans kräver periodstart den 1 januari.' USING ERRCODE='22023';
  END IF;
  row_count := jsonb_array_length(p_payload->'opening_balances');
  SELECT coalesce(sum((x->>'amount')::numeric),0) INTO ib_sum FROM jsonb_array_elements(p_payload->'opening_balances') x;
  IF abs(ib_sum)>0.005 THEN row_count:=row_count+1; END IF;
  FOR v IN SELECT * FROM jsonb_array_elements(p_payload->'verifications') LOOP
    IF v->>'date' IS NULL OR (v->>'date') !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Ogiltigt bokföringsdatum.' USING ERRCODE='22023'; END IF;
    d:=(v->>'date')::date;
    IF d < p_start OR d > p_end THEN RAISE EXCEPTION 'Bokföringsdatum ligger utanför verifierad period.' USING ERRCODE='22023'; END IF;
    IF jsonb_typeof(v->'rows') IS DISTINCT FROM 'array' OR jsonb_array_length(v->'rows')=0 THEN RAISE EXCEPTION 'Bokföringsrader saknas.' USING ERRCODE='22023'; END IF;
    row_count:=row_count+jsonb_array_length(v->'rows');
    IF row_count>50000 THEN RAISE EXCEPTION 'Fler än 50 000 verifikationsrader.' USING ERRCODE='22023'; END IF;
    FOR r IN SELECT * FROM jsonb_array_elements(v->'rows') LOOP
      IF r->>'date' IS NOT NULL THEN
        IF (r->>'date') !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Ogiltigt raddatum.' USING ERRCODE='22023'; END IF;
        d:=(r->>'date')::date;
        IF d < p_start OR d > p_end THEN RAISE EXCEPTION 'Raddatum ligger utanför verifierad period.' USING ERRCODE='22023'; END IF;
      END IF;
    END LOOP;
  END LOOP;
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow OR invalid_text_representation OR invalid_parameter_value THEN
  RAISE EXCEPTION 'Ogiltigt verifierat importunderlag.' USING ERRCODE='22023';
END;
$function$;
ALTER FUNCTION public.validate_sie_import_period(jsonb,date,date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.validate_sie_import_period(jsonb,date,date) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.register_sie_import_input(p_user_id uuid, p_payload jsonb, p_period_start date, p_period_end date, p_raw_sha256 text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_id uuid; v_now timestamptz:=clock_timestamp(); v_org text; v_file_org text;
BEGIN
  -- Grants are the primary boundary; reject non-service JWTs defensively too.
  IF coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role') IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Otillåten registrering.' USING ERRCODE='42501'; END IF;
  IF p_user_id IS NULL OR p_raw_sha256 IS NULL OR p_raw_sha256 !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Ogiltigt underlag.' USING ERRCODE='22023'; END IF;
  PERFORM public.validate_sie_import_period(p_payload,p_period_start,p_period_end);
  SELECT nullif(regexp_replace(coalesce(org_nr,''),'[^0-9]','','g'),'') INTO v_org FROM public.profiles WHERE id=p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Företagsprofil saknas.' USING ERRCODE='P2075'; END IF;
  v_file_org:=nullif(regexp_replace(coalesce(p_payload->>'org_nr',''),'[^0-9]','','g'),'');
  IF v_org IS NOT NULL AND v_file_org IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'Underlaget hör inte till aktuellt företag.' USING ERRCODE='P2075'; END IF;
  -- Bounded lazy cleanup; never wait for a receipt being consumed.
  WITH expired AS (
    SELECT id FROM public.sie_import_inputs WHERE expires_at <= clock_timestamp()
    ORDER BY expires_at,id FOR UPDATE SKIP LOCKED LIMIT 100
  ) DELETE FROM public.sie_import_inputs i USING expired e WHERE i.id=e.id;
  INSERT INTO public.sie_import_inputs(user_id,company_org_nr,period_start,period_end,payload,raw_sha256,created_at,expires_at)
    VALUES(p_user_id,v_org,p_period_start,p_period_end,p_payload,p_raw_sha256,v_now,v_now+interval '10 minutes') RETURNING id INTO v_id;
  RETURN v_id;
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'SIE-underlaget kunde inte registreras säkert.' USING ERRCODE=SQLSTATE;
END;
$function$;
ALTER FUNCTION public.register_sie_import_input(uuid,jsonb,date,date,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.register_sie_import_input(uuid,jsonb,date,date,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.register_sie_import_input(uuid,jsonb,date,date,text) TO service_role;
