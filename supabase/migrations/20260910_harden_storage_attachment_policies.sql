-- H4a: harden Supabase Storage policies for the attachments bucket.
-- Goal: authenticated users may only read/upload/delete files inside:
--   attachments/<auth.uid()>/...
--
-- This removes older broad bucket-wide policies and replaces them with
-- explicit own-folder policies for SELECT, INSERT and DELETE.

-- Remove broad legacy policies that granted access to the whole attachments bucket.
DROP POLICY IF EXISTS "Tillåt läsning för inloggade" ON storage.objects;
DROP POLICY IF EXISTS "Tillåt uppladdning för inloggade" ON storage.objects;
DROP POLICY IF EXISTS "Tillåt borttagning för inloggade" ON storage.objects;

-- Remove/replace own-folder policies to ensure the intended final definitions.
DROP POLICY IF EXISTS "Användare kan läsa sina egna bilagor" ON storage.objects;
DROP POLICY IF EXISTS "Användare kan ladda upp sina egna bilagor" ON storage.objects;
DROP POLICY IF EXISTS "Användare kan radera sina egna bilagor" ON storage.objects;

-- SELECT: only files in the authenticated user's top-level folder.
CREATE POLICY "Användare kan läsa sina egna bilagor"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- INSERT: only files written to the authenticated user's top-level folder.
CREATE POLICY "Användare kan ladda upp sina egna bilagor"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- DELETE: only files in the authenticated user's top-level folder.
CREATE POLICY "Användare kan radera sina egna bilagor"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
