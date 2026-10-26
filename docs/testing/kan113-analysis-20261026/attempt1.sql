set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout='25s'; SET LOCAL lock_timeout='5s';
DO $guard$ BEGIN
 IF current_database()<>'postgres' OR session_user<>'postgres' OR current_setting('session_authorization')<>'postgres' THEN RAISE EXCEPTION 'Wrong identity'; END IF;
END $guard$;
SELECT jsonb_build_object('identity',jsonb_build_object('database',current_database(),'user',session_user,'pid',pg_backend_pid(),'utc',clock_timestamp(),'stockholm',clock_timestamp() AT TIME ZONE 'Europe/Stockholm'));
SELECT pg_backend_pid() AS verified_pid gset
CREATE FUNCTION pg_temp.attempt(q text) RETURNS jsonb LANGUAGE plpgsql AS $fn$
DECLARE r jsonb; BEGIN EXECUTE q INTO r; RETURN jsonb_build_object('ok',true,'value',r); EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok',false,'code',SQLSTATE,'message',SQLERRM); END $fn$;
CREATE FUNCTION pg_temp.digest_public() RETURNS jsonb LANGUAGE plpgsql AS $fn$
DECLARE r record; d text; v jsonb:='{}'; BEGIN FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename LOOP
 EXECUTE format('SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'')) FROM public.%I t',r.tablename) INTO d;
 v:=v||jsonb_build_object(r.tablename,d); END LOOP; RETURN v; END $fn$;
SELECT jsonb_build_object('before',pg_temp.digest_public(),'auth_count',(SELECT count(*) FROM auth.users));
DO $hash$ BEGIN
 IF (SELECT md5(replace(pg_get_functiondef(oid),E'\r','')) FROM pg_proc WHERE oid='public.assert_vat_year_coverage(integer)'::regprocedure)<>'4e4cd485f4b36e7ae0eebc4d86d6c9a9' THEN RAISE EXCEPTION 'Definition changed'; END IF;
IF (SELECT md5(replace(pg_get_functiondef(oid),E'\r','')) FROM pg_proc WHERE oid='public.close_year_atomic(integer)'::regprocedure)<>'9a93f74704913fc47ed5fff93223e236' THEN RAISE EXCEPTION 'Definition changed'; END IF;
IF (SELECT md5(replace(pg_get_functiondef(oid),E'\r','')) FROM pg_proc WHERE oid='public.close_year_unchecked_inventory(integer)'::regprocedure)<>'b9416dc08d6dabfe1a12446260524c6d' THEN RAISE EXCEPTION 'Definition changed'; END IF;
END $hash$;
SAVEPOINT synthetic;
RESET ROLE; INSERT INTO auth.users(id) VALUES('fb814dde-73df-4483-979b-157f457b9591');
 INSERT INTO public.profiles(id,email,company_name,vat_status,vat_period_type,vat_management_from,domestic_sales_vat_treatment,default_deduction_entitlement)
 VALUES('fb814dde-73df-4483-979b-157f457b9591','kan113-fb814dde-73df-4483-979b-157f457b9591@example.invalid','KAN113 rollback synthetic','not_registered',NULL,NULL,'taxable','full');
 INSERT INTO public.accounts(id,user_id,name,debit_account,credit_account,default_vat_rate) VALUES('kan113-sale','fb814dde-73df-4483-979b-157f457b9591','KAN113 synthetic','1930','3010',0);
 INSERT INTO public.company_payment_account_roles(user_id,role,account_number) VALUES('fb814dde-73df-4483-979b-157f457b9591','business_payment_account','1930');
 SET LOCAL ROLE authenticated;
 SELECT set_config('request.jwt.claim.sub','fb814dde-73df-4483-979b-157f457b9591',true),set_config('request.jwt.claims','{"sub":"fb814dde-73df-4483-979b-157f457b9591","role":"authenticated"}'::jsonb::text,true);
