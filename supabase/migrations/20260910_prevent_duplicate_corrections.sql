-- Förhindra att samma verifikation korrigeras mer än en gång per användare.
-- Gäller bara korrigeringsverifikationer som faktiskt pekar på ett original.
-- Databasen blir därmed det slutliga skyddet även om UI:t kringgås
-- eller två korrigeringsanrop sker samtidigt.

CREATE UNIQUE INDEX IF NOT EXISTS
  transactions_one_correction_per_original
ON public.transactions (user_id, corrects_ver_nr)
WHERE
  is_correction = true
  AND corrects_ver_nr IS NOT NULL;
