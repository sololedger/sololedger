-- KAN-19 payment-account role ACL hardening.
--
-- The table is protected by owner-scoped RLS, but production default table
-- privileges can grant broader table ACL than this slice intends. Make the
-- table-level privilege boundary explicit without changing default privileges,
-- ownership, schema privileges, or RLS policies.

REVOKE ALL PRIVILEGES
ON TABLE public.company_payment_account_roles
FROM PUBLIC;

REVOKE ALL PRIVILEGES
ON TABLE public.company_payment_account_roles
FROM anon;

REVOKE ALL PRIVILEGES
ON TABLE public.company_payment_account_roles
FROM authenticated;

REVOKE ALL PRIVILEGES
ON TABLE public.company_payment_account_roles
FROM service_role;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.company_payment_account_roles
TO authenticated;

GRANT ALL PRIVILEGES
ON TABLE public.company_payment_account_roles
TO service_role;
