-- Local disposable test helpers ONLY. All are SECURITY INVOKER.
\ir kan62_identity_guard.sql
CREATE FUNCTION pg_temp.kan62_guard() RETURNS void LANGUAGE plpgsql AS $$
DECLARE expected_oid text := current_setting('sololedger.kan62_expected_oid',true);
  marker text := current_setting('sololedger.kan62_expected_marker',true);
BEGIN
  IF current_database() <> 'sololedger_kan62_disposable_20261021'
    OR host(inet_server_addr()) IS DISTINCT FROM '127.0.0.1' OR inet_server_port() IS DISTINCT FROM 5432
    OR current_setting('server_version_num')::integer/10000 <> 17 OR session_user <> 'postgres'
    OR current_setting('sololedger.kan62_test_approved',true) IS DISTINCT FROM 'yes'
    OR expected_oid IS NULL OR expected_oid !~ '^[1-9][0-9]*$'
    OR marker IS NULL OR marker !~ '^KAN62 disposable synthetic only [0-9a-f-]{36}$'
    OR (SELECT oid::text FROM pg_database WHERE datname=current_database()) IS DISTINCT FROM expected_oid
    OR (SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname=current_database()) IS DISTINCT FROM marker
  THEN RAISE EXCEPTION 'KAN62 isolated database identity mismatch' USING ERRCODE='42501'; END IF;
END $$;
SELECT pg_temp.kan62_guard();

CREATE FUNCTION pg_temp.kan62_assert(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF NOT coalesce(ok,false) THEN RAISE EXCEPTION 'KAN62 assertion: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.kan62_equal(actual jsonb, expected jsonb, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'KAN62 % actual %, expected %',label,actual,expected; END IF; END $$;

CREATE FUNCTION pg_temp.kan62_snapshot(u uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE tab text; rows jsonb; result jsonb := '{}'::jsonb;
BEGIN
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Snapshot requires test administrator'; END IF;
  FOREACH tab IN ARRAY ARRAY['transactions','journal_entries','fixed_asset_acquisition_groups','fixed_assets',
    'fixed_asset_events','fixed_asset_acquisition_idempotency','fixed_asset_depreciation_runs','ver_nr_sequences',
    'vat_periods','closed_years'] LOOP
    EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),''[]''::jsonb) FROM public.%I t WHERE user_id=$1',tab) INTO rows USING u;
    result := result || jsonb_build_object(tab,rows);
  END LOOP;
  RETURN result || jsonb_build_object('profile',(SELECT to_jsonb(p) FROM public.profiles p WHERE id=u),
    'paymentRoles',(SELECT jsonb_agg(to_jsonb(r) ORDER BY role) FROM public.company_payment_account_roles r WHERE user_id=u));
END $$;

