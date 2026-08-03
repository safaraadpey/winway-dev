// services/profile.ts
//
// Service functions for user profile management

import { supabase } from "@/lib/supabaseClient";
import type { ProfileInfo, ProfileUpdateData } from "@/src/types/profile";

/**
 * دریافت نام نمایشی کاربر (nickname از user_profiles یا username از users)
 * این تابع برای استفاده در تمام کامپوننت‌ها است
 */
export async function getUserDisplayName(userId: string): Promise<string> {
  try {
    // اول nickname از user_profiles را چک می‌کنیم
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("nickname")
      .eq("user_id", userId)
      .single();

    if (profile?.nickname) {
      return profile.nickname;
    }

    // اگر nickname وجود نداشت، username از users را می‌گیریم
    const { data: user } = await supabase
      .from("users")
      .select("username")
      .eq("id", userId)
      .single();

    if (user?.username) {
      return user.username;
    }

    // اگر هیچکدام وجود نداشت، از email استفاده می‌کنیم
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser?.email) {
      return authUser.email.split("@")[0];
    }

    return "کاربر";
  } catch (error) {
    console.error("Error in getUserDisplayName:", error);
    return "کاربر";
  }
}

/**
 * بارگذاری اطلاعات پروفایل کاربر فعلی
 */
export async function loadProfile(): Promise<ProfileInfo | null> {
  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error("loadProfile: auth.getUser error", userError);
      return null;
    }

    // خواندن اطلاعات از جدول users
    const { data: dbUser, error: dbError } = await supabase
      .from("users")
      .select("id, username, email, kyc_verified")
      .eq("id", user.id)
      .single();

    if (dbError) {
      console.error("loadProfile: users table read error", dbError);
      return null;
    }

    // خواندن اطلاعات از جدول user_profiles
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("nickname, avatar_url, metadata")
      .eq("user_id", user.id)
      .single();

    // اگر profile وجود نداشت، یک رکورد جدید ایجاد می‌کنیم
    let displayName = dbUser?.username || user.email?.split("@")[0] || "کاربر";
    let avatarUrl: string | null = null;
    let avatarId: string | null = null;

    if (profileError) {
      // اگر رکورد وجود نداشت، ایجاد می‌کنیم
      if (profileError.code === "PGRST116") {
        const { error: insertError } = await supabase
          .from("user_profiles")
          .insert({
            user_id: user.id,
            nickname: displayName,
            avatar_url: null,
            metadata: { avatar_id: "001" }, // پیش‌فرض
          });

        if (insertError) {
          console.error("loadProfile: failed to create profile", insertError);
        } else {
          avatarId = "001"; // پیش‌فرض
        }
      } else {
        console.error("loadProfile: profile read error", profileError);
      }
    } else if (profile) {
      displayName = profile.nickname || displayName;
      avatarUrl = profile.avatar_url;
      // اگر avatar_url وجود نداشت، avatar_id را از metadata می‌گیریم
      if (!avatarUrl && profile.metadata && typeof profile.metadata === 'object') {
        avatarId = (profile.metadata as any).avatar_id || "001";
      }
    }

    return {
      userId: user.id,
      username: dbUser?.username || user.email?.split("@")[0] || "",
      displayName,
      avatarUrl,
      avatarId: avatarId || "001", // پیش‌فرض
      email: dbUser?.email || user.email || "",
      kycVerified: Boolean(dbUser?.kyc_verified),
    };
  } catch (error) {
    console.error("Error in loadProfile:", error);
    return null;
  }
}

/**
 * به‌روزرسانی نام نمایشی (display name)
 */
const MAX_DISPLAY_NAME_LENGTH = 16;

