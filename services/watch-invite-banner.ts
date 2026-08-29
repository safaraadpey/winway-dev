import { supabase } from "@/lib/supabaseClient";
import type { WatchInviteBanner } from "@/lib/watch-invite/types";

const BANNER_IMAGES_BUCKET = "banner-images";
const BANNER_IMAGE_FOLDER = "watch-invite-banners";

export type WatchInviteBannerFormData = {
  title: string;
  caption: string;
  isEnabled: boolean;
  imageFile?: File | null;
  keepExistingImage?: boolean;
};

async function getAdminAccessToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export async function uploadWatchInviteBannerImage(
  file: File
): Promise<
  | { ok: true; url: string; size: number; width: number; height: number }
  | { ok: false; error: string }
> {
  try {
    if (file.size > 1024 * 1024) {
      return { ok: false, error: "حجم فایل باید کمتر از 1 مگابایت باشد" };
    }

    const imageDimensions = await new Promise<{ width: number; height: number }>(
      (resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.width, height: img.height });
        img.onerror = () => reject(new Error("فایل انتخاب‌شده تصویر معتبر نیست"));
        img.src = URL.createObjectURL(file);
      }
    );

    if (imageDimensions.width > 1000 || imageDimensions.height > 1300) {
      return { ok: false, error: "ابعاد تصویر باید حداکثر 1000x1300 پیکسل باشد" };
    }

    const fileExt = file.name.split(".").pop() || "jpg";
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `${BANNER_IMAGE_FOLDER}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from(BANNER_IMAGES_BUCKET)
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      console.error("[WatchInvite] upload error:", uploadError);
      return { ok: false, error: uploadError.message || "خطا در آپلود تصویر" };
    }

    const { data: urlData } = supabase.storage
      .from(BANNER_IMAGES_BUCKET)
      .getPublicUrl(filePath);

    return {
      ok: true,
      url: urlData.publicUrl,
      size: file.size,
      width: imageDimensions.width,
      height: imageDimensions.height,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "خطا در آپلود تصویر";
    return { ok: false, error: message };
  }
}

export async function loadWatchInviteBannerSettings(): Promise<WatchInviteBanner | null> {
  const token = await getAdminAccessToken();
  if (!token) return null;

  const res = await fetch("/api/admin/watch-invite-banner", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const payload = (await res.json()) as { banner?: WatchInviteBanner };
  return payload.banner ?? null;
}

export async function saveWatchInviteBannerSettings(
  formData: WatchInviteBannerFormData,
  current: WatchInviteBanner | null
): Promise<{ success: boolean; error?: string; banner?: WatchInviteBanner }> {
  const token = await getAdminAccessToken();
  if (!token) {
    return { success: false, error: "احراز هویت ناموفق بود" };
  }

  let imageUrl = current?.imageUrl ?? null;
  let imageSize: number | null = null;
  let imageWidth = current?.imageWidth ?? null;
  let imageHeight = current?.imageHeight ?? null;

  if (formData.imageFile) {
    const uploadResult = await uploadWatchInviteBannerImage(formData.imageFile);
    if (!uploadResult.ok) {
      return { success: false, error: uploadResult.error };
    }
    imageUrl = uploadResult.url;
    imageSize = uploadResult.size;
    imageWidth = uploadResult.width;
    imageHeight = uploadResult.height;
  } else if (!formData.keepExistingImage) {
    imageUrl = null;
    imageWidth = null;
    imageHeight = null;
  }

  const res = await fetch("/api/admin/watch-invite-banner", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: formData.title,
      caption: formData.caption,
      isEnabled: formData.isEnabled,
      imageUrl,
      imageSize,
      imageWidth,
      imageHeight,
    }),
  });

  const payload = (await res.json()) as {
    banner?: WatchInviteBanner;
    message?: string;
  };

  if (!res.ok) {
    return { success: false, error: payload.message || "خطا در ذخیره تنظیمات" };
  }

  return { success: true, banner: payload.banner };
}
