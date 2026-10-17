-- KAN-88: NE-only decisions. No historical journal/account changes or automatic backfill.
BEGIN;
CREATE TABLE public.ne_sales_classifications (
 journal_entry_id uuid PRIMARY KEY REFERENCES public.journal_entries(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
 ne_row text NOT NULL CHECK (ne_row IN ('R1','R2')),
 basis text NOT NULL CHECK (basis IN ('small_business_exempt','taxable','reviewed_legacy','inherited_correction')),
 evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence)='object'),
 decided_at timestamptz NOT NULL DEFAULT now(),
 decided_by uuid NOT NULL
);
CREATE INDEX ne_sales_classifications_user_transaction_idx ON public.ne_sales_classifications(user_id,transaction_id);
ALTER TABLE public.ne_sales_classifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY ne_sales_classifications_own_read ON public.ne_sales_classifications FOR SELECT TO authenticated USING ((SELECT auth.uid())=user_id);
REVOKE ALL ON public.ne_sales_classifications FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.ne_sales_classifications TO authenticated;
GRANT ALL ON public.ne_sales_classifications TO service_role;
COMMENT ON TABLE public.ne_sales_classifications IS 'KAN-88 immutable application decisions for 3010 NE allocation only; original bookkeeping remains unchanged. No current-profile fallback for historical rows.';

-- Private helper. Called only from the atomic ordinary-booking RPC, after journal validation.
CREATE FUNCTION public.capture_ne_manual_sale(p_transaction_id uuid,p_basis text,p_confirmed boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t public.transactions%ROWTYPE; v_profile text; v_row text; v_basis text;
BEGIN
 SELECT * INTO STRICT t FROM public.transactions WHERE id=p_transaction_id AND user_id=auth.uid();
 IF coalesce(t.source,'manual')<>'manual' OR coalesce(t.is_correction,false) OR t.import_batch_id IS NOT NULL THEN RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.journal_entries WHERE transaction_id=t.id AND user_id=t.user_id AND account_number='3010' AND credit>0) THEN RETURN; END IF;
 SELECT domestic_sales_vat_treatment INTO v_profile FROM public.profiles WHERE id=t.user_id FOR SHARE;
 IF p_basis='small_business_exempt' THEN
   IF NOT coalesce(p_confirmed,false) OR v_profile IS DISTINCT FROM 'small_business_exempt' OR t.vat_rate IS DISTINCT FROM 0
      OR EXISTS(SELECT 1 FROM public.journal_entries WHERE transaction_id=t.id AND account_number LIKE '26%' AND (debit<>0 OR credit<>0)) THEN
     RAISE EXCEPTION 'NE-underlaget för småföretagarundantaget är motsägande. Bekräfta försäljningens momsgrund och datum.' USING ERRCODE='23514';
   END IF;
   v_row:='R2'; v_basis:='small_business_exempt';
 ELSIF t.vat_rate>0 AND v_profile='taxable' AND EXISTS(SELECT 1 FROM public.journal_entries WHERE transaction_id=t.id AND user_id=t.user_id AND account_number IN ('2611','2621','2631') AND credit>0) THEN
   v_row:='R1'; v_basis:='taxable';
 ELSE RETURN;
 END IF;
 INSERT INTO public.ne_sales_classifications(journal_entry_id,user_id,transaction_id,ne_row,basis,evidence,decided_by)
 SELECT id,t.user_id,t.id,v_row,v_basis,jsonb_build_object('version',1,'source','ordinary_domestic_sale','booking_date',t.date,'profile_treatment',v_profile,'sale_date_basis_confirmed',coalesce(p_confirmed,false)),t.user_id
 FROM public.journal_entries WHERE transaction_id=t.id AND user_id=t.user_id AND account_number='3010' AND credit>0;
END $$;
REVOKE ALL ON FUNCTION public.capture_ne_manual_sale(uuid,text,boolean) FROM PUBLIC,anon,authenticated;

