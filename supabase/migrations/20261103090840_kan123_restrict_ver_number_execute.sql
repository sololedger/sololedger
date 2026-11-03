-- KAN-123: align this helper's Staging EXECUTE permissions with Production.
-- Preserve postgres, authenticated and service_role; change no function/data.
REVOKE EXECUTE ON FUNCTION public.get_next_ver_nr(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_next_ver_nr(uuid) FROM anon;
