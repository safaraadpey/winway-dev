// services/entry-banner.ts
//
// Service helpers for entry banner management

import { supabase } from "@/lib/supabaseClient";
import type {
  BannerTargetAudience,
  EntryBanner,
  EntryBannerFormData,
  EntryBannerListResult,
} from "@/src/types/entry-banner";

const BANNER_IMAGES_BUCKET = "banner-images";
const BANNER_IMAGE_FOLDER = "entry-banners";

function normalizeTargetAudience(value: unknown): BannerTargetAudience[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (v): v is BannerTargetAudience =>
      v === "admin" || v === "agent" || v === "super" || v === "player"
  );
}

/** Admin date inputs are YYYY-MM-DD; persist as a full local (Iran) calendar day. */
const IRAN_OFFSET = "+03:30";

function calendarDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const day = value.includes("T") ? value.split("T")[0] : value;
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

function toScheduleTimestamp(
  value: string | null | undefined,
  bound: "start" | "end"
): string | null {
  if (!value) return null;
  const day = calendarDateOnly(value);
  if (!day) return value;
  return bound === "start"
    ? `${day}T00:00:00.000${IRAN_OFFSET}`
    : `${day}T23:59:59.999${IRAN_OFFSET}`;
}

function isUtcMidnight(date: Date): boolean {
  return (
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0
  );
}

/** Date-only rows were stored at 00:00 UTC; treat that as the whole local calendar day. */
function bannerScheduleBound(raw: string, bound: "start" | "end"): Date {
  const date = new Date(raw);
  if (Number.isNaN(date.getTime()) || !isUtcMidnight(date)) return date;
  const local = new Date(date);
  if (bound === "start") {
    local.setHours(0, 0, 0, 0);
  } else {
    local.setHours(23, 59, 59, 999);
  }
  return local;
}

function isBannerInScheduleWindow(
  startRaw: string | null | undefined,
  endRaw: string | null | undefined,
  now: Date
): boolean {
  if (startRaw) {
    const startDate = bannerScheduleBound(startRaw, "start");
    if (now < startDate) return false;
  }
  if (endRaw) {
    const endDate = bannerScheduleBound(endRaw, "end");
    if (now > endDate) return false;
  }
  return true;
}

function mapEntryBanner(banner: any): EntryBanner {
  return {
    id: banner.id,
    title: banner.title,
    contentType: banner.content_type as "text" | "image",
    textContent: banner.text_content || null,
    imageUrl: banner.image_url || null,
    imageSize: banner.image_size || null,
    imageWidth: banner.image_width || null,
    imageHeight: banner.image_height || null,
    startDate: banner.start_date || null,
    endDate: banner.end_date || null,
    targetAudience: normalizeTargetAudience(banner.target_audience),
    requireConfirmation: banner.require_confirmation || false,
    confirmationText: banner.confirmation_text || null,
    showTitle: banner.show_title !== false,
    showCloseButton: banner.show_close_button !== false,
    showDontShowAgain: banner.show_dont_show_again !== false,
    isActive: banner.is_active !== false,
    createdAt: banner.created_at,
    updatedAt: banner.updated_at,
    createdBy: banner.created_by || null,
  };
}

/**
 * بارگذاری لیست بنرهای ورودی
 */
export async function loadEntryBanners(): Promise<EntryBannerListResult> {
  try {
    const { data: bannersData, error: bannersError } = await supabase
      .from("entry_banners")
      .select("*")
      .order("created_at", { ascending: false });

    if (bannersError) {
      console.error("loadEntryBanners: error", bannersError);
      return { banners: [], totalCount: 0 };
    }

    const banners: EntryBanner[] = (bannersData || []).map(mapEntryBanner);

    return {
      banners,
      totalCount: banners.length,
    };
  } catch (err) {
    console.error("loadEntryBanners unexpected error:", err);
    return { banners: [], totalCount: 0 };
  }
}

/**
 * بارگذاری یک بنر خاص
 */
