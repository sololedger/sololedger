-- Serialize every inventory journal insertion, including SIE, with the K1 run.
-- No change to import algorithms or historical rows. No DELETE/UPDATE trigger:
-- the established atomic user-deletion ordering remains unchanged.
BEGIN;
CREATE FUNCTION public.guard_inventory_journal_boundary() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE source_name text;
BEGIN
  IF NEW.account_number NOT BETWEEN '1220' AND '1249' AND NEW.account_number NOT LIKE '783%' THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('sololedger:inventory:'||NEW.user_id::text,0));
  SELECT source INTO source_name FROM public.transactions WHERE id=NEW.transaction_id AND user_id=NEW.user_id;
  IF source_name IS DISTINCT FROM 'fixed_asset_depreciation' AND EXISTS (
    SELECT 1 FROM public.fixed_asset_depreciation_runs WHERE user_id=NEW.user_id
      AND fiscal_year>=extract(year FROM NEW.date)::integer
  ) THEN
    RAISE EXCEPTION 'Inventarieunderlaget är fastställt genom årsavskrivning. Bakdatering, import och manuella ändringar som påverkar det kräver kontrollerad rättelse.' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_inventory_journal_boundary() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER inventory_journal_boundary BEFORE INSERT ON public.journal_entries
FOR EACH ROW EXECUTE FUNCTION public.guard_inventory_journal_boundary();
COMMIT;
