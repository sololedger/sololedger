-- Dedicated local PostgreSQL fixture adapter; never installed in public.
-- The session user must be postgres. Only fixture registration uses service role.
CREATE FUNCTION pg_temp.register_input(p jsonb, ps date DEFAULT NULL, pe date DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE u uuid:=auth.uid(); saved_role text:=current_setting('role'); saved_claim_role text:=current_setting('request.jwt.claim.role',true); id uuid;
BEGIN
 RESET ROLE;
 INSERT INTO public.profiles(id) VALUES(u) ON CONFLICT DO NOTHING;
 PERFORM set_config('request.jwt.claim.role','service_role',true);
 SET LOCAL ROLE service_role;
 id:=public.register_sie_import_input(u,p,
   coalesce(ps,make_date((CASE WHEN (p->>'fiscal_year') ~ '^\d{4}$' THEN (p->>'fiscal_year')::integer END),1,1)),
   coalesce(pe,make_date((CASE WHEN (p->>'fiscal_year') ~ '^\d{4}$' THEN (p->>'fiscal_year')::integer END),12,31)),repeat('a',64));
 RESET ROLE;
 PERFORM set_config('request.jwt.claim.role',coalesce(saved_claim_role,''),true);
 IF saved_role<>'none' THEN EXECUTE format('SET LOCAL ROLE %I',saved_role); END IF;
 RETURN id;
EXCEPTION WHEN OTHERS THEN
 RESET ROLE;
 PERFORM set_config('request.jwt.claim.role',coalesce(saved_claim_role,''),true);
 IF saved_role<>'none' THEN EXECUTE format('SET LOCAL ROLE %I',saved_role); END IF;
 RAISE;
END $$;
CREATE FUNCTION pg_temp.import_sie_payload(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE id uuid; r jsonb; saved_role text:=current_setting('role');
BEGIN
 IF auth.uid() IS NULL THEN RETURN public.import_sie_batch(jsonb_build_object('receipt_id',gen_random_uuid())); END IF;
 id:=pg_temp.register_input(p);
 SET LOCAL ROLE authenticated;
 r:=public.import_sie_batch(jsonb_build_object('receipt_id',id));
 RESET ROLE;
 IF saved_role<>'none' THEN EXECUTE format('SET LOCAL ROLE %I',saved_role); END IF;
 RETURN r;
EXCEPTION WHEN OTHERS THEN
 RESET ROLE;
 IF saved_role<>'none' THEN EXECUTE format('SET LOCAL ROLE %I',saved_role); END IF;
 RAISE;
END $$;
