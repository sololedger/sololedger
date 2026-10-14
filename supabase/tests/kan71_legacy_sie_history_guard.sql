\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='5s';
DO $$ BEGIN
 IF current_database() NOT LIKE 'sololedger_kan71_%' OR inet_server_addr() NOT IN ('127.0.0.1'::inet,'::1'::inet)
 THEN RAISE EXCEPTION 'Dedicated local KAN-71 DB required'; END IF;
 IF has_function_privilege('anon','public.get_sie_vat_history_review(date,date)','EXECUTE')
 OR has_function_privilege('authenticated','public.sie_vat_history_requires_review(uuid,date,date)','EXECUTE')
 THEN RAISE EXCEPTION 'History RPC/helper ACL regression'; END IF;
END $$;
CREATE TEMP TABLE evidence(scenario text,"userId" uuid,"startDate" date,"endDate" date,net numeric,review boolean,rows jsonb) ON COMMIT DROP;
CREATE FUNCTION pg_temp.auth(u uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('request.jwt.claim.sub',u::text,true); END $$;
CREATE FUNCTION pg_temp.history(ps date,pe date) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE r boolean;
BEGIN
 EXECUTE 'SET LOCAL ROLE authenticated';
 r:=public.get_sie_vat_history_review(ps,pe);
 EXECUTE 'RESET ROLE'; RETURN r;
EXCEPTION WHEN OTHERS THEN EXECUTE 'RESET ROLE'; RAISE;
END $$;
CREATE FUNCTION pg_temp.close_period(p uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
 EXECUTE 'SET LOCAL ROLE authenticated'; r:=public.close_vat_period_atomic(p);
 EXECUTE 'RESET ROLE'; RETURN r;
EXCEPTION WHEN OTHERS THEN EXECUTE 'RESET ROLE'; RAISE;
END $$;
CREATE FUNCTION pg_temp.sale(u uuid,d date,src text,reverse_vat boolean DEFAULT false) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE t uuid; v integer;
BEGIN
 v:=public.get_next_ver_nr(u);
 INSERT INTO transactions(user_id,date,source,amount,booked,description)
 VALUES(u,d,src,1250,true,'Synthetic historical lineage') RETURNING id INTO t;
 INSERT INTO journal_entries(user_id,transaction_id,date,ver_nr,account_number,debit,credit)
 VALUES(u,t,d,v,'1930',1250,0),(u,t,d,v,'3010',0,1000),
 (u,t,d,v,CASE WHEN reverse_vat THEN '2614' ELSE '2611' END,0,250);
 RETURN t;
END $$;
CREATE FUNCTION pg_temp.legacy_correction(u uuid,parent uuid,d date) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE t uuid; v integer;
BEGIN
 v:=public.get_next_ver_nr(u);
 INSERT INTO transactions(user_id,date,source,amount,booked,is_correction,corrects_ver_nr,description)
 SELECT u,d,'manual',amount,true,true,(SELECT min(ver_nr) FROM journal_entries WHERE transaction_id=parent AND user_id=u),
 'Synthetic legacy manual SIE correction' FROM transactions WHERE id=parent AND user_id=u RETURNING id INTO t;
 INSERT INTO journal_entries(user_id,transaction_id,date,ver_nr,account_number,debit,credit)
 SELECT u,t,d,v,account_number,credit,debit FROM journal_entries WHERE transaction_id=parent AND user_id=u;
 RETURN t;
END $$;
CREATE FUNCTION pg_temp.state(u uuid) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('tx',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM transactions t WHERE user_id=u),
 'journal',(SELECT jsonb_agg(to_jsonb(j) ORDER BY id) FROM journal_entries j WHERE user_id=u),
 'periods',(SELECT jsonb_agg(to_jsonb(v) ORDER BY id) FROM vat_periods v WHERE user_id=u),
 'seq',(SELECT jsonb_agg(to_jsonb(v)) FROM ver_nr_sequences v WHERE user_id=u));
$$;
CREATE FUNCTION pg_temp.capture(s text,u uuid,ps date,pe date,n numeric,review_required boolean) RETURNS void LANGUAGE sql AS $$
 INSERT INTO evidence VALUES(s,u,ps,pe,n,review_required,jsonb_build_object(
 'sieCorrectionHistoryReviewRequired',pg_temp.history(ps,pe),
 'transactions',coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM transactions t WHERE t.user_id=u),'[]'::jsonb),
 'journalRows',coalesce((SELECT jsonb_agg(to_jsonb(j)) FROM journal_entries j WHERE j.user_id=u),'[]'::jsonb),
 'vatPeriods',coalesce((SELECT jsonb_agg(to_jsonb(v)) FROM vat_periods v WHERE v.user_id=u),'[]'::jsonb),
 'vatV2Snapshots','[]'::jsonb));
