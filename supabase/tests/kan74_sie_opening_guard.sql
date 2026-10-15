\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='5s';
DO $$ BEGIN
 IF current_database() NOT LIKE 'sololedger_kan74_%' OR inet_server_addr() NOT IN ('127.0.0.1'::inet,'::1'::inet)
 THEN RAISE EXCEPTION 'KAN-74 requires a dedicated local database'; END IF;
 IF has_function_privilege('anon','public.import_sie_batch(jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Anonymous import allowed'; END IF;
END $$;
\ir helpers/kan74_receipt_fixture.sql
-- nextval survives a rejected subtransaction: prove P2074 rejects before
-- even an attempted insert/update, rather than merely rolling it back.
CREATE TEMP SEQUENCE kan74_attempted_write;
CREATE FUNCTION pg_temp.record_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN PERFORM nextval('pg_temp.kan74_attempted_write'); RETURN NEW; END $$;
CREATE TRIGGER kan74_test_write BEFORE INSERT OR UPDATE ON public.import_batches FOR EACH ROW EXECUTE FUNCTION pg_temp.record_write();
CREATE TRIGGER kan74_test_write BEFORE INSERT OR UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION pg_temp.record_write();
CREATE TRIGGER kan74_test_write BEFORE INSERT OR UPDATE ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION pg_temp.record_write();
CREATE TRIGGER kan74_test_write BEFORE INSERT OR UPDATE ON public.ver_nr_sequences FOR EACH ROW EXECUTE FUNCTION pg_temp.record_write();
CREATE FUNCTION pg_temp.set_auth(u uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('request.jwt.claim.sub',u::text,true); END $$;
CREATE FUNCTION pg_temp.payload(y integer, has_ib boolean DEFAULT true, d date DEFAULT NULL, row_d date DEFAULT NULL) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('filename','KAN74-synthetic.se','file_hash',gen_random_uuid()::text,'fiscal_year',y,
 'company_name','KAN74 SYNTHETIC','org_nr','000000-0000',
 'opening_balances',CASE WHEN has_ib THEN '[{"account_number":"1930","amount":10000},{"account_number":"2010","amount":-10000}]'::jsonb ELSE '[]'::jsonb END,
 'previous_year_result_balances','[]'::jsonb,
 'verifications',jsonb_build_array(jsonb_build_object('series','A','ver_number',1,'date',coalesce(d,make_date(y,6,15)),'description','KAN74 synthetic deposit',
 'rows',jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('account_number','1930','amount',100,'date',row_d)),
 jsonb_strip_nulls(jsonb_build_object('account_number','2018','amount',-100,'date',row_d))))));
$$;
CREATE FUNCTION pg_temp.state(u uuid) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object(
 'tx',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM transactions t WHERE user_id=u),
 'journal',(SELECT jsonb_agg(to_jsonb(j) ORDER BY id) FROM journal_entries j WHERE user_id=u),
 'batches',(SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM import_batches b WHERE user_id=u),
 'sequence',(SELECT jsonb_agg(to_jsonb(n)) FROM ver_nr_sequences n WHERE user_id=u),
 'years',(SELECT jsonb_agg(to_jsonb(c) ORDER BY year) FROM closed_years c WHERE user_id=u),
 'vat',(SELECT jsonb_agg(to_jsonb(v) ORDER BY id) FROM vat_periods v WHERE user_id=u));
