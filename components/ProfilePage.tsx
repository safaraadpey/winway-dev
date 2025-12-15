"use client";

import React, { useEffect, useState, useRef } from "react";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import {
  loadProfile,
  updateDisplayName,
  uploadAvatar,
  removeAvatar,
  updateAvatarId,
  changePassword,
} from "@/services/profile";
import Image from "next/image";

// Import آواتارهای موجود
import avatar001 from '@/src/assets/avatars/avatar-001.png';
import avatar002 from '@/src/assets/avatars/avatar-002.png';
import avatar003 from '@/src/assets/avatars/avatar-003.png';
import avatar004 from '@/src/assets/avatars/avatar-004.png';
import avatar005 from '@/src/assets/avatars/avatar-005.png';
import avatar006 from '@/src/assets/avatars/avatar-006.png';
import avatar007 from '@/src/assets/avatars/avatar-007.png';
import avatar008 from '@/src/assets/avatars/avatar-008.png';
import avatar009 from '@/src/assets/avatars/avatar-009.png';
import avatar010 from '@/src/assets/avatars/avatar-010.png';
import avatar011 from '@/src/assets/avatars/avatar-011.png';
import avatar012 from '@/src/assets/avatars/avatar-012.png';
import avatar013 from '@/src/assets/avatars/avatar-013.png';
import avatar014 from '@/src/assets/avatars/avatar-014.png';
import avatar015 from '@/src/assets/avatars/avatar-015.png';
import avatar017 from '@/src/assets/avatars/avatar-017.png';
import avatar018 from '@/src/assets/avatars/avatar-018.png';
import avatar019 from '@/src/assets/avatars/avatar-019.png';
import avatar020 from '@/src/assets/avatars/avatar-020.png';
import avatar021 from '@/src/assets/avatars/avatar-021.png';
import avatar022 from '@/src/assets/avatars/avatar-022.png';
import avatar023 from '@/src/assets/avatars/avatar-023.png';
import avatar024 from '@/src/assets/avatars/avatar-024.png';
import avatar025 from '@/src/assets/avatars/avatar-025.png';

const avatarMap: Record<string, any> = {
  '001': avatar001,
  '002': avatar002,
  '003': avatar003,
  '004': avatar004,
  '005': avatar005,
  '006': avatar006,
  '007': avatar007,
  '008': avatar008,
  '009': avatar009,
  '010': avatar010,
  '011': avatar011,
  '012': avatar012,
  '013': avatar013,
  '014': avatar014,
  '015': avatar015,
  '017': avatar017,
  '018': avatar018,
  '019': avatar019,
  '020': avatar020,
  '021': avatar021,
  '022': avatar022,
  '023': avatar023,
  '024': avatar024,
  '025': avatar025,
};

const AVAILABLE_AVATAR_IDS = ['001', '002', '003', '004', '005', '006', '007', '008', '009', '010', '011', '012', '013', '014', '015', '017', '018', '019', '020', '021', '022', '023', '024', '025'];
import type { ProfileInfo } from "@/src/types/profile";
import toast from "react-hot-toast";
import styles from "./ProfilePage.module.css";

