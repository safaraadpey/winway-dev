-- Entry banner image uploads (admin panel)
-- Bucket name must match services/entry-banner.ts (banner-images)

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'banner-images',
  'banner-images',
  true,
  1048576,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "banner_images_public_read" ON storage.objects;
CREATE POLICY "banner_images_public_read"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'banner-images');

DROP POLICY IF EXISTS "manager_admins_upload_banner_images" ON storage.objects;
CREATE POLICY "manager_admins_upload_banner_images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'banner-images'
  AND (storage.foldername(name))[1] = 'entry-banners'
  AND EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role = 'admin'::public.user_role
      AND u.admin_sub_role IS NULL
      AND u.status = 'active'::public.user_status
  )
);

DROP POLICY IF EXISTS "manager_admins_delete_banner_images" ON storage.objects;
CREATE POLICY "manager_admins_delete_banner_images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'banner-images'
  AND EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role = 'admin'::public.user_role
      AND u.admin_sub_role IS NULL
      AND u.status = 'active'::public.user_status
  )
);
