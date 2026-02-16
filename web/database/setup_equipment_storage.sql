-- ============================================
-- Supabase Storage Setup for Equipment Images
-- ============================================
-- This script is idempotent - safe to run multiple times

-- 1. Create the storage bucket (if not exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('equipment-images', 'equipment-images', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Set up RLS policies for the bucket (idempotent)

-- Policy 1: Public read access
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON p.polrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE p.polname = 'Public read access for equipment images'
      AND n.nspname = 'storage' AND c.relname = 'objects'
  ) THEN
    EXECUTE '
      CREATE POLICY "Public read access for equipment images"
      ON storage.objects FOR SELECT
      USING (bucket_id = ''equipment-images'')
    ';
  END IF;
END$$;

-- Policy 2: Admin/Superuser upload access
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON p.polrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE p.polname = 'Admins and superusers can upload equipment images'
      AND n.nspname = 'storage' AND c.relname = 'objects'
  ) THEN
    EXECUTE '
      CREATE POLICY "Admins and superusers can upload equipment images"
      ON storage.objects FOR INSERT
      WITH CHECK (
        bucket_id = ''equipment-images'' AND
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid()
          AND (profiles.role = ''admin'' OR profiles.role = ''superuser'')
        )
      )
    ';
  END IF;
END$$;

-- Policy 3: Admin/Superuser update access
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON p.polrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE p.polname = 'Admins and superusers can update equipment images'
      AND n.nspname = 'storage' AND c.relname = 'objects'
  ) THEN
    EXECUTE '
      CREATE POLICY "Admins and superusers can update equipment images"
      ON storage.objects FOR UPDATE
      USING (
        bucket_id = ''equipment-images'' AND
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid()
          AND (profiles.role = ''admin'' OR profiles.role = ''superuser'')
        )
      )
    ';
  END IF;
END$$;

-- Policy 4: Admin/Superuser delete access
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON p.polrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE p.polname = 'Admins and superusers can delete equipment images'
      AND n.nspname = 'storage' AND c.relname = 'objects'
  ) THEN
    EXECUTE '
      CREATE POLICY "Admins and superusers can delete equipment images"
      ON storage.objects FOR DELETE
      USING (
        bucket_id = ''equipment-images'' AND
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid()
          AND (profiles.role = ''admin'' OR profiles.role = ''superuser'')
        )
      )
    ';
  END IF;
END$$;

-- Verification: List all policies on storage.objects
SELECT 
  p.polname AS policy_name,
  CASE p.polcmd
    WHEN 'r' THEN 'SELECT'
    WHEN 'a' THEN 'INSERT'
    WHEN 'w' THEN 'UPDATE'
    WHEN 'd' THEN 'DELETE'
    WHEN '*' THEN 'ALL'
  END AS operation
FROM pg_policy p
JOIN pg_class c ON p.polrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'storage' 
  AND c.relname = 'objects'
  AND p.polname LIKE '%equipment images%'
ORDER BY p.polname;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Storage setup complete!';
  RAISE NOTICE 'Bucket: equipment-images (public read, admin/superuser write)';
  RAISE NOTICE 'Safe to run multiple times (idempotent)';
END $$;