export async function loadEntryBanner(bannerId: string): Promise<EntryBanner | null> {
  try {
    const { data: bannerData, error: bannerError } = await supabase
      .from("entry_banners")
      .select("*")
      .eq("id", bannerId)
      .single();

    if (bannerError || !bannerData) {
      console.error("loadEntryBanner: error", bannerError);
      return null;
    }

    return mapEntryBanner(bannerData);
  } catch (err) {
    console.error("loadEntryBanner unexpected error:", err);
    return null;
  }
}

/**
 * آپلود تصویر بنر
 */
async function uploadBannerImage(
  file: File
): Promise<
  | { ok: true; url: string; size: number; width: number; height: number }
  | { ok: false; error: string }
> {
  try {
    // بررسی سایز فایل (حداکثر 1 مگ)
    if (file.size > 1024 * 1024) {
      return { ok: false, error: "حجم فایل باید کمتر از 1 مگابایت باشد" };
    }

    // بررسی ابعاد تصویر
    const imageDimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.width, height: img.height });
      };
      img.onerror = () => reject(new Error("فایل انتخاب‌شده تصویر معتبر نیست"));
      img.src = URL.createObjectURL(file);
    });

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
      console.error("uploadBannerImage: upload error", uploadError);
      if (uploadError.message.includes("Bucket not found")) {
        return {
          ok: false,
          error: "bucket تصاویر بنر در Supabase Storage پیکربندی نشده است (banner-images).",
        };
      }
      if (uploadError.message.toLowerCase().includes("row-level security")) {
        return {
          ok: false,
          error: "دسترسی آپلود تصویر بنر برای این حساب فعال نیست.",
        };
      }
      return { ok: false, error: uploadError.message || "خطا در آپلود تصویر" };
    }

    const { data: urlData } = supabase.storage.from(BANNER_IMAGES_BUCKET).getPublicUrl(filePath);

    return {
      ok: true,
      url: urlData.publicUrl,
      size: file.size,
      width: imageDimensions.width,
      height: imageDimensions.height,
    };
  } catch (err) {
    console.error("uploadBannerImage unexpected error:", err);
    const message = err instanceof Error ? err.message : "خطا در آپلود تصویر";
    return { ok: false, error: message };
  }
}

/**
 * ایجاد بنر جدید
 */
export async function createEntryBanner(
  formData: EntryBannerFormData
): Promise<{ success: boolean; bannerId?: string; error?: string }> {
  try {
    // گرفتن کاربر فعلی
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) {
      return { success: false, error: "خطا در احراز هویت" };
    }

    // آپلود تصویر اگر وجود دارد
    let imageUrl: string | null = null;
    let imageSize: number | null = null;
    let imageWidth: number | null = null;
    let imageHeight: number | null = null;

    if (formData.contentType === "image" && formData.imageFile) {
      const uploadResult = await uploadBannerImage(formData.imageFile);
      if (!uploadResult.ok) {
        return { success: false, error: uploadResult.error };
      }
      imageUrl = uploadResult.url;
      imageSize = uploadResult.size;
      imageWidth = uploadResult.width;
      imageHeight = uploadResult.height;
    }

    // ایجاد بنر در دیتابیس
    const bannerData: any = {
      title: formData.title,
      content_type: formData.contentType,
      text_content: formData.contentType === "text" ? formData.textContent : null,
      image_url: imageUrl,
      image_size: imageSize,
      image_width: imageWidth,
      image_height: imageHeight,
      start_date: toScheduleTimestamp(formData.startDate, "start"),
      end_date: toScheduleTimestamp(formData.endDate, "end"),
      target_audience: formData.targetAudience,
      require_confirmation: formData.requireConfirmation,
      confirmation_text: formData.requireConfirmation ? formData.confirmationText : null,
      show_title: formData.showTitle !== false,
      show_close_button: formData.showCloseButton !== false,
      show_dont_show_again: formData.showDontShowAgain !== false,
      is_active: true,
      created_by: currentUser.id,
    };

    console.log("[Banner] create", {
      title: formData.title,
      showTitle: formData.showTitle !== false,
      showCloseButton: formData.showCloseButton !== false,
      showDontShowAgain: formData.showDontShowAgain !== false,
      contentType: formData.contentType,
    });

    const { data: insertedBanner, error: insertError } = await supabase
      .from("entry_banners")
      .insert(bannerData)
      .select()
      .single();

    if (insertError) {
      console.error("createEntryBanner: insert error", insertError);
      return { success: false, error: "خطا در ایجاد بنر" };
    }

    return { success: true, bannerId: insertedBanner.id };
  } catch (err: any) {
    console.error("createEntryBanner unexpected error:", err);
    return { success: false, error: err.message || "خطای غیرمنتظره" };
  }
}