-- Invoice linkage is created after its journal. A captured policy is preserved on the invoice.
CREATE FUNCTION public.capture_ne_invoice_sale() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE i public.customer_invoices%ROWTYPE; v_row text; v_basis text;
BEGIN
 IF NEW.booking_kind NOT IN ('payment_same_year','year_end_receivable') THEN RETURN NEW; END IF;
 SELECT * INTO STRICT i FROM public.customer_invoices WHERE id=NEW.invoice_id AND user_id=NEW.user_id;
 IF i.customer_country<>'SE' OR i.currency<>'SEK' OR i.vat_policy_snapshot_status<>'captured' OR i.vat_policy_captured_at IS NULL THEN RETURN NEW; END IF;
 IF i.vat_policy_domestic_sales_vat_treatment='small_business_exempt' AND i.vat_treatment='exempt' AND i.vat_amount=0 AND i.net_amount=i.gross_amount THEN
   v_row:='R2';v_basis:='small_business_exempt';
 ELSIF i.vat_policy_domestic_sales_vat_treatment='taxable' AND i.vat_treatment='taxable' AND i.vat_amount>0 THEN
   v_row:='R1';v_basis:='taxable';
 ELSE RETURN NEW;
 END IF;
 IF v_row='R2' AND EXISTS(SELECT 1 FROM public.journal_entries WHERE transaction_id=NEW.transaction_id AND account_number LIKE '26%' AND (debit<>0 OR credit<>0)) THEN RAISE EXCEPTION 'Motsägande NE-/momsunderlag.' USING ERRCODE='23514'; END IF;
 INSERT INTO public.ne_sales_classifications(journal_entry_id,user_id,transaction_id,ne_row,basis,evidence,decided_by)
 SELECT j.id,NEW.user_id,NEW.transaction_id,v_row,v_basis,jsonb_build_object('version',1,'source','customer_invoice','invoice_id',i.id,'booking_kind',NEW.booking_kind,'invoice_date',i.invoice_date,'service_date',i.service_date,'booking_date',NEW.booking_date,'profile_treatment',i.vat_policy_domestic_sales_vat_treatment,'vat_treatment',i.vat_treatment,'policy_captured_at',i.vat_policy_captured_at),NEW.user_id
 FROM public.journal_entries j JOIN public.transactions t ON t.id=j.transaction_id AND t.user_id=j.user_id
 WHERE j.transaction_id=NEW.transaction_id AND j.user_id=NEW.user_id AND t.source='customer_invoice' AND j.account_number='3010' AND j.credit=i.net_amount AND j.debit=0;
 IF NOT FOUND THEN RAISE EXCEPTION 'Kundfakturans NE-underlag matchar inte journalen.' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.capture_ne_invoice_sale() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER capture_ne_invoice_sale AFTER INSERT ON public.customer_invoice_bookings FOR EACH ROW EXECUTE FUNCTION public.capture_ne_invoice_sale();

-- Corrections inherit the original decision, never today's profile. Ambiguous matches stay unresolved.
CREATE FUNCTION public.inherit_ne_sale_correction() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t public.transactions%ROWTYPE; original_id uuid; matches integer;
BEGIN
 IF NEW.account_number<>'3010' THEN RETURN NEW; END IF;
 SELECT * INTO STRICT t FROM public.transactions WHERE id=NEW.transaction_id AND user_id=NEW.user_id;
 IF NOT coalesce(t.is_correction,false) OR t.corrects_ver_nr IS NULL THEN RETURN NEW; END IF;
 SELECT count(*), min(j.id::text)::uuid INTO matches,original_id FROM public.journal_entries j
 JOIN public.transactions ot ON ot.id=j.transaction_id AND ot.user_id=j.user_id
 WHERE j.user_id=NEW.user_id AND j.ver_nr=t.corrects_ver_nr AND j.account_number='3010'
 AND j.debit=NEW.credit AND j.credit=NEW.debit AND j.transaction_id<>NEW.transaction_id;
 IF matches=1 THEN
 INSERT INTO public.ne_sales_classifications(journal_entry_id,user_id,transaction_id,ne_row,basis,evidence,decided_by)
 SELECT NEW.id,NEW.user_id,NEW.transaction_id,c.ne_row,'inherited_correction',jsonb_build_object('version',1,'original_journal_entry_id',original_id,'original_basis',c.basis,'original_evidence',c.evidence),NEW.user_id
 FROM public.ne_sales_classifications c WHERE c.journal_entry_id=original_id AND c.user_id=NEW.user_id;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.inherit_ne_sale_correction() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER inherit_ne_sale_correction AFTER INSERT ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.inherit_ne_sale_correction();

