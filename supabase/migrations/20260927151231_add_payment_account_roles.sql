-- KAN-19 company payment-account role configuration.
--
-- This table stores explicit company/user configuration for semantic
-- bookkeeping payment roles. It deliberately does not extend public.accounts,
-- which is the current booking category/preset model.
--
-- A row exists only after the user has selected that account for the role.
-- No row means the role remains unconfigured; system recommendations are not
-- persisted by this migration.

CREATE TABLE public.company_payment_account_roles (
  user_id uuid NOT NULL DEFAULT auth.uid()
    REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL,
  account_number text NOT NULL,
  CONSTRAINT company_payment_account_roles_pkey
    PRIMARY KEY (user_id, role),
  CONSTRAINT company_payment_account_roles_role_check
    CHECK (
      role IN (
        'business_payment_account',
        'owner_private_payment'
      )
    ),
  CONSTRAINT company_payment_account_roles_account_number_check
    CHECK (account_number ~ '^\d{4}$')
);

COMMENT ON TABLE public.company_payment_account_roles IS
  'User/company-scoped bookkeeping configuration mapping semantic payment roles to explicitly selected BAS account numbers.';

COMMENT ON COLUMN public.company_payment_account_roles.role IS
  'Semantic bookkeeping payment role. Initial values: business_payment_account, owner_private_payment.';

COMMENT ON COLUMN public.company_payment_account_roles.account_number IS
  'Explicitly selected four-digit BAS account number for this role. This records company configuration, not global account validity.';

ALTER TABLE public.company_payment_account_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment_account_roles_self_access"
ON public.company_payment_account_roles
AS PERMISSIVE
FOR ALL
TO authenticated
USING ((SELECT auth.uid()) = user_id)
WITH CHECK ((SELECT auth.uid()) = user_id);

GRANT DELETE, INSERT, SELECT, UPDATE
ON TABLE public.company_payment_account_roles TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
ON TABLE public.company_payment_account_roles TO service_role;
