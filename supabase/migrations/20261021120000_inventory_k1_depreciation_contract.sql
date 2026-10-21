-- KAN-62/65/73/76: retain historical migrations; normal calendar-year K1 only.
BEGIN;

CREATE FUNCTION public.lock_inventory_boundary() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Ingen inloggad användare.' USING ERRCODE='28000'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('sololedger:inventory:'||auth.uid()::text,0));
END $$;
REVOKE ALL ON FUNCTION public.lock_inventory_boundary() FROM PUBLIC,anon,authenticated,service_role;

-- Take the inventory lock after the existing outer KAN-75 gate, before the
-- private acquisition implementation (including legacy idempotent replay).
DO $migration$
DECLARE d text; anchor text;
BEGIN
  d:=pg_get_functiondef('public.book_fixed_asset_acquisition_atomic(jsonb)'::regprocedure);
  anchor:='  RETURN public.book_fixed_asset_acquisition_atomic_unchecked_kan54(p_payload);';
  IF strpos(d,anchor)=0 OR strpos(d,'KAN-75: first lock domain')=0 THEN RAISE EXCEPTION 'Unexpected acquisition wrapper'; END IF;
  EXECUTE replace(d,anchor,'  PERFORM public.lock_inventory_boundary();'||E'\n'||anchor);
  d:=pg_get_functiondef('public.book_fixed_asset_acquisition_atomic_unchecked_kan54(jsonb)'::regprocedure);
  anchor:='  SELECT public.get_next_ver_nr(v_user_id) INTO v_ver_nr;';
  IF strpos(d,anchor)=0 OR strpos(d,'kan62-rule-contract-v1')=0 THEN RAISE EXCEPTION 'Requires reviewed KAN-62 contract'; END IF;
  EXECUTE replace(d,anchor,$guard$
  IF (v_capitalized_amount > 0 OR v_reclassification_amount > 0) AND EXISTS (
    SELECT 1 FROM public.fixed_asset_depreciation_runs WHERE user_id=v_user_id AND fiscal_year>=v_fiscal_year
  ) THEN
    RAISE EXCEPTION 'Inventarieunderlaget för året är fastställt genom årsavskrivning. Senare aktivering eller omklassning kräver en kontrollerad rättelse som ännu inte stöds.' USING ERRCODE='23514';
  END IF;
$guard$||anchor);
END $migration$;

