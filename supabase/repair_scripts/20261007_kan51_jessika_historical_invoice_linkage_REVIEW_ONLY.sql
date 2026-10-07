-- KAN-51 REVIEW ONLY - do not run against Production without final approval.
--
-- Purpose:
--   Link Jessika Foto & Media's two pre-KAN-46 paid customer invoices to their
--   existing manual payment verifications without creating/deleting accounting.
--
-- Safety:
--   This script is rollback-by-default. It contains the exact intended inserts
--   and assertions, but ends with ROLLBACK. Replace the final ROLLBACK with
--   COMMIT only after leader review, Production release of the supporting
--   schema migration, and a fresh read-only preflight.
--
-- Invoice 1001 service date:
--   Pontus verified the original photo metadata. The photography was performed
--   on 2026-02-11, which is the authoritative KAN-51 service_date.

BEGIN;

DO $$
DECLARE
  v_user_id constant uuid := 'd4b05ec2-85eb-4f53-94c0-b81a72335389';

  v_invoice_1001_id constant uuid := '19b96ac4-32c9-497b-abe6-b7f43a574a1c';
  v_invoice_1002_id constant uuid := '8ab63d97-d182-482c-810b-6c82c2747741';
  v_booking_1001_id constant uuid := '67c84d14-5b0d-47a7-88b8-5c35f7685211';
  v_booking_1002_id constant uuid := '1ee3fbb6-88b4-4f45-b616-eeca329117a7';

  v_tx_1001 constant uuid := '2b707513-c8ea-495d-81c6-40f505362a14';
  v_tx_1002 constant uuid := '44be1d16-918b-4f0c-9723-ca9ad2d0d4a3';

  v_pdf_1001 constant text := 'd4b05ec2-85eb-4f53-94c0-b81a72335389/1783975917581-84af3bd5-45d6-4a8c-b4da-f36bae94b2cb.pdf';
  v_pdf_1002 constant text := 'd4b05ec2-85eb-4f53-94c0-b81a72335389/1783976006464-843ba588-86df-46bd-acb4-fd233f14b554.pdf';

  v_1001_service_date constant date := DATE '2026-02-11';
  v_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = v_user_id
      AND p.company_name = 'Jessika Foto & Media'
  ) THEN
    RAISE EXCEPTION 'KAN-51 assertion failed: exact Jessika profile not found.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.closed_years
    WHERE user_id = v_user_id
      AND year = 2026
  ) THEN
    RAISE EXCEPTION 'KAN-51 assertion failed: 2026 is locked.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.vat_periods
    WHERE user_id = v_user_id
      AND status IN ('closed', 'declared')
      AND period_end >= DATE '2026-01-01'
      AND period_start <= DATE '2026-12-31'
  ) THEN
    RAISE EXCEPTION 'KAN-51 assertion failed: a 2026 VAT period is closed or declared.';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.customer_invoices
  WHERE user_id = v_user_id
    AND invoice_number IN ('1001', '1002');
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'KAN-51 assertion failed: invoice 1001/1002 already exists in customer_invoices.';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.customer_invoice_bookings
  WHERE user_id = v_user_id
    AND transaction_id IN (v_tx_1001, v_tx_1002);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'KAN-51 assertion failed: target transaction already has customer invoice booking.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tax_account_events
    WHERE user_id = v_user_id
      AND transaction_id IN (v_tx_1001, v_tx_1002)
  ) OR EXISTS (
    SELECT 1
    FROM public.tax_account_movements
    WHERE user_id = v_user_id
      AND transaction_id IN (v_tx_1001, v_tx_1002)
  ) OR EXISTS (
    SELECT 1
    FROM public.vat_audit_snapshots
    WHERE user_id = v_user_id
      AND transaction_id IN (v_tx_1001, v_tx_1002)
  ) OR EXISTS (
    SELECT 1
    FROM public.vat_v2_booking_idempotency
    WHERE user_id = v_user_id
      AND transaction_id IN (v_tx_1001, v_tx_1002)
  ) OR EXISTS (
    SELECT 1
    FROM public.vat_periods
    WHERE user_id = v_user_id
      AND closing_transaction_id IN (v_tx_1001, v_tx_1002)
  ) THEN
    RAISE EXCEPTION 'KAN-51 assertion failed: target transaction has VAT/tax dependencies.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.transactions
    WHERE user_id = v_user_id
      AND (
        corrects_ver_nr IN (5, 7)
        OR periodization_group_id IN (
          SELECT periodization_group_id
          FROM public.transactions
          WHERE user_id = v_user_id
            AND id IN (v_tx_1001, v_tx_1002)
            AND periodization_group_id IS NOT NULL
        )
      )
  ) THEN
    RAISE EXCEPTION 'KAN-51 assertion failed: target verification has correction or periodization relation.';
  END IF;

  PERFORM 1
  FROM public.transactions t
  WHERE t.id = v_tx_1001
    AND t.user_id = v_user_id
    AND t.date = DATE '2026-04-20'
    AND t.description = '1001 Mhalet'
    AND t.amount = 700
    AND t.type = 'försäljning'
    AND t.vat_rate = 0
    AND t.booked IS TRUE
    AND t.file_url = v_pdf_1001
    AND t.source = 'manual'
    AND coalesce(t.is_correction, false) IS FALSE
    AND coalesce(t.is_periodized, false) IS FALSE
    AND coalesce(t.is_periodized_reversal, false) IS FALSE
    AND t.corrects_ver_nr IS NULL
    AND t.import_batch_id IS NULL
    AND t.periodization_group_id IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'KAN-51 assertion failed: VER-5 transaction facts mismatch.';
  END IF;

  PERFORM 1
  FROM public.transactions t
  WHERE t.id = v_tx_1002
    AND t.user_id = v_user_id
    AND t.date = DATE '2026-05-05'
    AND t.description = '1002 Seppe'
    AND t.amount = 1395
    AND t.type = 'försäljning'
    AND t.vat_rate = 0
    AND t.booked IS TRUE
    AND t.file_url = v_pdf_1002
    AND t.source = 'manual'
    AND coalesce(t.is_correction, false) IS FALSE
    AND coalesce(t.is_periodized, false) IS FALSE
    AND coalesce(t.is_periodized_reversal, false) IS FALSE
    AND t.corrects_ver_nr IS NULL
    AND t.import_batch_id IS NULL
    AND t.periodization_group_id IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'KAN-51 assertion failed: VER-7 transaction facts mismatch.';
  END IF;

  PERFORM 1
  FROM public.journal_entries
  WHERE user_id = v_user_id
    AND transaction_id = v_tx_1001
  GROUP BY transaction_id
  HAVING count(*) = 2
     AND count(*) FILTER (WHERE ver_nr = 5 AND account_number = '1930' AND debit = 700 AND credit = 0 AND date = DATE '2026-04-20') = 1
     AND count(*) FILTER (WHERE ver_nr = 5 AND account_number = '3010' AND debit = 0 AND credit = 700 AND date = DATE '2026-04-20') = 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'KAN-51 assertion failed: VER-5 journal mismatch.';
  END IF;

  PERFORM 1
  FROM public.journal_entries
  WHERE user_id = v_user_id
    AND transaction_id = v_tx_1002
  GROUP BY transaction_id
  HAVING count(*) = 2
     AND count(*) FILTER (WHERE ver_nr = 7 AND account_number = '1930' AND debit = 1395 AND credit = 0 AND date = DATE '2026-05-05') = 1
     AND count(*) FILTER (WHERE ver_nr = 7 AND account_number = '3010' AND debit = 0 AND credit = 1395 AND date = DATE '2026-05-05') = 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'KAN-51 assertion failed: VER-7 journal mismatch.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM storage.objects WHERE bucket_id = 'attachments' AND name = v_pdf_1001
  ) OR NOT EXISTS (
    SELECT 1 FROM storage.objects WHERE bucket_id = 'attachments' AND name = v_pdf_1002
  ) THEN
    RAISE EXCEPTION 'KAN-51 assertion failed: expected invoice PDF object missing.';
  END IF;

  INSERT INTO public.customer_invoices (
    id,
    user_id,
    invoice_number,
    customer_name,
    customer_country,
    currency,
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
  ) VALUES
    (
      v_invoice_1001_id,
      v_user_id,
      '1001',
      'Mhalet Sisay Björkqvist',
      'SE',
      'SEK',
      DATE '2026-04-17',
      v_1001_service_date,
      DATE '2026-04-27',
      700,
      700,
      0,
      0,
      'exempt',
      'paid',
      DATE '2026-04-20',
      v_pdf_1001
    ),
    (
      v_invoice_1002_id,
      v_user_id,
      '1002',
      'Nathalie Mercey',
      'SE',
      'SEK',
      DATE '2026-05-03',
      DATE '2026-04-24',
      DATE '2026-05-13',
      1395,
      1395,
      0,
      0,
      'exempt',
      'paid',
      DATE '2026-05-05',
      v_pdf_1002
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
  ) VALUES
    (
      v_booking_1001_id,
      v_user_id,
      v_invoice_1001_id,
      v_tx_1001,
      'historical_payment_same_year',
      DATE '2026-04-20',
      2026,
      700,
      700,
      0,
      '8a39bcad-05b3-4d81-8946-001001000001'::uuid
    ),
    (
      v_booking_1002_id,
      v_user_id,
      v_invoice_1002_id,
      v_tx_1002,
      'historical_payment_same_year',
      DATE '2026-05-05',
      2026,
      1395,
      1395,
      0,
      '8a39bcad-05b3-4d81-8946-001002000002'::uuid
    );

  IF EXISTS (
    SELECT 1
    FROM public.transactions
    WHERE id IN (v_tx_1001, v_tx_1002)
      AND user_id = v_user_id
      AND source <> 'manual'
  ) THEN
    RAISE EXCEPTION 'KAN-51 post-check failed: transaction source changed.';
  END IF;

  PERFORM 1
  FROM public.customer_invoice_bookings
  WHERE user_id = v_user_id
    AND transaction_id IN (v_tx_1001, v_tx_1002)
  GROUP BY user_id
  HAVING count(*) = 2
     AND count(*) FILTER (WHERE booking_kind = 'historical_payment_same_year') = 2;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'KAN-51 post-check failed: historical booking links missing.';
  END IF;
END $$;

-- Review-only default: prove the script remains non-mutating if accidentally run.
ROLLBACK;