SELECT jsonb_build_object('case','no-vat-2025-book','result',pg_temp.attempt('SELECT public.book_transaction_atomic(''{"idempotency_key":"bbcfe5fc-6164-47b5-82e4-7338d189f32c","date":"2025-01-02","description":"KAN113 rollback synthetic","type":"kan113-sale","amount":100,"vat_rate":0,"ne_sales_basis":"taxable","ne_sales_basis_confirmed":true}''::jsonb)'));
SELECT jsonb_build_object('case','no-vat-2025-lock','result',pg_temp.attempt('SELECT public.close_year_atomic(2025)'));
SELECT jsonb_build_object('case','no-vat-2025-relock','result',pg_temp.attempt('SELECT public.close_year_atomic(2025)'));
SELECT jsonb_build_object('case','no-vat-2025-post-lock-book','result',pg_temp.attempt('SELECT public.book_transaction_atomic(''{"idempotency_key":"4bc95b2b-d2ff-44b8-af73-b3b54e8c92eb","date":"2025-01-02","description":"KAN113 rollback synthetic","type":"kan113-sale","amount":100,"vat_rate":0,"ne_sales_basis":"taxable","ne_sales_basis_confirmed":true}''::jsonb)'));
SELECT jsonb_build_object('case','no-vat-2025-state','result',pg_temp.attempt('SELECT jsonb_build_object(''locks'',(SELECT jsonb_agg(year) FROM public.closed_years WHERE user_id=''fb814dde-73df-4483-979b-157f457b9591''),''transactions'',(SELECT count(*) FROM public.transactions WHERE user_id=''fb814dde-73df-4483-979b-157f457b9591''),''debit'',(SELECT sum(debit) FROM public.journal_entries WHERE user_id=''fb814dde-73df-4483-979b-157f457b9591''),''credit'',(SELECT sum(credit) FROM public.journal_entries WHERE user_id=''fb814dde-73df-4483-979b-157f457b9591''))'));
RESET ROLE; INSERT INTO auth.users(id) VALUES('3e775ca1-0e1c-4e91-ab24-66a32e78becb');
 INSERT INTO public.profiles(id,email,company_name,vat_status,vat_period_type,vat_management_from,domestic_sales_vat_treatment,default_deduction_entitlement)
 VALUES('3e775ca1-0e1c-4e91-ab24-66a32e78becb','kan113-3e775ca1-0e1c-4e91-ab24-66a32e78becb@example.invalid','KAN113 rollback synthetic','not_registered',NULL,NULL,'taxable','full');
 INSERT INTO public.accounts(id,user_id,name,debit_account,credit_account,default_vat_rate) VALUES('kan113-sale','3e775ca1-0e1c-4e91-ab24-66a32e78becb','KAN113 synthetic','1930','3010',0);
 INSERT INTO public.company_payment_account_roles(user_id,role,account_number) VALUES('3e775ca1-0e1c-4e91-ab24-66a32e78becb','business_payment_account','1930');
 SET LOCAL ROLE authenticated;
 SELECT set_config('request.jwt.claim.sub','3e775ca1-0e1c-4e91-ab24-66a32e78becb',true),set_config('request.jwt.claims','{"sub":"3e775ca1-0e1c-4e91-ab24-66a32e78becb","role":"authenticated"}'::jsonb::text,true);
