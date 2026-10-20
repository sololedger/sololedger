-- Synthetic only; run inside the local runner's transaction, always rolled back.
CREATE FUNCTION pg_temp.check_ne(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'KAN-88 assertion: %',label; END IF; END $$;
CREATE TEMP TABLE kan88_evidence(label text,data jsonb);
CREATE TEMP TABLE kan88_owners(id uuid PRIMARY KEY);
DO $$
DECLARE uid uuid:=gen_random_uuid(); other_uid uuid:=gen_random_uuid(); tx uuid; original_tx uuid; iid uuid; je uuid; result jsonb; summary jsonb; before_rows jsonb; after_rows jsonb; n integer; before_seq jsonb; ids uuid[]:='{}';
BEGIN
 INSERT INTO kan88_owners VALUES(uid),(other_uid);
 INSERT INTO auth.users(id) VALUES(uid),(other_uid);
 INSERT INTO profiles(id,email,vat_status,domestic_sales_vat_treatment,vat_period_type,vat_management_from,foreign_purchase_reporting,default_deduction_entitlement)
 VALUES(uid,'kan88-synthetic@example.invalid','registered','small_business_exempt','quarter','2026-01-01','required','none'),(other_uid,'kan88-other@example.invalid','registered','taxable','quarter','2026-01-01','required','full');
 INSERT INTO accounts(id,user_id,name,debit_account,credit_account,default_vat_rate) VALUES('kan88_sale',uid,'Synthetic sale','1930','3010',0);
 PERFORM set_config('request.jwt.claim.sub',uid::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
 result:=book_transaction_atomic(jsonb_build_object('date','2026-10-01','description','Synthetic exempt sale','amount',1000,'type','kan88_sale','vat_rate',0,'ne_sales_basis','small_business_exempt','ne_sales_basis_confirmed',true));
 original_tx:=(result->>'transaction_id')::uuid;
 summary:=get_ne_sales_summary(2026);
 PERFORM pg_temp.check_ne(summary->'balances'=(SELECT jsonb_agg(to_jsonb(b) ORDER BY account_number) FROM get_period_account_balances('2026-01-01','2026-12-31') b),'summary preserves authoritative annual balances');
 PERFORM pg_temp.check_ne((summary->>'r2_reallocation')::numeric=1000 AND (summary->>'unresolved_count')::int=0,'manual exemption R2');
 PERFORM pg_temp.check_ne((SELECT count(*)=2 FROM journal_entries WHERE transaction_id=original_tx),'unchanged ordinary journal size');
 PERFORM pg_temp.check_ne((SELECT count(*)=1 FROM journal_entries WHERE transaction_id=original_tx AND account_number='3010' AND credit=1000),'3010 retained');
 BEGIN
  PERFORM book_transaction_atomic(jsonb_build_object('date','2026-10-01','description','Unconfirmed','amount',1000,'type','kan88_sale','vat_rate',0,'ne_sales_basis','small_business_exempt'));
  RAISE EXCEPTION 'Unconfirmed basis accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 UPDATE profiles SET domestic_sales_vat_treatment='taxable',default_deduction_entitlement='full' WHERE id=uid;
 PERFORM pg_temp.check_ne((get_ne_sales_summary(2026)->>'r2_reallocation')::numeric=1000,'profile change does not move history');
 result:=book_transaction_atomic(jsonb_build_object('date','2026-10-02','description','Synthetic taxable','amount',1250,'type','kan88_sale','vat_rate',25));
 tx:=(result->>'transaction_id')::uuid;
 PERFORM pg_temp.check_ne((SELECT ne_row='R1' FROM ne_sales_classifications WHERE transaction_id=tx),'taxable R1');
 result:=book_transaction_atomic(jsonb_build_object('date','2026-10-03','description','No VAT insufficient basis','amount',300,'type','kan88_sale','vat_rate',0));
 PERFORM pg_temp.check_ne((get_ne_sales_summary(2026)->>'unresolved_count')::int=1,'zero VAT is not R2 evidence');
 PERFORM create_correction_transaction_atomic(original_tx);
 PERFORM pg_temp.check_ne((get_ne_sales_summary(2026)->>'r2_reallocation')::numeric=0,'manual reversal inherits original R2 after profile change');
 -- New invoice captures the exemption, later profile changes cannot move its decision.
 UPDATE profiles SET domestic_sales_vat_treatment='small_business_exempt',default_deduction_entitlement='none' WHERE id=uid;
 result:=create_customer_invoice_atomic(jsonb_build_object('invoice_number','KAN88-cross','customer_name','Synthetic','invoice_date','2026-12-20','service_date','2026-12-20','due_date','2027-01-20','gross_amount',1000,'vat_treatment','exempt','attachment_url',uid::text||'/synthetic.pdf'));
 iid:=(result->>'invoice_id')::uuid;
 UPDATE profiles SET domestic_sales_vat_treatment='taxable',default_deduction_entitlement='full' WHERE id=uid;
 PERFORM book_customer_invoice_year_end_receivable_atomic(iid,2026,gen_random_uuid());
 PERFORM pg_temp.check_ne((get_ne_sales_summary(2026)->>'r2_reallocation')::numeric=1000,'invoice captured exemption survives profile change');
 PERFORM settle_customer_invoice_receivable_atomic(iid,'2027-01-15',gen_random_uuid());
 PERFORM pg_temp.check_ne((get_ne_sales_summary(2027)->>'r2_reallocation')::numeric=0,'next year settlement no income');
 PERFORM undo_customer_invoice_payment_atomic(iid,gen_random_uuid());
 PERFORM pg_temp.check_ne((get_ne_sales_summary(2027)->>'r2_reallocation')::numeric=0,'settlement undo no income');
 -- Same-year exempt invoice and its undo inherit the frozen decision.
 UPDATE profiles SET domestic_sales_vat_treatment='small_business_exempt',default_deduction_entitlement='none' WHERE id=uid;
 result:=create_customer_invoice_atomic(jsonb_build_object('invoice_number','KAN88-same','customer_name','Synthetic','invoice_date','2026-10-01','service_date','2026-10-01','due_date','2026-10-20','gross_amount',500,'vat_treatment','exempt','attachment_url',uid::text||'/synthetic.pdf'));
 iid:=(result->>'invoice_id')::uuid;
 PERFORM record_customer_invoice_payment_atomic(iid,'2026-10-05',gen_random_uuid());
 PERFORM pg_temp.check_ne((get_ne_sales_summary(2026)->>'r2_reallocation')::numeric=1500,'same year exempt invoice R2');
 UPDATE profiles SET domestic_sales_vat_treatment='taxable',default_deduction_entitlement='full' WHERE id=uid;
 PERFORM undo_customer_invoice_payment_atomic(iid,gen_random_uuid());
 PERFORM pg_temp.check_ne((get_ne_sales_summary(2026)->>'r2_reallocation')::numeric=1000,'same year invoice undo inherits decision');
 -- Taxable invoice follows R1, independently of the exempt-invoice path.
 result:=create_customer_invoice_atomic(jsonb_build_object('invoice_number','KAN88-taxable','customer_name','Synthetic taxable','invoice_date','2026-10-01','service_date','2026-10-01','due_date','2026-10-20','gross_amount',1250,'vat_treatment','taxable','vat_rate',25,'attachment_url',uid::text||'/synthetic.pdf'));
 iid:=(result->>'invoice_id')::uuid;
 result:=record_customer_invoice_payment_atomic(iid,'2026-10-05',gen_random_uuid());
 PERFORM pg_temp.check_ne((SELECT ne_row='R1' FROM ne_sales_classifications WHERE transaction_id=(result->>'transaction_id')::uuid),'taxable invoice R1');
 -- Two ALREADY booked synthetic invoices, unknown historical exemption basis.
 FOR n IN 1..2 LOOP
  result:=create_customer_invoice_atomic(jsonb_build_object('invoice_number','KAN88-legacy-'||n,'customer_name','Synthetic legacy','invoice_date','2026-10-01','service_date','2026-10-01','due_date','2026-10-30','gross_amount',1000,'vat_treatment','exempt','attachment_url',uid::text||'/synthetic.pdf'));
  iid:=(result->>'invoice_id')::uuid;
  IF n=1 THEN
   result:=record_customer_invoice_payment_atomic(iid,'2026-10-05',gen_random_uuid());
  ELSE
   -- Exact KAN-51 historical linkage to an existing manual verification; setup only.
   INSERT INTO accounts(id,user_id,name,debit_account,credit_account,default_vat_rate) VALUES('försäljning',uid,'Synthetic historical sale','1930','3010',0);
   result:=book_transaction_atomic(jsonb_build_object('date','2026-10-05','description','Synthetic pre-invoice historical sale','amount',1000,'type','försäljning','vat_rate',0));
   UPDATE customer_invoices SET payment_status='paid',paid_at='2026-10-05' WHERE id=iid;
   INSERT INTO customer_invoice_bookings(user_id,invoice_id,transaction_id,booking_kind,booking_date,fiscal_year,gross_amount,net_amount,vat_amount,idempotency_key)
   VALUES(uid,iid,(result->>'transaction_id')::uuid,'historical_payment_same_year','2026-10-05',2026,1000,1000,0,gen_random_uuid());
  END IF;
  tx:=(result->>'transaction_id')::uuid;
  SELECT id INTO je FROM journal_entries WHERE transaction_id=tx AND account_number='3010';
  ids:=array_append(ids,je);
 END LOOP;
 INSERT INTO kan88_evidence VALUES('before_review',jsonb_build_object('summary',get_ne_sales_summary(2026),'cumulative',(SELECT jsonb_agg(to_jsonb(x)) FROM get_cumulative_account_balances('2026-12-31') x)));
 SELECT jsonb_build_object('tx',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM transactions t WHERE user_id=uid),'journal',(SELECT jsonb_agg(to_jsonb(j) ORDER BY id) FROM journal_entries j WHERE user_id=uid),'invoices',(SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM customer_invoices i WHERE user_id=uid),'bookings',(SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM customer_invoice_bookings b WHERE user_id=uid)) INTO before_rows;
 SELECT to_jsonb(s) INTO before_seq FROM ver_nr_sequences s WHERE user_id=uid;
 FOREACH je IN ARRAY ids LOOP PERFORM review_ne_legacy_sale(je,'R2','Synthetic reviewed evidence: ordinary Swedish sale covered by small business exemption on its sale date.'); END LOOP;
 SELECT jsonb_build_object('tx',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM transactions t WHERE user_id=uid),'journal',(SELECT jsonb_agg(to_jsonb(j) ORDER BY id) FROM journal_entries j WHERE user_id=uid),'invoices',(SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM customer_invoices i WHERE user_id=uid),'bookings',(SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM customer_invoice_bookings b WHERE user_id=uid)) INTO after_rows;
 INSERT INTO kan88_evidence VALUES('after_review',jsonb_build_object('summary',get_ne_sales_summary(2026),'cumulative',(SELECT jsonb_agg(to_jsonb(x)) FROM get_cumulative_account_balances('2026-12-31') x)));
 PERFORM pg_temp.check_ne(before_rows=after_rows,'legacy review adds NO transactions, journals, invoices, bookings or mutations');
 PERFORM pg_temp.check_ne(before_seq=(SELECT to_jsonb(s) FROM ver_nr_sequences s WHERE user_id=uid),'legacy review consumes no verification number');
 PERFORM pg_temp.check_ne((get_ne_sales_summary(2026)->>'r2_reallocation')::numeric=3000,'two legacy invoices now allocated only in NE');
 PERFORM pg_temp.check_ne((SELECT count(*)=2 FROM ne_sales_classifications WHERE journal_entry_id=ANY(ids) AND evidence->'saved_invoice_evidence'->>'invoice_id' IS NOT NULL),'review retains saved invoice evidence including historical linkage');
 BEGIN PERFORM review_ne_legacy_sale((SELECT id FROM journal_entries WHERE transaction_id=original_tx AND account_number='3010'),'R2','Corrected original must be reviewed as an entire chain.'); RAISE EXCEPTION 'corrected original allowed'; EXCEPTION WHEN check_violation THEN NULL; END;
 INSERT INTO closed_years(user_id,year) VALUES(uid,2026);
 BEGIN PERFORM review_ne_legacy_sale((SELECT j.id FROM journal_entries j JOIN transactions t ON t.id=j.transaction_id WHERE t.description='No VAT insufficient basis' AND j.account_number='3010'),'R2','Locked year must never receive a classification.'); RAISE EXCEPTION 'locked year allowed'; EXCEPTION WHEN check_violation THEN NULL; END;
 DELETE FROM closed_years WHERE user_id=uid AND year=2026;
 BEGIN PERFORM review_ne_legacy_sale(ids[1],'R2','Duplicate must be refused without changing an existing decision.'); RAISE EXCEPTION 'duplicate allowed'; EXCEPTION WHEN unique_violation THEN NULL; END;
 PERFORM set_config('request.jwt.claim.sub',other_uid::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',other_uid,'role','authenticated')::text,true);
 PERFORM pg_temp.check_ne((get_ne_sales_summary(2026)->>'r2_reallocation')::numeric=0,'other owner report isolated');
 INSERT INTO accounts(id,user_id,name,debit_account,credit_account,default_vat_rate) VALUES('kan88_sale',other_uid,'Other owner sale','1930','3010',25);
 PERFORM book_transaction_atomic(jsonb_build_object('date','2026-10-01','description','Other owner taxable','amount',1250,'type','kan88_sale','vat_rate',25));
 BEGIN PERFORM review_ne_legacy_sale(ids[1],'R2','Attempt from different owner must be refused.'); RAISE EXCEPTION 'foreign owner allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('request.jwt.claim.sub',uid::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
END $$;
-- Exercise SELECT policy and denied direct writes under the actual browser role.
SET LOCAL ROLE authenticated;
SELECT pg_temp.check_ne((SELECT count(*)>0 FROM ne_sales_classifications),'own RLS reads');
SELECT pg_temp.check_ne((SELECT count(*)=0 FROM ne_sales_classifications WHERE user_id<>auth.uid()),'foreign decisions hidden by actual RLS');
SELECT pg_temp.check_ne((get_ne_sales_summary(2026)->>'r2_reallocation')::numeric=3000,'actual authenticated summary keeps isolation');
DO $$ BEGIN
 BEGIN INSERT INTO public.ne_sales_classifications(journal_entry_id,user_id,transaction_id,ne_row,basis,evidence,decided_by) VALUES(gen_random_uuid(),auth.uid(),gen_random_uuid(),'R2','reviewed_legacy','{}',auth.uid()); RAISE EXCEPTION 'browser insert allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.capture_ne_manual_sale(gen_random_uuid(),'small_business_exempt',true); RAISE EXCEPTION 'private helper exposed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE public.ne_sales_classifications SET ne_row='R1'; RAISE EXCEPTION 'browser update allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN DELETE FROM public.ne_sales_classifications; RAISE EXCEPTION 'browser delete allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN
 PERFORM undo_customer_invoice_payment_atomic((SELECT id FROM customer_invoices WHERE user_id=auth.uid() AND invoice_number='KAN88-legacy-1'),gen_random_uuid());
 PERFORM pg_temp.check_ne((get_ne_sales_summary(2026)->>'r2_reallocation')::numeric=2000,'later invoice undo also inherits an explicitly reviewed legacy decision');
END $$;
DO $$ DECLARE uid uuid; result jsonb; n integer; BEGIN
 SELECT id INTO uid FROM kan88_owners WHERE id=auth.uid();
 SELECT count(*) INTO n FROM ne_sales_classifications WHERE user_id=uid;
 result:=delete_user_data_atomic(uid);
 PERFORM pg_temp.check_ne((result->'deleted'->>'ne_sales_classifications')::int=n,'atomic deletion count parity');
 PERFORM pg_temp.check_ne(NOT EXISTS(SELECT 1 FROM ne_sales_classifications WHERE user_id=uid),'no classification residue');
END $$;
SELECT jsonb_object_agg(label,data) FROM kan88_evidence;