export async function updateDisplayName(displayName: string): Promise<boolean> {
  try {
    // اعتبارسنجی طول
    const trimmed = displayName.trim();
    if (trimmed.length === 0) {
      throw new Error("نام نمایشی نمی‌تواند خالی باشد");
    }
    if (trimmed.length > MAX_DISPLAY_NAME_LENGTH) {
      throw new Error(`نام نمایشی نمی‌تواند بیشتر از ${MAX_DISPLAY_NAME_LENGTH} کاراکتر باشد`);
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error("updateDisplayName: auth.getUser error", userError);
      return false;
    }

    // بررسی اینکه آیا profile وجود دارد یا نه
    const { data: existingProfile } = await supabase
      .from("user_profiles")
      .select("user_id")
      .eq("user_id", user.id)
      .single();

    if (existingProfile) {
      // به‌روزرسانی nickname
      const { error: updateError } = await supabase
        .from("user_profiles")
        .update({
          nickname: trimmed,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);

      if (updateError) {
        console.error("updateDisplayName: update error", updateError);
        return false;
      }
    } else {
      // ایجاد رکورد جدید
      const { error: insertError } = await supabase
        .from("user_profiles")
        .insert({
          user_id: user.id,
          nickname: trimmed,
          avatar_url: null,
        });

      if (insertError) {
        console.error("updateDisplayName: insert error", insertError);
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error("Error in updateDisplayName:", error);
    return false;
  }
}

/**
 * به‌روزرسانی avatar_id (برای آواتارهای داخلی)
 */
export async function updateAvatarId(avatarId: string): Promise<boolean> {
  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error("updateAvatarId: auth.getUser error", userError);
      return false;
    }

    // بررسی اینکه آیا profile وجود دارد یا نه
    const { data: existingProfile } = await supabase
      .from("user_profiles")
      .select("user_id, metadata")
      .eq("user_id", user.id)
      .single();

    const currentMetadata = existingProfile?.metadata && typeof existingProfile.metadata === 'object' 
      ? (existingProfile.metadata as any) 
      : {};

    if (existingProfile) {
      // به‌روزرسانی metadata و پاک کردن avatar_url
      const { error: updateError } = await supabase
        .from("user_profiles")
        .update({
          metadata: { ...currentMetadata, avatar_id: avatarId },
          avatar_url: null, // اگر آواتار داخلی انتخاب شد، avatar_url را پاک می‌کنیم
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);

      if (updateError) {
        console.error("updateAvatarId: update error", updateError);
        return false;
      }
    } else {
      // ایجاد رکورد جدید
      const { error: insertError } = await supabase
        .from("user_profiles")
        .insert({
          user_id: user.id,
          nickname: user.email?.split("@")[0] || "کاربر",
          avatar_url: null,
          metadata: { avatar_id: avatarId },
        });

      if (insertError) {
        console.error("updateAvatarId: insert error", insertError);
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error("Error in updateAvatarId:", error);
    return false;
  }
}

/**
 * آپلود آواتار به Supabase Storage
 */
export async function uploadAvatar(file: File): Promise<string | null> {
  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error("uploadAvatar: auth.getUser error", userError);
      return null;
    }

    // بررسی اندازه فایل (حداکثر 2MB)
    const maxSize = 2 * 1024 * 1024; // 2MB
    if (file.size > maxSize) {
      throw new Error("حجم فایل باید کمتر از 2 مگابایت باشد");
    }

    // بررسی نوع فایل (فقط تصویر)
    if (!file.type.startsWith("image/")) {
      throw new Error("فقط فایل‌های تصویری مجاز هستند");
    }

    // نام فایل: avatar_{userId}_{timestamp}.{extension}
    const fileExt = file.name.split(".").pop();
    const fileName = `avatar_${user.id}_${Date.now()}.${fileExt}`;
    const filePath = `avatars/${fileName}`;

    // آپلود فایل
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      // اگر bucket وجود نداشت، خطا می‌دهد
      if (uploadError.message.includes("Bucket not found")) {
        console.warn("uploadAvatar: avatars bucket not found, creating...");
        // در اینجا می‌توانیم bucket را ایجاد کنیم یا به کاربر بگوییم که با ادمین تماس بگیرد
        throw new Error("خطا در آپلود تصویر. لطفاً با پشتیبانی تماس بگیرید.");
      }
      console.error("uploadAvatar: upload error", uploadError);
      throw new Error(uploadError.message);
    }

    // دریافت URL عمومی
    const {
      data: { publicUrl },
    } = supabase.storage.from("avatars").getPublicUrl(filePath);

    // به‌روزرسانی avatar_url در user_profiles و پاک کردن avatar_id
    const { data: existingProfile } = await supabase
      .from("user_profiles")
      .select("user_id, metadata")
      .eq("user_id", user.id)
      .single();

    const currentMetadata = existingProfile?.metadata && typeof existingProfile.metadata === 'object' 
      ? (existingProfile.metadata as any) 
      : {};

    if (existingProfile) {
      const { error: updateError } = await supabase
        .from("user_profiles")
        .update({
          avatar_url: publicUrl,
          metadata: { ...currentMetadata, avatar_id: null }, // پاک کردن avatar_id وقتی آواتار آپلود می‌شود
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);

      if (updateError) {
        console.error("uploadAvatar: update profile error", updateError);
        // حتی اگر update خطا داد، URL را برمی‌گردانیم
        return publicUrl;
      }
    } else {
      // ایجاد رکورد جدید
      const { error: insertError } = await supabase
        .from("user_profiles")
        .insert({
          user_id: user.id,
          nickname: user.email?.split("@")[0] || "کاربر",
          avatar_url: publicUrl,
          metadata: { avatar_id: null },
        });

      if (insertError) {
        console.error("uploadAvatar: insert profile error", insertError);
        return publicUrl;
      }
    }

    return publicUrl;
  } catch (error: any) {
    console.error("Error in uploadAvatar:", error);
    throw error;
  }
}

/**
 * حذف آواتار
 */
export async function removeAvatar(): Promise<boolean> {
  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error("removeAvatar: auth.getUser error", userError);
      return false;
    }

    // دریافت avatar_url فعلی
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("avatar_url")
      .eq("user_id", user.id)
      .single();

    // حذف فایل از storage (اگر وجود داشت)
    if (profile?.avatar_url) {
      try {
        // استخراج مسیر فایل از URL
        const urlParts = profile.avatar_url.split("/avatars/");
        if (urlParts.length > 1) {
          const filePath = `avatars/${urlParts[1]}`;
          await supabase.storage.from("avatars").remove([filePath]);
        }
      } catch (storageError) {
        console.warn("removeAvatar: failed to delete file from storage", storageError);
        // ادامه می‌دهیم حتی اگر حذف فایل خطا داد
      }
    }

    // به‌روزرسانی user_profiles
    const { data: existingProfile } = await supabase
      .from("user_profiles")
      .select("user_id")
      .eq("user_id", user.id)
      .single();

    if (existingProfile) {
      const { error: updateError } = await supabase
        .from("user_profiles")
        .update({
          avatar_url: null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);

      if (updateError) {
        console.error("removeAvatar: update error", updateError);
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error("Error in removeAvatar:", error);
    return false;
  }
}

/**
 * تغییر رمز عبور
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<boolean> {
  try {
    // بررسی اینکه رمز فعلی درست است
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user || !user.email) {
      console.error("changePassword: auth.getUser error", userError);
      return false;
    }

    // بررسی رمز فعلی با تلاش برای ورود
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });

    if (signInError) {
      throw new Error("رمز عبور فعلی اشتباه است");
    }

    // تغییر رمز عبور
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updateError) {
      console.error("changePassword: update error", updateError);
      throw new Error(updateError.message || "خطا در تغییر رمز عبور");
    }

    return true;
  } catch (error: any) {
    console.error("Error in changePassword:", error);
    throw error;
  }
}