SELECT jsonb_build_object('case','no-vat-2026-book','result',pg_temp.attempt('SELECT public.book_transaction_atomic(''{"idempotency_key":"37c965cb-6c56-4150-925d-d35a387ed5af","date":"2026-01-02","description":"KAN113 rollback synthetic","type":"kan113-sale","amount":100,"vat_rate":0,"ne_sales_basis":"taxable","ne_sales_basis_confirmed":true}''::jsonb)'));
SELECT jsonb_build_object('case','no-vat-2026-lock','result',pg_temp.attempt('SELECT public.close_year_atomic(2026)'));
SELECT jsonb_build_object('case','no-vat-2026-relock','result',pg_temp.attempt('SELECT public.close_year_atomic(2026)'));
SELECT jsonb_build_object('case','no-vat-2026-post-lock-book','result',pg_temp.attempt('SELECT public.book_transaction_atomic(''{"idempotency_key":"82033bb3-ed99-4cc5-a23a-50ed950cf466","date":"2026-01-02","description":"KAN113 rollback synthetic","type":"kan113-sale","amount":100,"vat_rate":0,"ne_sales_basis":"taxable","ne_sales_basis_confirmed":true}''::jsonb)'));
SELECT jsonb_build_object('case','no-vat-2026-state','result',pg_temp.attempt('SELECT jsonb_build_object(''locks'',(SELECT jsonb_agg(year) FROM public.closed_years WHERE user_id=''3e775ca1-0e1c-4e91-ab24-66a32e78becb''),''transactions'',(SELECT count(*) FROM public.transactions WHERE user_id=''3e775ca1-0e1c-4e91-ab24-66a32e78becb''),''debit'',(SELECT sum(debit) FROM public.journal_entries WHERE user_id=''3e775ca1-0e1c-4e91-ab24-66a32e78becb''),''credit'',(SELECT sum(credit) FROM public.journal_entries WHERE user_id=''3e775ca1-0e1c-4e91-ab24-66a32e78becb''))'));
RESET ROLE; INSERT INTO auth.users(id) VALUES('ba8a30a3-9b9c-496f-81d7-282f3098e818');
 INSERT INTO public.profiles(id,email,company_name,vat_status,vat_period_type,vat_management_from,domestic_sales_vat_treatment,default_deduction_entitlement)
 VALUES('ba8a30a3-9b9c-496f-81d7-282f3098e818','kan113-ba8a30a3-9b9c-496f-81d7-282f3098e818@example.invalid','KAN113 rollback synthetic','not_registered',NULL,NULL,'taxable','full');
 INSERT INTO public.accounts(id,user_id,name,debit_account,credit_account,default_vat_rate) VALUES('kan113-sale','ba8a30a3-9b9c-496f-81d7-282f3098e818','KAN113 synthetic','1930','3010',0);
 INSERT INTO public.company_payment_account_roles(user_id,role,account_number) VALUES('ba8a30a3-9b9c-496f-81d7-282f3098e818','business_payment_account','1930');
 SET LOCAL ROLE authenticated;
 SELECT set_config('request.jwt.claim.sub','ba8a30a3-9b9c-496f-81d7-282f3098e818',true),set_config('request.jwt.claims','{"sub":"ba8a30a3-9b9c-496f-81d7-282f3098e818","role":"authenticated"}'::jsonb::text,true);
SELECT jsonb_build_object('case','no-vat-2027-book','result',pg_temp.attempt('SELECT public.book_transaction_atomic(''{"idempotency_key":"6368c692-9aab-4a30-9da7-43d5621a6f38","date":"2027-01-02","description":"KAN113 rollback synthetic","type":"kan113-sale","amount":100,"vat_rate":0,"ne_sales_basis":"taxable","ne_sales_basis_confirmed":true}''::jsonb)'));
SELECT jsonb_build_object('case','no-vat-2027-lock','result',pg_temp.attempt('SELECT public.close_year_atomic(2027)'));
SELECT jsonb_build_object('case','no-vat-2027-relock','result',pg_temp.attempt('SELECT public.close_year_atomic(2027)'));
SELECT jsonb_build_object('case','no-vat-2027-post-lock-book','result',pg_temp.attempt('SELECT public.book_transaction_atomic(''{"idempotency_key":"d0f3c5b8-30f1-4239-a608-ff05ac75adbf","date":"2027-01-02","description":"KAN113 rollback synthetic","type":"kan113-sale","amount":100,"vat_rate":0,"ne_sales_basis":"taxable","ne_sales_basis_confirmed":true}''::jsonb)'));
SELECT jsonb_build_object('case','no-vat-2027-state','result',pg_temp.attempt('SELECT jsonb_build_object(''locks'',(SELECT jsonb_agg(year) FROM public.closed_years WHERE user_id=''ba8a30a3-9b9c-496f-81d7-282f3098e818''),''transactions'',(SELECT count(*) FROM public.transactions WHERE user_id=''ba8a30a3-9b9c-496f-81d7-282f3098e818''),''debit'',(SELECT sum(debit) FROM public.journal_entries WHERE user_id=''ba8a30a3-9b9c-496f-81d7-282f3098e818''),''credit'',(SELECT sum(credit) FROM public.journal_entries WHERE user_id=''ba8a30a3-9b9c-496f-81d7-282f3098e818''))'));
RESET ROLE; INSERT INTO auth.users(id) VALUES('d285fdee-e3e3-451c-9bd4-33d0c5f032f2');
 INSERT INTO public.profiles(id,email,company_name,vat_status,vat_period_type,vat_management_from,domestic_sales_vat_treatment,default_deduction_entitlement)
 VALUES('d285fdee-e3e3-451c-9bd4-33d0c5f032f2','kan113-d285fdee-e3e3-451c-9bd4-33d0c5f032f2@example.invalid','KAN113 rollback synthetic','registered','year','2025-01-01','taxable','full');
 INSERT INTO public.accounts(id,user_id,name,debit_account,credit_account,default_vat_rate) VALUES('kan113-sale','d285fdee-e3e3-451c-9bd4-33d0c5f032f2','KAN113 synthetic','1930','3010',0);
 INSERT INTO public.company_payment_account_roles(user_id,role,account_number) VALUES('d285fdee-e3e3-451c-9bd4-33d0c5f032f2','business_payment_account','1930');
 SET LOCAL ROLE authenticated;
 SELECT set_config('request.jwt.claim.sub','d285fdee-e3e3-451c-9bd4-33d0c5f032f2',true),set_config('request.jwt.claims','{"sub":"d285fdee-e3e3-451c-9bd4-33d0c5f032f2","role":"authenticated"}'::jsonb::text,true);
