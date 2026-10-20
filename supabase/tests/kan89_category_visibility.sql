-- Synthetic fixtures only; the local runner always rolls this transaction back.
CREATE FUNCTION pg_temp.check89(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'KAN-89: %',label; END IF; END $$;
CREATE TEMP TABLE kan89_owners(a uuid,b uuid);
INSERT INTO kan89_owners VALUES(gen_random_uuid(),gen_random_uuid());
GRANT SELECT ON kan89_owners TO authenticated;
INSERT INTO auth.users(id) SELECT a FROM kan89_owners UNION ALL SELECT b FROM kan89_owners;
INSERT INTO profiles(id,email,vat_status,domestic_sales_vat_treatment,vat_period_type,vat_management_from,foreign_purchase_reporting,default_deduction_entitlement)
SELECT a,'kan89-a@example.invalid','registered','taxable','quarter',DATE '2026-01-01','required','full' FROM kan89_owners
UNION ALL SELECT b,'kan89-b@example.invalid','registered','taxable','quarter',DATE '2026-01-01','required','full' FROM kan89_owners;
INSERT INTO accounts(id,user_id,name,debit_account,credit_account,default_vat_rate)
SELECT c.id,u.id,c.name,c.debit,c.credit,c.rate FROM
(SELECT a id FROM kan89_owners UNION ALL SELECT b FROM kan89_owners) u
CROSS JOIN (VALUES('programvaror','Programvaror','5420','1930',25),('own','Own category','6991','1930',0),('egen_insättning','Legacy deposit','1930','2018',0)) c(id,name,debit,credit,rate);
SELECT set_config('request.jwt.claim.sub',(SELECT a::text FROM kan89_owners),true);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',(SELECT a FROM kan89_owners),'role','authenticated')::text,true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE uid uuid:=auth.uid(); other_uid uuid; original uuid; j jsonb; t jsonb; balances jsonb; ne jsonb; sequence_before jsonb; r jsonb; n integer;
BEGIN
 SELECT b INTO other_uid FROM kan89_owners;
 PERFORM pg_temp.check89((SELECT bool_and(hidden_from_new_booking=false) FROM accounts),'default false for all old/new categories');
 -- Representative ordinary and periodized bookings, plus custom/legacy IDs.
 r:=book_transaction_atomic(jsonb_build_object('date','2026-10-01','description','Synthetic ordinary','amount',1250,'type','programvaror','vat_rate',25));original:=(r->>'transaction_id')::uuid;
 r:=book_periodized_transaction_atomic(jsonb_build_object('date','2026-10-01','future_date','2027-01-01','description','Synthetic periodized','amount',1250,'type','programvaror','vat_rate',25));
 PERFORM book_transaction_atomic(jsonb_build_object('date','2026-10-01','description','Synthetic custom','amount',100,'type','own','vat_rate',0));
 PERFORM book_transaction_atomic(jsonb_build_object('date','2026-10-01','description','Synthetic legacy','amount',100,'type','egen_insättning','vat_rate',0));
 SELECT jsonb_agg(to_jsonb(x) ORDER BY id) INTO j FROM journal_entries x WHERE user_id=uid;
 SELECT jsonb_agg(to_jsonb(x) ORDER BY id) INTO t FROM transactions x WHERE user_id=uid;
 SELECT jsonb_agg(to_jsonb(x) ORDER BY account_number) INTO balances FROM get_period_account_balances('2026-01-01','2026-12-31') x;
 ne:=get_ne_sales_summary(2026);
 SELECT to_jsonb(s) INTO sequence_before FROM ver_nr_sequences s WHERE user_id=uid;
 UPDATE accounts SET hidden_from_new_booking=true WHERE user_id=uid;
 PERFORM pg_temp.check89((SELECT count(*)=3 FROM accounts WHERE user_id=uid),'hidden categories remain readable and named for history/export/payment roles');
 PERFORM pg_temp.check89((SELECT jsonb_agg(to_jsonb(x) ORDER BY id)=j FROM journal_entries x WHERE user_id=uid),'hiding preserves every historical journal field');
 PERFORM pg_temp.check89((SELECT jsonb_agg(to_jsonb(x) ORDER BY id)=t FROM transactions x WHERE user_id=uid),'hiding preserves every historical transaction field');
 PERFORM pg_temp.check89((SELECT jsonb_agg(to_jsonb(x) ORDER BY account_number)=balances FROM get_period_account_balances('2026-01-01','2026-12-31') x),'VAT, dashboard/result/balance inputs unchanged');
 PERFORM pg_temp.check89(get_ne_sales_summary(2026)=ne,'NE summary unchanged');
 FOREACH n IN ARRAY ARRAY[1,2,3] LOOP
  BEGIN
   PERFORM book_transaction_atomic(jsonb_build_object('date','2026-10-01','description','Reject hidden','amount',100,'type',CASE n WHEN 1 THEN 'programvaror' WHEN 2 THEN 'own' ELSE 'egen_insättning' END,'vat_rate',0,'user_id',other_uid));
   RAISE EXCEPTION 'hidden category accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
 END LOOP;
 BEGIN
  PERFORM book_periodized_transaction_atomic(jsonb_build_object('date','2026-10-01','future_date','2027-01-01','description','Reject hidden periodized','amount',100,'type','programvaror','vat_rate',0));
  RAISE EXCEPTION 'hidden periodized accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  PERFORM book_transaction_atomic(jsonb_build_object('date','2026-10-01','description','Reject unknown','amount',100,'type','unknown','vat_rate',0));
  RAISE EXCEPTION 'unknown category accepted';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 BEGIN
  PERFORM book_periodized_transaction_atomic(jsonb_build_object('date','2026-10-01','future_date','2027-01-01','description','Reject unknown periodized','amount',100,'type','unknown','vat_rate',0));
  RAISE EXCEPTION 'unknown periodized category accepted';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 PERFORM pg_temp.check89((SELECT to_jsonb(s)=sequence_before FROM ver_nr_sequences s WHERE user_id=uid),'rejections do not consume VER or create partial bookings');
 PERFORM pg_temp.check89((SELECT jsonb_agg(to_jsonb(x) ORDER BY id)=j FROM journal_entries x WHERE user_id=uid),'rejections create no journal rows');
 -- Metadata and auditable corrections remain available for hidden categories.
 PERFORM update_transaction_safe(original,jsonb_build_object('file_url',uid::text||'/synthetic.pdf'));
 PERFORM create_correction_transaction_atomic(original);
 UPDATE accounts SET hidden_from_new_booking=false WHERE id='programvaror' AND user_id=uid;
 PERFORM book_transaction_atomic(jsonb_build_object('date','2026-10-01','description','Restored ordinary','amount',1250,'type','programvaror','vat_rate',25));
 PERFORM book_periodized_transaction_atomic(jsonb_build_object('date','2026-10-01','future_date','2027-01-01','description','Restored periodized','amount',1250,'type','programvaror','vat_rate',25));
 -- Cross-user settings cannot be read or modified by this owner.
 PERFORM pg_temp.check89((SELECT count(*)=0 FROM accounts WHERE user_id=other_uid),'other owner not readable');
 UPDATE accounts SET hidden_from_new_booking=true WHERE user_id=other_uid;
 GET DIAGNOSTICS n=ROW_COUNT;
 PERFORM pg_temp.check89(n=0,'other owner not writable');
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',(SELECT b::text FROM kan89_owners),true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 PERFORM pg_temp.check89((SELECT bool_and(hidden_from_new_booking=false) FROM accounts),'second owner settings unchanged');
 PERFORM book_transaction_atomic(jsonb_build_object('date','2026-10-01','description','Other owner unaffected','amount',100,'type','own','vat_rate',0));
END $$;
RESET ROLE;
SELECT 'PASS KAN-89 local SQL: defaults, standard/custom/legacy, ordinary/periodized/direct calls, no partial writes, history/NE/VAT/balance, metadata/correction, restore, two-owner RLS';