CREATE FUNCTION public.inventory_depreciation_state(p_year integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  u uuid:=auth.uid(); end_date date; rules jsonb; half_pbb numeric;
  acquisitions numeric; depreciation numeric; balance numeric; basis numeric;
  amount numeric; signature text; run public.fixed_asset_depreciation_runs%ROWTYPE;
BEGIN
  IF u IS NULL THEN RAISE EXCEPTION 'Ingen inloggad användare.' USING ERRCODE='28000'; END IF;
  IF p_year IS NULL OR p_year<2025 OR p_year>extract(year FROM current_date)::integer THEN
    RAISE EXCEPTION 'Året stöds inte för normal K1-avskrivning.' USING ERRCODE='23514'; END IF;
  end_date:=make_date(p_year,12,31);
  rules:=public.get_tax_rule_parameters_for_year(p_year);
  half_pbb:=(rules->>'halfPriceBaseAmount')::numeric;
  SELECT * INTO run FROM public.fixed_asset_depreciation_runs WHERE user_id=u AND fiscal_year=p_year;
  SELECT coalesce(sum(capitalized_amount),0) INTO acquisitions FROM public.fixed_assets
    WHERE user_id=u AND acquisition_date<=end_date AND decision_type='capitalized';
  SELECT coalesce(sum(depreciation_amount),0) INTO depreciation FROM public.fixed_asset_depreciation_runs
    WHERE user_id=u AND fiscal_year<=p_year;
  SELECT round(coalesce(sum(coalesce(debit,0)-coalesce(credit,0)),0),2) INTO balance
    FROM public.journal_entries WHERE user_id=u AND date<=end_date AND account_number BETWEEN '1220' AND '1249';
  IF balance IS DISTINCT FROM round(acquisitions-depreciation,2) OR balance<0 OR EXISTS (
    SELECT 1 FROM public.journal_entries j JOIN public.transactions t ON t.id=j.transaction_id
    WHERE j.user_id=u AND j.date<=end_date AND j.account_number BETWEEN '1220' AND '1249'
      AND (t.user_id<>u OR t.source IS NULL OR t.source NOT IN ('fixed_asset','fixed_asset_reclassification','fixed_asset_depreciation'))
  ) THEN
    RAISE EXCEPTION 'Inventariejournal och register stämmer inte överens. Osäkra ingående värden, manuella ändringar, krediter och avyttring stöds inte i detta flöde.' USING ERRCODE='23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fixed_assets WHERE user_id=u AND acquisition_date<=end_date
    AND decision_type='capitalized' AND status<>'active') THEN
    RAISE EXCEPTION 'Avyttring eller utrangering kräver separat kontrollerat stöd.' USING ERRCODE='23514'; END IF;
  -- Missing previous runs are not silently folded into a later year's rate.
  IF EXISTS (
    SELECT 1 FROM generate_series((SELECT min(fiscal_year) FROM public.fixed_assets
      WHERE user_id=u AND decision_type='capitalized'),p_year-1) y
    WHERE NOT EXISTS (SELECT 1 FROM public.fixed_asset_depreciation_runs r WHERE r.user_id=u AND r.fiscal_year=y)
      AND (SELECT coalesce(sum(capitalized_amount),0) FROM public.fixed_assets WHERE user_id=u AND decision_type='capitalized'
        AND acquisition_date<=make_date(y,12,31)) >
        (SELECT coalesce(sum(depreciation_amount),0) FROM public.fixed_asset_depreciation_runs WHERE user_id=u AND fiscal_year<=y)
  ) THEN RAISE EXCEPTION 'Slutför tidigare inventarieårs avskrivning först.' USING ERRCODE='23514'; END IF;
  IF run.id IS NULL AND EXISTS (SELECT 1 FROM public.fixed_asset_depreciation_runs WHERE user_id=u AND fiscal_year>p_year) THEN
    RAISE EXCEPTION 'Ett senare inventarieår är redan fastställt. Automatisk rättelse stöds inte.' USING ERRCODE='23514'; END IF;
  basis:=balance+coalesce(run.depreciation_amount,0);
  amount:=CASE WHEN basis<=half_pbb THEN basis ELSE round(basis*0.30,2) END;
  IF run.id IS NOT NULL AND (run.basis_amount IS DISTINCT FROM basis OR run.depreciation_amount IS DISTINCT FROM amount) THEN
    RAISE EXCEPTION 'Årsavskrivningens underlag har ändrats. Kontrollerad rättelse krävs; omkörning stöds inte.' USING ERRCODE='23514'; END IF;
  SELECT md5(jsonb_build_object('year',p_year,'rule',rules,'basis',basis,'acquisitions',acquisitions,
    'priorDepreciation',depreciation-coalesce(run.depreciation_amount,0),
    'assets',(SELECT jsonb_agg(jsonb_build_array(id,acquisition_date,capitalized_amount,status) ORDER BY id)
      FROM public.fixed_assets WHERE user_id=u AND acquisition_date<=end_date AND decision_type='capitalized'))::text) INTO signature;
  RETURN jsonb_build_object('status',CASE WHEN run.id IS NOT NULL THEN 'booked' WHEN basis=0 THEN 'empty' ELSE 'ready' END,
    'fiscal_year',p_year,'basis_amount',basis,'book_value',balance,'acquisition_total',acquisitions,
    'depreciation_total',depreciation,'depreciation_amount',amount,'signature',signature,
    'method',CASE WHEN basis<=half_pbb THEN 'k1_half_pbb_full_writeoff' ELSE 'k1_main_rule_30_percent' END,
    'half_price_base_amount',half_pbb);