SELECT jsonb_build_object('case','vat-2025-book','result',pg_temp.attempt('SELECT public.book_transaction_atomic(''{"idempotency_key":"6c88fc5e-9a33-49eb-9deb-5855729d5123","date":"2025-01-02","description":"KAN113 rollback synthetic","type":"kan113-sale","amount":100,"vat_rate":0,"ne_sales_basis":"taxable","ne_sales_basis_confirmed":true}''::jsonb)'));
SELECT jsonb_build_object('case','vat-2025-missing-period','result',pg_temp.attempt('SELECT public.close_year_atomic(2025)'));
SELECT jsonb_build_object('case','vat-2025-ensure','result',pg_temp.attempt('SELECT public.ensure_vat_periods(''2025-12-31'')'));
SELECT jsonb_build_object('case','vat-2025-open-period','result',pg_temp.attempt('SELECT public.close_year_atomic(2025)'));
SELECT jsonb_build_object('case','vat-2025-close-period','result',pg_temp.attempt('SELECT public.close_vat_period_atomic((SELECT id FROM public.vat_periods WHERE user_id=''d285fdee-e3e3-451c-9bd4-33d0c5f032f2'' AND period_start=''2025-01-01''))'));
SELECT jsonb_build_object('case','vat-2025-lock','result',pg_temp.attempt('SELECT public.close_year_atomic(2025)'));
SELECT jsonb_build_object('case','vat-2025-relock','result',pg_temp.attempt('SELECT public.close_year_atomic(2025)'));
SELECT jsonb_build_object('case','vat-2025-post-lock-book','result',pg_temp.attempt('SELECT public.book_transaction_atomic(''{"idempotency_key":"d864e3d0-0de5-4f74-af01-9a692cbcf13f","date":"2025-01-02","description":"KAN113 rollback synthetic","type":"kan113-sale","amount":100,"vat_rate":0,"ne_sales_basis":"taxable","ne_sales_basis_confirmed":true}''::jsonb)'));
SELECT jsonb_build_object('case','vat-2025-state','result',pg_temp.attempt('SELECT jsonb_build_object(''locks'',(SELECT jsonb_agg(year) FROM public.closed_years WHERE user_id=''d285fdee-e3e3-451c-9bd4-33d0c5f032f2''),''transactions'',(SELECT count(*) FROM public.transactions WHERE user_id=''d285fdee-e3e3-451c-9bd4-33d0c5f032f2''),''debit'',(SELECT sum(debit) FROM public.journal_entries WHERE user_id=''d285fdee-e3e3-451c-9bd4-33d0c5f032f2''),''credit'',(SELECT sum(credit) FROM public.journal_entries WHERE user_id=''d285fdee-e3e3-451c-9bd4-33d0c5f032f2''))'));
RESET ROLE; INSERT INTO auth.users(id) VALUES('ab430705-55b8-41dd-bb9d-2227d5561eab');
 INSERT INTO public.profiles(id,email,company_name,vat_status,vat_period_type,vat_management_from,domestic_sales_vat_treatment,default_deduction_entitlement)
 VALUES('ab430705-55b8-41dd-bb9d-2227d5561eab','kan113-ab430705-55b8-41dd-bb9d-2227d5561eab@example.invalid','KAN113 rollback synthetic','registered','year','2026-01-01','taxable','full');
 INSERT INTO public.accounts(id,user_id,name,debit_account,credit_account,default_vat_rate) VALUES('kan113-sale','ab430705-55b8-41dd-bb9d-2227d5561eab','KAN113 synthetic','1930','3010',0);
 INSERT INTO public.company_payment_account_roles(user_id,role,account_number) VALUES('ab430705-55b8-41dd-bb9d-2227d5561eab','business_payment_account','1930');
 SET LOCAL ROLE authenticated;
 SELECT set_config('request.jwt.claim.sub','ab430705-55b8-41dd-bb9d-2227d5561eab',true),set_config('request.jwt.claims','{"sub":"ab430705-55b8-41dd-bb9d-2227d5561eab","role":"authenticated"}'::jsonb::text,true);
