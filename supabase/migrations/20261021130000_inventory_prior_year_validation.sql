-- Reject uncertain legacy opening history instead of carrying stale prior runs.
BEGIN;
DO $migration$
DECLARE d text; anchor text;
BEGIN
 d:=pg_get_functiondef('public.inventory_depreciation_state(integer)'::regprocedure);
 anchor:='  amount numeric; signature text; run public.fixed_asset_depreciation_runs%ROWTYPE;';
 IF strpos(d,anchor)=0 THEN RAISE EXCEPTION 'Unexpected inventory state declaration'; END IF;
 d:=replace(d,anchor,anchor||E'\n  prior_run record; prior_basis numeric; prior_half numeric;');
 anchor:='  WHERE j.user_id=u AND j.date<=end_date AND j.account_number BETWEEN ''1220'' AND ''1249''';
 IF strpos(d,anchor)=0 THEN RAISE EXCEPTION 'Unexpected inventory journal scope'; END IF;
 d:=replace(d,anchor,'  WHERE j.user_id=u AND j.date<=end_date AND (j.account_number BETWEEN ''1220'' AND ''1249'' OR j.account_number LIKE ''783%'')');
 anchor:='  basis:=balance+coalesce(run.depreciation_amount,0);';
 IF strpos(d,anchor)=0 THEN RAISE EXCEPTION 'Unexpected inventory basis anchor'; END IF;
 d:=replace(d,anchor,$guard$
  IF run.id IS NOT NULL AND run.audit_snapshot->>'contract' IS DISTINCT FROM 'inventory-k1-calendar-v1' THEN
    RAISE EXCEPTION 'Äldre årsavskrivning saknar verifierad årslängd. Kontroll krävs; automatisk rättelse stöds inte.' USING ERRCODE='23514'; END IF;
  FOR prior_run IN SELECT * FROM public.fixed_asset_depreciation_runs WHERE user_id=u AND fiscal_year<p_year ORDER BY fiscal_year LOOP
    IF prior_run.audit_snapshot->>'contract' IS DISTINCT FROM 'inventory-k1-calendar-v1' THEN
      RAISE EXCEPTION 'Tidigare års avskrivning saknar verifierad årslängd. Kontroll av ingående värden krävs.' USING ERRCODE='23514'; END IF;
    SELECT coalesce(sum(capitalized_amount),0) INTO prior_basis FROM public.fixed_assets
      WHERE user_id=u AND decision_type='capitalized' AND acquisition_date<=make_date(prior_run.fiscal_year,12,31);
    prior_basis:=prior_basis-(SELECT coalesce(sum(depreciation_amount),0) FROM public.fixed_asset_depreciation_runs WHERE user_id=u AND fiscal_year<prior_run.fiscal_year);
    prior_half:=(public.get_tax_rule_parameters_for_year(prior_run.fiscal_year)->>'halfPriceBaseAmount')::numeric;
    IF prior_run.basis_amount IS DISTINCT FROM prior_basis OR prior_run.depreciation_amount IS DISTINCT FROM
      (CASE WHEN prior_basis<=prior_half THEN prior_basis ELSE round(prior_basis*.30,2) END) THEN
      RAISE EXCEPTION 'Tidigare års inventarieunderlag har ändrats. Kontroll av ingående värden krävs.' USING ERRCODE='23514'; END IF;
  END LOOP;
$guard$||anchor);
 EXECUTE d;
END $migration$;
COMMIT;