$$;
DO $$
DECLARE s text; u uuid; t uuid; c uuid; extra uuid; p2 uuid; p3 uuid; d date; cd date; ps date;
 before_state jsonb; old_period jsonb; r jsonb; failed boolean; msg text; expected boolean; foreign_u uuid;
BEGIN
 FOREACH s IN ARRAY ARRAY['q2_q3_closed','q2_q3_declared','q2_q3_open','manual_sie_no_batch','multihop','ordinary_manual','same_open','same_closed','year_cross','year_single_period','reverse_same','missing_period','overlap','imported_period','orphan','foreign_ver'] LOOP
  u:=gen_random_uuid(); INSERT INTO auth.users(id) VALUES(u); PERFORM pg_temp.auth(u);
  d:=CASE WHEN s IN ('same_open','same_closed','reverse_same') THEN '2026-08-15'::date
    WHEN s IN ('year_cross','year_single_period') THEN '2025-05-15'::date ELSE '2026-05-15'::date END;
  cd:='2026-08-16'; ps:=CASE WHEN s IN ('year_cross','year_single_period') THEN '2025-04-01'::date ELSE '2026-04-01'::date END;
  t:=pg_temp.sale(u,d,CASE WHEN s='ordinary_manual' THEN 'manual' ELSE 'sie_import' END,s='reverse_same');
  INSERT INTO vat_periods(user_id,period_start,period_end,period_type)
   VALUES(u,ps,(ps+interval '3 months - 1 day')::date,'quarter') RETURNING id INTO p2;
  INSERT INTO vat_periods(user_id,period_start,period_end,period_type)
   VALUES(u,'2026-07-01','2026-09-30','quarter') RETURNING id INTO p3;
  IF s IN ('q2_q3_closed','q2_q3_declared','ordinary_manual','year_cross') THEN
   PERFORM pg_temp.close_period(p2);
   IF s='q2_q3_declared' THEN PERFORM public.declare_vat_period_atomic(p2,'2026-07-01'); END IF;
  END IF;
  SELECT to_jsonb(v) INTO old_period FROM vat_periods v WHERE id=p2;
  IF s='multihop' THEN t:=pg_temp.legacy_correction(u,t,'2026-05-16'); END IF;
  c:=pg_temp.legacy_correction(u,t,cd);
  IF (SELECT source <> 'manual' OR import_batch_id IS NOT NULL FROM transactions WHERE id=c) THEN RAISE EXCEPTION 'Bad no-batch manual fixture'; END IF;
  IF s IN ('same_open','same_closed') THEN
   -- A legitimate nonzero remainder avoids the unrelated existing all-zero close guard.
   extra:=pg_temp.sale(u,'2026-08-20','manual');
  END IF;
  IF s='same_closed' THEN PERFORM pg_temp.close_period(p3); END IF;
  IF s='missing_period' THEN DELETE FROM vat_periods WHERE id=p2; END IF;
  IF s='year_single_period' THEN
   DELETE FROM vat_periods WHERE id=p2;
   UPDATE vat_periods SET period_start=ps WHERE id=p3;
  END IF;
  IF s='overlap' THEN INSERT INTO vat_periods(user_id,period_start,period_end,period_type) VALUES(u,'2026-05-01','2026-05-31','month'); END IF;
  IF s='imported_period' THEN UPDATE vat_periods SET source='imported_history' WHERE id=p2; END IF;
  IF s='orphan' THEN UPDATE transactions SET corrects_ver_nr=NULL WHERE id=c; END IF;
  IF s='foreign_ver' THEN
   -- Only another tenant owns this ver_nr; never follow it or infer SIE.
   foreign_u:=gen_random_uuid(); INSERT INTO auth.users(id) VALUES(foreign_u);
   PERFORM pg_temp.auth(foreign_u);
   extra:=pg_temp.sale(foreign_u,d,'sie_import');
   PERFORM pg_temp.auth(u);
   UPDATE transactions SET corrects_ver_nr=999999 WHERE id=c;
   UPDATE journal_entries SET ver_nr=999999 WHERE transaction_id=extra;
  END IF;
  expected:=s NOT IN ('ordinary_manual','same_open','same_closed');
  before_state:=pg_temp.state(u);
  IF pg_temp.history('2026-07-01','2026-09-30') IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Q3 lineage verdict wrong: %',s; END IF;
  IF s<>'reverse_same' AND pg_temp.history(ps,(ps+interval '3 months - 1 day')::date) IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Original period must see descendant: %',s; END IF;
  IF before_state IS DISTINCT FROM pg_temp.state(u) THEN RAISE EXCEPTION 'History read mutated data'; END IF;
  failed:=false;
  BEGIN r:=pg_temp.close_period(p3); EXCEPTION WHEN check_violation THEN failed:=true; GET STACKED DIAGNOSTICS msg=MESSAGE_TEXT; END;
  IF expected THEN
   IF NOT failed OR msg NOT LIKE '%separat hantering%' OR before_state IS DISTINCT FROM pg_temp.state(u)
   THEN RAISE EXCEPTION 'Direct authenticated close bypass/atomic failure: % / %',s,msg; END IF;
  ELSE
   IF failed OR (r->>'success')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'Legitimate close blocked: % / %',s,msg; END IF;
  END IF;
  IF s NOT IN ('missing_period','imported_period','year_single_period') AND old_period IS DISTINCT FROM (SELECT to_jsonb(v) FROM vat_periods v WHERE id=p2)
  THEN RAISE EXCEPTION 'Historical original period changed: %',s; END IF;
  IF s IN ('q2_q3_closed','q2_q3_declared','q2_q3_open','manual_sie_no_batch','ordinary_manual','year_cross') THEN
   PERFORM pg_temp.capture(s||'_original',u,ps,(ps+interval '3 months - 1 day')::date,250,expected);
   PERFORM pg_temp.capture(s||'_correction',u,'2026-07-01','2026-09-30',-250,expected);
   IF s<>'year_cross' THEN PERFORM pg_temp.capture(s||'_annual',u,'2026-01-01','2026-12-31',0,expected); END IF;
  END IF;
  IF s IN ('same_open','same_closed') THEN PERFORM pg_temp.capture(s,u,'2026-07-01','2026-09-30',250,false); END IF;
  RAISE NOTICE 'PASS legacy lineage history/direct close: %',s;
 END LOOP;
 -- Authentication and tenant isolation are enforced by the read RPC itself.
 u:=gen_random_uuid(); INSERT INTO auth.users(id) VALUES(u); PERFORM pg_temp.auth(u);
 IF pg_temp.history('2026-01-01','2026-12-31') THEN RAISE EXCEPTION 'Another tenant leaked into history'; END IF;
 PERFORM set_config('request.jwt.claim.sub','',true);
 failed:=false; BEGIN PERFORM pg_temp.history('2026-01-01','2026-12-31'); EXCEPTION WHEN invalid_authorization_specification THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Unauthenticated history allowed'; END IF;
END $$;
SELECT jsonb_agg(to_jsonb(e)) FROM evidence e;
ROLLBACK;
SELECT 'PASS 16 legacy chain scenarios; direct authenticated close, report evidence, auth/ACL/tenant and history preservation; all rolled back';
