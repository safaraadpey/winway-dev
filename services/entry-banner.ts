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

function normalizeTargetAudience(value: unknown): BannerTargetAudience[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (v): v is BannerTargetAudience =>
      v === "admin" || v === "agent" || v === "super" || v === "player"
  );
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

    const banners: EntryBanner[] = (bannersData || []).map((banner: any) => ({
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
      isActive: banner.is_active !== false,
      createdAt: banner.created_at,
      updatedAt: banner.updated_at,
      createdBy: banner.created_by || null,
    }));

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

    return {
      id: bannerData.id,
      title: bannerData.title,
      contentType: bannerData.content_type as "text" | "image",
      textContent: bannerData.text_content || null,
      imageUrl: bannerData.image_url || null,
      imageSize: bannerData.image_size || null,
      imageWidth: bannerData.image_width || null,
      imageHeight: bannerData.image_height || null,
      startDate: bannerData.start_date || null,
      endDate: bannerData.end_date || null,
      targetAudience: normalizeTargetAudience(bannerData.target_audience),
      requireConfirmation: bannerData.require_confirmation || false,
      confirmationText: bannerData.confirmation_text || null,
      isActive: bannerData.is_active !== false,
      createdAt: bannerData.created_at,
      updatedAt: bannerData.updated_at,
      createdBy: bannerData.created_by || null,
    };
  } catch (err) {
    console.error("loadEntryBanner unexpected error:", err);
    return null;
  }
}

/**
 * آپلود تصویر بنر
 */
async function uploadBannerImage(file: File): Promise<{ url: string; size: number; width: number; height: number } | null> {
  try {
    // بررسی سایز فایل (حداکثر 1 مگ)
    if (file.size > 1024 * 1024) {
      throw new Error("حجم فایل باید کمتر از 1 مگابایت باشد");
    }

    // بررسی ابعاد تصویر
    const imageDimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.width, height: img.height });
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });

    if (imageDimensions.width > 1000 || imageDimensions.height > 1300) {
      throw new Error("ابعاد تصویر باید حداکثر 1000x1300 پیکسل باشد");
    }

    // آپلود به Supabase Storage
    const fileExt = file.name.split(".").pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `entry-banners/${fileName}`;

    // استفاده از bucket مناسب (اگر 'public' وجود ندارد، از 'images' یا bucket دیگری استفاده کنید)
    const bucketName = "public"; // یا bucket دیگری که در Supabase ایجاد کرده‌اید
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      console.error("uploadBannerImage: upload error", uploadError);
      // اگر bucket وجود ندارد، می‌توانیم از یک URL موقت استفاده کنیم
      // یا به کاربر بگوییم که bucket را ایجاد کند
      throw new Error("خطا در آپلود تصویر. لطفاً مطمئن شوید که bucket 'public' در Supabase Storage ایجاد شده است.");
    }

    // گرفتن URL عمومی
    const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(filePath);

    return {
      url: urlData.publicUrl,
      size: file.size,
      width: imageDimensions.width,
      height: imageDimensions.height,
    };
  } catch (err) {
    console.error("uploadBannerImage unexpected error:", err);
    return null;
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
      if (!uploadResult) {
        return { success: false, error: "خطا در آپلود تصویر" };
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
      start_date: formData.startDate || null,
      end_date: formData.endDate || null,
      target_audience: formData.targetAudience,
      require_confirmation: formData.requireConfirmation,
      confirmation_text: formData.requireConfirmation ? formData.confirmationText : null,
      is_active: true,
      created_by: currentUser.id,
    };

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
      if (!uploadResult) {
        return { success: false, error: "خطا در آپلود تصویر" };
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
      start_date: formData.startDate || null,
      end_date: formData.endDate || null,
      target_audience: formData.targetAudience,
      require_confirmation: formData.requireConfirmation,
      confirmation_text: formData.requireConfirmation ? formData.confirmationText : null,
    };

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

/**
 * بارگذاری بنرهای فعال برای کاربر فعلی
 * بر اساس role کاربر، target_audience، تاریخ و وضعیت فعال
 */
export async function loadActiveBannersForUser(): Promise<EntryBanner[]> {
  try {
    // گرفتن نقش کاربر فعلی و بنرها به صورت موازی
    const [userResult, bannersResult] = await Promise.all([
      supabase.auth.getUser(),
      supabase
        .from("entry_banners")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
    ]);

    const { data: { user: currentUser } } = userResult;
    if (!currentUser) {
      return [];
    }

    const { data: bannersData, error: bannersError } = bannersResult;
    if (bannersError) {
      console.error("loadActiveBannersForUser: banners error", bannersError);
      return [];
    }

    // گرفتن نقش کاربر
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("role")
      .eq("id", currentUser.id)
      .single();

    if (userError || !userData) {
      console.error("loadActiveBannersForUser: user error", userError);
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

    if (bannersError) {
      console.error("loadActiveBannersForUser: banners error", bannersError);
      return [];
    }

    // فیلتر بر اساس target_audience و بررسی دقیق تاریخ
    const banners: EntryBanner[] = (bannersData || [])
      .filter((banner: any) => {
        // بررسی تاریخ: باید بین start_date و end_date باشد
        const startDate = banner.start_date ? new Date(banner.start_date) : null;
        const endDate = banner.end_date ? new Date(banner.end_date) : null;
        const nowDate = new Date();

        if (startDate && nowDate < startDate) return false;
        if (endDate && nowDate > endDate) return false;

        // بررسی target_audience
        const targetAudience = normalizeTargetAudience(banner.target_audience);
        // اگر target_audience خالی باشد، برای همه است
        if (targetAudience.length === 0) return true;
        // بررسی اینکه role کاربر در target_audience باشد
        if (!userRole) return false;
        return targetAudience.includes(userRole);
      })
      .map((banner: any) => ({
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
        isActive: banner.is_active !== false,
        createdAt: banner.created_at,
        updatedAt: banner.updated_at,
        createdBy: banner.created_by || null,
      }));

    return banners;
  } catch (err) {
    console.error("loadActiveBannersForUser unexpected error:", err);
    return [];
  }
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
      // استخراج مسیر فایل از URL
      const urlParts = banner.imageUrl.split("/");
      const fileName = urlParts[urlParts.length - 1];
      const filePath = `entry-banners/${fileName}`;
      const bucketName = "public";

      await supabase.storage.from(bucketName).remove([filePath]);
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

