-- KAN-51 candidate test.
--
-- Intended for an isolated local/staging database after applying
-- 20261007110000_kan51_historical_customer_invoice_linkage.sql.
-- This is not a Production repair script.

BEGIN;

DO $$
DECLARE
  v_user_id uuid := gen_random_uuid();
  v_invoice_id uuid := gen_random_uuid();
  v_tx_id uuid := gen_random_uuid();
  v_booking_id uuid := gen_random_uuid();
  v_ver_nr integer := 1;
  v_undo_error text;
BEGIN
  INSERT INTO auth.users (id)
  VALUES (v_user_id);

  INSERT INTO public.profiles (id, company_name)
  VALUES (v_user_id, 'KAN-51 Historical Linkage Test');

  INSERT INTO public.transactions (
    id,
    user_id,
    date,
    description,
    amount,
    type,
    vat_rate,
    file_url,
    booked,
    source
  ) VALUES (
    v_tx_id,
    v_user_id,
    DATE '2026-04-20',
    'KAN-51 historical invoice payment',
    700,
    'försäljning',
    0,
    'kan51/invoice.pdf',
    true,
    'manual'
  );

  INSERT INTO public.journal_entries (
    user_id,
    transaction_id,
    ver_nr,
    account_number,
    debit,
    credit,
    description,
    date
  ) VALUES
    (v_user_id, v_tx_id, v_ver_nr, '1930', 700, 0, 'KAN-51 payment', DATE '2026-04-20'),
    (v_user_id, v_tx_id, v_ver_nr, '3010', 0, 700, 'KAN-51 sale', DATE '2026-04-20');

  INSERT INTO public.customer_invoices (
    id,
    user_id,
    invoice_number,
    customer_name,
    invoice_date,
    service_date,
    due_date,
    gross_amount,
    net_amount,
    vat_amount,
    vat_rate,
    vat_treatment,
    payment_status,
    paid_at,
    attachment_url
  ) VALUES (
    v_invoice_id,
    v_user_id,
    'KAN51-1',
    'Historical customer',
    DATE '2026-04-17',
    DATE '2026-04-17',
    DATE '2026-04-27',
    700,
    700,
    0,
    0,
    'exempt',
    'paid',
    DATE '2026-04-20',
    'kan51/invoice.pdf'
  );

  INSERT INTO public.customer_invoice_bookings (
    id,
    user_id,
    invoice_id,
    transaction_id,
    booking_kind,
    booking_date,
    fiscal_year,
    gross_amount,
    net_amount,
    vat_amount,
    idempotency_key
  ) VALUES (
    v_booking_id,
    v_user_id,
    v_invoice_id,
    v_tx_id,
    'historical_payment_same_year',
    DATE '2026-04-20',
    2026,
    700,
    700,
    0,
    gen_random_uuid()
  );

  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user_id::text, 'role', 'authenticated')::text,
    true
  );

  IF auth.uid() IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'auth.uid() test context was not established';
  END IF;

  BEGIN
    PERFORM public.undo_customer_invoice_payment_atomic(v_invoice_id, gen_random_uuid());
  EXCEPTION WHEN others THEN
    v_undo_error := SQLERRM;
  END;

  IF v_undo_error IS NULL OR v_undo_error !~* 'Historiskt inlyft' THEN
    RAISE EXCEPTION 'Expected historical payment undo to be rejected, got %', v_undo_error;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.transactions
    WHERE user_id = v_user_id
      AND source = 'customer_invoice'
  ) THEN
    RAISE EXCEPTION 'Historical linkage test unexpectedly created or rewrote customer_invoice transaction source.';
  END IF;

  IF (
    SELECT count(*)
    FROM public.journal_entries
    WHERE user_id = v_user_id
      AND transaction_id = v_tx_id
  ) <> 2 THEN
    RAISE EXCEPTION 'Historical linkage test changed the original journal entries.';
  END IF;
END $$;

ROLLBACK;
