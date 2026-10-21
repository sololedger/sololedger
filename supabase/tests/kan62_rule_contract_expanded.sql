-- Expanded local-only rollback suite. NO migrations, NO global role/server changes.
BEGIN;
\ir kan62_test_helpers.sql
SELECT pg_temp.kan62_guard();
DO $tests$
DECLARE
  u uuid; v uuid; unknown_user uuid:=gen_random_uuid(); deduction text; role_name text; tab text;
  a jsonb; b jsonb; c jsonb; r jsonb; p jsonb; saved jsonb; other_before jsonb;
  old_a jsonb; old_b jsonb; event_a jsonb; event_b jsonb; short_asset jsonb; long_asset jsonb; planned jsonb;
  cost numeric; vat numeric; reclass numeric; basis numeric; rate integer; own_visible boolean;
  period_id uuid; period_status text; group_asset jsonb; purchased text;
  legacy jsonb:=current_setting('sololedger.kan62_legacy_fixture',true)::jsonb;
  legacy_user uuid; key uuid:=gen_random_uuid();
BEGIN
  PERFORM pg_temp.kan62_guard();
  PERFORM pg_temp.kan62_assert(legacy IS NOT NULL,'pre-upgrade legacy fixture required, never skip');
  PERFORM pg_temp.kan62_assert((SELECT p.prosecdef AND r.rolname='postgres'
    AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
      WHERE acl.privilege_type='EXECUTE' AND acl.grantee<>p.proowner)
    FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner
    WHERE p.oid='public.book_fixed_asset_acquisition_atomic_unchecked_kan54(jsonb)'::regprocedure),'private owner/ACL/SECURITY DEFINER');
  PERFORM pg_temp.kan62_assert((SELECT strpos(body,'lock_accounting_year_boundary')>0
    AND strpos(body,'lock_accounting_year_boundary')<strpos(body,'assert_fixed_asset_vat_deduction_allowed')
    AND strpos(body,'assert_fixed_asset_vat_deduction_allowed')<strpos(body,'RETURN public.book_fixed_asset_acquisition_atomic_unchecked_kan54')
    FROM (SELECT pg_get_functiondef('public.book_fixed_asset_acquisition_atomic(jsonb)'::regprocedure) body) f),'public guard ordering');
  PERFORM pg_temp.kan62_assert((SELECT count(*)=1 FROM pg_proc WHERE pronamespace='public'::regnamespace
    AND proname='book_fixed_asset_acquisition_atomic_unchecked_kan54'),'no unexpected private overload');
  PERFORM pg_temp.kan62_assert((SELECT NOT rolsuper AND NOT rolbypassrls FROM pg_roles WHERE rolname='authenticated'),'real RLS client role');
  PERFORM pg_temp.kan62_assert(NOT pg_has_role('authenticated','postgres','MEMBER')
    AND NOT pg_has_role('authenticated','service_role','MEMBER'),'no inherited administrator/service role');
  PERFORM pg_temp.kan62_setup(unknown_user,'unknown');
  FOREACH deduction IN ARRAY ARRAY['none','full'] LOOP
    u:=gen_random_uuid(); v:=gen_random_uuid();
    PERFORM pg_temp.kan62_setup(u,deduction); PERFORM pg_temp.kan62_setup(v,deduction);
    cost:=CASE WHEN deduction='none' THEN 12500 ELSE 10000 END;
    vat:=12500-cost; reclass:=2*cost;
    p:=pg_temp.kan62_payload(35000,25,deduction,28000);
    r:=pg_temp.kan62_book(u,p);
    PERFORM pg_temp.kan62_purchase(r,u,CASE WHEN deduction='none' THEN 35000 ELSE 28000 END,
      CASE WHEN deduction='none' THEN 0 ELSE 7000 END,false);
    saved:=pg_temp.kan62_snapshot(u); a:=pg_temp.kan62_book(u,p);
    PERFORM pg_temp.kan62_equal(a-'idempotent_replay',r-'idempotent_replay','same replay receipt IDs');
    PERFORM pg_temp.kan62_assert((a->>'idempotent_replay')::boolean,'replay flag');
    PERFORM pg_temp.kan62_equal(pg_temp.kan62_snapshot(u),saved,'replay no extra rows');
    PERFORM pg_temp.kan62_reject_book(u,p||'{"gross_amount":35001}','23505','Idempotency-nyckeln har redan använts');
    IF deduction='none' THEN PERFORM pg_temp.kan62_reject_book(u,pg_temp.kan62_payload(12500,25,'full',10000),
      '23514','Företagsprofilen tillåter inte'); END IF;
    FOREACH basis IN ARRAY ARRAY[29599.99,29600,29600.01]::numeric[] LOOP
      p:=pg_temp.kan62_payload(basis,0,deduction,basis);
      IF basis<29600 THEN
        r:=pg_temp.kan62_book(u,p); PERFORM pg_temp.kan62_purchase(r,u,basis,0,false);
      ELSE PERFORM pg_temp.kan62_reject_book(u,p,'23514','högst tre år'); END IF;
    END LOOP;
    FOREACH basis IN ARRAY ARRAY[29600,40000]::numeric[] LOOP
      p:=pg_temp.kan62_payload(basis*1.25,25,deduction,basis,ARRAY[]::uuid[],0,'max_three_years');
      r:=pg_temp.kan62_book(u,p);
      PERFORM pg_temp.kan62_purchase(r,u,basis*CASE WHEN deduction='none' THEN 1.25 ELSE 1 END,
        basis*CASE WHEN deduction='none' THEN 0 ELSE .25 END,false);
      PERFORM pg_temp.kan62_assert(r->>'decision_type'='immediate_expense_short_life'
        AND (r->>'reclassification_amount')::numeric=0,'short life at and above threshold');
      saved:=pg_temp.kan62_snapshot(u); r:=pg_temp.kan62_book(u,p);
      PERFORM pg_temp.kan62_equal(pg_temp.kan62_snapshot(u),saved,'short life replay no extra rows');
    END LOOP;

    a:=pg_temp.kan62_book(u,pg_temp.kan62_payload(12500,25,deduction,10000));
    PERFORM pg_temp.kan62_purchase(a,u,cost,vat,false);
    SELECT jsonb_agg(to_jsonb(j) ORDER BY id) INTO old_a FROM public.journal_entries j WHERE transaction_id=(a->>'transaction_id')::uuid;
    SELECT jsonb_agg(to_jsonb(e) ORDER BY id) INTO event_a FROM public.fixed_asset_events e WHERE asset_id=(a->>'asset_id')::uuid;
    b:=pg_temp.kan62_book(u,pg_temp.kan62_payload(12500,25,deduction,20000,ARRAY[(a->>'asset_id')::uuid]));
    PERFORM pg_temp.kan62_purchase(b,u,cost,vat,false);
    PERFORM pg_temp.kan62_assert((SELECT acquisition_group_id=(b->>'acquisition_group_id')::uuid AND naturally_connected
      AND connected_acquisition_key=b->>'acquisition_group_id'
      AND audit_snapshot->'groupLinks'->0->>'linkedByTransactionId'=b->>'transaction_id'
      FROM public.fixed_assets WHERE id=(a->>'asset_id')::uuid),'A durable membership and audit link after B');
    SELECT jsonb_agg(to_jsonb(j) ORDER BY id) INTO old_b FROM public.journal_entries j WHERE transaction_id=(b->>'transaction_id')::uuid;
    SELECT jsonb_agg(to_jsonb(e) ORDER BY id) INTO event_b FROM public.fixed_asset_events e WHERE asset_id=(b->>'asset_id')::uuid;
    p:=pg_temp.kan62_payload(12500,25,deduction,30000,ARRAY[(a->>'asset_id')::uuid,(b->>'asset_id')::uuid],reclass,'more_than_three_years_or_unknown')
      ||jsonb_build_object('connected_asset_ids',jsonb_build_array(b->>'asset_id'));
    PERFORM pg_temp.kan62_reject_book(u,p||'{"expected_threshold_basis_amount":20000}','23514','bedömningsvärde har ändrats');
    PERFORM pg_temp.kan62_reject_book(u,p||jsonb_build_object('expected_prior_asset_ids',jsonb_build_array(b->>'asset_id')),'23514','delar har ändrats');
    c:=pg_temp.kan62_book(u,p); PERFORM pg_temp.kan62_purchase(c,u,cost,vat,true);
    PERFORM pg_temp.kan62_journal((c->>'reclassification_transaction_id')::uuid,u,'fixed_asset_reclassification',0,
      jsonb_build_array(jsonb_build_array('1220',reclass,0),jsonb_build_array('5410',0,reclass)));
    PERFORM pg_temp.kan62_assert((SELECT count(*)=3 AND bool_and(user_id=u AND naturally_connected
      AND connected_acquisition_key=c->>'acquisition_group_id' AND decision_type='capitalized' AND capitalized_amount=cost)
      FROM public.fixed_assets WHERE acquisition_group_id=(c->>'acquisition_group_id')::uuid),'exactly three persistent group members');
    PERFORM pg_temp.kan62_assert((SELECT count(*)=2 AND sum(amount)=reclass FROM public.fixed_asset_events
      WHERE transaction_id=(c->>'reclassification_transaction_id')::uuid AND event_type='reclassification' AND user_id=u),'exact reclassification events');
    PERFORM pg_temp.kan62_equal((SELECT jsonb_agg(to_jsonb(j) ORDER BY id) FROM public.journal_entries j WHERE transaction_id=(a->>'transaction_id')::uuid),old_a,'A original journal unchanged');
    PERFORM pg_temp.kan62_equal((SELECT jsonb_agg(to_jsonb(j) ORDER BY id) FROM public.journal_entries j WHERE transaction_id=(b->>'transaction_id')::uuid),old_b,'B original journal unchanged');
    PERFORM pg_temp.kan62_equal((SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.fixed_asset_events e WHERE asset_id=(a->>'asset_id')::uuid AND event_type='acquisition'),event_a,'A original event unchanged');
    PERFORM pg_temp.kan62_equal((SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.fixed_asset_events e WHERE asset_id=(b->>'asset_id')::uuid AND event_type='acquisition'),event_b,'B original event unchanged');
    saved:=pg_temp.kan62_snapshot(u); r:=pg_temp.kan62_book(u,p);
    PERFORM pg_temp.kan62_equal(pg_temp.kan62_snapshot(u),saved,'package replay no duplicate reclassification');
    -- Rollback-only reconstruction of the known incomplete legacy metadata.
    PERFORM pg_temp.kan62_guard();
    UPDATE public.fixed_assets SET connection_assessment='standalone',acquisition_group_id=NULL,naturally_connected=false,connected_acquisition_key=NULL WHERE id=(a->>'asset_id')::uuid;
    -- B+C are already capitalized here: provide valid life/amount/member input
    -- so that ONLY the intentionally incomplete historic link is rejected.
    p:=pg_temp.kan62_payload(12500,25,deduction,30000,ARRAY[(b->>'asset_id')::uuid,(c->>'asset_id')::uuid],0,'more_than_three_years_or_unknown')
      ||jsonb_build_object('connected_asset_ids',jsonb_build_array(b->>'asset_id'));
    PERFORM pg_temp.kan62_reject_book(u,p,'23514','äldre paketkoppling');
    PERFORM pg_temp.kan62_guard();
    UPDATE public.fixed_assets SET connection_assessment='connected',acquisition_group_id=(b->>'acquisition_group_id')::uuid,naturally_connected=true,connected_acquisition_key=b->>'acquisition_group_id' WHERE id=(a->>'asset_id')::uuid;

    short_asset:=pg_temp.kan62_book(u,pg_temp.kan62_payload(12500,25,deduction,10000,ARRAY[]::uuid[],0,'max_three_years'));
    long_asset:=pg_temp.kan62_book(u,pg_temp.kan62_payload(25000,25,deduction,20000,ARRAY[(short_asset->>'asset_id')::uuid]));
    r:=pg_temp.kan62_book(u,pg_temp.kan62_payload(12500,25,deduction,30000,
      ARRAY[(short_asset->>'asset_id')::uuid,(long_asset->>'asset_id')::uuid],2*cost,'more_than_three_years_or_unknown')
      ||jsonb_build_object('connected_asset_ids',jsonb_build_array(long_asset->>'asset_id')));
    PERFORM pg_temp.kan62_journal((r->>'reclassification_transaction_id')::uuid,u,'fixed_asset_reclassification',0,
      jsonb_build_array(jsonb_build_array('1220',2*cost,0),jsonb_build_array('5410',0,2*cost)));
    PERFORM pg_temp.kan62_assert((SELECT decision_type='immediate_expense_short_life' AND expensed_amount=cost AND capitalized_amount=0
      FROM public.fixed_assets WHERE id=(short_asset->>'asset_id')::uuid),'short life never reclassified');
    PERFORM pg_temp.kan62_purchase(short_asset,u,cost,vat,false);
    p:=pg_temp.kan62_payload(12500,25,deduction,30000)
      ||'{"connection_assessment":"connected","planned_group_basis_amount":30000}';
    PERFORM pg_temp.kan62_reject_book(u,p,'23514','högst tre år');
    planned:=pg_temp.kan62_book(u,p||'{"useful_life_answer":"more_than_three_years_or_unknown"}');
    PERFORM pg_temp.kan62_purchase(planned,u,cost,vat,true);
    p:=pg_temp.kan62_payload(12500,25,deduction,30000,ARRAY[(planned->>'asset_id')::uuid]);
    PERFORM pg_temp.kan62_reject_book(u,p,'23514','högst tre år');
    r:=pg_temp.kan62_book(u,p||'{"useful_life_answer":"more_than_three_years_or_unknown"}');
    PERFORM pg_temp.kan62_purchase(r,u,cost,vat,true);
    p:=pg_temp.kan62_payload(12500,25,deduction,30000,ARRAY[]::uuid[],0,'max_three_years')
      ||'{"connection_assessment":"connected","planned_group_basis_amount":30000}';
    planned:=pg_temp.kan62_book(u,p); PERFORM pg_temp.kan62_purchase(planned,u,cost,vat,false);
    p:=pg_temp.kan62_payload(12500,25,deduction,30000,ARRAY[(planned->>'asset_id')::uuid],0,'max_three_years');
    PERFORM pg_temp.kan62_reject_book(u,p||'{"expected_threshold_basis_amount":20000}','23514','bedömningsvärde har ändrats');
    r:=pg_temp.kan62_book(u,p); PERFORM pg_temp.kan62_purchase(r,u,cost,vat,false);
    PERFORM pg_temp.kan62_guard();
    UPDATE public.fixed_assets SET audit_snapshot=audit_snapshot #- '{rule,thresholdBasisDefinition}' WHERE id=(planned->>'asset_id')::uuid;
    PERFORM pg_temp.kan62_reject_book(u,p||jsonb_build_object('idempotency_key',gen_random_uuid()),'23514','äldre planerat paketbelopp');
    PERFORM pg_temp.kan62_reject_book(u,pg_temp.kan62_payload(12500,25,deduction,10000,ARRAY[(a->>'asset_id')::uuid],0,NULL,'2025-03-01'),'23514','kopplade inventarier saknas');
    r:=pg_temp.kan62_book(u,pg_temp.kan62_payload(12500,25,deduction,10000,ARRAY[]::uuid[],0,NULL,'2025-03-01'));
    PERFORM pg_temp.kan62_purchase(r,u,cost,vat,false,'2025-03-01');
    PERFORM pg_temp.kan62_assert(r->>'acquisition_group_id' IS NULL,'different year not auto-grouped');
    FOREACH rate IN ARRAY ARRAY[0,6,12,25] LOOP
      basis:=round(12345.67/(1+rate/100.0),2);
      r:=pg_temp.kan62_book(u,pg_temp.kan62_payload(12345.67,rate,deduction,basis));
      PERFORM pg_temp.kan62_purchase(r,u,CASE WHEN deduction='none' THEN 12345.67 ELSE basis END,
        CASE WHEN deduction='none' THEN 0 ELSE 12345.67-basis END,false);
    END LOOP;
    PERFORM pg_temp.kan62_reject_book(u,pg_temp.kan62_payload(100.005,25,deduction,80),'22023','två decimaler');
    PERFORM pg_temp.kan62_reject_book(u,pg_temp.kan62_payload(12500,25,deduction,10000)||'{"supplier_country":"DE"}','23514','varor från utlandet');
    PERFORM pg_temp.kan62_reject_book(u,pg_temp.kan62_payload(12500,25,deduction,10000)||'{"connection_assessment":"uncertain"}','23514','kan inte avgöra');
    PERFORM pg_temp.kan62_reject_book(u,pg_temp.kan62_payload(12500,25,deduction,10000)||'{"supplier_vat_amount":99999}','23514','Momsbeloppet stämmer inte');
    PERFORM pg_temp.kan62_reject_book(u,pg_temp.kan62_payload(12500,25,deduction,10000)||'{"expected_reclassification_amount":1}','23514','Omklassificeringsbeloppet har ändrats');
    PERFORM pg_temp.kan62_reject(u,format('SELECT public.create_correction_transaction_atomic(%L::uuid)',a->>'transaction_id'),'23514','Systemverifikationer');
    PERFORM pg_temp.kan62_reject(u,format('SELECT public.create_correction_transaction_atomic(%L::uuid)',c->>'reclassification_transaction_id'),'23514','Systemverifikationer');
    PERFORM pg_temp.kan62_reject(u,format('SELECT public.update_transaction_safe(%L::uuid,''{"description":"forbidden"}''::jsonb)',a->>'transaction_id'),'42501','Systemverifikationer');

    r:=pg_temp.kan62_book(v,pg_temp.kan62_payload(12500,25,deduction,10000)); group_asset:=r;
    other_before:=pg_temp.kan62_snapshot(u);
    PERFORM pg_temp.kan62_reject_book(v,pg_temp.kan62_payload(12500,25,deduction,20000,ARRAY[(a->>'asset_id')::uuid]),'23514','kopplade inventarier saknas');
    PERFORM pg_temp.kan62_reject_book(v,pg_temp.kan62_payload(12500,25,deduction,10000)
      ||jsonb_build_object('connection_assessment','connected','acquisition_group_id',b->>'acquisition_group_id'),'23514','Anskaffningsgruppen saknas');
    PERFORM pg_temp.kan62_equal(pg_temp.kan62_snapshot(u),other_before,'foreign owner unchanged');
    p:=pg_temp.kan62_payload(12500,25,deduction,10000)||jsonb_build_object('idempotency_key',key);
    r:=pg_temp.kan62_book(v,p); saved:=pg_temp.kan62_book(u,p); key:=gen_random_uuid();
    PERFORM pg_temp.kan62_assert(r->>'asset_id'<>saved->>'asset_id' AND NOT (saved->>'idempotent_replay')::boolean,'owner-scoped idempotency');
    FOREACH legacy_user IN ARRAY ARRAY[u,v] LOOP
      -- Run fixture exercises SELECT RLS only; no depreciation RPC or journal.
      PERFORM pg_temp.kan62_guard();
      INSERT INTO public.fixed_asset_depreciation_runs(user_id,fiscal_year,transaction_id,basis_amount,depreciation_amount,
        rule_year,rule_version,price_base_amount,half_price_base_amount,full_writeoff_applied,audit_snapshot)
      SELECT legacy_user,2026,id,1,1,2026,'synthetic-RLS-only',59200,29600,true,'{}'::jsonb FROM public.transactions WHERE user_id=legacy_user LIMIT 1;
      r:=pg_temp.kan62_book(legacy_user,pg_temp.kan62_payload(12500,25,deduction,10000)||'{"connection_assessment":"connected"}');
      PERFORM pg_temp.kan62_auth(legacy_user);
      FOREACH tab IN ARRAY ARRAY['fixed_assets','fixed_asset_acquisition_groups','fixed_asset_events','fixed_asset_depreciation_runs','transactions','journal_entries'] LOOP
        EXECUTE format('SELECT count(*)>0 AND bool_and(user_id=$1) FROM public.%I',tab) INTO own_visible USING legacy_user;
        PERFORM pg_temp.kan62_assert(own_visible,'positive own and negative foreign RLS '||tab);
      END LOOP;
      RESET ROLE;
    END LOOP;
    FOREACH tab IN ARRAY ARRAY['fixed_assets','fixed_asset_acquisition_groups','fixed_asset_events','fixed_asset_depreciation_runs','fixed_asset_acquisition_idempotency'] LOOP
      PERFORM pg_temp.kan62_reject(u,format('UPDATE public.%I SET user_id=user_id WHERE false',tab),'42501','permission denied for table '||tab);
      PERFORM pg_temp.kan62_reject(u,format('DELETE FROM public.%I WHERE false',tab),'42501','permission denied for table '||tab);
      PERFORM pg_temp.kan62_reject(u,format('INSERT INTO public.%I DEFAULT VALUES',tab),'42501','permission denied for table '||tab);
    END LOOP;
    PERFORM pg_temp.kan62_reject(u,'SELECT * FROM public.fixed_asset_acquisition_idempotency','42501','permission denied for table fixed_asset_acquisition_idempotency');
    FOREACH role_name IN ARRAY ARRAY['authenticated','anon','service_role'] LOOP
      PERFORM pg_temp.kan62_reject(u,'SELECT public.book_fixed_asset_acquisition_atomic_unchecked_kan54(''{}''::jsonb)','42501','permission denied for function book_fixed_asset_acquisition_atomic_unchecked_kan54',role_name);
      PERFORM pg_temp.kan62_reject(u,'SELECT public.lock_accounting_year_boundary(NULL,false)','42501','permission denied for function lock_accounting_year_boundary',role_name);
    END LOOP;
    PERFORM pg_temp.kan62_reject(u,'SELECT public.book_fixed_asset_acquisition_atomic(''{}''::jsonb)','42501','permission denied for function book_fixed_asset_acquisition_atomic','anon');
    PERFORM pg_temp.kan62_reject(u,'SELECT public.fixed_asset_payment_account(NULL,''business_payment_account'')','42501','permission denied for function fixed_asset_payment_account');
    PERFORM pg_temp.kan62_reject(u,'SELECT public.assert_fixed_asset_vat_deduction_allowed(NULL,''full'')','42501','permission denied for function assert_fixed_asset_vat_deduction_allowed');
    PERFORM pg_temp.kan62_reject(u,'CREATE FUNCTION public.kan62_forbidden() RETURNS int LANGUAGE sql AS ''SELECT 1''','42501','permission denied for schema public');
    PERFORM pg_temp.kan62_reject(u,'CREATE FUNCTION auth.kan62_forbidden() RETURNS int LANGUAGE sql AS ''SELECT 1''','42501','permission denied for schema auth');
    PERFORM pg_temp.kan62_reject_book(NULL,pg_temp.kan62_payload(12500,25,'none',10000),'28000','giltig användarkontext');
    FOREACH period_status IN ARRAY ARRAY['closed','declared'] LOOP
      purchased:=CASE WHEN period_status='closed' THEN '2026-04-01' ELSE '2026-05-01' END;
      PERFORM pg_temp.kan62_guard();
      INSERT INTO public.vat_periods(user_id,period_start,period_end,period_type)
        VALUES(v,purchased::date,(purchased::date+interval '1 month - 1 day')::date,'month') RETURNING id INTO period_id;
      PERFORM pg_temp.kan62_auth(v); PERFORM pg_temp.kan62_guard();
      r:=public.close_vat_period_atomic(period_id); RESET ROLE;
      PERFORM pg_temp.kan62_assert((r->>'success')::boolean,'real close VAT fixture');
      IF period_status='declared' THEN
        PERFORM pg_temp.kan62_auth(v); PERFORM pg_temp.kan62_guard();
        r:=public.declare_vat_period_atomic(period_id,'2026-06-01'); RESET ROLE;
        PERFORM pg_temp.kan62_assert((r->>'success')::boolean,'real declare VAT fixture');
      END IF;
      PERFORM pg_temp.kan62_reject_book(v,pg_temp.kan62_payload(12500,25,deduction,10000,ARRAY[]::uuid[],0,NULL,purchased),'23514','redan stängd eller deklarerad');
      PERFORM pg_temp.kan62_reject_book(v,pg_temp.kan62_payload(12500,25,deduction,20000,ARRAY[(group_asset->>'asset_id')::uuid],0,NULL,purchased),'23514','redan stängd eller deklarerad');
    END LOOP;
    -- Open overlapping periods must stop BEFORE consuming a verification number.
    PERFORM pg_temp.kan62_guard();
    INSERT INTO public.vat_periods(user_id,period_start,period_end,period_type) VALUES(v,'2026-06-01','2026-06-30','month'),(v,'2026-06-01','2026-08-31','quarter');
    PERFORM pg_temp.kan62_reject_book(v,pg_temp.kan62_payload(12500,25,deduction,10000,ARRAY[]::uuid[],0,NULL,'2026-06-01'),'23514','överlappande SoloLedger-momsperioder');
    PERFORM pg_temp.kan62_guard(); INSERT INTO public.closed_years(user_id,year) VALUES(v,2026);
    PERFORM pg_temp.kan62_reject_book(v,pg_temp.kan62_payload(12500,25,deduction,10000),'23514','Räkenskapsår 2026 är låst');
  END LOOP;
  PERFORM pg_temp.kan62_reject_book(unknown_user,pg_temp.kan62_payload(12500,25,'full',10000),'23514','Företagsprofilen tillåter inte');
  r:=pg_temp.kan62_book(unknown_user,pg_temp.kan62_payload(12500,25,'none',10000)); PERFORM pg_temp.kan62_purchase(r,unknown_user,12500,0,false);
  PERFORM pg_temp.kan62_guard(); CREATE TEMP TABLE journal_entries(fake boolean);
  r:=pg_temp.kan62_book(unknown_user,pg_temp.kan62_payload(12500,25,'none',10000));
  PERFORM pg_temp.kan62_purchase(r,unknown_user,12500,0,false);
  PERFORM pg_temp.kan62_assert((SELECT count(*)=0 FROM pg_temp.journal_entries),'temporary shadow table unused by public RPC');
  legacy_user:=(legacy->>'user_id')::uuid;
  PERFORM pg_temp.kan62_assert(NOT ((legacy->'payload') ? 'booking_contract_version'),'genuine old payload');
  PERFORM pg_temp.kan62_guard(); UPDATE public.profiles SET default_deduction_entitlement='none' WHERE id=legacy_user;
  saved:=pg_temp.kan62_snapshot(legacy_user); r:=pg_temp.kan62_book(legacy_user,legacy->'payload');
  PERFORM pg_temp.kan62_equal(r-'idempotent_replay',(legacy->'result')-'idempotent_replay','old replay receipt after profile change');
  PERFORM pg_temp.kan62_equal(pg_temp.kan62_snapshot(legacy_user),saved,'old replay no extra rows');
  PERFORM pg_temp.kan62_reject_book(legacy_user,(legacy->'payload')||'{"gross_amount":12501}','23505','Idempotency-nyckeln har redan använts');
  PERFORM pg_temp.kan62_reject_book(legacy_user,pg_temp.kan62_payload(12500,25,'full',10000),'23514','Företagsprofilen tillåter inte');
END $tests$;
ROLLBACK;
\echo 'KAN62 rollback SQL PASS; separate concurrency suite remains mandatory'
