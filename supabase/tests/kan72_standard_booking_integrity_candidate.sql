\set ON_ERROR_STOP on
-- Local-only rollback fixtures. The guarded runner verifies localhost first.
BEGIN;
\if :apply_kan72_migration
\i supabase/migrations/20261014100000_kan72_standard_booking_integrity.sql
\endif
CREATE FUNCTION pg_temp.check_true(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT coalesce(ok,false) THEN RAISE EXCEPTION 'KAN-72: %', label; END IF;
END $$;
CREATE FUNCTION pg_temp.payload(category text, amount jsonb, rate integer DEFAULT 25) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('date','2026-02-01','future_date','2027-01-01',
 'description','KAN-72 synthetic fixture','type',category,'amount',amount,'vat_rate',rate)
$$;
CREATE FUNCTION pg_temp.reject_booking(payload jsonb, periodized boolean, label text,
 expected_message text DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
 tx_count bigint; journal_count bigint; numbers jsonb; rejected boolean := false; error_text text;
BEGIN
 SELECT count(*) INTO tx_count FROM public.transactions;
 SELECT count(*) INTO journal_count FROM public.journal_entries;
 SELECT jsonb_agg(to_jsonb(s) ORDER BY user_id) INTO numbers FROM public.ver_nr_sequences s;
 BEGIN
   IF periodized THEN PERFORM public.book_periodized_transaction_atomic(payload);
   ELSE PERFORM public.book_transaction_atomic(payload); END IF;
 EXCEPTION WHEN OTHERS THEN rejected := true; error_text := SQLERRM;
 END;
 PERFORM pg_temp.check_true(rejected, label || ' was accepted');
 IF expected_message IS NOT NULL THEN
   PERFORM pg_temp.check_true(error_text LIKE expected_message, label || ': unexpected error ' || error_text);
 END IF;
 PERFORM pg_temp.check_true(tx_count=(SELECT count(*) FROM public.transactions),label || ': transaction rollback');
 PERFORM pg_temp.check_true(journal_count=(SELECT count(*) FROM public.journal_entries),label || ': journal rollback');
 PERFORM pg_temp.check_true(numbers IS NOT DISTINCT FROM
   (SELECT jsonb_agg(to_jsonb(s) ORDER BY user_id) FROM public.ver_nr_sequences s),label || ': number rollback');
END $$;
CREATE FUNCTION pg_temp.check_journal(tx uuid, expected_user uuid, expected_ver integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_temp.check_true((SELECT count(*)>=2 AND sum(debit)=sum(credit) AND sum(debit)>0
 AND bool_and(user_id=expected_user AND ver_nr=expected_ver AND debit>=0 AND credit>=0
 AND debit IS NOT NULL AND credit IS NOT NULL) FROM public.journal_entries WHERE transaction_id=tx),
 'valid stored journal');
END $$;
-- Fault injection applies only to the synthetic user, inside this rollback transaction.
CREATE FUNCTION pg_temp.inject_fault() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE mode text := current_setting('kan72.fault',true); reversal boolean;
BEGIN
 IF NEW.description='KAN-72 injected extra' THEN RETURN NEW; END IF;
 IF NEW.user_id::text IS DISTINCT FROM current_setting('kan72.user',true) THEN RETURN NEW; END IF;
 SELECT is_periodized_reversal INTO reversal FROM public.transactions WHERE id=NEW.transaction_id;
 IF (mode IN ('extra_other_transaction','extra_other_transaction_null','extra_other_transaction_zero','extra_other_transaction_balanced') AND NEW.account_number='1930')
    OR (mode='extra_other_transaction_second' AND reversal AND NEW.account_number='1790') THEN
   INSERT INTO public.journal_entries(transaction_id,ver_nr,account_number,debit,credit,description,date,user_id)
   VALUES(current_setting('kan72.anchor')::uuid,NEW.ver_nr,'1930',
     CASE WHEN mode='extra_other_transaction_null' THEN NULL
          WHEN mode='extra_other_transaction_zero' THEN 0 ELSE 0.01 END,
     0,'KAN-72 injected extra',NEW.date,NEW.user_id);
   IF mode='extra_other_transaction_balanced' THEN
     INSERT INTO public.journal_entries(transaction_id,ver_nr,account_number,debit,credit,description,date,user_id)
     VALUES(current_setting('kan72.anchor')::uuid,NEW.ver_nr,'1930',0,0.01,
       'KAN-72 injected extra',NEW.date,NEW.user_id);
   END IF;
 END IF;
 IF mode='other_user_same_ver' AND NEW.account_number='1930' THEN
   INSERT INTO public.journal_entries(transaction_id,ver_nr,account_number,debit,credit,description,date,user_id)
   VALUES
   (current_setting('kan72.other_anchor')::uuid,NEW.ver_nr,'1930',0.01,0,'KAN-72 injected extra',NEW.date,current_setting('kan72.other_user')::uuid),
   (current_setting('kan72.other_anchor')::uuid,NEW.ver_nr,'2018',0,0.01,'KAN-72 injected extra',NEW.date,current_setting('kan72.other_user')::uuid);
 END IF;
 CASE mode
 WHEN 'wrong_user' THEN NEW.user_id := current_setting('kan72.other_user')::uuid;
 WHEN 'wrong_ver' THEN NEW.ver_nr := NEW.ver_nr+100;
 WHEN 'wrong_transaction' THEN NEW.transaction_id := current_setting('kan72.anchor')::uuid;
 WHEN 'missing' THEN RETURN NULL;
 WHEN 'null' THEN NEW.debit := NULL;
 WHEN 'negative' THEN IF NEW.debit>0 THEN NEW.debit := -NEW.debit; END IF;
 WHEN 'imbalance' THEN IF NEW.debit>0 THEN NEW.debit := NEW.debit+0.01; END IF;
 WHEN 'second_ver_imbalance' THEN IF reversal AND NEW.credit>0 THEN NEW.credit := NEW.credit+0.01; END IF;
 WHEN 'cancelled_pair' THEN
   IF NEW.account_number='1930' AND NEW.credit>0 THEN NEW.credit := NEW.credit+0.01;
   ELSIF reversal AND NEW.credit>0 THEN NEW.credit := NEW.credit-0.01; END IF;
 ELSE NULL;
 END CASE;
 RETURN NEW;
END $$;
CREATE TRIGGER kan72_test_fault BEFORE INSERT ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION pg_temp.inject_fault();
DO $$
<<matrix>>
DECLARE
 uid uuid:=gen_random_uuid(); other_uid uuid:=gen_random_uuid(); prefix text;
 category text; amount jsonb; rate integer; periodized boolean; result jsonb; correction jsonb;
 fault text; sale_tx uuid; anchor_tx uuid; period_tx uuid; legacy_tx uuid; other_anchor uuid; rounding_case record;
BEGIN
 prefix := 'kan72-' || uid::text;
 INSERT INTO auth.users(id) VALUES(uid),(other_uid);
 INSERT INTO public.profiles(id,email,vat_status,vat_period_type,vat_management_from,
 domestic_sales_vat_treatment,foreign_purchase_reporting,default_deduction_entitlement)
 VALUES(uid,prefix || '@example.test','registered','month','2026-01-01','taxable','required','full');
 INSERT INTO public.accounts(id,user_id,name,debit_account,credit_account) VALUES
 (prefix || '-sale',uid,'KAN-72 sale','1930','3001'),
 (prefix || '-purchase',uid,'KAN-72 purchase','5420','1930'),
 (prefix || '-deposit',uid,'KAN-72 deposit','1930','2018'),
 (prefix || '-withdrawal',uid,'KAN-72 withdrawal','2013','1930');
 PERFORM set_config('request.jwt.claim.sub',uid::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
 PERFORM set_config('kan72.user',uid::text,true);
 PERFORM set_config('kan72.other_user',other_uid::text,true);
 IF current_setting('kan72.journal_only',true) IS DISTINCT FROM 'on' THEN
   FOREACH rate IN ARRAY ARRAY[0,6,12,25] LOOP
     FOREACH category IN ARRAY ARRAY['sale','purchase','deposit','withdrawal'] LOOP
       FOREACH amount IN ARRAY ARRAY['-1250'::jsonb,'0'::jsonb,'-0.01'::jsonb,'0.001'::jsonb,'1.001'::jsonb,
         '"NaN"'::jsonb,'"Infinity"'::jsonb,'null'::jsonb,'""'::jsonb,'"abc"'::jsonb,'10000000000000'::jsonb] LOOP
         PERFORM pg_temp.reject_booking(pg_temp.payload(prefix || '-' || category,amount,rate),false,
           category || ' rate ' || rate || ' amount ' || amount,'%belopp%');
         IF category='purchase' THEN
           PERFORM pg_temp.reject_booking(pg_temp.payload(prefix || '-purchase',amount,rate),true,
             'periodization rate ' || rate || ' amount ' || amount,'%belopp%');
         END IF;
       END LOOP;
     END LOOP;
   END LOOP;
 END IF;
 -- No-auth and unsupported-rate guards also preserve the number table.
 PERFORM set_config('request.jwt.claim.sub','',true);
 PERFORM set_config('request.jwt.claims','{}',true);
 PERFORM pg_temp.reject_booking(pg_temp.payload(prefix || '-sale','1250'::jsonb),false,'no auth','%inloggad%');
 PERFORM set_config('request.jwt.claim.sub',uid::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
 PERFORM pg_temp.reject_booking(pg_temp.payload(prefix || '-sale','1250'::jsonb,5),false,'unsupported rate','%Momssatsen%');
 -- No row in the number table may survive the rejected first bookings.
 PERFORM pg_temp.check_true(NOT EXISTS(SELECT 1 FROM public.ver_nr_sequences WHERE user_id=uid),'first number not consumed');
 PERFORM set_config('kan72.fault','imbalance',true);
 PERFORM pg_temp.reject_booking(pg_temp.payload(prefix || '-sale','1250'::jsonb),false,'journal fault before first number','%Journal%');
 PERFORM set_config('kan72.fault','',true);
 PERFORM pg_temp.check_true(NOT EXISTS(SELECT 1 FROM public.ver_nr_sequences WHERE user_id=uid),'failed first journal leaves no counter');
 result:=public.book_transaction_atomic(pg_temp.payload(prefix || '-sale','1250'::jsonb));
 PERFORM pg_temp.check_true((result->>'ver_nr')::integer=1,'first successful number is 1');
 sale_tx:=(result->>'transaction_id')::uuid;
 PERFORM pg_temp.check_journal(sale_tx,uid,1);
 anchor_tx:=sale_tx;
 PERFORM set_config('kan72.anchor',anchor_tx::text,true);
 -- Review finding: extra rows have the right owner/number but a different transaction.
 FOREACH periodized IN ARRAY CASE WHEN current_setting('kan72.repro_periodized',true)='on'
   THEN ARRAY[true] ELSE ARRAY[false,true] END LOOP
   FOREACH fault IN ARRAY ARRAY['extra_other_transaction','extra_other_transaction_null',
     'extra_other_transaction_zero','extra_other_transaction_balanced'] LOOP
     PERFORM set_config('kan72.fault',fault,true);
     PERFORM pg_temp.reject_booking(pg_temp.payload(prefix || CASE WHEN periodized THEN '-purchase' ELSE '-sale' END,'1250'::jsonb),
       periodized,fault || ' periodized=' || periodized,'%Journal%');
   END LOOP;
 END LOOP;
 PERFORM set_config('kan72.fault','extra_other_transaction_second',true);
 PERFORM pg_temp.reject_booking(pg_temp.payload(prefix || '-purchase','1250'::jsonb),true,'extra row on second periodization verification','%Journal%');
 FOREACH periodized IN ARRAY ARRAY[false,true] LOOP
   FOREACH fault IN ARRAY ARRAY['imbalance','wrong_user','wrong_ver','wrong_transaction','missing','null','negative'] LOOP
     PERFORM set_config('kan72.fault',fault,true);
     PERFORM pg_temp.reject_booking(pg_temp.payload(prefix || CASE WHEN periodized THEN '-purchase' ELSE '-sale' END,'1250'::jsonb),
       periodized,fault || ' periodized=' || periodized,'%Journal%');
   END LOOP;
 END LOOP;
 FOREACH fault IN ARRAY ARRAY['second_ver_imbalance','cancelled_pair'] LOOP
   PERFORM set_config('kan72.fault',fault,true);
   PERFORM pg_temp.reject_booking(pg_temp.payload(prefix || '-purchase','1250'::jsonb),true,fault,'%Journal%');
 END LOOP;
 PERFORM set_config('kan72.fault','',true);
 result:=public.book_transaction_atomic(pg_temp.payload(prefix || '-sale','1250'::jsonb));
 PERFORM pg_temp.check_true((result->>'ver_nr')::integer=2,'no number gap after journal faults');
 -- Different users may legitimately have the same verification number.
 INSERT INTO public.transactions(user_id,date,description,amount,type,vat_rate,booked)
 VALUES(other_uid,'2026-02-01','KAN-72 unrelated other user',0.01,'kan72-other-user-fixture',0,true)
 RETURNING id INTO other_anchor;
 PERFORM set_config('kan72.other_anchor',other_anchor::text,true);
 PERFORM set_config('kan72.fault','other_user_same_ver',true);
 result:=public.book_transaction_atomic(pg_temp.payload(prefix || '-sale','1250'::jsonb));
 PERFORM pg_temp.check_journal((result->>'transaction_id')::uuid,uid,(result->>'ver_nr')::integer);
 result:=public.book_periodized_transaction_atomic(pg_temp.payload(prefix || '-purchase','1250'::jsonb));
 PERFORM pg_temp.check_journal((result->>'transaction_id')::uuid,uid,(result->>'ver_nr')::integer);
 PERFORM pg_temp.check_journal((result->>'reversal_transaction_id')::uuid,uid,(result->>'reversal_ver_nr')::integer);
 PERFORM set_config('kan72.fault','',true);
 -- Happy-path cent matrix and both VAT deduction choices; expected account totals.
 FOREACH rate IN ARRAY ARRAY[0,6,12,25] LOOP
   FOREACH category IN ARRAY ARRAY['sale','purchase','deposit','withdrawal'] LOOP
     FOREACH amount IN ARRAY ARRAY['0.01'::jsonb,'0.02'::jsonb,'0.03'::jsonb,'0.05'::jsonb,'0.09'::jsonb,'1.01'::jsonb,'1250.01'::jsonb,'"1.000"'::jsonb] LOOP
       result:=public.book_transaction_atomic(pg_temp.payload(prefix || '-' || category,amount,rate));
       PERFORM pg_temp.check_journal((result->>'transaction_id')::uuid,uid,(result->>'ver_nr')::integer);
     END LOOP;
   END LOOP;
   result:=public.book_transaction_atomic(pg_temp.payload(prefix || '-purchase','1250'::jsonb,rate)
     || '{"input_vat_deduction_entitlement":"none"}'::jsonb);
   PERFORM pg_temp.check_true(NOT EXISTS(SELECT 1 FROM public.journal_entries
     WHERE transaction_id=(result->>'transaction_id')::uuid AND account_number='2641'),'no deduction creates no 2641');
   FOREACH amount IN ARRAY ARRAY['0.01'::jsonb,'0.03'::jsonb,'1.01'::jsonb,'1250'::jsonb] LOOP
     result:=public.book_periodized_transaction_atomic(pg_temp.payload(prefix || '-purchase',amount,rate));
     PERFORM pg_temp.check_journal((result->>'transaction_id')::uuid,uid,(result->>'ver_nr')::integer);
     PERFORM pg_temp.check_journal((result->>'reversal_transaction_id')::uuid,uid,(result->>'reversal_ver_nr')::integer);
     PERFORM pg_temp.check_true((result->>'reversal_ver_nr')::integer=(result->>'ver_nr')::integer+1,'consecutive periodization numbers');
   END LOOP;
 END LOOP;
 period_tx := (result->>'transaction_id')::uuid;
 -- Independent known VAT/rounding fixtures, rather than reproducing the RPC formula.
 FOR rounding_case IN SELECT * FROM (VALUES
   (1060::numeric,6,60::numeric),(1120,12,120),(1250,25,250),
   (0.02,25,0),(0.03,25,0.01),(0.05,12,0.01),(0.09,6,0.01)
 ) AS cases(gross,rate,vat) LOOP
   result:=public.book_transaction_atomic(pg_temp.payload(prefix || '-sale',to_jsonb(rounding_case.gross),rounding_case.rate));
   PERFORM pg_temp.check_true((SELECT coalesce(sum(credit),0) FROM public.journal_entries
     WHERE transaction_id=(result->>'transaction_id')::uuid AND account_number IN ('2611','2621','2631'))=rounding_case.vat,
     'known sales VAT rounding');
   PERFORM pg_temp.check_true((SELECT sum(credit) FROM public.journal_entries
     WHERE transaction_id=(result->>'transaction_id')::uuid AND account_number='3001')=rounding_case.gross-rounding_case.vat,
     'known sales net');
   result:=public.book_transaction_atomic(pg_temp.payload(prefix || '-purchase',to_jsonb(rounding_case.gross),rounding_case.rate));
   PERFORM pg_temp.check_true((SELECT coalesce(sum(debit),0) FROM public.journal_entries
     WHERE transaction_id=(result->>'transaction_id')::uuid AND account_number='2641')=rounding_case.vat,'known input VAT rounding');
 END LOOP;
 FOREACH rate IN ARRAY ARRAY[0,6,12,25] LOOP
   result:=public.book_periodized_transaction_atomic(pg_temp.payload(prefix || '-purchase','1250.01'::jsonb,rate)
     || '{"input_vat_deduction_entitlement":"none"}'::jsonb);
   PERFORM pg_temp.check_journal((result->>'transaction_id')::uuid,uid,(result->>'ver_nr')::integer);
   PERFORM pg_temp.check_journal((result->>'reversal_transaction_id')::uuid,uid,(result->>'reversal_ver_nr')::integer);
   PERFORM pg_temp.check_true((SELECT sum(debit) FROM public.journal_entries
     WHERE transaction_id=(result->>'transaction_id')::uuid AND account_number='1790')=1250.01,'periodization without deduction uses gross');
 END LOOP;
 result:=public.book_transaction_atomic(pg_temp.payload(prefix || '-deposit','9999999999999.99'::jsonb,0));
 PERFORM pg_temp.check_journal((result->>'transaction_id')::uuid,uid,(result->>'ver_nr')::integer);
 -- Preserve booked legacy metadata, including amounts forbidden for new bookings.
 FOREACH amount IN ARRAY ARRAY['-1250'::jsonb,'0'::jsonb] LOOP
   INSERT INTO public.transactions(user_id,date,description,amount,type,vat_rate,booked)
   VALUES(uid,'2026-02-01','KAN-72 legacy fixture',(amount#>>'{}')::numeric,prefix || '-deposit',0,true)
   RETURNING id INTO legacy_tx;
   PERFORM public.update_transaction_safe(legacy_tx,'{"file_url":"kan72-local-fixture"}'::jsonb);
   PERFORM pg_temp.check_true(EXISTS(SELECT 1 FROM public.transactions WHERE id=legacy_tx
     AND file_url='kan72-local-fixture' AND transactions.amount=(matrix.amount#>>'{}')::numeric),'legacy metadata preserves amount');
 END LOOP;
 -- Rights and existing guards remain authoritative.
 PERFORM pg_temp.check_true(has_function_privilege('authenticated','public.book_transaction_atomic(jsonb)','EXECUTE'),'authenticated execute');
 PERFORM pg_temp.check_true(NOT has_function_privilege('anon','public.book_transaction_atomic(jsonb)','EXECUTE'),'anon denied');
 PERFORM set_config('request.jwt.claim.sub',other_uid::text,true);
 PERFORM pg_temp.reject_booking(pg_temp.payload(prefix || '-sale','1250'::jsonb),false,'other user account','%tillhör%');
 PERFORM set_config('request.jwt.claim.sub',uid::text,true);
 UPDATE public.profiles SET domestic_sales_vat_treatment='small_business_exempt' WHERE id=uid;
 PERFORM pg_temp.reject_booking(pg_temp.payload(prefix || '-sale','1250'::jsonb),false,'exempt sale','%momsfri%');
 UPDATE public.profiles SET domestic_sales_vat_treatment='unknown' WHERE id=uid;
 PERFORM pg_temp.reject_booking(pg_temp.payload(prefix || '-sale','1250'::jsonb),false,'unknown sale','%momsuppgift%');
 UPDATE public.profiles SET domestic_sales_vat_treatment='exempt_other',vat_status='not_registered',foreign_purchase_reporting='not_required',vat_period_type=NULL,vat_management_from=NULL WHERE id=uid;
 PERFORM pg_temp.reject_booking(pg_temp.payload(prefix || '-purchase','1250'::jsonb),false,'unregistered purchase','%inte momsregistrerat%');
 PERFORM pg_temp.reject_booking(pg_temp.payload(prefix || '-purchase','1250'::jsonb),true,'unregistered periodization','%inte momsregistrerat%');
 UPDATE public.profiles SET vat_status='registered',vat_period_type='month',vat_management_from='2026-01-01',domestic_sales_vat_treatment='taxable',foreign_purchase_reporting='required',default_deduction_entitlement='none' WHERE id=uid;
 PERFORM pg_temp.reject_booking(pg_temp.payload(prefix || '-purchase','1250'::jsonb)
   || '{"input_vat_deduction_entitlement":"full"}'::jsonb,false,'deduction privilege','%avdrag%');
 UPDATE public.profiles SET default_deduction_entitlement='full' WHERE id=uid;
 INSERT INTO public.closed_years(user_id,year) VALUES(uid,2026);
 PERFORM pg_temp.reject_booking(pg_temp.payload(prefix || '-sale','1250'::jsonb),false,'closed year','%låst%');
 PERFORM pg_temp.reject_booking(pg_temp.payload(prefix || '-purchase','1250'::jsonb),true,'closed origin year','%låst%');
 DELETE FROM public.closed_years WHERE user_id=uid;
 INSERT INTO public.closed_years(user_id,year) VALUES(uid,2027);
 PERFORM pg_temp.reject_booking(pg_temp.payload(prefix || '-purchase','1250'::jsonb),true,'closed future year','%låst%');
 DELETE FROM public.closed_years WHERE user_id=uid;
 INSERT INTO public.vat_periods(user_id,period_start,period_end,period_type,status,source,closing_amount,closing_transaction_id,declared_at)
 VALUES(uid,'2026-02-01','2026-02-28','month','closed','sololedger',0,anchor_tx,NULL),
 (uid,'2026-12-01','2026-12-31','month','declared','sololedger',0,anchor_tx,now());
 PERFORM pg_temp.reject_booking(pg_temp.payload(prefix || '-sale','1250'::jsonb),false,'closed VAT period','%stängd%');
 PERFORM pg_temp.reject_booking(pg_temp.payload(prefix || '-purchase','1250'::jsonb),true,'declared periodization VAT','%deklarerad%');
 -- Closed correction periods are still blocked by the established correction RPC.
 INSERT INTO public.vat_periods(user_id,period_start,period_end,period_type,status,source,closing_amount,closing_transaction_id)
 VALUES(uid,date_trunc('month',current_date)::date,(date_trunc('month',current_date)+interval '1 month - 1 day')::date,
 'month','closed','sololedger',0,anchor_tx);
 BEGIN
   PERFORM public.create_correction_transaction_atomic(sale_tx);
   RAISE EXCEPTION 'KAN-72 closed-period correction accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 -- Open periods for controlled correction: mirror every amount, preserve history.
 UPDATE public.vat_periods SET status='open',closing_amount=NULL,closing_transaction_id=NULL,declared_at=NULL WHERE user_id=uid;
 correction:=public.create_correction_transaction_atomic(sale_tx);
 PERFORM pg_temp.check_journal((correction->>'transaction_id')::uuid,uid,(correction->>'ver_nr')::integer);
 PERFORM pg_temp.check_true(NOT EXISTS(
   SELECT 1 FROM (SELECT account_number,sum(debit) debit,sum(credit) credit FROM public.journal_entries
     WHERE transaction_id=sale_tx GROUP BY account_number)o
   FULL JOIN (SELECT account_number,sum(credit) debit,sum(debit) credit FROM public.journal_entries
     WHERE transaction_id=(correction->>'transaction_id')::uuid GROUP BY account_number)c USING(account_number)
   WHERE o.debit IS DISTINCT FROM c.debit OR o.credit IS DISTINCT FROM c.credit),'correction mirrors original');
 BEGIN
   PERFORM public.create_correction_transaction_atomic(sale_tx);
   RAISE EXCEPTION 'KAN-72 duplicate correction accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 correction:=public.create_correction_transaction_atomic(period_tx);
 PERFORM pg_temp.check_journal((correction->>'transaction_id')::uuid,uid,(correction->>'ver_nr')::integer);
 PERFORM pg_temp.check_journal((correction->>'reversal_correction_transaction_id')::uuid,uid,
   (correction->>'reversal_correction_ver_nr')::integer);
 RAISE NOTICE 'KAN-72 amount, journal, rollback, numbering and existing-guard matrix passed';
END $$;
SET LOCAL ROLE authenticated;
SELECT public.book_transaction_atomic(jsonb_build_object(
 'date','2026-02-01','description','KAN-72 authenticated fixture','amount',0.03,
 'type','kan72-' || current_setting('kan72.user') || '-sale','vat_rate',25))->>'success' AS authenticated_success;
RESET ROLE;
SET LOCAL ROLE anon;
DO $anon$ BEGIN
 BEGIN
   PERFORM public.book_transaction_atomic('{"amount":1}'::jsonb);
   RAISE EXCEPTION 'KAN-72 anonymous execution accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $anon$;
RESET ROLE;
ROLLBACK;