END $$;
REVOKE ALL ON FUNCTION public.inventory_depreciation_state(integer) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.get_fixed_asset_depreciation_preview(p_fiscal_year integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM public.lock_accounting_year_boundary(auth.uid(),false);
  PERFORM public.lock_inventory_boundary();
  BEGIN RETURN public.inventory_depreciation_state(p_fiscal_year);
  EXCEPTION WHEN check_violation THEN RETURN jsonb_build_object('status','blocked','reason',SQLERRM); END;
END $$;
REVOKE ALL ON FUNCTION public.get_fixed_asset_depreciation_preview(integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_fixed_asset_depreciation_preview(integer) TO authenticated;

-- Preserve the proven journal writer and year-close implementation privately.
DO $migration$
DECLARE d text;
BEGIN
  d:=pg_get_functiondef('public.book_fixed_asset_depreciation_atomic(integer)'::regprocedure);
  IF strpos(d,'KAN-75: first lock domain')=0 OR strpos(d,'''7830''')=0 THEN RAISE EXCEPTION 'Unexpected depreciation writer'; END IF;
  EXECUTE replace(d,'public.book_fixed_asset_depreciation_atomic(', 'public.book_fixed_asset_depreciation_unchecked_inventory(');
  d:=pg_get_functiondef('public.close_year_atomic(integer)'::regprocedure);
  IF strpos(d,'KAN-75: first lock domain')=0 THEN RAISE EXCEPTION 'Unexpected close-year writer'; END IF;
  EXECUTE replace(d,'public.close_year_atomic(', 'public.close_year_unchecked_inventory(');
END $migration$;
REVOKE ALL ON FUNCTION public.book_fixed_asset_depreciation_unchecked_inventory(integer) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.close_year_unchecked_inventory(integer) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.book_fixed_asset_depreciation_atomic(p_fiscal_year integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM public.lock_accounting_year_boundary(auth.uid(),false);
  PERFORM public.lock_inventory_boundary();
  -- Existing callers may replay, but cannot create an unconfirmed new run.
  IF EXISTS (SELECT 1 FROM public.fixed_asset_depreciation_runs WHERE user_id=auth.uid() AND fiscal_year=p_fiscal_year) THEN
    RETURN public.book_fixed_asset_depreciation_unchecked_inventory(p_fiscal_year);
  END IF;
  RAISE EXCEPTION 'Uppdatera inventariesidan och bekräfta tolvmånadersår samt granskat avskrivningsunderlag.' USING ERRCODE='23514';
END $$;

CREATE FUNCTION public.book_fixed_asset_depreciation_checked(p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE y integer; state jsonb; result jsonb; previous jsonb;
BEGIN
  PERFORM public.lock_accounting_year_boundary(auth.uid(),false);
  PERFORM public.lock_inventory_boundary();
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR p_payload->>'fiscal_year' !~ '^20[0-9]{2}$' THEN
    RAISE EXCEPTION 'Ogiltigt avskrivningsunderlag.' USING ERRCODE='22023'; END IF;
  y:=(p_payload->>'fiscal_year')::integer;
  IF p_payload->'normal_calendar_year_confirmed' IS DISTINCT FROM 'true'::jsonb
    OR p_payload->'all_purchases_complete' IS DISTINCT FROM 'true'::jsonb
    OR p_payload->>'year_start' IS DISTINCT FROM make_date(y,1,1)::text
    OR p_payload->>'year_end' IS DISTINCT FROM make_date(y,12,31)::text THEN
    RAISE EXCEPTION 'Bekräfta ett känt tolvmånadersår januari–december och att årets inventarieköp är färdiga. Okänd, förkortad eller förlängd årslängd stöds inte.' USING ERRCODE='23514'; END IF;
  SELECT audit_snapshot->'confirmedRequest' INTO previous FROM public.fixed_asset_depreciation_runs WHERE user_id=auth.uid() AND fiscal_year=y;
  IF FOUND THEN
    IF previous IS DISTINCT FROM p_payload THEN RAISE EXCEPTION 'Årsavskrivningen är redan bokförd med annat underlag. Automatisk rättelse stöds inte.' USING ERRCODE='23505'; END IF;
    RETURN public.book_fixed_asset_depreciation_unchecked_inventory(y);
  END IF;
  state:=public.inventory_depreciation_state(y);
  IF state->>'status'<>'ready' THEN RAISE EXCEPTION 'Det finns inget nytt avskrivningsunderlag.' USING ERRCODE='23514'; END IF;
  IF p_payload->>'expected_signature' IS DISTINCT FROM state->>'signature'
    OR p_payload->'expected_amount' IS DISTINCT FROM state->'depreciation_amount' THEN
    RAISE EXCEPTION 'Avskrivningsunderlaget har ändrats. Uppdatera och granska beloppet igen.' USING ERRCODE='23514'; END IF;
  result:=public.book_fixed_asset_depreciation_unchecked_inventory(y);
  IF result->'depreciation_amount' IS DISTINCT FROM state->'depreciation_amount'
    OR result->'basis_amount' IS DISTINCT FROM state->'basis_amount' THEN
    RAISE EXCEPTION 'Avskrivningsberäkningen stämmer inte med granskat underlag.' USING ERRCODE='23514'; END IF;
  UPDATE public.fixed_asset_depreciation_runs SET audit_snapshot=audit_snapshot||jsonb_build_object(
    'confirmedRequest',p_payload,'contract','inventory-k1-calendar-v1') WHERE id=(result->>'depreciation_run_id')::uuid AND user_id=auth.uid();
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.book_fixed_asset_depreciation_checked(jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.book_fixed_asset_depreciation_checked(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.close_year_atomic(p_year integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s jsonb;
BEGIN
  PERFORM public.lock_accounting_year_boundary(auth.uid(),true);
  -- Never upgrade a shared KAN-75 lock from an inner call.
  PERFORM public.lock_inventory_boundary();
  IF EXISTS(SELECT 1 FROM public.fixed_assets WHERE user_id=auth.uid() AND decision_type='capitalized' AND fiscal_year<=p_year)
    OR EXISTS(SELECT 1 FROM public.journal_entries WHERE user_id=auth.uid() AND date<=make_date(p_year,12,31) AND account_number BETWEEN '1220' AND '1249') THEN
    s:=public.inventory_depreciation_state(p_year);
    IF s->>'status'='ready' THEN RAISE EXCEPTION 'Inventarier behöver årsavskrivning innan årslås.' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN public.close_year_unchecked_inventory(p_year);
END $$;

COMMENT ON FUNCTION public.book_fixed_asset_depreciation_checked(jsonb) IS
 'Audited normal 12-month K1 year confirmation; authoritative journal/register preview, expected amount, shared inventory lock and exact per-year replay. No VAT deduction or disposal/correction support.';

CREATE OR REPLACE FUNCTION public.enforce_manual_equipment_purchase_redirect() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.accounts%ROWTYPE;
BEGIN
  IF coalesce(NEW.source,'manual')<>'manual' OR coalesce(NEW.is_correction,false) OR NEW.type IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO a FROM public.accounts WHERE user_id=NEW.user_id AND id=NEW.type;
  IF a.debit_account='5410' THEN
    RAISE EXCEPTION 'Utrustning bokförs under Inventarier. Gå till Inventarier så hjälper SoloLedger dig att bokföra köpet rätt, oavsett belopp.' USING ERRCODE='23514'; END IF;
  IF a.debit_account BETWEEN '1220' AND '1249' OR a.credit_account BETWEEN '1220' AND '1249'
    OR a.debit_account LIKE '783%' OR a.credit_account LIKE '783%' THEN
    RAISE EXCEPTION 'Inventarier och årsavskrivning hanteras under Inventarier. Kreditering, avyttring och fri ändring av inventarievärdet stöds inte säkert.' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
COMMIT;
