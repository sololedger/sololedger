-- KAN-100: intentional archive conflicts are HTTP 409, never serialization retries.
-- Only the two business-conflict SQLSTATE values change. Signature, body logic,
-- SECURITY DEFINER, search_path, owner and existing EXECUTE grants are preserved.
-- New forward migration; requires separate hosted execution approval.
DO $preflight$
BEGIN
  IF md5(pg_get_functiondef('public.save_declaration_revision_atomic(uuid,uuid,jsonb,jsonb)'::regprocedure))
      IS DISTINCT FROM '209c593b90f851a1d6bbfc734ab0fc91' THEN
    RAISE EXCEPTION 'KAN100 archive definition changed; inspect before applying.';
  END IF;
END;
$preflight$;

CREATE OR REPLACE FUNCTION public.save_declaration_revision_atomic(p_user_id uuid, p_request_id uuid, p_request jsonb, p_candidate jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  y integer; mode text; previous uuid; source_id uuid; submitted_source uuid;
  latest public.declaration_revisions%ROWTYPE; receipt public.declaration_revisions%ROWTYPE;
  fresh jsonb; risk jsonb; result_id uuid; next_no integer;
BEGIN
  -- Same first lock domain as close/correction/import/delete. READ COMMITTED is
  -- enforced by this helper. Never acquire a source/profile lock before it.
  PERFORM public.lock_accounting_year_boundary(p_user_id,true);
  IF p_request_id IS NULL OR p_request IS NULL OR jsonb_typeof(p_request)<>'object'
    OR (p_request->>'schema_version') IS DISTINCT FROM '1' OR pg_column_size(p_request)>262144 THEN
    RAISE EXCEPTION 'Ogiltig arkivbegäran.' USING ERRCODE='22023'; END IF;
  SELECT * INTO receipt FROM public.declaration_revisions WHERE user_id=p_user_id AND request_id=p_request_id;
  IF FOUND THEN
    IF receipt.request_payload IS DISTINCT FROM p_request THEN
      RAISE EXCEPTION 'Begäransnyckeln har redan använts för andra uppgifter.' USING ERRCODE='23505'; END IF;
    RETURN jsonb_build_object('status','replayed','id',receipt.id,'revision_no',receipt.revision_no,'source_snapshot_id',receipt.source_snapshot_id);
  END IF;
  -- Profile writes do not all use the accounting gate. Lock this row before
  -- fresh source read so its company metadata cannot change through commit.
  PERFORM 1 FROM public.profiles WHERE id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Användaren finns inte.' USING ERRCODE='P0002'; END IF;
  y:=(p_request->>'income_year')::integer; mode:=p_request#>>'{source,mode}';
  previous:=(p_request->>'expected_previous_id')::uuid;
  IF y IS NULL OR y NOT BETWEEN 1900 AND 9998 OR mode IS NULL OR mode NOT IN ('capture','reuse','none')
    OR jsonb_typeof(p_request->'manual') IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_request->'submission') IS DISTINCT FROM 'object'
    OR (p_request#>>'{submission,status}') IS NULL OR (p_request#>>'{submission,status}') NOT IN ('not_recorded','submitted_by_user') THEN
    RAISE EXCEPTION 'Ogiltigt arkivinnehåll.' USING ERRCODE='22023'; END IF;
  SELECT * INTO latest FROM public.declaration_revisions WHERE user_id=p_user_id AND income_year=y ORDER BY revision_no DESC LIMIT 1;
  IF previous IS DISTINCT FROM latest.id THEN RAISE EXCEPTION 'Arkivet har en senare version.' USING ERRCODE='PT409'; END IF;
  next_no:=coalesce(latest.revision_no,0)+1;
  IF (next_no=1) IS DISTINCT FROM (p_request->>'change_kind'='initial')
    OR (next_no>1 AND coalesce(length(btrim(p_request->>'reason')),0)=0) THEN
    RAISE EXCEPTION 'Ändringsorsak/version saknas.' USING ERRCODE='22023'; END IF;
  IF p_request->>'change_kind'='documentation_correction' AND
    (mode='capture' OR (p_request#>>'{source,snapshot_id}')::uuid IS DISTINCT FROM latest.source_snapshot_id) THEN
    RAISE EXCEPTION 'Dokumentationsrättelse ska behålla det frysta underlaget.' USING ERRCODE='23514'; END IF;
  IF p_request->>'change_kind'='new_calculation' AND (mode<>'capture'
    OR p_request->'manual' IS DISTINCT FROM latest.manual_payload
    OR p_request->'submission' IS DISTINCT FROM latest.submission_payload) THEN
    RAISE EXCEPTION 'Nytt beräkningsunderlag ska bevara tidigare användaruppgifter och deklarationskälla.' USING ERRCODE='23514'; END IF;
  IF p_request->>'change_kind'='declaration_amendment' AND
    ((p_request#>>'{submission,status}') IS DISTINCT FROM 'submitted_by_user'
      OR (p_request#>>'{submission,kind}') IS DISTINCT FROM 'amendment') THEN
    RAISE EXCEPTION 'Deklarationsrättelse kräver en dokumenterad ändringsinlämning.' USING ERRCODE='23514'; END IF;
  IF mode='capture' THEN
    IF p_request#>>'{source,snapshot_id}' IS NOT NULL THEN RAISE EXCEPTION 'Ogiltig källkoppling.' USING ERRCODE='22023'; END IF;
    -- Probe allows replay before any current-source read; it writes nothing.
    IF p_candidate IS NULL THEN RETURN jsonb_build_object('status','needs_source'); END IF;
    IF jsonb_typeof(p_candidate)<>'object' OR pg_column_size(p_candidate)>40000000
      OR jsonb_typeof(p_candidate->'source') IS DISTINCT FROM 'object'
      OR jsonb_typeof(p_candidate->'computed') IS DISTINCT FROM 'object'
      OR jsonb_typeof(p_candidate->'risk') IS DISTINCT FROM 'object'
      OR (p_candidate->>'source_fingerprint') IS DISTINCT FROM (p_request#>>'{source,expected_fingerprint}')
      OR coalesce(length(p_candidate->>'calculation_version'),0)=0 THEN
      RAISE EXCEPTION 'Ogiltigt serverunderlag.' USING ERRCODE='22023'; END IF;
    -- A new SQL command after all waits gets a fresh MVCC snapshot. Private
    -- owner reader has identical body to step 2, never a JWT rewrite.
    fresh:=public.kan100_ne_source_for_owner(p_user_id,y);
    IF fresh-'captured_at' IS DISTINCT FROM (p_candidate->'source')-'captured_at' THEN
      RAISE EXCEPTION 'Bokföringsunderlaget har ändrats.' USING ERRCODE='PT409'; END IF;
    IF jsonb_typeof(fresh->'year_lock') IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Ett fryst bokföringsunderlag kräver låst år.' USING ERRCODE='23514'; END IF;
    risk:=p_candidate->'risk';
    IF risk->>'verification' IS DISTINCT FROM 'not_verified'
      OR risk->>'assessment' IS NULL OR risk->>'assessment' NOT IN ('limited','not_assessed')
      OR risk->>'version' IS DISTINCT FROM '1' OR jsonb_typeof(risk->'reasons') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Ogiltig riskmärkning.' USING ERRCODE='23514'; END IF;
    IF jsonb_array_length(risk->'reasons')>0 THEN risk:=jsonb_set(risk,'{assessment}','"limited"'); END IF;
    -- Independent fail-closed DB backstop. No dependence on today's NE warnings.
    IF jsonb_array_length(fresh->'imports')>0 OR EXISTS (SELECT 1 FROM jsonb_array_elements(fresh->'transactions') t
      WHERE t->>'source' IS NULL OR t->>'source' NOT IN ('manual','vat_closing','vat_v2','vat_settlement','tax_account_movement','customer_invoice','fixed_asset','fixed_asset_reclassification','fixed_asset_depreciation','supplier_invoice')
        OR t->>'import_batch_id' IS NOT NULL OR t->>'source_ver_series' IS NOT NULL OR t->>'source_ver_number' IS NOT NULL) THEN
      risk:=risk || jsonb_build_object('assessment','limited','db_import_or_unknown_source',true,
        'affected_sections',jsonb_build_array('NE','result','balance'),
        'reasons',CASE WHEN (risk->'reasons') ? 'db_import_or_unknown_source' THEN risk->'reasons'
          ELSE (risk->'reasons') || '["db_import_or_unknown_source"]'::jsonb END);
    END IF;
    INSERT INTO public.declaration_source_snapshots(user_id,income_year,schema_version,calculation_version,app_revision,source_fingerprint,source_payload,computed_payload,risk_payload)
      VALUES(p_user_id,y,1,p_candidate->>'calculation_version',p_candidate->>'app_revision',p_candidate->>'source_fingerprint',fresh,p_candidate->'computed',risk) RETURNING id INTO source_id;
  ELSIF mode='reuse' THEN
    source_id:=(p_request#>>'{source,snapshot_id}')::uuid;
    IF source_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.declaration_source_snapshots WHERE user_id=p_user_id AND income_year=y AND id=source_id) THEN
      RAISE EXCEPTION 'Underlaget hör inte till detta arkiv.' USING ERRCODE='23503'; END IF;
  ELSE
    IF p_request#>>'{source,snapshot_id}' IS NOT NULL THEN RAISE EXCEPTION 'Ogiltig källkoppling.' USING ERRCODE='22023'; END IF;
  END IF;
  IF p_request#>>'{submission,source_snapshot_id}'='current' THEN submitted_source:=source_id;
  ELSE submitted_source:=(p_request#>>'{submission,source_snapshot_id}')::uuid; END IF;
  IF p_request#>>'{submission,source_snapshot_id}'='current' AND submitted_source IS NULL THEN
    RAISE EXCEPTION 'Deklarationens underlag saknas.' USING ERRCODE='23514'; END IF;
  INSERT INTO public.declaration_revisions(user_id,income_year,revision_no,previous_revision_id,source_snapshot_id,submission_source_snapshot_id,
    recorded_by,schema_version,change_kind,reason,manual_payload,submission_payload,request_id,request_payload)
    VALUES(p_user_id,y,next_no,previous,source_id,submitted_source,p_user_id,1,p_request->>'change_kind',p_request->>'reason',p_request->'manual',
      jsonb_set(p_request->'submission','{source_snapshot_id}',coalesce(to_jsonb(submitted_source),'null'::jsonb)),p_request_id,p_request) RETURNING id INTO result_id;
  RETURN jsonb_build_object('status','saved','id',result_id,'revision_no',next_no,'source_snapshot_id',source_id);
END;$function$;
