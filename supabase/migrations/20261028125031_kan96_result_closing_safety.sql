-- KAN-96 stage 1. LOCAL candidate only. No historical rows are changed.
BEGIN;
DO $guard$
BEGIN
 IF md5(replace(pg_get_functiondef('public.close_year_atomic(integer)'::regprocedure),chr(13),'')) <> '09839e674ce07177d774fe23bfe1608e'
 OR md5(replace(pg_get_functiondef('public.get_ne_sales_summary(integer)'::regprocedure),chr(13),'')) <> 'fd5b624e9dd977062e8f8b8f02184a83'
 OR md5(replace(pg_get_functiondef('public.get_withdrawal_context(date)'::regprocedure),chr(13),'')) <> '37704c515564406fe95bb9fdbe6eb18e'
 THEN RAISE EXCEPTION 'KAN-96: reviewed function changed; inspect before applying.'; END IF;
END $guard$;

-- Single tenant-scoped rule used by NE, withdrawal and the protected year lock.
-- No source/description heuristics, report reconstruction, or accounting writes.
CREATE FUNCTION public.get_result_closing_review(p_year integer, p_through_date date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path TO 'pg_catalog','public'
AS $body$
DECLARE u uuid:=auth.uid(); b date; e date; entries jsonb;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Inloggning krävs.' USING ERRCODE='28000'; END IF;
 IF p_year IS NULL OR p_year<1900 OR p_year>9998 THEN RAISE EXCEPTION 'Ogiltigt år.' USING ERRCODE='22023'; END IF;
 b:=make_date(p_year,1,1); e:=coalesce(p_through_date,make_date(p_year,12,31));
 IF e<b OR e>make_date(p_year,12,31) THEN RAISE EXCEPTION 'Ogiltigt kontrolldatum.' USING ERRCODE='22023'; END IF;
 WITH rows AS MATERIALIZED (
   SELECT t.id,t.date AS transaction_date,j.date AS journal_date,j.ver_nr,j.account_number,
     coalesce(j.debit,0)-coalesce(j.credit,0) AS amount,
     coalesce(j.debit,0)<>0 OR coalesce(j.credit,0)<>0 AS active
   FROM public.transactions t JOIN public.journal_entries j ON j.transaction_id=t.id AND j.user_id=t.user_id
   WHERE t.user_id=u AND j.user_id=u
     AND (t.date BETWEEN b AND e OR EXISTS(SELECT 1 FROM public.journal_entries a
       WHERE a.user_id=u AND a.transaction_id=t.id AND a.date BETWEEN b AND e))
 ), mixed AS (
   SELECT id,
     bool_or(account_number ~ '^899[0-9]$' AND active)
       AND bool_or(account_number ~ '^[3-8][0-9]{3}$' AND account_number !~ '^899[0-9]$' AND active) AS candidate,
     bool_or(extract(year FROM transaction_date)<>extract(year FROM journal_date)
       OR (transaction_date<=e)<>(journal_date<=e)) AS split_dates
   FROM rows GROUP BY id
 ), sums AS (
   SELECT r.account_number,
     sum(r.amount) FILTER(WHERE m.candidate) AS technical_delta,
     coalesce(sum(r.amount) FILTER(WHERE NOT m.candidate),0) AS ordinary_balance
   FROM rows r JOIN mixed m USING(id)
   WHERE r.transaction_date BETWEEN b AND e AND r.journal_date BETWEEN b AND e
     AND r.account_number ~ '^[3-8][0-9]{3}$' AND r.account_number !~ '^899[0-9]$'
   GROUP BY r.account_number
 ), affected AS (
   -- Per-account signed comparison: reversal/undo offsets within this year
   -- restore the input. Never offset different accounts or different years.
   SELECT account_number FROM sums WHERE technical_delta*ordinary_balance<0
 ), evidence AS (
   SELECT r.id AS transaction_id,r.transaction_date AS date,min(r.ver_nr) AS ver_nr,
     array_agg(DISTINCT r.journal_date ORDER BY r.journal_date) AS journal_dates,
     array_agg(DISTINCT r.account_number ORDER BY r.account_number) AS accounts
   FROM rows r JOIN mixed m USING(id)
   WHERE m.candidate AND (m.split_dates OR EXISTS(SELECT 1 FROM rows x JOIN affected a USING(account_number) WHERE x.id=r.id))
   GROUP BY r.id,r.transaction_date
 )
 SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY v.date,v.ver_nr,v.transaction_id),'[]'::jsonb) INTO entries FROM evidence v;
 RETURN jsonb_build_object('version',1,'year',p_year,'through_date',e,'blocked',jsonb_array_length(entries)>0,'entries',entries);
