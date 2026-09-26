-- 2026-09-09
-- Hardening: låt bokföringens skriv-RPC:er köra som SECURITY DEFINER.
-- Detta behövs innan authenticateds direkta INSERT/UPDATE/DELETE på
-- transactions och journal_entries kan tas bort.
--
-- Funktionerna validerar auth.uid() och användarägarskap själva.
-- Ägaren är postgres, så SECURITY DEFINER låter dem skriva även efter REVOKE.

ALTER FUNCTION public.book_transaction_atomic(jsonb)
  SECURITY DEFINER
  SET search_path TO public;

ALTER FUNCTION public.book_periodized_transaction_atomic(jsonb)
  SECURITY DEFINER
  SET search_path TO public;

ALTER FUNCTION public.create_correction_transaction_atomic(uuid)
  SECURITY DEFINER
  SET search_path TO public;

ALTER FUNCTION public.import_sie_batch(jsonb)
  SECURITY DEFINER
  SET search_path TO public;

-- Begränsa vem som får anropa skrivfunktionerna.
REVOKE ALL ON FUNCTION public.book_transaction_atomic(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.book_periodized_transaction_atomic(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_correction_transaction_atomic(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.import_sie_batch(jsonb) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.book_transaction_atomic(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.book_periodized_transaction_atomic(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_correction_transaction_atomic(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_sie_batch(jsonb) TO authenticated;

-- Dessa två är redan SECURITY DEFINER, men lås även deras EXECUTE-rättigheter.
REVOKE ALL ON FUNCTION public.update_transaction_safe(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_next_ver_nr(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.update_transaction_safe(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_ver_nr(uuid) TO authenticated;
