-- Existing identified synthetic database only; all new fixtures roll back.
BEGIN;
\ir kan62_test_helpers.sql
CREATE FUNCTION pg_temp.inv_preview(u uuid,y integer) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r jsonb; BEGIN PERFORM pg_temp.kan62_auth(u); r:=public.get_fixed_asset_depreciation_preview(y); RESET ROLE; RETURN r; END $$;
CREATE FUNCTION pg_temp.inv_request(u uuid,y integer) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE s jsonb:=pg_temp.inv_preview(u,y); BEGIN RETURN jsonb_build_object('fiscal_year',y,'year_start',make_date(y,1,1),
 'year_end',make_date(y,12,31),'normal_calendar_year_confirmed',true,'all_purchases_complete',true,
 'expected_signature',s->>'signature','expected_amount',s->'depreciation_amount'); END $$;
CREATE FUNCTION pg_temp.inv_book(u uuid,p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r jsonb; BEGIN PERFORM pg_temp.kan62_auth(u); r:=public.book_fixed_asset_depreciation_checked(p); RESET ROLE; RETURN r; END $$;
DO $grants$ BEGIN EXECUTE format('GRANT USAGE ON SCHEMA %I TO authenticated,anon,service_role',
 (SELECT nspname FROM pg_namespace WHERE oid=pg_my_temp_schema())); END $grants$;
DO $tests$
DECLARE u uuid; v uuid; deduction text; a jsonb; p jsonb; r jsonb; s jsonb; prior jsonb;
 cost numeric; vat numeric; first_amount numeric; next_basis numeric; pid uuid; role_name text; helper text; code text; message text;
 successful_users uuid[]:=ARRAY[]::uuid[];
BEGIN
 FOREACH deduction IN ARRAY ARRAY['full','none'] LOOP
  u:=gen_random_uuid(); PERFORM pg_temp.kan62_setup(u,deduction);
  successful_users:=array_append(successful_users,u);
  PERFORM pg_temp.kan62_auth(u);
  r:=public.book_transaction_atomic(jsonb_build_object('idempotency_key',gen_random_uuid(),'date','2025-01-01',
    'description','Synthetic owner deposit','amount',500000,'type','kan62_deposit','vat_rate',0)); RESET ROLE;
  a:=pg_temp.kan62_book(u,pg_temp.kan62_payload(125000,25,deduction,100000,ARRAY[]::uuid[],0,'more_than_three_years_or_unknown','2025-01-20'));
  cost:=CASE WHEN deduction='full' THEN 100000 ELSE 125000 END; vat:=CASE WHEN deduction='full' THEN 25000 ELSE 0 END;
  PERFORM pg_temp.kan62_purchase(a,u,cost,vat,true,'2025-01-20');
  PERFORM pg_temp.kan62_reject(u,'SELECT public.book_fixed_asset_depreciation_atomic(2025)','23514','Uppdatera inventariesidan');
  p:=pg_temp.inv_request(u,2025);
  PERFORM pg_temp.kan62_reject(u,format('SELECT public.book_fixed_asset_depreciation_checked(%L::jsonb)',
    (p||'{"normal_calendar_year_confirmed":false}'::jsonb)::text),'23514','tolvmånadersår');
  PERFORM pg_temp.kan62_reject(u,format('SELECT public.book_fixed_asset_depreciation_checked(%L::jsonb)',
    (p||'{"year_start":"2025-07-01"}'::jsonb)::text),'23514','årslängd');
  PERFORM pg_temp.kan62_reject(u,format('SELECT public.book_fixed_asset_depreciation_checked(%L::jsonb)',
    (p||'{"expected_amount":999}'::jsonb)::text),'23514','underlaget har ändrats');
  INSERT INTO public.vat_periods(user_id,period_start,period_end,period_type) VALUES(u,'2025-01-01','2025-01-31','month') RETURNING id INTO pid;
  PERFORM pg_temp.kan62_auth(u); r:=public.close_vat_period_atomic(pid); r:=public.declare_vat_period_atomic(pid,'2025-02-10'); RESET ROLE;
  -- A declared VAT period does not block a VAT-free 7830/1220 year-end entry.
  first_amount:=round(cost*0.30,2); r:=pg_temp.inv_book(u,p);
  PERFORM pg_temp.kan62_journal((r->>'transaction_id')::uuid,u,'fixed_asset_depreciation',0,
    jsonb_build_array(jsonb_build_array('7830',first_amount,0),jsonb_build_array('1220',0,first_amount)),'2025-12-31');
  s:=pg_temp.inv_preview(u,2025); PERFORM pg_temp.kan62_assert((s->>'book_value')::numeric=cost-first_amount,'first-year collective remaining value');
  prior:=pg_temp.kan62_snapshot(u); s:=pg_temp.inv_book(u,p);
  PERFORM pg_temp.kan62_assert((s->>'idempotent_replay')::boolean,'exact annual replay');
  PERFORM pg_temp.kan62_equal(pg_temp.kan62_snapshot(u),prior,'annual replay creates no extra rows');
  PERFORM pg_temp.kan62_reject(u,format('SELECT public.book_fixed_asset_depreciation_checked(%L::jsonb)',
    (p||'{"expected_amount":1}'::jsonb)::text),'23505','annat underlag');
  PERFORM pg_temp.kan62_reject_book(u,pg_temp.kan62_payload(40000,0,deduction,40000,ARRAY[]::uuid[],0,
    'more_than_three_years_or_unknown','2025-05-01'),'23514','fastställt genom årsavskrivning');
  -- Safe immediate expense/short-life must remain possible, without changing basis.
  a:=pg_temp.kan62_book(u,pg_temp.kan62_payload(1250,25,deduction,1000,ARRAY[]::uuid[],0,NULL,'2025-05-01'));
  a:=pg_temp.kan62_book(u,pg_temp.kan62_payload(50000,25,deduction,40000,ARRAY[]::uuid[],0,'max_three_years','2025-05-02'));
  PERFORM pg_temp.kan62_assert((pg_temp.inv_preview(u,2025)->>'book_value')::numeric=cost-first_amount,'direct deductions do not change frozen basis');
  -- KAN-75 deliberately forbids lock upgrades in a multi-RPC transaction.
  -- The real successful year close runs in a separate session in concurrency tests.
  PERFORM pg_temp.kan62_reject(u,'SELECT public.close_year_atomic(2025)','25001','egen transaktion');
  INSERT INTO public.closed_years(user_id,year) VALUES(u,2025);
  a:=pg_temp.kan62_book(u,pg_temp.kan62_payload(50000,25,deduction,40000,ARRAY[]::uuid[],0,'more_than_three_years_or_unknown','2026-02-01'));
  next_basis:=cost-first_amount+CASE WHEN deduction='full' THEN 40000 ELSE 50000 END;
  s:=pg_temp.inv_preview(u,2026);
  PERFORM pg_temp.kan62_assert((s->>'basis_amount')::numeric=next_basis AND (s->>'depreciation_amount')::numeric=round(next_basis*.30,2),
    'next year uses opening residual plus new acquisitions; annual amount is 30 percent, not whole technical residual');
  p:=pg_temp.inv_request(u,2026); r:=pg_temp.inv_book(u,p);
  PERFORM pg_temp.kan62_journal((r->>'transaction_id')::uuid,u,'fixed_asset_depreciation',0,
    jsonb_build_array(jsonb_build_array('7830',round(next_basis*.30,2),0),jsonb_build_array('1220',0,round(next_basis*.30,2))),'2026-12-31');
  PERFORM pg_temp.kan62_assert((pg_temp.inv_preview(u,2026)->>'book_value')::numeric=round(next_basis*.70,2),'second-year B4 value');
  PERFORM pg_temp.kan62_reject_book(u,pg_temp.kan62_payload(40000,0,deduction,40000,ARRAY[]::uuid[],0,
    'more_than_three_years_or_unknown'),'23514','fastställt genom årsavskrivning');
  PERFORM pg_temp.kan62_reject(u,format('SELECT public.retire_fixed_asset_atomic(%L::uuid,%L::date,NULL)',a->>'asset_id','2026-03-01'),
    '23514','Avyttring eller utrangering');
  prior:=pg_temp.kan62_snapshot(u); PERFORM pg_temp.kan62_auth(u);
  s:=public.book_transaction_atomic(jsonb_build_object('idempotency_key',gen_random_uuid(),
    'date','2026-05-01','description','Unsupported direct asset credit','amount',100,'vat_rate',0,'type','kan62_asset'));
  RESET ROLE;
  PERFORM pg_temp.kan62_assert(s->>'error_code'='23514' AND s->>'message'~'Kreditering, avyttring'
    AND (s->>'confirmed_rejection')::boolean,'ordinary RPC confirmed rejection has exact cause');
  PERFORM pg_temp.kan62_equal(pg_temp.kan62_snapshot(u),prior,'manual asset rejection leaves journal unchanged');
  prior:=pg_temp.kan62_snapshot(u);code:=NULL;message:=NULL;
  BEGIN
    INSERT INTO public.transactions(user_id,date,description,amount,booked,source)
      VALUES(u,'2026-01-01','Synthetic late import',1,true,'sie_import') RETURNING id INTO pid;
    INSERT INTO public.journal_entries(user_id,date,transaction_id,ver_nr,account_number,debit,credit)
      VALUES(u,'2026-01-01',pid,999,'1220',1,0);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS code=RETURNED_SQLSTATE,message=MESSAGE_TEXT; END;
  PERFORM pg_temp.kan62_assert(code='23514' AND message~'Bakdatering, import','journal trigger rejects late imported movement');
  PERFORM pg_temp.kan62_equal(pg_temp.kan62_snapshot(u),prior,'late import creates no journal or transaction');
  RAISE NOTICE 'INVENTORY_PASS full chain deduction=% basis2026=%',deduction,next_basis;
 END LOOP;
 u:=gen_random_uuid(); PERFORM pg_temp.kan62_setup(u,'none');
 a:=pg_temp.kan62_book(u,pg_temp.kan62_payload(29400,0,'none',29400,ARRAY[]::uuid[],0,'more_than_three_years_or_unknown','2025-01-01'));
 s:=pg_temp.inv_preview(u,2026); PERFORM pg_temp.kan62_assert(s->>'status'='blocked' AND s->>'reason'~'tidigare inventarieårs','year order fails closed');
 r:=pg_temp.inv_book(u,pg_temp.inv_request(u,2025)); PERFORM pg_temp.kan62_assert((r->>'depreciation_amount')::numeric=29400,'2025 whole-basis rule at exact half PBB');
 s:=pg_temp.inv_preview(u,2026); PERFORM pg_temp.kan62_assert(s->>'status'='empty' AND (s->>'book_value')::numeric=0,'zero value, no ghost depreciation');
 v:=gen_random_uuid(); PERFORM pg_temp.kan62_setup(v,'none');
 PERFORM pg_temp.kan62_assert(pg_temp.inv_preview(v,2026)->>'status'='empty','preview uses authenticated owner only');
 FOREACH role_name IN ARRAY ARRAY['authenticated','anon','service_role'] LOOP
  FOREACH helper IN ARRAY ARRAY['inventory_depreciation_state(2026)','lock_inventory_boundary()',
    'book_fixed_asset_depreciation_unchecked_inventory(2026)','close_year_unchecked_inventory(2026)'] LOOP
    PERFORM pg_temp.kan62_reject(v,'SELECT public.'||helper,'42501','permission denied',role_name);
  END LOOP;
  IF role_name<>'authenticated' THEN
    PERFORM pg_temp.kan62_reject(v,'SELECT public.get_fixed_asset_depreciation_preview(2026)','42501','permission denied',role_name);
    PERFORM pg_temp.kan62_reject(v,'SELECT public.book_fixed_asset_depreciation_checked(''{}''::jsonb)','42501','permission denied',role_name);
  END IF;
 END LOOP;
 PERFORM pg_temp.kan62_reject(v,'INSERT INTO public.journal_entries(user_id) VALUES(auth.uid())','42501','permission denied');
 -- An imported opening balance is synthetic but unsupported: never silently depreciate it.
 INSERT INTO public.transactions(user_id,date,description,amount,booked,source) VALUES(v,'2025-01-01','Synthetic unsupported opening',1000,true,'sie_import') RETURNING id INTO pid;
 INSERT INTO public.journal_entries(user_id,date,transaction_id,ver_nr,account_number,debit,credit) VALUES
  (v,'2025-01-01',pid,1,'1220',1000,0),(v,'2025-01-01',pid,1,'2018',0,1000);
 s:=pg_temp.inv_preview(v,2026); PERFORM pg_temp.kan62_assert(s->>'status'='blocked' AND s->>'reason'~'ingående värden','unverified opening fails closed');
 -- Synthetic legacy drift: ledger/register still balance, but a previous run is stale.
 v:=gen_random_uuid();PERFORM pg_temp.kan62_setup(v,'none');
 a:=pg_temp.kan62_book(v,pg_temp.kan62_payload(100000,0,'none',100000,ARRAY[]::uuid[],0,'more_than_three_years_or_unknown','2025-01-01'));
 p:=pg_temp.inv_request(v,2025);r:=pg_temp.inv_book(v,p);
 UPDATE public.fixed_assets SET capitalized_amount=110000 WHERE id=(a->>'asset_id')::uuid;
 UPDATE public.journal_entries SET debit=CASE WHEN account_number='1220' THEN 110000 ELSE debit END,
   credit=CASE WHEN account_number='1930' THEN 110000 ELSE credit END WHERE transaction_id=(a->>'transaction_id')::uuid;
 s:=pg_temp.inv_preview(v,2026);PERFORM pg_temp.kan62_assert(s->>'status'='blocked' AND s->>'reason'~'Tidigare års inventarieunderlag','stale previous run cannot become a normal opening');
 UPDATE public.fixed_asset_depreciation_runs SET audit_snapshot=audit_snapshot-'contract' WHERE user_id=v;
 s:=pg_temp.inv_preview(v,2026);PERFORM pg_temp.kan62_assert(s->>'status'='blocked' AND s->>'reason'~'saknar verifierad årslängd','unknown legacy year length cannot become a normal opening');
 PERFORM set_config('sololedger.inventory_accounting_evidence',jsonb_build_object('users',to_jsonb(successful_users),
   'transactions',(SELECT jsonb_agg(t) FROM public.transactions t WHERE user_id=ANY(successful_users)),
   'journal',(SELECT jsonb_agg(j) FROM public.journal_entries j WHERE user_id=ANY(successful_users)),
   'periods',(SELECT jsonb_agg(vp) FROM public.vat_periods vp WHERE vp.user_id=ANY(successful_users)))::text,true);
 RAISE NOTICE 'INVENTORY_PASS year order, exact boundary, zero, ownership, private ACL and unknown opening';
END $tests$;
SELECT current_setting('sololedger.inventory_accounting_evidence')::jsonb;
ROLLBACK;