$$;
CREATE FUNCTION pg_temp.import(p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN EXECUTE 'SET LOCAL ROLE authenticated'; r:=pg_temp.import_sie_payload(p); EXECUTE 'RESET ROLE'; RETURN r;
EXCEPTION WHEN OTHERS THEN EXECUTE 'RESET ROLE'; RAISE;
END $$;
CREATE FUNCTION pg_temp.blocked(p jsonb, expected text DEFAULT 'P2074') RETURNS void LANGUAGE plpgsql AS $$
DECLARE before_state jsonb:=pg_temp.state(auth.uid()); code text; message text;
 writes_before bigint:=(SELECT last_value FROM pg_temp.kan74_attempted_write);
BEGIN
 BEGIN PERFORM pg_temp.import(p); EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS code=RETURNED_SQLSTATE,message=MESSAGE_TEXT; END;
 IF code IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Expected %, received %: %',expected,code,message; END IF;
 IF expected='P2074' AND writes_before IS DISTINCT FROM (SELECT last_value FROM pg_temp.kan74_attempted_write) THEN RAISE EXCEPTION 'Conflict guard attempted a write'; END IF;
 IF expected='P2074' AND message NOT LIKE '%Ingen bokföring har importerats.%' THEN RAISE EXCEPTION 'Missing understandable atomic denial'; END IF;
 IF before_state IS DISTINCT FROM pg_temp.state(auth.uid()) THEN RAISE EXCEPTION 'Blocked import changed data'; END IF;
END $$;
DO $$
DECLARE u uuid; other_u uuid; p jsonb; r jsonb; b uuid; s text; t uuid; ver integer; before_state jsonb;
BEGIN
 FOREACH s IN ARRAY ARRAY['first','forward','reverse','older_no_ib_first','older_no_ib_after','same_year','future_no_ib','no_ib_years','payload_old_tx','payload_old_row','new_ib_old_row','existing_old_row','manual_before','manual_after','legacy_forward','legacy_reverse','undone','tenant','closed_vat','locked_year','invalid','bridge'] LOOP
  u:=gen_random_uuid(); INSERT INTO auth.users(id) VALUES(u); PERFORM pg_temp.set_auth(u);
  IF s='first' THEN
   p:=pg_temp.payload(2024); r:=pg_temp.import(p);
   IF NOT (r->>'opening_balance_imported')::boolean THEN RAISE EXCEPTION 'First IB not imported'; END IF;
   IF (SELECT balance FROM get_cumulative_account_balances('2025-12-31') WHERE account_number='1930')<>10100 THEN RAISE EXCEPTION 'First import balance'; END IF;
   PERFORM pg_temp.blocked(p,'23505');
  ELSIF s IN ('forward','reverse','same_year','future_no_ib','older_no_ib_after','legacy_forward','legacy_reverse','tenant') THEN
   r:=pg_temp.import(pg_temp.payload(CASE WHEN s IN ('reverse','older_no_ib_after','legacy_reverse') THEN 2025 ELSE 2024 END));
   IF s IN ('legacy_forward','legacy_reverse') THEN UPDATE transactions SET source='sie_import',description='Öppningsbalans' WHERE user_id=u AND source='sie_opening_balance'; END IF;
   IF s='same_year' THEN PERFORM pg_temp.blocked(pg_temp.payload(2024),'P2001');
   ELSIF s='future_no_ib' THEN
    PERFORM pg_temp.blocked(pg_temp.payload(2025,false));
   ELSIF s='older_no_ib_after' THEN PERFORM pg_temp.blocked(pg_temp.payload(2024,false));
   ELSIF s='tenant' THEN
    other_u:=gen_random_uuid(); INSERT INTO auth.users(id) VALUES(other_u); before_state:=pg_temp.state(u); PERFORM pg_temp.set_auth(other_u);
    PERFORM pg_temp.import(pg_temp.payload(2025));
    IF before_state IS DISTINCT FROM pg_temp.state(u) THEN RAISE EXCEPTION 'Other tenant changed'; END IF;
   ELSE PERFORM pg_temp.blocked(pg_temp.payload(CASE WHEN s IN ('reverse','legacy_reverse') THEN 2024 ELSE 2025 END)); END IF;
  ELSIF s='older_no_ib_first' THEN PERFORM pg_temp.import(pg_temp.payload(2024,false)); PERFORM pg_temp.blocked(pg_temp.payload(2025));
  ELSIF s='no_ib_years' THEN PERFORM pg_temp.import(pg_temp.payload(2024,false)); PERFORM pg_temp.blocked(pg_temp.payload(2025,false));
  ELSIF s='payload_old_tx' THEN PERFORM pg_temp.blocked(pg_temp.payload(2025,true,'2024-12-31'),'22023');
  ELSIF s='payload_old_row' THEN PERFORM pg_temp.import(pg_temp.payload(2025)); PERFORM pg_temp.blocked(pg_temp.payload(2025,false,NULL,'2024-12-31'),'22023');
  ELSIF s='new_ib_old_row' THEN PERFORM pg_temp.blocked(pg_temp.payload(2025,true,NULL,'2024-12-31'),'22023');
  ELSIF s='existing_old_row' THEN PERFORM pg_temp.blocked(pg_temp.payload(2025,false,NULL,'2024-12-31'),'22023');
  ELSIF s IN ('manual_before','manual_after') THEN
   INSERT INTO transactions(user_id,date,description,amount,booked,source) VALUES(u,CASE WHEN s='manual_before' THEN '2024-12-31'::date ELSE '2025-02-01'::date END,'KAN74 existing manual',50,true,'manual') RETURNING id INTO t;
   ver:=get_next_ver_nr(u);
   INSERT INTO journal_entries(user_id,transaction_id,ver_nr,date,account_number,debit,credit)
    SELECT u,t,ver,CASE WHEN s='manual_before' THEN '2024-12-31'::date ELSE '2025-02-01'::date END,a,d,c FROM (VALUES('1930',50,0),('2018',0,50)) x(a,d,c);
   IF s='manual_before' THEN PERFORM pg_temp.blocked(pg_temp.payload(2025)); ELSE PERFORM pg_temp.import(pg_temp.payload(2025)); END IF;
  ELSIF s='undone' THEN
   r:=pg_temp.import(pg_temp.payload(extract(year FROM current_date)::integer-1)); b:=(r->>'import_batch_id')::uuid;
   EXECUTE 'SET LOCAL ROLE authenticated'; PERFORM undo_sie_import_atomic(b); EXECUTE 'RESET ROLE';
   IF (SELECT status FROM import_batches WHERE id=b)<>'undone' THEN RAISE EXCEPTION 'Undo failed'; END IF;
   IF (SELECT balance FROM get_cumulative_account_balances(current_date) WHERE account_number='1930')<>0 THEN RAISE EXCEPTION 'Undo not neutral'; END IF;
   PERFORM pg_temp.blocked(pg_temp.payload(extract(year FROM current_date)::integer));
   PERFORM pg_temp.blocked(pg_temp.payload(extract(year FROM current_date)::integer-2,false));
   PERFORM pg_temp.blocked(pg_temp.payload(extract(year FROM current_date)::integer-1),'P2001');
  ELSIF s='closed_vat' THEN
   p:=pg_temp.payload(2025,false); p:=jsonb_set(p,'{verifications,0,rows}','[{"account_number":"1930","amount":125},{"account_number":"3010","amount":-100},{"account_number":"2611","amount":-25}]');
   PERFORM pg_temp.import(p);
   INSERT INTO vat_periods(user_id,period_start,period_end,period_type) VALUES(u,'2025-06-01','2025-06-30','month') RETURNING id INTO b;
   PERFORM close_vat_period_atomic(b);
   PERFORM pg_temp.blocked(p,'23514');
  ELSIF s='locked_year' THEN INSERT INTO closed_years(user_id,year) VALUES(u,2025); PERFORM pg_temp.blocked(pg_temp.payload(2025),'23514');
  ELSIF s='invalid' THEN p:=pg_temp.payload(2025); p:=jsonb_set(p,'{verifications,0,rows,0,date}','"bad"'); PERFORM pg_temp.blocked(p,'22023');
  ELSIF s='bridge' THEN
   p:=pg_temp.payload(2025); p:=jsonb_set(p,'{opening_balances,1,amount}','-8000'); p:=jsonb_set(p,'{previous_year_result_balances}','[{"account_number":"3010","amount":-2000}]');
   PERFORM pg_temp.import(p);
   IF (SELECT balance FROM get_period_account_balances('2025-01-01','2025-12-31') WHERE account_number='2019')<>-2000 THEN RAISE EXCEPTION 'Result bridge changed'; END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM journal_entries WHERE user_id IN (u,other_u) GROUP BY transaction_id HAVING sum(debit-credit)<>0) THEN RAISE EXCEPTION 'Unbalanced journal'; END IF;
  RAISE NOTICE 'PASS KAN74 %',s;
 END LOOP;