/**
 * به‌روزرسانی بنر موجود
 */
export async function updateEntryBanner(
  bannerId: string,
  formData: EntryBannerFormData
): Promise<{ success: boolean; error?: string }> {
  try {
    // آپلود تصویر جدید اگر وجود دارد
    let imageUrl: string | null = null;
    let imageSize: number | null = null;
    let imageWidth: number | null = null;
    let imageHeight: number | null = null;

    if (formData.contentType === "image" && formData.imageFile) {
      const uploadResult = await uploadBannerImage(formData.imageFile);
      if (!uploadResult.ok) {
        return { success: false, error: uploadResult.error };
      }
      imageUrl = uploadResult.url;
      imageSize = uploadResult.size;
      imageWidth = uploadResult.width;
      imageHeight = uploadResult.height;
    }

    // به‌روزرسانی بنر در دیتابیس
    const updateData: any = {
      title: formData.title,
      content_type: formData.contentType,
      text_content: formData.contentType === "text" ? formData.textContent : null,
      start_date: toScheduleTimestamp(formData.startDate, "start"),
      end_date: toScheduleTimestamp(formData.endDate, "end"),
      target_audience: formData.targetAudience,
      require_confirmation: formData.requireConfirmation,
      confirmation_text: formData.requireConfirmation ? formData.confirmationText : null,
      show_title: formData.showTitle !== false,
      show_close_button: formData.showCloseButton !== false,
      show_dont_show_again: formData.showDontShowAgain !== false,
    };

    console.log("[Banner] update", {
      bannerId,
      title: formData.title,
      showTitle: formData.showTitle !== false,
      showCloseButton: formData.showCloseButton !== false,
      showDontShowAgain: formData.showDontShowAgain !== false,
      contentType: formData.contentType,
    });

    // اگر تصویر جدید آپلود شده، فیلدهای تصویر را به‌روزرسانی کن
    if (formData.contentType === "image" && imageUrl) {
      updateData.image_url = imageUrl;
      updateData.image_size = imageSize;
      updateData.image_width = imageWidth;
      updateData.image_height = imageHeight;
    } else if (formData.contentType === "text") {
      // اگر به متن تبدیل شد، فیلدهای تصویر را null کن
      updateData.image_url = null;
      updateData.image_size = null;
      updateData.image_width = null;
      updateData.image_height = null;
    }

    const { error: updateError } = await supabase
      .from("entry_banners")
      .update(updateData)
      .eq("id", bannerId);

    if (updateError) {
      console.error("updateEntryBanner: update error", updateError);
      return { success: false, error: "خطا در به‌روزرسانی بنر" };
    }

    return { success: true };
  } catch (err: any) {
    console.error("updateEntryBanner unexpected error:", err);
    return { success: false, error: err.message || "خطای غیرمنتظره" };
  }
}

let activeBannersCache: EntryBanner[] | null = null;
let activeBannersCacheUserId: string | null = null;
let activeBannersInflight: Promise<EntryBanner[]> | null = null;
let activeBannersInflightUserId: string | null = null;

/**
 * بارگذاری بنرهای فعال برای کاربر فعلی
 * بر اساس role کاربر، target_audience، تاریخ و وضعیت فعال
 */
