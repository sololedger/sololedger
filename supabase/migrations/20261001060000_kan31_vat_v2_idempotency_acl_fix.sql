-- KAN-31 ACL fix: ensure the VAT V2 idempotency ledger is service-role read-only.

REVOKE ALL PRIVILEGES ON TABLE public.vat_v2_booking_idempotency FROM service_role;
GRANT SELECT ON TABLE public.vat_v2_booking_idempotency TO service_role;