END $$;
-- Independent review P1: an opening entered as ordinary #VER has no #IB.
DO $$
DECLARE u uuid:=gen_random_uuid(); p jsonb;
BEGIN
 INSERT INTO auth.users(id) VALUES(u); PERFORM pg_temp.set_auth(u);
 PERFORM pg_temp.import(pg_temp.payload(2024));
 IF (SELECT balance FROM get_cumulative_account_balances('2024-12-31') WHERE account_number='1930')<>10100 THEN RAISE EXCEPTION 'P1 starting balance'; END IF;
 p:=pg_temp.payload(2025,false,'2025-01-01');
 p:=jsonb_set(p,'{verifications,0,description}','"Öppningsbalans"');
 p:=jsonb_set(p,'{verifications,0,rows}','[{"account_number":"1930","amount":10100},{"account_number":"2010","amount":-10100}]');
 PERFORM pg_temp.blocked(p);
 IF (SELECT balance FROM get_cumulative_account_balances('2025-12-31') WHERE account_number='1930')<>10100 THEN RAISE EXCEPTION 'P1 bank changed'; END IF;
 RAISE NOTICE 'PASS KAN74_P1 opening_as_ver';
END $$;
-- Policy hardening: safe same-year continuation, metadata and legacy history.
DO $$
DECLARE u uuid; p jsonb; r jsonb; label text; account text; b uuid; s text; historical_tx uuid; historical_ver integer;
BEGIN
 FOREACH s IN ARRAY ARRAY['same_year_no_ib','inferred_year','spoofed_year','future_row','multiple_ver_years','null_historical_year','undone_no_ib','failed_history','legacy_without_batch','inconsistent_history','unauthenticated','spoofed_user','invalid_year','legacy_manual_marker','historical_journal_year','mixed_year_history'] LOOP
  u:=gen_random_uuid(); INSERT INTO auth.users(id) VALUES(u); PERFORM pg_temp.set_auth(u);
  IF s='unauthenticated' THEN
   PERFORM set_config('request.jwt.claim.sub','',true); PERFORM pg_temp.blocked(pg_temp.payload(2024),'28000');
  ELSIF s='invalid_year' THEN p:=jsonb_set(pg_temp.payload(2024,false),'{fiscal_year}','"unknown"'); PERFORM pg_temp.blocked(p,'22023');
  ELSIF s='spoofed_user' THEN
   PERFORM pg_temp.import(pg_temp.payload(2024));
   p:=pg_temp.payload(2025,false)||jsonb_build_object('user_id',gen_random_uuid(),'filename','safe-2024.se'); PERFORM pg_temp.blocked(p);
  ELSIF s='same_year_no_ib' THEN
   PERFORM pg_temp.import(pg_temp.payload(2024)); p:=pg_temp.payload(2024,false); PERFORM pg_temp.import(p); PERFORM pg_temp.blocked(p,'23505');
   IF (SELECT count(*) FROM import_batches WHERE user_id=u)<>2 THEN RAISE EXCEPTION 'Same-year continuation failed'; END IF;
  ELSIF s='inferred_year' THEN
   -- Full RAR is now mandatory; missing fiscal year has no fallback.
   PERFORM pg_temp.blocked(pg_temp.payload(2024,false)-'fiscal_year','22023');
  ELSIF s='spoofed_year' THEN p:=jsonb_set(pg_temp.payload(2025,false),'{fiscal_year}','2024'); PERFORM pg_temp.blocked(p,'22023');
  ELSIF s='future_row' THEN PERFORM pg_temp.blocked(pg_temp.payload(2024,false,NULL,'2025-01-01'),'22023');
  ELSIF s='multiple_ver_years' THEN
   p:=pg_temp.payload(2024,false); p:=jsonb_set(p,'{verifications}',(p->'verifications')||(pg_temp.payload(2025,false)->'verifications')); PERFORM pg_temp.blocked(p,'22023');
  ELSE
   r:=pg_temp.import(pg_temp.payload(2024,false)); b:=(r->>'import_batch_id')::uuid;
   IF s='historical_journal_year' THEN
    -- Existing synthetic history: batch and transaction say 2024, journal says 2025.
    UPDATE journal_entries SET date='2025-01-01' WHERE user_id=u AND account_number='1930';
    PERFORM pg_temp.blocked(pg_temp.payload(2024,false));
   ELSIF s='mixed_year_history' THEN
    -- Construct already-existing mixed history in this rollback fixture only.
    INSERT INTO import_batches(user_id,filename,file_hash,fiscal_year,status,verification_count)
     VALUES(u,'KAN74-existing-2025.se',gen_random_uuid()::text,2025,'completed',1) RETURNING id INTO b;
    INSERT INTO transactions(user_id,date,description,amount,booked,source,import_batch_id)
     VALUES(u,'2025-06-15','KAN74 existing synthetic import',100,true,'sie_import',b) RETURNING id INTO historical_tx;
    historical_ver:=get_next_ver_nr(u);
    INSERT INTO journal_entries(user_id,transaction_id,ver_nr,date,account_number,debit,credit)
     VALUES(u,historical_tx,historical_ver,'2025-06-15','1930',100,0),
       (u,historical_tx,historical_ver,'2025-06-15','2018',0,100);
    PERFORM pg_temp.blocked(pg_temp.payload(2024,false));
    PERFORM pg_temp.blocked(pg_temp.payload(2025,false));
    PERFORM pg_temp.blocked(pg_temp.payload(2026,false));
   ELSIF s='null_historical_year' THEN UPDATE import_batches SET fiscal_year=NULL WHERE id=b; PERFORM pg_temp.blocked(pg_temp.payload(2024,false));
   ELSIF s='undone_no_ib' THEN
    EXECUTE 'SET LOCAL ROLE authenticated'; PERFORM undo_sie_import_atomic(b); EXECUTE 'RESET ROLE';
    PERFORM pg_temp.blocked(pg_temp.payload(2025,false)); PERFORM pg_temp.import(pg_temp.payload(2024,false));
   ELSIF s='failed_history' THEN UPDATE import_batches SET status='failed' WHERE id=b; PERFORM pg_temp.blocked(pg_temp.payload(2025,false));
   ELSIF s='legacy_without_batch' THEN
    UPDATE transactions SET import_batch_id=NULL WHERE user_id=u; DELETE FROM import_batches WHERE id=b;
    PERFORM pg_temp.blocked(pg_temp.payload(2025,false));
   ELSIF s='legacy_manual_marker' THEN
    UPDATE transactions SET source='manual',import_batch_id=NULL WHERE user_id=u; DELETE FROM import_batches WHERE id=b;
    PERFORM pg_temp.blocked(pg_temp.payload(2025,false));
   ELSIF s='inconsistent_history' THEN UPDATE import_batches SET fiscal_year=2025 WHERE id=b; PERFORM pg_temp.blocked(pg_temp.payload(2025,false));
   END IF;
  END IF;
  RAISE NOTICE 'PASS KAN74_POLICY %',s;
 END LOOP;
 FOREACH label IN ARRAY ARRAY['Öppningsbalans','Ingående balans','Opening balances','Verifikation'] LOOP
  FOREACH account IN ARRAY ARRAY['2010','2018'] LOOP
   u:=gen_random_uuid(); INSERT INTO auth.users(id) VALUES(u); PERFORM pg_temp.set_auth(u); PERFORM pg_temp.import(pg_temp.payload(2024));
   p:=pg_temp.payload(2025,false,'2025-01-01');
   p:=jsonb_set(p,'{verifications,0,description}',to_jsonb(label));
   p:=jsonb_set(p,'{verifications,0,rows}',jsonb_build_array(jsonb_build_object('account_number','1930','amount',10100),jsonb_build_object('account_number',account,'amount',-10100)));
   PERFORM pg_temp.blocked(p);
   IF (SELECT balance FROM get_cumulative_account_balances('2025-12-31') WHERE account_number='1930')<>10100 THEN RAISE EXCEPTION 'Adversarial bank changed'; END IF;
   RAISE NOTICE 'PASS KAN74_VARIANT % %',label,account;
  END LOOP;
 END LOOP;
