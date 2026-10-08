BEGIN;

REVOKE EXECUTE ON FUNCTION public.book_fixed_asset_acquisition_atomic_unchecked_kan54(jsonb) FROM service_role;

COMMIT;
