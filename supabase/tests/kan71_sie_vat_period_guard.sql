\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='5s';
DO $$ BEGIN
 IF current_database() NOT LIKE 'sololedger_kan71_%' OR inet_server_addr() NOT IN ('127.0.0.1'::inet,'::1'::inet)
 THEN RAISE EXCEPTION 'KAN-71 requires dedicated local database'; END IF;
 IF has_function_privilege('anon','public.undo_sie_import_atomic(uuid)','EXECUTE')
 OR has_function_privilege('anon','public.close_vat_period_atomic(uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'Anonymous RPC execution allowed'; END IF;
END $$;
CREATE TEMP TABLE evidence(scenario text, "userId" uuid, "startDate" date, "endDate" date, net numeric, review boolean, rows jsonb) ON COMMIT DROP;
CREATE FUNCTION pg_temp.auth(u uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
END $$;
CREATE FUNCTION pg_temp.fixture_import(u uuid,d date,reverse_vat boolean DEFAULT false,vat_date date DEFAULT NULL,net_only boolean DEFAULT false) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
 PERFORM pg_temp.auth(u);
 r:=public.import_sie_batch(jsonb_build_object(
  'filename','KAN71-synthetic.se','file_hash',gen_random_uuid()::text,'fiscal_year',extract(year FROM d)::int,
  'opening_balances','[]'::jsonb,'previous_year_result_balances','[]'::jsonb,
  'verifications',CASE WHEN net_only THEN jsonb_build_array(jsonb_build_object(
   'series','A','ver_number',1,'date',d,'description','Synthetic no VAT',
   'rows',jsonb_build_array(jsonb_build_object('account_number','1930','amount',1000),jsonb_build_object('account_number','3010','amount',-1000))))
  WHEN reverse_vat THEN jsonb_build_array(jsonb_build_object(
   'series','A','ver_number',1,'date',d,'description','Synthetic ambiguous VAT',
   'rows',jsonb_build_array(jsonb_build_object('account_number','1930','amount',-1000),jsonb_build_object('account_number','4535','amount',1000),
    jsonb_build_object('account_number','2614','amount',-250,'date',coalesce(vat_date,d)),jsonb_build_object('account_number','2645','amount',250,'date',coalesce(vat_date,d)))))
  ELSE jsonb_build_array(
   jsonb_build_object('series','A','ver_number',1,'date',d,'description','Synthetic sale',
    'rows',jsonb_build_array(jsonb_build_object('account_number','1930','amount',3750),jsonb_build_object('account_number','3010','amount',-3000),
     jsonb_build_object('account_number','2611','amount',-750,'date',coalesce(vat_date,d)))),
   jsonb_build_object('series','A','ver_number',2,'date',d,'description','Synthetic purchase',
    'rows',jsonb_build_array(jsonb_build_object('account_number','1930','amount',-2500),jsonb_build_object('account_number','5410','amount',2000),
     jsonb_build_object('account_number','2641','amount',500,'date',coalesce(vat_date,d))))) END));
 RETURN (r->>'import_batch_id')::uuid;
END $$;
CREATE FUNCTION pg_temp.capture(s text,u uuid,ps date,pe date,n numeric,review_required boolean) RETURNS void LANGUAGE sql AS $$
 INSERT INTO evidence VALUES(s,u,ps,pe,n,review_required,jsonb_build_object(
 'transactions',coalesce((SELECT jsonb_agg(to_jsonb(t)||jsonb_build_object('import_batch_status',b.status)) FROM transactions t LEFT JOIN import_batches b ON b.id=t.import_batch_id WHERE t.user_id=u),'[]'::jsonb),
 'journalRows',coalesce((SELECT jsonb_agg(to_jsonb(j)) FROM journal_entries j WHERE j.user_id=u),'[]'::jsonb),
 'vatPeriods',coalesce((SELECT jsonb_agg(to_jsonb(v)) FROM vat_periods v WHERE v.user_id=u),'[]'::jsonb),
 'vatV2Snapshots','[]'::jsonb));
$$;
CREATE FUNCTION pg_temp.state(u uuid) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object(
 'tx',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM transactions t WHERE user_id=u),
 'journal',(SELECT jsonb_agg(to_jsonb(j) ORDER BY id) FROM journal_entries j WHERE user_id=u),
 'batches',(SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM import_batches b WHERE user_id=u),
 'periods',(SELECT jsonb_agg(to_jsonb(v) ORDER BY id) FROM vat_periods v WHERE user_id=u),
 'sequence',(SELECT jsonb_agg(to_jsonb(v)) FROM ver_nr_sequences v WHERE user_id=u));
$$;
DO $$
DECLARE s text; u uuid; b uuid; p uuid; d date; start_d date; end_d date; extra uuid; r jsonb;
 before_state jsonb; original_rows jsonb; after_rows jsonb; failed boolean; message text; sqlstate_text text; legacy_tx uuid; ver integer; t record;
BEGIN
 FOREACH s IN ARRAY ARRAY['before_close','zero_after_undo','after_close','after_declared','cross_period','year_cross','row_year_cross','missing_period','overlap','imported_history','ambiguous_reverse','non_vat','locked_year','legacy_closed','legacy_open'] LOOP
  u:=gen_random_uuid(); INSERT INTO auth.users(id) VALUES(u);
  d:=CASE WHEN s IN ('cross_period','legacy_closed','legacy_open') THEN make_date(extract(year FROM current_date)::int,1,15)
          WHEN s IN ('year_cross','non_vat') THEN make_date(extract(year FROM current_date)::int-1,5,15)
          ELSE current_date END;
  b:=pg_temp.fixture_import(u,d,s='ambiguous_reverse',CASE WHEN s='row_year_cross' THEN make_date(extract(year FROM current_date)::int-1,5,15) ELSE NULL END,s='non_vat');
  start_d:=date_trunc('month',d)::date;
  end_d:=CASE WHEN d=current_date THEN current_date ELSE (date_trunc('month',d)+interval '1 month - 1 day')::date END;
  IF s<>'missing_period' THEN
   INSERT INTO vat_periods(user_id,period_start,period_end,period_type,source)
    VALUES(u,start_d,end_d,'month',CASE WHEN s='imported_history' THEN 'imported_history' ELSE 'sololedger' END) RETURNING id INTO p;
   IF d<date_trunc('month',current_date)::date THEN
    INSERT INTO vat_periods(user_id,period_start,period_end,period_type) VALUES(u,date_trunc('month',current_date)::date,current_date,'month');
   END IF;
  END IF;
  IF s='overlap' THEN
   INSERT INTO vat_periods(user_id,period_start,period_end,period_type) VALUES(u,start_d-1,end_d,'quarter');
  END IF;
  IF s='locked_year' THEN INSERT INTO closed_years(user_id,year) VALUES(u,extract(year FROM current_date)::int); END IF;
  IF s IN ('after_close','after_declared','legacy_closed') THEN
   r:=public.close_vat_period_atomic(p);
   IF (r->>'closing_amount')::numeric<>250 THEN RAISE EXCEPTION 'Initial close mismatch'; END IF;
   IF s IN ('after_declared','legacy_closed') THEN PERFORM public.declare_vat_period_atomic(p,current_date); END IF;
  END IF;
  IF s IN ('legacy_closed','legacy_open') THEN
   -- Deliberately construct already-existing history only in this rollback
   -- fixture. The production migration performs no data repair/backfill.
   FOR t IN SELECT tx.*,min(j.ver_nr) AS original_ver FROM transactions tx JOIN journal_entries j ON j.transaction_id=tx.id WHERE tx.import_batch_id=b GROUP BY tx.id LOOP
    SELECT get_next_ver_nr(u) INTO ver;
    INSERT INTO transactions(user_id,date,description,amount,booked,source,import_batch_id,is_correction,corrects_ver_nr)
     VALUES(u,current_date,'Synthetic legacy undo',t.amount,true,'sie_import_undo',b,true,t.original_ver) RETURNING id INTO legacy_tx;
    INSERT INTO journal_entries(transaction_id,user_id,ver_nr,date,account_number,debit,credit,description)
     SELECT legacy_tx,u,ver,current_date,account_number,credit,debit,'Synthetic legacy mirror' FROM journal_entries WHERE transaction_id=t.id;
   END LOOP;
   UPDATE import_batches SET status='undone',undone_at=now() WHERE id=b;
   before_state:=pg_temp.state(u);
   IF s='legacy_closed' THEN
    BEGIN PERFORM public.close_vat_period_atomic(p); EXCEPTION WHEN check_violation THEN NULL; END;
    IF before_state IS DISTINCT FROM pg_temp.state(u) THEN RAISE EXCEPTION 'Historical declared close changed'; END IF;
    PERFORM pg_temp.capture(s,u,start_d,end_d,250,true);
    PERFORM pg_temp.capture(s||'_correction',u,date_trunc('month',current_date)::date,current_date,-250,true);
   ELSE
    failed:=false;
    BEGIN PERFORM public.close_vat_period_atomic(p); EXCEPTION WHEN check_violation THEN failed:=true; END;
    IF NOT failed OR before_state IS DISTINCT FROM pg_temp.state(u) THEN RAISE EXCEPTION 'Unsafe legacy closing not blocked atomically'; END IF;
    PERFORM pg_temp.capture(s,u,start_d,end_d,250,true);
   END IF;
   CONTINUE;
  END IF;
  before_state:=pg_temp.state(u);
  SELECT jsonb_agg(to_jsonb(j) ORDER BY j.id) INTO original_rows FROM journal_entries j JOIN transactions tx ON tx.id=j.transaction_id WHERE tx.import_batch_id=b;
  failed:=false;
  BEGIN r:=public.undo_sie_import_atomic(b);
  EXCEPTION WHEN check_violation THEN failed:=true; GET STACKED DIAGNOSTICS message=MESSAGE_TEXT; END;
  IF s IN ('before_close','zero_after_undo','non_vat') THEN
   IF failed THEN RAISE EXCEPTION 'Allowed undo failed: %',message; END IF;
   SELECT jsonb_agg(to_jsonb(j) ORDER BY j.id) INTO after_rows FROM journal_entries j JOIN transactions tx ON tx.id=j.transaction_id WHERE tx.import_batch_id=b AND tx.source='sie_import';
   IF original_rows IS DISTINCT FROM after_rows THEN RAISE EXCEPTION 'Original rows changed'; END IF;
   IF EXISTS(SELECT 1 FROM journal_entries WHERE user_id=u GROUP BY transaction_id HAVING sum(debit-credit)<>0) THEN RAISE EXCEPTION 'Unbalanced verification'; END IF;
   IF s='before_close' THEN
    -- Independent ordinary SIE import still contributes 250; close must
    -- reconcile to it after the first batch cancels within this period.
    extra:=pg_temp.fixture_import(u,current_date);
    r:=public.close_vat_period_atomic(p);
    IF (r->>'closing_amount')::numeric<>250 THEN RAISE EXCEPTION 'Post-undo close mismatch'; END IF;
    PERFORM pg_temp.capture(s,u,start_d,end_d,250,false);
   ELSE
    IF s='zero_after_undo' THEN
     before_state:=pg_temp.state(u); failed:=false;
     BEGIN PERFORM public.close_vat_period_atomic(p); EXCEPTION WHEN check_violation THEN failed:=true; END;
     IF NOT failed OR before_state IS DISTINCT FROM pg_temp.state(u) THEN RAISE EXCEPTION 'Existing all-zero VAT activity manual-review guard changed'; END IF;
    END IF;
    PERFORM pg_temp.capture(s,u,start_d,end_d,0,false);
   END IF;
   before_state:=pg_temp.state(u);
   failed:=false; BEGIN PERFORM public.undo_sie_import_atomic(b); EXCEPTION WHEN check_violation THEN failed:=true; END;
   IF NOT failed OR before_state IS DISTINCT FROM pg_temp.state(u) THEN RAISE EXCEPTION 'Duplicate undo not atomic'; END IF;
  ELSE
   IF NOT failed OR before_state IS DISTINCT FROM pg_temp.state(u) THEN RAISE EXCEPTION 'Unsafe undo % not blocked atomically',s; END IF;
   IF message NOT LIKE '%separat hantering%' THEN RAISE EXCEPTION 'Unclear error message: %',message; END IF;
   IF s NOT IN ('row_year_cross','ambiguous_reverse','locked_year') THEN PERFORM pg_temp.capture(s,u,start_d,end_d,250,false); END IF;
  END IF;
 END LOOP;
 -- Auth and tenant boundaries remain enforced by the SECURITY DEFINER RPC.
 failed:=false; PERFORM pg_temp.auth(gen_random_uuid());
 BEGIN PERFORM public.undo_sie_import_atomic(b); EXCEPTION WHEN insufficient_privilege THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Foreign batch not rejected'; END IF;
 failed:=false; PERFORM set_config('request.jwt.claim.sub','',true); PERFORM set_config('request.jwt.claims','{}',true);
 BEGIN PERFORM public.undo_sie_import_atomic(b); EXCEPTION WHEN invalid_authorization_specification THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Unauthenticated undo not rejected'; END IF;
END $$;
SELECT coalesce(jsonb_agg(to_jsonb(evidence)),'[]'::jsonb) FROM evidence;
ROLLBACK;
SELECT 'FIXTURES_ROLLED_BACK';
