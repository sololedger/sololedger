BEGIN;
SELECT set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
INSERT INTO auth.users(id) VALUES(auth.uid());
CREATE TEMP TABLE ctx AS SELECT auth.uid() AS u;
INSERT INTO public.vat_periods(user_id,period_start,period_end,period_type) SELECT u,current_date,current_date,'month' FROM ctx;
CREATE TEMP TABLE result AS SELECT public.import_sie_batch(jsonb_build_object(
'filename','KAN71-concurrency.se','file_hash',gen_random_uuid()::text,'fiscal_year',extract(year from current_date)::int,
'opening_balances','[]'::jsonb,'previous_year_result_balances','[]'::jsonb,
'verifications',jsonb_build_array(jsonb_build_object('series','A','ver_number',1,'date',current_date,'description','Synthetic concurrency sale',
'rows',jsonb_build_array(jsonb_build_object('account_number','1930','amount',1250),jsonb_build_object('account_number','3010','amount',-1000),jsonb_build_object('account_number','2611','amount',-250)))))) AS data FROM ctx;
-- A separate batch preserves a nonzero closing candidate after the first undo.
SELECT public.import_sie_batch(jsonb_build_object(
'filename','KAN71-independent.se','file_hash',gen_random_uuid()::text,'fiscal_year',extract(year from current_date)::int,
'opening_balances','[]'::jsonb,'previous_year_result_balances','[]'::jsonb,
'verifications',jsonb_build_array(jsonb_build_object('series','A','ver_number',1,'date',current_date,'description','Independent sale',
'rows',jsonb_build_array(jsonb_build_object('account_number','1930','amount',500),jsonb_build_object('account_number','3010','amount',-400),jsonb_build_object('account_number','2611','amount',-100))))));
SELECT jsonb_build_object('user',ctx.u,'batch',result.data->>'import_batch_id','period',(SELECT id FROM vat_periods WHERE user_id=ctx.u),'tx',(SELECT id FROM transactions WHERE import_batch_id=(result.data->>'import_batch_id')::uuid)) FROM ctx,result;
COMMIT;
