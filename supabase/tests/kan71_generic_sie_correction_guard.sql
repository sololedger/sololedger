\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='5s';
DO $$ BEGIN
 IF current_database() NOT LIKE 'sololedger_kan71_%' OR inet_server_addr() NOT IN ('127.0.0.1'::inet,'::1'::inet) THEN RAISE EXCEPTION 'Dedicated local KAN-71 DB required'; END IF;
 IF has_function_privilege('anon','public.create_correction_transaction_atomic(uuid)','EXECUTE')
 OR has_function_privilege('authenticated','public.sie_correction_lineage(uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'RPC/helper ACL regression'; END IF;
END $$;
CREATE FUNCTION pg_temp.set_auth(u uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('request.jwt.claim.sub',u::text,true); PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true); END $$;
CREATE FUNCTION pg_temp.state(u uuid) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object(
 'tx',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM transactions t WHERE user_id=u),
 'journal',(SELECT jsonb_agg(to_jsonb(j) ORDER BY id) FROM journal_entries j WHERE user_id=u),
 'periods',(SELECT jsonb_agg(to_jsonb(v) ORDER BY id) FROM vat_periods v WHERE user_id=u),
 'batch',(SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM import_batches b WHERE user_id=u),
 'seq',(SELECT jsonb_agg(to_jsonb(n)) FROM ver_nr_sequences n WHERE user_id=u));