SELECT jsonb_build_object('case','vat-2026-book','result',pg_temp.attempt('SELECT public.book_transaction_atomic(''{"idempotency_key":"d6f68bfb-445e-4e1b-806c-eceb4d5a6693","date":"2026-01-02","description":"KAN113 rollback synthetic","type":"kan113-sale","amount":100,"vat_rate":0,"ne_sales_basis":"taxable","ne_sales_basis_confirmed":true}''::jsonb)'));
SELECT jsonb_build_object('case','vat-2026-missing-period','result',pg_temp.attempt('SELECT public.close_year_atomic(2026)'));
SELECT jsonb_build_object('case','vat-2026-ensure','result',pg_temp.attempt('SELECT public.ensure_vat_periods(''2026-12-31'')'));
SELECT jsonb_build_object('case','vat-2026-open-period','result',pg_temp.attempt('SELECT public.close_year_atomic(2026)'));
SELECT jsonb_build_object('case','vat-2026-close-period','result',pg_temp.attempt('SELECT public.close_vat_period_atomic((SELECT id FROM public.vat_periods WHERE user_id=''ab430705-55b8-41dd-bb9d-2227d5561eab'' AND period_start=''2026-01-01''))'));
SELECT jsonb_build_object('case','vat-2026-lock','result',pg_temp.attempt('SELECT public.close_year_atomic(2026)'));
SELECT jsonb_build_object('case','vat-2026-relock','result',pg_temp.attempt('SELECT public.close_year_atomic(2026)'));
SELECT jsonb_build_object('case','vat-2026-post-lock-book','result',pg_temp.attempt('SELECT public.book_transaction_atomic(''{"idempotency_key":"486d9529-0660-4ea3-829d-4bafb62885fa","date":"2026-01-02","description":"KAN113 rollback synthetic","type":"kan113-sale","amount":100,"vat_rate":0,"ne_sales_basis":"taxable","ne_sales_basis_confirmed":true}''::jsonb)'));
SELECT jsonb_build_object('case','vat-2026-state','result',pg_temp.attempt('SELECT jsonb_build_object(''locks'',(SELECT jsonb_agg(year) FROM public.closed_years WHERE user_id=''ab430705-55b8-41dd-bb9d-2227d5561eab''),''transactions'',(SELECT count(*) FROM public.transactions WHERE user_id=''ab430705-55b8-41dd-bb9d-2227d5561eab''),''debit'',(SELECT sum(debit) FROM public.journal_entries WHERE user_id=''ab430705-55b8-41dd-bb9d-2227d5561eab''),''credit'',(SELECT sum(credit) FROM public.journal_entries WHERE user_id=''ab430705-55b8-41dd-bb9d-2227d5561eab''))'));
RESET ROLE; INSERT INTO auth.users(id) VALUES('f01a1f5e-7374-4904-a930-02166f035d50');
 INSERT INTO public.profiles(id,email,company_name,vat_status,vat_period_type,vat_management_from,domestic_sales_vat_treatment,default_deduction_entitlement)
 VALUES('f01a1f5e-7374-4904-a930-02166f035d50','kan113-f01a1f5e-7374-4904-a930-02166f035d50@example.invalid','KAN113 rollback synthetic','registered','year','2027-01-01','taxable','full');
 INSERT INTO public.accounts(id,user_id,name,debit_account,credit_account,default_vat_rate) VALUES('kan113-sale','f01a1f5e-7374-4904-a930-02166f035d50','KAN113 synthetic','1930','3010',0);
 INSERT INTO public.company_payment_account_roles(user_id,role,account_number) VALUES('f01a1f5e-7374-4904-a930-02166f035d50','business_payment_account','1930');
 SET LOCAL ROLE authenticated;
 SELECT set_config('request.jwt.claim.sub','f01a1f5e-7374-4904-a930-02166f035d50',true),set_config('request.jwt.claims','{"sub":"f01a1f5e-7374-4904-a930-02166f035d50","role":"authenticated"}'::jsonb::text,true);