CREATE FUNCTION pg_temp.kan62_auth(u uuid, role_name text DEFAULT 'authenticated') RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.kan62_guard();
  IF role_name NOT IN ('authenticated','anon','service_role') THEN RAISE EXCEPTION 'Invalid test role'; END IF;
  PERFORM set_config('request.jwt.claim.sub',coalesce(u::text,''),true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role',role_name)::text,true);
  EXECUTE format('SET LOCAL ROLE %I',role_name);
  IF current_user <> role_name THEN RAISE EXCEPTION 'Client role not established'; END IF;
  IF role_name='authenticated' AND auth.uid() IS DISTINCT FROM u THEN RAISE EXCEPTION 'Wrong auth.uid'; END IF;
END $$;

CREATE FUNCTION pg_temp.kan62_book(u uuid, payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE result jsonb;
BEGIN
  PERFORM pg_temp.kan62_auth(u);
  PERFORM pg_temp.kan62_guard();
  IF current_user <> 'authenticated' THEN RAISE EXCEPTION 'Booking must run as authenticated'; END IF;
  result := public.book_fixed_asset_acquisition_atomic(payload);
  RAISE NOTICE 'KAN62_CLIENT_PASS role=% uid=% replay=%',current_user,auth.uid(),result->>'idempotent_replay';
  RESET ROLE;
  PERFORM pg_temp.kan62_assert((result->>'success')::boolean,'RPC success');
  RETURN result;
END $$;

CREATE FUNCTION pg_temp.kan62_reject(u uuid, sql_text text, expected_state text, pattern text,
  role_name text DEFAULT 'authenticated') RETURNS void LANGUAGE plpgsql AS $$
DECLARE before_state jsonb; code text; message text;
BEGIN
  before_state := pg_temp.kan62_snapshot(u);
  BEGIN
    PERFORM pg_temp.kan62_auth(u,role_name);
    PERFORM pg_temp.kan62_guard();
    EXECUTE sql_text;
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS code=RETURNED_SQLSTATE,message=MESSAGE_TEXT;
  END;
  RESET ROLE;
  PERFORM pg_temp.kan62_assert(code=expected_state AND message ~ pattern,
    format('expected %s / %s, got %s / %s',expected_state,pattern,code,message));
  PERFORM pg_temp.kan62_equal(pg_temp.kan62_snapshot(u),before_state,'rejected call leaves every protected row unchanged');
  RAISE NOTICE 'KAN62_REJECT_PASS role=% state=% cause=%',role_name,code,message;
END $$;
CREATE FUNCTION pg_temp.kan62_reject_book(u uuid,payload jsonb,expected_state text,pattern text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM pg_temp.kan62_reject(u,format('SELECT public.book_fixed_asset_acquisition_atomic(%L::jsonb)',payload::text),expected_state,pattern); END $$;

CREATE FUNCTION pg_temp.kan62_setup(u uuid,deduction text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.kan62_guard();
  INSERT INTO auth.users(id) VALUES(u);
  INSERT INTO public.profiles(id,email,default_deduction_entitlement) VALUES(u,'kan62-'||u||'@example.test',deduction);
  INSERT INTO public.accounts(id,user_id,name,debit_account,credit_account) VALUES
    ('kan62_bank',u,'Synthetic bank','1930','3001'),('kan62_cost',u,'Synthetic equipment','5410','1930'),
    ('kan62_asset',u,'Synthetic asset','1220','1930'),('kan62_vat',u,'Synthetic input VAT','2641','1930'),
    ('kan62_deposit',u,'Synthetic owner deposit','1930','2018');
  INSERT INTO public.company_payment_account_roles(user_id,role,account_number) VALUES(u,'business_payment_account','1930');
END $$;

CREATE FUNCTION pg_temp.kan62_payload(gross numeric,rate numeric,deduction text,basis numeric,
  prior uuid[] DEFAULT ARRAY[]::uuid[],reclass numeric DEFAULT 0,life text DEFAULT NULL,
  purchased text DEFAULT '2026-03-01') RETURNS jsonb LANGUAGE sql AS $$
SELECT jsonb_build_object('idempotency_key',gen_random_uuid(),'date',purchased,'description','KAN62 synthetic purchase',
  'supplier_country','SE','gross_amount',gross,'vat_rate',rate,'vat_deduction_entitlement',deduction,
  'payment_account_role','business_payment_account','booking_contract_version','kan62-rule-contract-v1',
  'connection_assessment',CASE WHEN cardinality(prior)>0 THEN 'connected' ELSE 'standalone' END,
  'connected_asset_ids',to_jsonb(prior),'expected_prior_asset_ids',to_jsonb(prior),
  'expected_threshold_basis_amount',basis,'expected_reclassification_amount',reclass,'useful_life_answer',life);
$$;

CREATE FUNCTION pg_temp.kan62_journal(tx uuid,u uuid,source_name text,rate numeric,expected jsonb,
  booked_date date DEFAULT '2026-03-01') RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual jsonb; normalized jsonb;
BEGIN
  SELECT jsonb_agg(jsonb_build_array(account_number,debit,credit) ORDER BY account_number,debit,credit)
    INTO actual FROM public.journal_entries WHERE transaction_id=tx;
  SELECT jsonb_agg(value ORDER BY value->>0,(value->>1)::numeric,(value->>2)::numeric)
    INTO normalized FROM jsonb_array_elements(expected);
  PERFORM pg_temp.kan62_equal(actual,normalized,'exact journal rows/accounts/amounts');
  PERFORM pg_temp.kan62_assert((SELECT count(*)=jsonb_array_length(expected)
    AND count(DISTINCT ver_nr)=1 AND bool_and(user_id=u AND date=booked_date)
    AND sum(debit)=sum(credit) FROM public.journal_entries WHERE transaction_id=tx),'journal count/owner/date/ver/balance');
  PERFORM pg_temp.kan62_assert((SELECT user_id=u AND date=booked_date AND source=source_name AND vat_rate IS NOT DISTINCT FROM rate AND booked
    AND amount=(SELECT sum(debit) FROM public.journal_entries WHERE transaction_id=tx)
    FROM public.transactions WHERE id=tx),'transaction owner/date/source/rate/amount');
END $$;

CREATE FUNCTION pg_temp.kan62_purchase(r jsonb,u uuid,cost numeric,vat numeric,capitalized boolean,
  booked_date date DEFAULT '2026-03-01') RETURNS void LANGUAGE plpgsql AS $$
DECLARE expected jsonb; fa public.fixed_assets%ROWTYPE;
BEGIN
  expected := jsonb_build_array(jsonb_build_array(CASE WHEN capitalized THEN '1220' ELSE '5410' END,cost,0),
    jsonb_build_array('1930',0,cost+vat));
  IF vat>0 THEN expected := expected || jsonb_build_array(jsonb_build_array('2641',vat,0)); END IF;
  PERFORM pg_temp.kan62_journal((r->>'transaction_id')::uuid,u,'fixed_asset',(r->>'vat_rate')::numeric,expected,booked_date);
  SELECT * INTO STRICT fa FROM public.fixed_assets WHERE id=(r->>'asset_id')::uuid;
  PERFORM pg_temp.kan62_assert((SELECT min(ver_nr)=(r->>'ver_nr')::integer FROM public.journal_entries
    WHERE transaction_id=(r->>'transaction_id')::uuid),'receipt verification number');
  PERFORM pg_temp.kan62_assert(fa.user_id=u AND fa.acquisition_transaction_id=(r->>'transaction_id')::uuid
    AND fa.taxable_base_amount=(r->>'taxable_base_amount')::numeric
    AND fa.threshold_basis_amount=(r->>'threshold_basis_amount')::numeric
    AND fa.deductible_vat_amount=vat AND fa.capitalized_amount+fa.expensed_amount=cost
    AND (r->>'gross_amount')::numeric=cost+vat
    AND (fa.audit_snapshot->'journal'->>'debitTotal')::numeric=cost+vat
    AND (fa.audit_snapshot->'journal'->>'creditTotal')::numeric=cost+vat,'registry receipt agreement');
  PERFORM pg_temp.kan62_assert((SELECT count(*)=1 AND bool_and(user_id=u AND amount=cost AND event_date=booked_date
    AND audit_snapshot->'journal'->>'transactionId'=r->>'transaction_id'
    AND (audit_snapshot->'facts'->>'deductibleVatAmount')::numeric=vat)
    FROM public.fixed_asset_events WHERE asset_id=fa.id AND event_type='acquisition'),'one acquisition event and audit');
END $$;

-- Namespace permission is confined to THIS session's temporary schema; no role changes.
DO $$ BEGIN EXECUTE format('GRANT USAGE ON SCHEMA %I TO authenticated,anon,service_role',
  (SELECT nspname FROM pg_namespace WHERE oid=pg_my_temp_schema())); END $$;