-- One explicitly reviewed existing row, with evidence. No profile inference, journal write or bulk operation.
CREATE FUNCTION public.review_ne_legacy_sale(p_journal_entry_id uuid,p_ne_row text,p_evidence_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j public.journal_entries%ROWTYPE; t public.transactions%ROWTYPE; v_invoice jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Inloggning krävs.' USING ERRCODE='28000'; END IF;
 IF p_ne_row IS NULL OR p_ne_row NOT IN ('R1','R2') OR length(btrim(coalesce(p_evidence_note,'')))<20 OR length(p_evidence_note)>2000 THEN RAISE EXCEPTION 'Ange R1/R2 och konkret granskat underlag (20–2000 tecken).' USING ERRCODE='22023'; END IF;
 SELECT * INTO j FROM public.journal_entries WHERE id=p_journal_entry_id AND user_id=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'Intäktsraden saknas.' USING ERRCODE='42501'; END IF;
 SELECT * INTO STRICT t FROM public.transactions WHERE id=j.transaction_id AND user_id=auth.uid() FOR UPDATE;
 IF j.account_number<>'3010' OR coalesce(j.credit,0)<=0 OR coalesce(j.debit,0)<>0 OR NOT t.booked OR coalesce(t.is_correction,false) OR coalesce(t.source,'manual') NOT IN ('manual','customer_invoice') OR t.import_batch_id IS NOT NULL THEN RAISE EXCEPTION 'Posten omfattas inte av granskad svensk 3010-försäljning.' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM public.closed_years WHERE user_id=t.user_id AND year=extract(year FROM t.date)::int) THEN RAISE EXCEPTION 'Året är låst.' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM public.transactions ct JOIN public.journal_entries cj ON cj.transaction_id=ct.id AND cj.user_id=ct.user_id WHERE ct.user_id=t.user_id AND ct.is_correction AND ct.corrects_ver_nr=j.ver_nr) THEN RAISE EXCEPTION 'Posten har rättelser; granska hela rättelsekedjan separat.' USING ERRCODE='23514'; END IF;
 IF p_ne_row='R2' AND (coalesce(t.vat_rate,0)<>0 OR EXISTS(SELECT 1 FROM public.journal_entries WHERE transaction_id=t.id AND account_number LIKE '26%' AND (debit<>0 OR credit<>0))) THEN RAISE EXCEPTION 'R2 motsägs av bokförd moms.' USING ERRCODE='23514'; END IF;
 SELECT jsonb_build_object('invoice_id',i.id,'booking_kind',b.booking_kind,'customer_country',i.customer_country,'currency',i.currency,
   'invoice_date',i.invoice_date,'service_date',i.service_date,'vat_treatment',i.vat_treatment,'vat_amount',i.vat_amount,
   'policy_status',i.vat_policy_snapshot_status,'policy_treatment',i.vat_policy_domestic_sales_vat_treatment,'policy_captured_at',i.vat_policy_captured_at)
 INTO v_invoice FROM public.customer_invoice_bookings b JOIN public.customer_invoices i ON i.id=b.invoice_id AND i.user_id=b.user_id
 WHERE b.transaction_id=t.id AND b.user_id=t.user_id;
 IF v_invoice IS NOT NULL AND (v_invoice->>'customer_country'<>'SE' OR v_invoice->>'currency'<>'SEK') THEN RAISE EXCEPTION 'Fakturan omfattas inte av granskad svensk försäljning.' USING ERRCODE='23514'; END IF;
 INSERT INTO public.ne_sales_classifications(journal_entry_id,user_id,transaction_id,ne_row,basis,evidence,decided_by)
 VALUES(j.id,t.user_id,t.id,p_ne_row,'reviewed_legacy',jsonb_build_object('version',1,'review_note',btrim(p_evidence_note),'booking_date',t.date,'review_scope','this_row_only','saved_invoice_evidence',v_invoice),auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.review_ne_legacy_sale(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.review_ne_legacy_sale(uuid,text,text) TO authenticated;

-- A single snapshot supplies both original annual balances and the NE-only adjustment.
CREATE FUNCTION public.get_ne_sales_summary(p_year integer) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
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
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_ne_sales_summary(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_ne_sales_summary(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.book_transaction_atomic(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_journal_count bigint;
  v_invalid_journal_count bigint;
  v_debit_sum numeric;
  v_credit_sum numeric;
  v_date date;
  v_description text;
  v_amount numeric;
  v_type text;
  v_vat_rate numeric;
  v_vat_status text;
  v_file_url text;

  v_debit_account text;
  v_credit_account text;
  v_is_income boolean;

  v_vat_amount numeric;
  v_net_amount numeric;
  v_output_vat_account text;
  v_input_vat_deduction text := 'none';
  v_deductible_vat_amount numeric := 0;
  v_expense_amount numeric;

  v_ver_nr integer;
  v_tx_id uuid;

  v_needs_vat_lock boolean := false;
  v_matching_vat_periods integer := 0;
  v_blocking_vat_periods integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Ingen inloggad användare.'
      USING ERRCODE = '28000';
  END IF;

  IF p_payload->>'date' IS NULL
     OR p_payload->>'date' !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RAISE EXCEPTION 'Ogiltigt eller saknat bokföringsdatum.'
      USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_date := (p_payload->>'date')::date;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Ogiltigt bokföringsdatum: %.', p_payload->>'date'
      USING ERRCODE = '22023';
  END;

  v_description := btrim(coalesce(p_payload->>'description', ''));
  IF v_description = '' THEN
    RAISE EXCEPTION 'Beskrivning saknas.'
      USING ERRCODE = '22023';
  END IF;

  IF p_payload->>'amount' IS NULL
     OR p_payload->>'amount' !~ '^-?\d+(\.\d+)?$' THEN
    RAISE EXCEPTION 'Ogiltigt eller saknat belopp.'
      USING ERRCODE = '22023';
  END IF;
  v_amount := (p_payload->>'amount')::numeric;
  IF v_amount <= 0 OR v_amount <> round(v_amount, 2)
     OR v_amount > 9999999999999.99 THEN
    RAISE EXCEPTION 'Ogiltigt belopp. Ange ett belopp större än 0 kr, i hela ören, inom tillåtet beloppsintervall.'
      USING ERRCODE = '22023';
  END IF;


  v_type := p_payload->>'type';
  IF v_type IS NULL OR btrim(v_type) = '' THEN
    RAISE EXCEPTION 'Kategori/kontotyp saknas.'
      USING ERRCODE = '22023';
  END IF;

  IF p_payload->>'vat_rate' IS NULL OR p_payload->>'vat_rate' = '' THEN
    v_vat_rate := 0;
  ELSIF p_payload->>'vat_rate' !~ '^-?\d+(\.\d+)?$' THEN
    RAISE EXCEPTION 'Ogiltig momssats.'
      USING ERRCODE = '22023';
  ELSE
    v_vat_rate := (p_payload->>'vat_rate')::numeric;
  END IF;

  IF v_vat_rate NOT IN (0, 6, 12, 25) THEN
    RAISE EXCEPTION
      'Momssatsen % stöds inte. Tillåtna satser är 0, 6, 12 och 25 procent.',
      v_vat_rate
      USING ERRCODE = '22023';
  END IF;

  SELECT p.vat_status
    INTO v_vat_status
  FROM public.profiles p
  WHERE p.id = v_user_id;

  IF coalesce(v_vat_status, 'unknown') = 'not_registered'
     AND v_vat_rate <> 0 THEN
    RAISE EXCEPTION
      'Företaget är markerat som inte momsregistrerat. Momssatsen måste vara 0 procent för nya vanliga bokningar.'
      USING ERRCODE = '23514';
  END IF;

  v_file_url := nullif(p_payload->>'file_url', '');

  IF EXISTS (
    SELECT 1
    FROM public.closed_years
    WHERE user_id = v_user_id
      AND year = extract(year from v_date)::int
  ) THEN
    RAISE EXCEPTION 'Räkenskapsår % är låst för ändringar.',
      extract(year from v_date)::int
      USING ERRCODE = '23514';
  END IF;

  SELECT debit_account, credit_account
    INTO v_debit_account, v_credit_account
  FROM public.accounts
  WHERE id = v_type
    AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Konto saknas eller tillhör inte användaren: %.', v_type
      USING ERRCODE = '23503';
  END IF;

  IF v_debit_account IS NULL OR btrim(v_debit_account) = ''
     OR v_credit_account IS NULL OR btrim(v_credit_account) = '' THEN
    RAISE EXCEPTION 'Kontotyp % saknar debet- eller kreditkonto.', v_type
      USING ERRCODE = '23514';
  END IF;

  v_vat_amount :=
    CASE
      WHEN v_vat_rate > 0
        THEN round((v_amount - (v_amount / (1 + v_vat_rate / 100)))::numeric, 2)
      ELSE 0
    END;

  v_net_amount := round((v_amount - v_vat_amount)::numeric, 2);
  v_is_income := left(v_credit_account, 1) = '3';

  IF v_is_income AND v_vat_amount > 0 THEN
    v_output_vat_account :=
      CASE v_vat_rate
        WHEN 25 THEN '2611'
        WHEN 12 THEN '2621'
        WHEN 6  THEN '2631'
        ELSE NULL
      END;

    IF v_output_vat_account IS NULL THEN
      RAISE EXCEPTION 'Momssatsen % stöds inte för svensk försäljning. Tillåtna satser är 0, 6, 12 och 25 procent.', v_vat_rate
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF NOT v_is_income AND v_vat_amount > 0 THEN
    v_input_vat_deduction := public.resolve_purchase_input_vat_deduction(
      v_user_id,
      p_payload->>'input_vat_deduction_entitlement'
    );
  END IF;

  v_deductible_vat_amount :=
    CASE
      WHEN NOT v_is_income
           AND v_vat_amount > 0
           AND v_input_vat_deduction = 'full'
        THEN v_vat_amount
      ELSE 0
    END;
  v_expense_amount := round((v_amount - v_deductible_vat_amount)::numeric, 2);

  v_needs_vat_lock :=
       public.vat_concurrency_account(v_debit_account)
    OR public.vat_concurrency_account(v_credit_account)
    OR (
         v_vat_amount > 0
         AND v_is_income
         AND public.vat_concurrency_account(v_output_vat_account)
       )
    OR (
         v_deductible_vat_amount > 0
         AND public.vat_concurrency_account('2641')
       );

  IF v_needs_vat_lock THEN
    PERFORM public.lock_vat_months(
      v_user_id,
      ARRAY[v_date]::date[]
    );

    SELECT
      count(*)::integer,
      count(*) FILTER (
        WHERE vp.status IN ('closed', 'declared')
      )::integer
    INTO
      v_matching_vat_periods,
      v_blocking_vat_periods
    FROM public.vat_periods vp
    WHERE vp.user_id = v_user_id
      AND vp.source = 'sololedger'
      AND v_date BETWEEN vp.period_start AND vp.period_end;

    IF v_matching_vat_periods > 1 THEN
      RAISE EXCEPTION
        'Flera överlappande SoloLedger-momsperioder matchar bokföringsdatum %. Bokningen stoppades för manuell kontroll.',
        v_date
        USING ERRCODE = '23514';
    END IF;

    IF v_blocking_vat_periods > 0 THEN
      RAISE EXCEPTION
        'Momsperioden för bokföringsdatum % är redan stängd eller deklarerad. Bokningen kan inte genomföras.',
        v_date
        USING ERRCODE = '23514';
    END IF;
  END IF;

  SELECT public.get_next_ver_nr(v_user_id) INTO v_ver_nr;

  IF v_ver_nr IS NULL THEN
    RAISE EXCEPTION 'Kunde inte generera verifikationsnummer.';
  END IF;

  INSERT INTO public.transactions (
    user_id,
    date,
    description,
    amount,
    type,
    vat_rate,
    file_url,
    booked
  ) VALUES (
    v_user_id,
    v_date,
    v_description,
    v_amount,
    v_type,
    v_vat_rate,
    v_file_url,
    true
  )
  RETURNING id INTO v_tx_id;

  IF v_is_income THEN
    INSERT INTO public.journal_entries (
      transaction_id, ver_nr, account_number,
      debit, credit, description, date, user_id
    )
    VALUES
      (
        v_tx_id, v_ver_nr, v_debit_account,
        v_amount, 0, v_description, v_date, v_user_id
      ),
      (
        v_tx_id, v_ver_nr, v_credit_account,
        0, v_net_amount, v_description, v_date, v_user_id
      );

    IF v_vat_amount > 0 THEN
      INSERT INTO public.journal_entries (
        transaction_id, ver_nr, account_number,
        debit, credit, description, date, user_id
      )
      VALUES (
        v_tx_id, v_ver_nr, v_output_vat_account,
        0, v_vat_amount,
        'Utgående moms på ' || v_description,
        v_date, v_user_id
      );
    END IF;

  ELSE
    INSERT INTO public.journal_entries (
      transaction_id, ver_nr, account_number,
      debit, credit, description, date, user_id
    )
    VALUES
      (
        v_tx_id, v_ver_nr, v_debit_account,
        v_expense_amount, 0, v_description, v_date, v_user_id
      ),
      (
        v_tx_id, v_ver_nr, v_credit_account,
        0, v_amount, v_description, v_date, v_user_id
      );

    IF v_deductible_vat_amount > 0 THEN
      INSERT INTO public.journal_entries (
        transaction_id, ver_nr, account_number,
        debit, credit, description, date, user_id
      )
      VALUES (
        v_tx_id, v_ver_nr, '2641',
        v_deductible_vat_amount, 0,
        'Ingående moms på ' || v_description,
        v_date, v_user_id
      );
    END IF;
  END IF;

  -- Inspect the whole user/verification plus all rows linked to the new transaction.
  -- OR avoids double-counting; DISTINCT FROM rejects NULL and mismatched identities.
  SELECT count(*), count(*) FILTER (
    WHERE transaction_id IS DISTINCT FROM v_tx_id
       OR user_id IS DISTINCT FROM v_user_id OR ver_nr IS DISTINCT FROM v_ver_nr
       OR debit IS NULL OR credit IS NULL OR debit < 0 OR credit < 0
       OR debit = 'NaN'::numeric OR credit = 'NaN'::numeric
       OR (debit > 0 AND credit > 0)
  ), sum(debit), sum(credit)
  INTO v_journal_count, v_invalid_journal_count, v_debit_sum, v_credit_sum
  FROM public.journal_entries
  WHERE transaction_id = v_tx_id
     OR (user_id = v_user_id AND ver_nr = v_ver_nr);

  IF v_journal_count <> (2 + CASE WHEN (v_is_income AND v_vat_amount > 0) OR v_deductible_vat_amount > 0 THEN 1 ELSE 0 END) OR v_invalid_journal_count <> 0
     OR v_debit_sum IS NULL OR v_credit_sum IS NULL
     OR v_debit_sum <= 0 OR v_debit_sum <> v_credit_sum THEN
    RAISE EXCEPTION 'Journalen för VER-% är ofullständig, ogiltig eller obalanserad. Hela bokningen avbröts.', v_ver_nr
      USING ERRCODE = '23514';
  END IF;

  PERFORM public.capture_ne_manual_sale(v_tx_id, p_payload->>'ne_sales_basis', coalesce(p_payload->>'ne_sales_basis_confirmed','false')='true');

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_tx_id,
    'ver_nr', v_ver_nr
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_user_data_atomic(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
  v_ne_sales_classifications integer := 0;
  v_fixed_asset_depreciation_runs integer := 0;
  v_fixed_asset_events integer := 0;
  v_fixed_asset_acquisition_idempotency integer := 0;
  v_fixed_assets integer := 0;
  v_fixed_asset_acquisition_groups integer := 0;
  v_customer_invoice_bookings integer := 0;
  v_customer_invoices integer := 0;
  v_tax_account_movements integer := 0;
  v_tax_account_events integer := 0;
  v_vat_v2_booking_idempotency integer := 0;
  v_vat_audit_snapshots integer := 0;
  v_vat_periods integer := 0;
  v_company_payment_account_roles integer := 0;
  v_journal_entries integer := 0;
  v_transactions integer := 0;
  v_favorites integer := 0;
  v_import_batches integer := 0;
  v_accounts integer := 0;
  v_closed_years integer := 0;
  v_ver_nr_sequences integer := 0;
  v_profiles integer := 0;
  v_sie_import_inputs integer := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id krävs.' USING ERRCODE = '22023';
  END IF;

  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Användaren hittades inte.' USING ERRCODE = 'P0002';
  END IF;

  IF v_role = 'admin' THEN
    RAISE EXCEPTION 'Admin-konton kan inte raderas här.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.delete_user_data_atomic_lifecycle_context (
    backend_pid,
    user_id
  ) VALUES (
    pg_backend_pid(),
    p_user_id
  )
  ON CONFLICT (backend_pid, user_id)
  DO UPDATE SET created_at = excluded.created_at;

  DELETE FROM public.sie_import_inputs WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_sie_import_inputs = ROW_COUNT;

  DELETE FROM public.ne_sales_classifications WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_ne_sales_classifications = ROW_COUNT;

  DELETE FROM public.fixed_asset_depreciation_runs WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_fixed_asset_depreciation_runs = ROW_COUNT;

  DELETE FROM public.fixed_asset_events WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_fixed_asset_events = ROW_COUNT;

  DELETE FROM public.fixed_asset_acquisition_idempotency WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_fixed_asset_acquisition_idempotency = ROW_COUNT;

  DELETE FROM public.fixed_assets WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_fixed_assets = ROW_COUNT;

  DELETE FROM public.fixed_asset_acquisition_groups WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_fixed_asset_acquisition_groups = ROW_COUNT;

  DELETE FROM public.tax_account_movements WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_tax_account_movements = ROW_COUNT;

  DELETE FROM public.tax_account_events WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_tax_account_events = ROW_COUNT;

  DELETE FROM public.customer_invoice_bookings WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_customer_invoice_bookings = ROW_COUNT;

  DELETE FROM public.delete_user_data_atomic_lifecycle_context
  WHERE backend_pid = pg_backend_pid()
    AND user_id = p_user_id;

  DELETE FROM public.customer_invoices WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_customer_invoices = ROW_COUNT;

  DELETE FROM public.vat_v2_booking_idempotency WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_vat_v2_booking_idempotency = ROW_COUNT;

  DELETE FROM public.vat_audit_snapshots WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_vat_audit_snapshots = ROW_COUNT;

  DELETE FROM public.vat_periods WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_vat_periods = ROW_COUNT;

  DELETE FROM public.company_payment_account_roles WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_company_payment_account_roles = ROW_COUNT;

  DELETE FROM public.journal_entries WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_journal_entries = ROW_COUNT;

  DELETE FROM public.transactions WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_transactions = ROW_COUNT;

  DELETE FROM public.favorites WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_favorites = ROW_COUNT;

  DELETE FROM public.import_batches WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_import_batches = ROW_COUNT;

  DELETE FROM public.accounts WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_accounts = ROW_COUNT;

  DELETE FROM public.closed_years WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_closed_years = ROW_COUNT;

  DELETE FROM public.ver_nr_sequences WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_ver_nr_sequences = ROW_COUNT;

  DELETE FROM public.profiles WHERE id = p_user_id;
  GET DIAGNOSTICS v_profiles = ROW_COUNT;

  IF v_profiles <> 1 THEN
    RAISE EXCEPTION 'Profilraderingen gav oväntat resultat.' USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'deleted', jsonb_build_object(
      'ne_sales_classifications', v_ne_sales_classifications,
      'fixed_asset_depreciation_runs', v_fixed_asset_depreciation_runs,
      'fixed_asset_events', v_fixed_asset_events,
      'fixed_asset_acquisition_idempotency', v_fixed_asset_acquisition_idempotency,
      'fixed_assets', v_fixed_assets,
      'fixed_asset_acquisition_groups', v_fixed_asset_acquisition_groups,
      'customer_invoice_bookings', v_customer_invoice_bookings,
      'customer_invoices', v_customer_invoices,
      'tax_account_movements', v_tax_account_movements,
      'tax_account_events', v_tax_account_events,
      'vat_v2_booking_idempotency', v_vat_v2_booking_idempotency,
      'vat_audit_snapshots', v_vat_audit_snapshots,
      'vat_periods', v_vat_periods,
      'company_payment_account_roles', v_company_payment_account_roles,
      'journal_entries', v_journal_entries,
      'transactions', v_transactions,
      'favorites', v_favorites,
      'import_batches', v_import_batches,
      'accounts', v_accounts,
      'closed_years', v_closed_years,
      'ver_nr_sequences', v_ver_nr_sequences,
      'sie_import_inputs', v_sie_import_inputs,
      'profiles', v_profiles
    )
  );
EXCEPTION WHEN OTHERS THEN
  DELETE FROM public.delete_user_data_atomic_lifecycle_context
  WHERE backend_pid = pg_backend_pid()
    AND user_id = p_user_id;
  RAISE;
END;
$function$;

COMMIT;