SELECT jsonb_build_object('case','vat-2027-book','result',pg_temp.attempt('SELECT public.book_transaction_atomic(''{"idempotency_key":"5c50fab4-5aa0-4e05-b201-23b2ce13ee07","date":"2027-01-02","description":"KAN113 rollback synthetic","type":"kan113-sale","amount":100,"vat_rate":0,"ne_sales_basis":"taxable","ne_sales_basis_confirmed":true}''::jsonb)'));
SELECT jsonb_build_object('case','vat-2027-missing-period','result',pg_temp.attempt('SELECT public.close_year_atomic(2027)'));
SELECT jsonb_build_object('case','vat-2027-ensure','result',pg_temp.attempt('SELECT public.ensure_vat_periods(''2027-12-31'')'));
SELECT jsonb_build_object('case','vat-2027-open-period','result',pg_temp.attempt('SELECT public.close_year_atomic(2027)'));
SELECT jsonb_build_object('case','vat-2027-close-period','result',pg_temp.attempt('SELECT public.close_vat_period_atomic((SELECT id FROM public.vat_periods WHERE user_id=''f01a1f5e-7374-4904-a930-02166f035d50'' AND period_start=''2027-01-01''))'));
SELECT jsonb_build_object('case','vat-2027-lock','result',pg_temp.attempt('SELECT public.close_year_atomic(2027)'));
SELECT jsonb_build_object('case','vat-2027-relock','result',pg_temp.attempt('SELECT public.close_year_atomic(2027)'));
SELECT jsonb_build_object('case','vat-2027-post-lock-book','result',pg_temp.attempt('SELECT public.book_transaction_atomic(''{"idempotency_key":"6bd4c9f3-1c9e-4555-a4ec-f74121ec0b28","date":"2027-01-02","description":"KAN113 rollback synthetic","type":"kan113-sale","amount":100,"vat_rate":0,"ne_sales_basis":"taxable","ne_sales_basis_confirmed":true}''::jsonb)'));
SELECT jsonb_build_object('case','vat-2027-state','result',pg_temp.attempt('SELECT jsonb_build_object(''locks'',(SELECT jsonb_agg(year) FROM public.closed_years WHERE user_id=''f01a1f5e-7374-4904-a930-02166f035d50''),''transactions'',(SELECT count(*) FROM public.transactions WHERE user_id=''f01a1f5e-7374-4904-a930-02166f035d50''),''debit'',(SELECT sum(debit) FROM public.journal_entries WHERE user_id=''f01a1f5e-7374-4904-a930-02166f035d50''),''credit'',(SELECT sum(credit) FROM public.journal_entries WHERE user_id=''f01a1f5e-7374-4904-a930-02166f035d50''))'));
RESET ROLE;
SELECT jsonb_build_object('same_session',pg_backend_pid()=:verified_pid);
ROLLBACK TO SAVEPOINT synthetic;
SELECT jsonb_build_object('after',pg_temp.digest_public(),'auth_count',(SELECT count(*) FROM auth.users));
SELECT jsonb_build_object('residual_auth',(SELECT count(*) FROM auth.users WHERE id IN ('fb814dde-73df-4483-979b-157f457b9591','3e775ca1-0e1c-4e91-ab24-66a32e78becb','ba8a30a3-9b9c-496f-81d7-282f3098e818','d285fdee-e3e3-451c-9bd4-33d0c5f032f2','ab430705-55b8-41dd-bb9d-2227d5561eab','f01a1f5e-7374-4904-a930-02166f035d50')),'residual_profiles',(SELECT count(*) FROM public.profiles WHERE id IN ('fb814dde-73df-4483-979b-157f457b9591','3e775ca1-0e1c-4e91-ab24-66a32e78becb','ba8a30a3-9b9c-496f-81d7-282f3098e818','d285fdee-e3e3-451c-9bd4-33d0c5f032f2','ab430705-55b8-41dd-bb9d-2227d5561eab','f01a1f5e-7374-4904-a930-02166f035d50')),'same_session_after',pg_backend_pid()=:verified_pid);
ROLLBACK;