END $body$;
REVOKE ALL ON FUNCTION public.get_result_closing_review(integer,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_result_closing_review(integer,date) TO authenticated,service_role,postgres;
COMMENT ON FUNCTION public.get_result_closing_review(integer,date) IS
'KAN-96: owner-only read; opposite net movement against ordinary result-account activity in mixed 899x verifications. Full same-year restoration clears; no reconstruction.';

CREATE OR REPLACE FUNCTION public.get_ne_sales_summary(p_year integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_user uuid:=auth.uid(); result jsonb;
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'Inloggning krävs.' USING ERRCODE='28000'; END IF;
 IF p_year IS NULL OR p_year<1900 OR p_year>9998 THEN RAISE EXCEPTION 'Ogiltigt år.' USING ERRCODE='22023'; END IF;
 WITH rows AS (
 SELECT j.*,t.vat_rate FROM public.journal_entries j JOIN public.transactions t ON t.id=j.transaction_id AND t.user_id=j.user_id
 WHERE j.user_id=v_user AND t.user_id=v_user AND t.date>=make_date(p_year,1,1) AND t.date<make_date(p_year+1,1,1)
 ), balances AS (SELECT account_number,round(sum(coalesce(debit,0)-coalesce(credit,0)),2) AS balance FROM rows GROUP BY account_number), candidates AS (
 SELECT r.*,c.ne_row FROM rows r LEFT JOIN public.ne_sales_classifications c ON c.journal_entry_id=r.id AND c.user_id=v_user AND c.transaction_id=r.transaction_id
 WHERE r.account_number='3010' AND (coalesce(r.debit,0)<>0 OR coalesce(r.credit,0)<>0)
 ) SELECT jsonb_build_object('version',1,'balances',coalesce((SELECT jsonb_agg(to_jsonb(b) ORDER BY account_number) FROM balances b),'[]'::jsonb),
 'r2_reallocation',coalesce((SELECT sum(coalesce(credit,0)-coalesce(debit,0)) FROM candidates WHERE ne_row='R2'),0),
 'unresolved_count',(SELECT count(*) FROM candidates WHERE ne_row IS NULL AND coalesce(vat_rate,0)=0),
 'unresolved_amount',coalesce((SELECT sum(abs(coalesce(credit,0)-coalesce(debit,0))) FROM candidates WHERE ne_row IS NULL AND coalesce(vat_rate,0)=0),0)) INTO result;
 RETURN result || jsonb_build_object('result_closing_review',public.get_result_closing_review(p_year));
END $function$
;
CREATE OR REPLACE FUNCTION public.close_year_atomic(p_year integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE s jsonb;
BEGIN
  PERFORM public.lock_accounting_year_boundary(auth.uid(),true);
  IF p_year IS NULL OR p_year < 1900 OR p_year > 9999 THEN
    RAISE EXCEPTION 'Ogiltigt räkenskapsår.' USING ERRCODE='22023';
  END IF;
  -- Evaluate AFTER the accounting gate, including a possible lock wait.
  -- No client clock, session timezone or caller-supplied date can bypass this.
  IF p_year >= extract(year FROM clock_timestamp() AT TIME ZONE 'Europe/Stockholm')::integer THEN
    RAISE EXCEPTION 'År % är inte avslutat. Du kan låsa året tidigast den 1 januari % (svensk tid).', p_year, p_year + 1
      USING ERRCODE='23514';
  END IF;
  s:=public.get_result_closing_review(p_year);
  IF (s->>'blocked')::boolean THEN
    RAISE EXCEPTION 'År % kan inte låsas: bokslutsposter kan ha nollställt resultatkonton. Kontrollera berörda verifikationer i NE-underlaget mot bokföringsunderlaget och eventuellt externt bokslut. SoloLedger har inget självserviceflöde för att godkänna detta underlag.',p_year
      USING ERRCODE='23514';
  END IF;
  PERFORM public.assert_vat_year_coverage(p_year);
  PERFORM public.lock_inventory_boundary();
  IF EXISTS(SELECT 1 FROM public.fixed_assets WHERE user_id=auth.uid() AND decision_type='capitalized' AND fiscal_year<=p_year)
    OR EXISTS(SELECT 1 FROM public.journal_entries WHERE user_id=auth.uid() AND date<=make_date(p_year,12,31) AND account_number BETWEEN '1220' AND '1249') THEN
    s:=public.inventory_depreciation_state(p_year);
    IF s->>'status'='ready' THEN RAISE EXCEPTION 'Inventarier behöver årsavskrivning innan årslås.' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN public.close_year_unchecked_inventory(p_year);
END $function$
;
-- Add derived verdicts without changing existing save/bank fingerprints.
-- The journal inputs of this rule are already included in those fingerprints.
DO $patch$
DECLARE d text:=replace(pg_get_functiondef('public.get_withdrawal_context(date)'::regprocedure),chr(13),'');
BEGIN
 IF d NOT LIKE '%RETURN data || jsonb_build_object(%' OR d LIKE '%result_closing_reviews%' THEN
   RAISE EXCEPTION 'KAN-96: unexpected withdrawal context definition.';
 END IF;
 d:=replace(d,'  RETURN data || jsonb_build_object(', $insert$  RETURN data || jsonb_build_object('result_closing_reviews',coalesce((
    SELECT jsonb_agg(public.get_result_closing_review(y,least(p_as_of,make_date(y,12,31))) ORDER BY y)
    FROM (
      SELECT DISTINCT extract(year FROM (value->>'date')::date)::integer AS y FROM jsonb_array_elements(data->'journal')
    ) years
  ),'[]'::jsonb)) || jsonb_build_object($insert$);
 EXECUTE d;
END $patch$;
COMMIT;
