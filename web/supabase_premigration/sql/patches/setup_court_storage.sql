-- ============================================
-- Supabase Storage Setup for Court Images
-- ============================================
-- This script is idempotent - safe to run multiple times

-- 1. Create the storage bucket (if not exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('court-images', 'court-images', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Set up RLS policies for the bucket (idempotent)

-- Policy 1: Public read access
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON p.polrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE p.polname = 'Public read access for court images'
      AND n.nspname = 'storage' AND c.relname = 'objects'
  ) THEN
    EXECUTE '
      CREATE POLICY "Public read access for court images"
      ON storage.objects FOR SELECT
      USING (bucket_id = ''court-images'')
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
    WHERE p.polname = 'Admins and superusers can upload court images'
      AND n.nspname = 'storage' AND c.relname = 'objects'
  ) THEN
    EXECUTE '
      CREATE POLICY "Admins and superusers can upload court images"
      ON storage.objects FOR INSERT
      WITH CHECK (
        bucket_id = ''court-images'' AND
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
    WHERE p.polname = 'Admins and superusers can update court images'
      AND n.nspname = 'storage' AND c.relname = 'objects'
  ) THEN
    EXECUTE '
      CREATE POLICY "Admins and superusers can update court images"
      ON storage.objects FOR UPDATE
      USING (
        bucket_id = ''court-images'' AND
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
    WHERE p.polname = 'Admins and superusers can delete court images'
      AND n.nspname = 'storage' AND c.relname = 'objects'
  ) THEN
    EXECUTE '
      CREATE POLICY "Admins and superusers can delete court images"
      ON storage.objects FOR DELETE
      USING (
        bucket_id = ''court-images'' AND
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid()
          AND (profiles.role = ''admin'' OR profiles.role = ''superuser'')
        )
      )
    ';
  END IF;
END$$;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Court images storage setup complete!';
  RAISE NOTICE 'Bucket: court-images (public read, admin/superuser write)';
END $$;