END $$;

CREATE FUNCTION pg_temp.consume(id uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r jsonb; BEGIN SET LOCAL ROLE authenticated; r:=public.import_sie_batch(jsonb_build_object('receipt_id',id)); RESET ROLE; RETURN r;
EXCEPTION WHEN OTHERS THEN RESET ROLE; RAISE; END $$;
CREATE FUNCTION pg_temp.blocked_direct(p jsonb, expected text, no_attempt boolean DEFAULT false) RETURNS void LANGUAGE plpgsql AS $$
DECLARE before_state jsonb:=pg_temp.state(auth.uid()); code text;
 writes_before bigint:=(SELECT last_value FROM pg_temp.kan74_attempted_write);
BEGIN
 BEGIN SET LOCAL ROLE authenticated; PERFORM public.import_sie_batch(p); RESET ROLE;
 EXCEPTION WHEN OTHERS THEN RESET ROLE; GET STACKED DIAGNOSTICS code=RETURNED_SQLSTATE; END;
 IF code IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Expected direct %, got %',expected,code; END IF;
 IF (expected IN ('P2074','P2075') OR no_attempt) AND writes_before IS DISTINCT FROM (SELECT last_value FROM pg_temp.kan74_attempted_write) THEN RAISE EXCEPTION 'Receipt/period guard attempted accounting write'; END IF;
 IF before_state IS DISTINCT FROM pg_temp.state(auth.uid()) THEN RAISE EXCEPTION 'Denied direct call changed accounting'; END IF;
END $$;
-- Real RPC permission boundary, source-period verification and receipt lifecycle.
DO $$
DECLARE u uuid; other_u uuid; p jsonb; v_receipt_id uuid; id2 uuid; r jsonb; before_state jsonb; code text; s text; count_before integer;
BEGIN
 IF has_table_privilege('authenticated','public.sie_import_inputs','SELECT,INSERT,UPDATE,DELETE')
  OR has_table_privilege('anon','public.sie_import_inputs','SELECT,INSERT,UPDATE,DELETE')
  OR has_function_privilege('authenticated','public.register_sie_import_input(uuid,jsonb,date,date,text)','EXECUTE')
  OR has_function_privilege('anon','public.register_sie_import_input(uuid,jsonb,date,date,text)','EXECUTE')
  OR NOT has_function_privilege('service_role','public.register_sie_import_input(uuid,jsonb,date,date,text)','EXECUTE')
  OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.sie_import_inputs'::regclass)
 THEN RAISE EXCEPTION 'Receipt grants/RLS incorrect'; END IF;
 FOREACH s IN ARRAY ARRAY['free_payload','extra_fields','missing_receipt','reused','wrong_user','expired','company','period','date_recheck','atomic','cleanup','ttl_cap','row_limit','client_permissions','registration_role','no_profile','profile_cascade','ib_period_start'] LOOP
  u:=gen_random_uuid(); INSERT INTO auth.users(id) VALUES(u); PERFORM pg_temp.set_auth(u); p:=pg_temp.payload(2024,false);
  IF s='free_payload' THEN PERFORM pg_temp.blocked_direct(p,'P2075');
  ELSIF s='missing_receipt' THEN PERFORM pg_temp.blocked_direct(jsonb_build_object('receipt_id',gen_random_uuid()),'P2075');
  ELSIF s='period' THEN
   code:=NULL; BEGIN PERFORM pg_temp.register_input(p,'2024-07-01','2025-12-31'); EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS code=RETURNED_SQLSTATE; END;
   IF code IS DISTINCT FROM 'P2074' THEN RAISE EXCEPTION 'Declared multi-year not denied'; END IF;
  ELSIF s='row_limit' THEN
   p:=jsonb_set(p,'{verifications,0,rows}',(SELECT jsonb_agg(jsonb_build_object('account_number','1930','amount',0)) FROM generate_series(1,50001)));
   code:=NULL; BEGIN PERFORM pg_temp.register_input(p); EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS code=RETURNED_SQLSTATE; END;
   IF code IS DISTINCT FROM '22023' THEN RAISE EXCEPTION 'DB row limit not denied'; END IF;
  ELSIF s='client_permissions' THEN
   EXECUTE 'SET LOCAL ROLE authenticated'; code:=NULL;
   BEGIN PERFORM public.register_sie_import_input(u,p,'2024-01-01','2024-12-31',repeat('a',64)); EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS code=RETURNED_SQLSTATE; END;
   EXECUTE 'RESET ROLE'; IF code IS DISTINCT FROM '42501' THEN RAISE EXCEPTION 'Client could register'; END IF;
   EXECUTE 'SET LOCAL ROLE authenticated'; code:=NULL;
   BEGIN PERFORM count(*) FROM public.sie_import_inputs; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS code=RETURNED_SQLSTATE; END;
   EXECUTE 'RESET ROLE'; IF code IS DISTINCT FROM '42501' THEN RAISE EXCEPTION 'Client could read receipt payloads'; END IF;
  ELSIF s='ib_period_start' THEN
   code:=NULL; BEGIN PERFORM pg_temp.register_input(pg_temp.payload(2024),'2024-07-01','2024-12-31'); EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS code=RETURNED_SQLSTATE; END;
   IF code IS DISTINCT FROM '22023' THEN RAISE EXCEPTION 'Non-January IB accepted'; END IF;
  ELSIF s='no_profile' THEN
   SET LOCAL ROLE service_role; PERFORM set_config('request.jwt.claim.role','service_role',true); code:=NULL;
   BEGIN PERFORM public.register_sie_import_input(u,p,'2024-01-01','2024-12-31',repeat('a',64)); EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS code=RETURNED_SQLSTATE; END;
   RESET ROLE; PERFORM set_config('request.jwt.claim.role','authenticated',true);
   IF code IS DISTINCT FROM 'P2075' THEN RAISE EXCEPTION 'Missing company profile accepted'; END IF;
  ELSIF s='profile_cascade' THEN
   v_receipt_id:=pg_temp.register_input(p); DELETE FROM profiles WHERE profiles.id=u;
   IF EXISTS(SELECT 1 FROM sie_import_inputs WHERE user_id=u) THEN RAISE EXCEPTION 'Data reset retained receipt'; END IF;
   PERFORM pg_temp.blocked_direct(jsonb_build_object('receipt_id',v_receipt_id),'P2075');
  ELSIF s='registration_role' THEN
   -- Owner can execute, but the secondary JWT-role check still denies.
   PERFORM set_config('request.jwt.claim.role','authenticated',true); code:=NULL;
   BEGIN PERFORM public.register_sie_import_input(u,p,'2024-01-01','2024-12-31',repeat('a',64)); EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS code=RETURNED_SQLSTATE; END;
   IF code IS DISTINCT FROM '42501' THEN RAISE EXCEPTION 'JWT role guard absent'; END IF;
  ELSIF s='company' THEN
   INSERT INTO profiles(id,org_nr) VALUES(u,'111111-1111');
   code:=NULL; BEGIN PERFORM pg_temp.register_input(p); EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS code=RETURNED_SQLSTATE; END;
   IF code IS DISTINCT FROM 'P2075' THEN RAISE EXCEPTION 'Wrong source company accepted'; END IF;
   p:=jsonb_set(p,'{org_nr}','"111111-1111"'); v_receipt_id:=pg_temp.register_input(p);
   UPDATE profiles SET org_nr='222222-2222' WHERE id=u;
   PERFORM pg_temp.blocked_direct(jsonb_build_object('receipt_id',v_receipt_id),'P2075');
  ELSE
   IF s='atomic' THEN p:=jsonb_set(p,'{verifications,0,rows,1,amount}','-90'); END IF;
   v_receipt_id:=pg_temp.register_input(p);
   IF s='extra_fields' THEN PERFORM pg_temp.blocked_direct(jsonb_build_object('receipt_id',v_receipt_id,'verifications','[]'::jsonb),'P2075');
   ELSIF s='reused' THEN
    PERFORM pg_temp.consume(v_receipt_id);
    IF EXISTS(SELECT 1 FROM public.sie_import_inputs WHERE sie_import_inputs.id=v_receipt_id) THEN RAISE EXCEPTION 'Consumed receipt retained'; END IF;
    PERFORM pg_temp.blocked_direct(jsonb_build_object('receipt_id',v_receipt_id),'P2075');
    -- Same source, another receipt still hits the historic duplicate boundary.
    id2:=pg_temp.register_input(p); PERFORM pg_temp.blocked_direct(jsonb_build_object('receipt_id',id2),'23505');
   ELSIF s='wrong_user' THEN
    other_u:=gen_random_uuid(); INSERT INTO auth.users(id) VALUES(other_u); PERFORM pg_temp.set_auth(other_u);
    PERFORM pg_temp.blocked_direct(jsonb_build_object('receipt_id',v_receipt_id),'P2075');
    PERFORM pg_temp.set_auth(u); PERFORM pg_temp.consume(v_receipt_id);
   ELSIF s IN ('expired','cleanup') THEN
    UPDATE public.sie_import_inputs SET created_at=now()-interval '11 minutes',expires_at=now()-interval '1 minute' WHERE sie_import_inputs.id=v_receipt_id;
    IF s='expired' THEN PERFORM pg_temp.blocked_direct(jsonb_build_object('receipt_id',v_receipt_id),'P2075');
    ELSE id2:=pg_temp.register_input(p); IF EXISTS(SELECT 1 FROM public.sie_import_inputs WHERE sie_import_inputs.id=v_receipt_id) THEN RAISE EXCEPTION 'Expired receipt not cleaned'; END IF; END IF;
   ELSIF s='ttl_cap' THEN
    code:=NULL; BEGIN UPDATE public.sie_import_inputs SET expires_at=created_at+interval '601 seconds' WHERE sie_import_inputs.id=v_receipt_id; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS code=RETURNED_SQLSTATE; END;
    IF code IS DISTINCT FROM '23514' THEN RAISE EXCEPTION 'TTL exceeds ten minutes'; END IF;
   ELSIF s='date_recheck' THEN
    UPDATE public.sie_import_inputs SET payload=jsonb_set(payload,'{verifications,0,rows,0,date}','"2025-01-01"') WHERE sie_import_inputs.id=v_receipt_id;
    PERFORM pg_temp.blocked_direct(jsonb_build_object('receipt_id',v_receipt_id),'22023',true);
   ELSIF s='atomic' THEN
    before_state:=pg_temp.state(u); count_before:=(SELECT count(*) FROM public.sie_import_inputs WHERE user_id=u);
    PERFORM pg_temp.blocked_direct(jsonb_build_object('receipt_id',v_receipt_id),'22023');
    IF count_before<>(SELECT count(*) FROM public.sie_import_inputs WHERE user_id=u) OR before_state IS DISTINCT FROM pg_temp.state(u) THEN RAISE EXCEPTION 'Failed booking consumed receipt'; END IF;
   END IF;
  END IF;
  RAISE NOTICE 'PASS KAN74_RECEIPT %',s;
 END LOOP;
END $$;

-- Complete deletion and late failure rollback, including receipt counts/cascade.
CREATE FUNCTION pg_temp.fail_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF OLD.id::text=current_setting('kan74.fail_delete',true) THEN RAISE EXCEPTION 'Synthetic deletion failure'; END IF; RETURN OLD; END $$;
CREATE TRIGGER kan74_receipt_delete_failure BEFORE DELETE ON public.profiles FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_delete();
DO $$
DECLARE u uuid:=gen_random_uuid(); other_u uuid:=gen_random_uuid(); v_receipt_id uuid; r jsonb; p jsonb; before_state jsonb; code text;
BEGIN
 INSERT INTO auth.users(id) VALUES(u),(other_u); INSERT INTO profiles(id) VALUES(u),(other_u);
 PERFORM pg_temp.set_auth(u); p:=pg_temp.payload(2024,false); PERFORM pg_temp.import(p); v_receipt_id:=pg_temp.register_input(pg_temp.payload(2024,false));
 PERFORM pg_temp.set_auth(other_u); PERFORM pg_temp.register_input(pg_temp.payload(2025,false)); PERFORM pg_temp.set_auth(u);
 before_state:=pg_temp.state(u); PERFORM set_config('kan74.fail_delete',u::text,true);
 SET LOCAL ROLE service_role; code:=NULL;
 BEGIN PERFORM public.delete_user_data_atomic(u); EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS code=RETURNED_SQLSTATE; END;
 RESET ROLE;
 IF code IS NULL OR before_state IS DISTINCT FROM pg_temp.state(u) OR NOT EXISTS(SELECT 1 FROM public.sie_import_inputs WHERE sie_import_inputs.id=v_receipt_id) THEN RAISE EXCEPTION 'Failed deletion not atomic'; END IF;
 PERFORM set_config('kan74.fail_delete','',true);
 SET LOCAL ROLE service_role;
 IF (SELECT count(*) FROM public.sie_import_inputs WHERE user_id=u)<>1 THEN RAISE EXCEPTION 'Server dry-run count unavailable'; END IF;
 r:=public.delete_user_data_atomic(u); RESET ROLE;
 IF (r->'deleted'->>'sie_import_inputs')::integer<>1 OR EXISTS(SELECT 1 FROM public.sie_import_inputs WHERE user_id=u)
  OR EXISTS(SELECT 1 FROM transactions WHERE user_id=u) OR EXISTS(SELECT 1 FROM journal_entries WHERE user_id=u)
  OR EXISTS(SELECT 1 FROM profiles WHERE profiles.id=u) OR EXISTS(SELECT 1 FROM public.delete_user_data_atomic_lifecycle_context WHERE user_id=u)
  OR NOT EXISTS(SELECT 1 FROM public.sie_import_inputs WHERE user_id=other_u) THEN RAISE EXCEPTION 'Deletion/residual/tenant parity failed'; END IF;
 DELETE FROM auth.users WHERE auth.users.id=other_u;
 IF EXISTS(SELECT 1 FROM public.sie_import_inputs WHERE user_id=other_u) THEN RAISE EXCEPTION 'Auth FK receipt cascade failed'; END IF;
 RAISE NOTICE 'PASS KAN74_DELETION atomicity_count_residual_tenant_auth_cascade';
END $$;

ROLLBACK;
