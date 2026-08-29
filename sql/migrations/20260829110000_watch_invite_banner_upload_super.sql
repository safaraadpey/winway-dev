-- Allow tournament admins (admin + super) to upload watch-invite banner images.

BEGIN;

DROP POLICY IF EXISTS "manager_admins_upload_watch_invite_banners" ON storage.objects;
CREATE POLICY "manager_admins_upload_watch_invite_banners"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'banner-images'
  AND (storage.foldername(name))[1] = 'watch-invite-banners'
  AND EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role IN ('admin'::public.user_role, 'super'::public.user_role)
      AND u.status = 'active'::public.user_status
  )
);

COMMIT;