export async function loadActiveBannersForUser(): Promise<EntryBanner[]> {
  try {
    // Session is local; banners + role go out in one round-trip.
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const currentUser = session?.user;
    if (!currentUser) {
      return [];
    }

    const [bannersResult, userResult] = await Promise.all([
      supabase
        .from("entry_banners")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false }),
      supabase.from("users").select("role").eq("id", currentUser.id).single(),
    ]);

    const { data: bannersData, error: bannersError } = bannersResult;
    if (bannersError) {
      console.error("[EntryBanner] banners error", bannersError);
      return [];
    }

    const { data: userData, error: userError } = userResult;
    if (userError || !userData) {
      console.error("[EntryBanner] user error", userError);
      return [];
    }

    const userRoleRaw = userData.role as string;
    const userRole: BannerTargetAudience | null =
      userRoleRaw === "admin" ||
      userRoleRaw === "agent" ||
      userRoleRaw === "super" ||
      userRoleRaw === "player"
        ? userRoleRaw
        : null;

    const nowDate = new Date();
    const inWindow = (bannersData || []).filter((banner: any) =>
      isBannerInScheduleWindow(banner.start_date, banner.end_date, nowDate)
    );
    if ((bannersData?.length ?? 0) > 0 && inWindow.length === 0) {
      console.log("[EntryBanner] All active banners outside schedule window", {
        activeCount: bannersData.length,
        now: nowDate.toISOString(),
        source: "postgres",
      });
    }

    const banners: EntryBanner[] = inWindow
      .filter((banner: any) => {
        const targetAudience = normalizeTargetAudience(banner.target_audience);
        if (targetAudience.length === 0) return true;
        if (!userRole) return false;
        return targetAudience.includes(userRole);
      })
      .map(mapEntryBanner);

    return banners;
  } catch (err) {
    console.error("[EntryBanner] unexpected error:", err);
    return [];
  }
}

export function peekCachedActiveBanners(): EntryBanner[] | null {
  return activeBannersCache;
}

/** Deduped in-flight fetch. Must run after session exists or it caches an empty miss. */
export async function prefetchActiveBannersForUser(): Promise<EntryBanner[]> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user?.id ?? null;
  if (!userId) {
    return [];
  }

  if (activeBannersCache !== null && activeBannersCacheUserId === userId) {
    return activeBannersCache;
  }
  if (activeBannersInflight && activeBannersInflightUserId === userId) {
    return activeBannersInflight;
  }

  activeBannersInflightUserId = userId;
  activeBannersInflight = loadActiveBannersForUser()
    .then((banners) => {
      activeBannersCache = banners;
      activeBannersCacheUserId = userId;
      return banners;
    })
    .finally(() => {
      activeBannersInflight = null;
      activeBannersInflightUserId = null;
    });
  return activeBannersInflight;
}

/**
 * حذف بنر
 */
export async function deleteEntryBanner(
  bannerId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // حذف تصویر از storage اگر وجود دارد
    const banner = await loadEntryBanner(bannerId);
    if (banner?.imageUrl) {
      const marker = `/storage/v1/object/public/${BANNER_IMAGES_BUCKET}/`;
      const markerIndex = banner.imageUrl.indexOf(marker);
      const filePath =
        markerIndex >= 0
          ? banner.imageUrl.slice(markerIndex + marker.length)
          : `${BANNER_IMAGE_FOLDER}/${banner.imageUrl.split("/").pop() || ""}`;

      await supabase.storage.from(BANNER_IMAGES_BUCKET).remove([filePath]);
    }

    // حذف بنر از دیتابیس
    const { error: deleteError } = await supabase
      .from("entry_banners")
      .delete()
      .eq("id", bannerId);

    if (deleteError) {
      console.error("deleteEntryBanner: delete error", deleteError);
      return { success: false, error: "خطا در حذف بنر" };
    }

    return { success: true };
  } catch (err: any) {
    console.error("deleteEntryBanner unexpected error:", err);
    return { success: false, error: err.message || "خطای غیرمنتظره" };
  }
}