export default function ProfilePage() {
  const { setShowBackButton, setOnBackClick } = useHeaderVisibility();
  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [savingDisplayName, setSavingDisplayName] = useState(false);
  const MAX_DISPLAY_NAME_LENGTH = 16;
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [removingAvatar, setRemovingAvatar] = useState(false);
  const [savingAvatarId, setSavingAvatarId] = useState(false);
  const [selectedAvatarId, setSelectedAvatarId] = useState<string | null>(null);
  const [showAvatarSelector, setShowAvatarSelector] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setShowBackButton(true);
    setOnBackClick(() => () => {
      window.history.back();
    });
    return () => {
      setShowBackButton(false);
      setOnBackClick(null);
    };
  }, [setShowBackButton, setOnBackClick]);

  useEffect(() => {
    async function fetchProfile() {
      try {
        const data = await loadProfile();
        if (data) {
          setProfile(data);
          setDisplayName(data.displayName);
          setSelectedAvatarId(data.avatarId || "001");
        } else {
          toast.error("خطا در بارگذاری اطلاعات پروفایل");
        }
      } catch (error) {
        console.error("Error fetching profile:", error);
        toast.error("خطا در بارگذاری اطلاعات پروفایل");
      } finally {
        setLoading(false);
      }
    }

    fetchProfile();
  }, []);

  const handleSaveDisplayName = async () => {
    if (!displayName.trim()) {
      toast.error("نام نمایشی نمی‌تواند خالی باشد");
      return;
    }

    if (displayName.trim().length > MAX_DISPLAY_NAME_LENGTH) {
      toast.error(`نام نمایشی نمی‌تواند بیشتر از ${MAX_DISPLAY_NAME_LENGTH} کاراکتر باشد`);
      return;
    }

    if (displayName.trim() === profile?.displayName) {
      return; // تغییری نکرده
    }

    setSavingDisplayName(true);
    try {
      const success = await updateDisplayName(displayName.trim());
      if (success) {
        setProfile((prev) =>
          prev ? { ...prev, displayName: displayName.trim() } : null
        );
        toast.success("نام نمایشی با موفقیت به‌روزرسانی شد");
        
        // Dispatch event برای refresh کردن PlayerStatusBar
        if (typeof window !== 'undefined') {
          const event = new CustomEvent('profileDisplayNameUpdated', {
            detail: { displayName: displayName.trim() }
          });
          window.dispatchEvent(event);
          console.log('ProfilePage: Dispatched profileDisplayNameUpdated event');
        }
      } else {
        toast.error("خطا در به‌روزرسانی نام نمایشی");
      }
    } catch (error: any) {
      console.error("Error updating display name:", error);
      toast.error(error.message || "خطا در به‌روزرسانی نام نمایشی");
    } finally {
      setSavingDisplayName(false);
    }
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingAvatar(true);
    try {
      const avatarUrl = await uploadAvatar(file);
      if (avatarUrl) {
        setSelectedAvatarId(null); // پاک کردن avatar_id وقتی آواتار آپلود می‌شود
        setProfile((prev) => (prev ? { ...prev, avatarUrl, avatarId: null } : null));
        toast.success("آواتار با موفقیت آپلود شد");
        
        // Dispatch event برای refresh کردن PlayerStatusBar
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('profileAvatarUpdated'));
        }
      } else {
        toast.error("خطا در آپلود آواتار");
      }
    } catch (error: any) {
      console.error("Error uploading avatar:", error);
      toast.error(error.message || "خطا در آپلود آواتار");
    } finally {
      setUploadingAvatar(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleSelectAvatar = async (avatarId: string) => {
    if (avatarId === selectedAvatarId) {
      return; // همان آواتار انتخاب شده
    }

    setSavingAvatarId(true);
    try {
      const success = await updateAvatarId(avatarId);
      if (success) {
        setSelectedAvatarId(avatarId);
        setProfile((prev) => (prev ? { ...prev, avatarId, avatarUrl: null } : null));
        setShowAvatarSelector(false);
        toast.success("آواتار با موفقیت تغییر کرد");
        
        // Dispatch event برای refresh کردن PlayerStatusBar
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('profileAvatarUpdated'));
        }
      } else {
        toast.error("خطا در تغییر آواتار");
      }
    } catch (error: any) {
      console.error("Error updating avatar:", error);
      toast.error(error.message || "خطا در تغییر آواتار");
    } finally {
      setSavingAvatarId(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!confirm("آیا مطمئن هستید که می‌خواهید آواتار آپلود شده را حذف کنید؟")) {
      return;
    }

    setRemovingAvatar(true);
    try {
      const success = await removeAvatar();
      if (success) {
        // بعد از حذف آواتار آپلود شده، به آواتار پیش‌فرض برمی‌گردیم
        const defaultAvatarId = "001";
        await updateAvatarId(defaultAvatarId);
        setSelectedAvatarId(defaultAvatarId);
        setProfile((prev) => (prev ? { ...prev, avatarUrl: null, avatarId: defaultAvatarId } : null));
        toast.success("آواتار با موفقیت حذف شد");
        
        // Dispatch event برای refresh کردن PlayerStatusBar
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('profileAvatarUpdated'));
        }
      } else {
        toast.error("خطا در حذف آواتار");
      }
    } catch (error: any) {
      console.error("Error removing avatar:", error);
      toast.error(error.message || "خطا در حذف آواتار");
    } finally {
      setRemovingAvatar(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error("لطفاً تمام فیلدها را پر کنید");
      return;
    }

    if (newPassword.length < 6) {
      toast.error("رمز عبور جدید باید حداقل 6 کاراکتر باشد");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("رمز عبور جدید و تأیید آن مطابقت ندارند");
      return;
    }

    setChangingPassword(true);
    try {
      const success = await changePassword(currentPassword, newPassword);
      if (success) {
        toast.success("رمز عبور با موفقیت تغییر کرد");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setShowPasswordForm(false);
      }
    } catch (error: any) {
      console.error("Error changing password:", error);
      toast.error(error.message || "خطا در تغییر رمز عبور");
    } finally {
      setChangingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingContainer}>
          <div className={styles.loadingSpinner}></div>
          <p className={styles.loadingText}>در حال بارگذاری...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className={styles.container}>
        <div className={styles.errorContainer}>
          <p className={styles.errorText}>خطا در بارگذاری اطلاعات پروفایل</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <h1 className={styles.title}>پروفایل من</h1>

        {/* بخش آواتار */}
        <div className={styles.section}>
          <label className={styles.sectionLabel}>آواتار</label>
          <div className={styles.avatarSection}>
            <div className={styles.avatarContainer}>
              {profile.avatarUrl ? (
                <img
                  src={profile.avatarUrl}
                  alt="Avatar"
                  className={styles.avatar}
                />
              ) : selectedAvatarId && avatarMap[selectedAvatarId] ? (
                <Image
                  src={avatarMap[selectedAvatarId]}
                  alt="Avatar"
                  className={styles.avatar}
                  width={120}
                  height={120}
                />
              ) : (
                <div className={styles.avatarPlaceholder}>
                  {profile.displayName[0]?.toUpperCase() || "U"}
                </div>
              )}
            </div>
            <div className={styles.avatarActions}>
              <button
                type="button"
                onClick={() => setShowAvatarSelector(!showAvatarSelector)}
                disabled={savingAvatarId}
                className={styles.avatarButton}
              >
                {savingAvatarId ? "در حال ذخیره..." : "انتخاب از آواتارهای موجود"}
              </button>
              <button
                type="button"
                onClick={handleAvatarClick}
                disabled={uploadingAvatar}
                className={styles.avatarButton}
              >
                {uploadingAvatar ? "در حال آپلود..." : "آپلود آواتار"}
              </button>
              {profile.avatarUrl && (
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  disabled={removingAvatar}
                  className={`${styles.avatarButton} ${styles.removeButton}`}
                >
                  {removingAvatar ? "در حال حذف..." : "حذف آواتار آپلود شده"}
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              style={{ display: "none" }}
            />
            
            {/* انتخابگر آواتار */}
            {showAvatarSelector && (
              <div className={styles.avatarSelector}>
                <div className={styles.avatarGrid}>
                  {AVAILABLE_AVATAR_IDS.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => handleSelectAvatar(id)}
                      className={`${styles.avatarOption} ${
                        selectedAvatarId === id ? styles.avatarOptionSelected : ""
                      }`}
                      disabled={savingAvatarId}
                    >
                      <Image
                        src={avatarMap[id]}
                        alt={`Avatar ${id}`}
                        width={60}
                        height={60}
                      />
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setShowAvatarSelector(false)}
                  className={styles.closeButton}
                >
                  بستن
                </button>
              </div>
            )}
            
            <p className={styles.helperText}>
              می‌توانید از آواتارهای موجود انتخاب کنید یا آواتار خود را آپلود کنید
            </p>
          </div>
        </div>

        {/* بخش نام نمایشی */}
        <div className={styles.section}>
          <label htmlFor="displayName" className={styles.sectionLabel}>
            انتخاب نام داخل بازی
          </label>
          <div className={styles.inputGroup}>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => {
                const value = e.target.value;
                if (value.length <= MAX_DISPLAY_NAME_LENGTH) {
                  setDisplayName(value);
                }
              }}
              maxLength={MAX_DISPLAY_NAME_LENGTH}
              className={styles.input}
              placeholder="نام نمایشی خود را وارد کنید"
              disabled={savingDisplayName}
            />
            <button
              type="button"
              onClick={handleSaveDisplayName}
              disabled={savingDisplayName || displayName.trim() === profile.displayName}
              className={styles.saveButton}
            >
              {savingDisplayName ? "در حال ذخیره..." : "ذخیره"}
            </button>
          </div>
          <p className={styles.helperText}>
            این نام در اپلیکیشن به سایر کاربران نمایش داده می‌شود
            <span className={styles.characterCount}>
              ({displayName.length}/{MAX_DISPLAY_NAME_LENGTH})
            </span>
          </p>
        </div>

        {/* بخش اطلاعات کاربری */}
        <div className={styles.section}>
          <label className={styles.sectionLabel}>اطلاعات کاربری</label>
          <div className={styles.infoGroup}>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>نام کاربری:</span>
              <span className={styles.infoValue}>{profile.username}</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>ایمیل:</span>
              <span className={styles.infoValue}>{profile.email}</span>
            </div>
          </div>
        </div>

        {/* بخش تغییر رمز عبور */}
        <div className={styles.section}>
          <div className={styles.passwordHeader}>
            <label className={styles.sectionLabel}>رمز عبور</label>
            <button
              type="button"
              onClick={() => setShowPasswordForm(!showPasswordForm)}
              className={styles.toggleButton}
            >
              {showPasswordForm ? "لغو" : "تغییر رمز عبور"}
            </button>
          </div>

          {showPasswordForm && (
            <form onSubmit={handleChangePassword} className={styles.passwordForm}>
              <div className={styles.formGroup}>
                <label htmlFor="currentPassword" className={styles.formLabel}>
                  رمز عبور فعلی
                </label>
                <input
                  id="currentPassword"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className={styles.input}
                  placeholder="رمز عبور فعلی خود را وارد کنید"
                  disabled={changingPassword}
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="newPassword" className={styles.formLabel}>
                  رمز عبور جدید
                </label>
                <input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={styles.input}
                  placeholder="رمز عبور جدید را وارد کنید"
                  disabled={changingPassword}
                  required
                  minLength={6}
                />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="confirmPassword" className={styles.formLabel}>
                  تأیید رمز عبور جدید
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={styles.input}
                  placeholder="رمز عبور جدید را دوباره وارد کنید"
                  disabled={changingPassword}
                  required
                  minLength={6}
                />
              </div>

              <button
                type="submit"
                disabled={changingPassword}
                className={styles.submitButton}
              >
                {changingPassword ? "در حال تغییر..." : "تغییر رمز عبور"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