$$;
CREATE FUNCTION pg_temp.direct_correction(t uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
 EXECUTE 'SET LOCAL ROLE authenticated';
 IF current_user <> 'authenticated' THEN RAISE EXCEPTION 'Direct RPC role not applied'; END IF;
 r:=public.create_correction_transaction_atomic(t);
 EXECUTE 'RESET ROLE'; RETURN r;
EXCEPTION WHEN OTHERS THEN EXECUTE 'RESET ROLE'; RAISE;
END $$;
CREATE FUNCTION pg_temp.seed(u uuid,d date,vat_d date,kind text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE r jsonb; b uuid; t uuid; ver integer;
BEGIN
 PERFORM pg_temp.set_auth(u);
 r:=public.import_sie_batch(jsonb_build_object('filename','KAN71-review.se','file_hash',gen_random_uuid()::text,'fiscal_year',extract(year FROM d)::integer,
 'opening_balances','[]'::jsonb,'previous_year_result_balances','[]'::jsonb,
 'verifications',jsonb_build_array(jsonb_build_object('series','A','ver_number',1,'date',d,'description','Synthetic review SIE',
 'rows',CASE WHEN kind='reverse' THEN jsonb_build_array(
 jsonb_build_object('account_number','1930','amount',-1000),jsonb_build_object('account_number','4535','amount',1000),
 jsonb_build_object('account_number','2645','amount',250,'date',vat_d),jsonb_build_object('account_number','2614','amount',-250,'date',vat_d))
 WHEN kind='2645' THEN jsonb_build_array(
 jsonb_build_object('account_number','1930','amount',-1250),jsonb_build_object('account_number','5410','amount',1000),jsonb_build_object('account_number','2645','amount',250,'date',vat_d))
 WHEN kind='no_vat' THEN jsonb_build_array(jsonb_build_object('account_number','1930','amount',1000),jsonb_build_object('account_number','3010','amount',-1000))
 ELSE jsonb_build_array(jsonb_build_object('account_number','1930','amount',1250),jsonb_build_object('account_number','3010','amount',-1000),jsonb_build_object('account_number','2611','amount',-250,'date',vat_d)) END))));
 b:=(r->>'import_batch_id')::uuid;
 SELECT id INTO t FROM transactions WHERE user_id=u AND import_batch_id=b;
 RETURN t;
END $$;
DO $$
DECLARE s text; u uuid; t uuid; parent uuid; p uuid; d date; vd date; ps date; pe date; r jsonb; extra uuid; ver integer;
 old_state jsonb; originals jsonb; failed boolean; msg text;
BEGIN
 FOREACH s IN ARRAY ARRAY['open_sie','closed_same','declared_same','closed_old','declared_old','other_period','year_cross','row_other_period','reverse','2645','missing','overlap','imported_history','manual_open','manual_old','manual_no_vat','descendant_open','descendant_closed','legacy_descendant','orphan_correction'] LOOP
  u:=gen_random_uuid(); INSERT INTO auth.users(id) VALUES(u); PERFORM pg_temp.set_auth(u);
  d:=CASE WHEN s IN ('closed_old','declared_old','other_period','manual_old','legacy_descendant') THEN date_trunc('year',current_date)::date+14
    WHEN s IN ('year_cross','manual_no_vat') THEN make_date(extract(year FROM current_date)::int-1,5,15) ELSE current_date END;
  vd:=CASE WHEN s='row_other_period' THEN date_trunc('year',current_date)::date+14 ELSE d END;
  t:=pg_temp.seed(u,d,vd,CASE WHEN s IN ('reverse','2645') THEN s WHEN s='manual_no_vat' THEN 'no_vat' ELSE 'normal' END);
  IF s LIKE 'manual_%' THEN UPDATE transactions SET source='manual',import_batch_id=NULL WHERE id=t; END IF;
  ps:=date_trunc('month',vd)::date; pe:=CASE WHEN vd=current_date THEN current_date ELSE (date_trunc('month',vd)+interval '1 month - 1 day')::date END;
  IF s<>'missing' THEN
   INSERT INTO vat_periods(user_id,period_start,period_end,period_type,source)
    VALUES(u,ps,pe,'month',CASE WHEN s='imported_history' THEN 'imported_history' ELSE 'sololedger' END) RETURNING id INTO p;
   IF vd<date_trunc('month',current_date)::date THEN
    INSERT INTO vat_periods(user_id,period_start,period_end,period_type) VALUES(u,date_trunc('month',current_date)::date,current_date,'month');
   END IF;
  END IF;
  IF s='overlap' THEN INSERT INTO vat_periods(user_id,period_start,period_end,period_type) VALUES(u,ps-1,pe,'quarter'); END IF;
  IF s IN ('closed_same','declared_same','closed_old','declared_old','manual_old','legacy_descendant') THEN
   PERFORM public.close_vat_period_atomic(p);
   IF s LIKE 'declared_%' THEN PERFORM public.declare_vat_period_atomic(p,current_date); END IF;
  END IF;
  IF s IN ('descendant_open','descendant_closed') THEN
   r:=pg_temp.direct_correction(t); t:=(r->>'transaction_id')::uuid;
   IF (SELECT source FROM transactions WHERE id=t) <> 'manual' THEN RAISE EXCEPTION 'Expected legacy/default manual correction source'; END IF;
   IF s='descendant_closed' THEN extra:=pg_temp.seed(u,current_date,current_date,'normal'); PERFORM public.close_vat_period_atomic(p); END IF;
  END IF;
  IF s='legacy_descendant' THEN
   parent:=t; ver:=public.get_next_ver_nr(u);
   INSERT INTO transactions(user_id,date,source,amount,booked,is_correction,corrects_ver_nr,description)
    SELECT u,current_date,'manual',amount,true,true,(SELECT min(ver_nr) FROM journal_entries WHERE transaction_id=parent),'Synthetic pre-fix SIE correction' FROM transactions WHERE id=parent RETURNING id INTO t;
   INSERT INTO journal_entries(user_id,transaction_id,date,ver_nr,account_number,debit,credit,description)
    SELECT u,t,current_date,ver,account_number,credit,debit,'Synthetic legacy mirror' FROM journal_entries WHERE transaction_id=parent;
  END IF;
  IF s='orphan_correction' THEN UPDATE transactions SET source='manual',is_correction=true,corrects_ver_nr=NULL WHERE id=t; END IF;
  old_state:=pg_temp.state(u);
  SELECT jsonb_agg(to_jsonb(j) ORDER BY id) INTO originals FROM journal_entries j WHERE user_id=u;
  failed:=false;
  BEGIN r:=pg_temp.direct_correction(t); EXCEPTION WHEN check_violation THEN failed:=true; GET STACKED DIAGNOSTICS msg=MESSAGE_TEXT; END;
  IF s IN ('open_sie','manual_open','manual_old','manual_no_vat','descendant_open') THEN
   IF failed OR (r->>'success')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'Legitimate correction % rejected: %',s,msg; END IF;
   IF EXISTS(SELECT 1 FROM journal_entries WHERE user_id=u GROUP BY transaction_id HAVING sum(debit-credit)<>0) THEN RAISE EXCEPTION 'Unbalanced correction'; END IF;
   IF (SELECT count(*) FROM journal_entries j WHERE user_id=u AND transaction_id=(r->>'transaction_id')::uuid)=0 THEN RAISE EXCEPTION 'No correction journal'; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(originals) e WHERE NOT EXISTS(SELECT 1 FROM journal_entries j WHERE to_jsonb(j)=e)) THEN RAISE EXCEPTION 'Original journal mutated'; END IF;
  ELSE
   IF NOT failed OR old_state IS DISTINCT FROM pg_temp.state(u) THEN RAISE EXCEPTION 'Unsafe SIE path % bypassed atomic guard',s; END IF;
   IF msg NOT LIKE '%separat hantering%' THEN RAISE EXCEPTION 'Unclear historical stop: %',msg; END IF;
  END IF;
  RAISE NOTICE 'PASS direct authenticated correction: %',s;
 END LOOP;
END $$;
ROLLBACK;
SELECT 'PASS 20 direct authenticated correction cases; all serial fixtures rolled back';
