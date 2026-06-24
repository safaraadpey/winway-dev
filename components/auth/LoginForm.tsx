"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";
import { usernameToEmail, validateUsername } from "@/lib/auth-helpers";
import toast from "react-hot-toast";
import styles from "./LoginForm.module.css";
import { getLogoImagePath } from "@/lib/theme/logoImageFiles";
import { DEFAULT_THEME } from "@/lib/theme/types";
import AdminPortalRequiredScreen from "@/components/auth/AdminPortalRequiredScreen";
import { getAdminHost, isMainHost, isNonPlayerRole } from "@/lib/auth/portalHosts";
import { signOutInBackground } from "@/lib/auth/signOutInBackground";

const logoSrc = getLogoImagePath(DEFAULT_THEME, "logo");

/**
 * کامپوننت فرم ورود با Username + Password
 * 
 * ویژگی‌ها:
 * - فقط username و password می‌گیرد (نه email)
 * - ایمیل را خودش می‌سازد: ${username}@dingmoney.org
 * - از Supabase برای ورود استفاده می‌کند
 * - Toast برای نمایش خطاها و موفقیت‌ها
 * - Redirect به /dashboard بعد از موفقیت
 */
export default function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);
  const [adminPortalRequired, setAdminPortalRequired] = useState(false);

  /**
   * هندل کردن submit فرم
   * فقط ورود می‌کند (بدون auto-signup)
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // اعتبارسنجی username
      if (!validateUsername(username)) {
        toast.error("Username باید بین 3 تا 20 کاراکتر باشد و فقط شامل حروف، اعداد و زیرخط باشد");
        setLoading(false);
        return;
      }

      // اعتبارسنجی password
      if (password.length < 6) {
        toast.error("رمز عبور باید حداقل 6 کاراکتر باشد");
        setLoading(false);
        return;
      }

      // ساخت ایمیل از username
      const email = usernameToEmail(username);

      // ورود
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        // اگر خطای "Invalid login credentials" بود
        if (signInError.message.includes("Invalid login credentials") || signInError.message.includes("Invalid")) {
          toast.error("نام کاربری یا رمز عبور اشتباه است. لطفاً از صفحه ثبت‌نام استفاده کنید");
        } else {
          toast.error(signInError.message || "خطایی در ورود رخ داد");
        }
      } else if (data.user) {
        const roleFromAuth =
          (data.user.user_metadata?.role as string | undefined) ??
          (data.user.app_metadata?.role as string | undefined);

        const { data: userData, error: userError } = await supabase
          .from("users")
          .select("status, role")
          .eq("id", data.user.id)
          .single();

        const resolvedRole = userData?.role ?? roleFromAuth;

        if (userError && !resolvedRole) {
          console.error("LoginForm: error fetching user status", userError);
          toast.error("خطا در بررسی وضعیت حساب کاربری");
          signOutInBackground();
          return;
        }

        if (userData?.status === "suspended" && resolvedRole === "player") {
          signOutInBackground();
          toast.error("کاربر گرامی؛ اکانت شما موقتا به حالت تعلیق درآمده، لطفا با پشتیبانی و یا ایجنت خود تماس بگیرید.");
          return;
        }

        if (isNonPlayerRole(resolvedRole) && isMainHost(window.location.hostname)) {
          setAdminPortalRequired(true);
          signOutInBackground();
          toast.error(`برای ورود به داشبورد مدیریت از ${getAdminHost()} استفاده کنید.`);
          return;
        }

        toast.success("خوش آمدید!");
        router.push("/post-login");
      }
    } catch (err: any) {
      console.error("Login error:", err);
      toast.error(err.message || "خطای غیرمنتظره‌ای رخ داد");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.wrapper}>
        {/* Logo */}
        <div className={styles.logoContainer}>
          <h1 className={styles.logo}>
            <Image
              src={logoSrc}
              alt="dingmoney دینگ مانی"
              width={516}
              height={300}
              className={styles.logoImage}
              priority
            />
          </h1>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className={styles.form}>
          {/* Username Input */}
          <div className={styles.inputGroup}>
            <label htmlFor="username" className={styles.label}>
              نام کاربری
            </label>
            <div className={styles.inputFrame}>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={`${styles.input} ${styles.latinInput}`}
                placeholder="مثلاً: alipro"
                disabled={loading}
              />
            </div>
            <p className={styles.helperText}>
              3 تا 20 کاراکتر، فقط حروف، اعداد و زیرخط
            </p>
          </div>

          {/* Password Input */}
          <div className={styles.inputGroup}>
            <label htmlFor="password" className={styles.label}>
              پسورد
            </label>
            <div className={`${styles.inputFrame} ${styles.passwordWrapper}`}>
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={styles.input}
                placeholder="رمز عبور خود را وارد کنید"
                disabled={loading}
              />
              <button
                type="button"
                className={styles.passwordToggle}
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                disabled={loading}
              >
                {showPassword ? (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
            <p className={styles.helperText}>
              حداقل 6 کاراکتر
            </p>
          </div>

          {/* Forgot Password Link */}
          <div className={styles.forgotPasswordLink}>
            <button
              type="button"
              onClick={() => setShowForgotPasswordModal(true)}
              className={styles.forgotPasswordButton}
              disabled={loading}
            >
              <span className={styles.forgotPasswordText}>
                فراموشی <span className={styles.forgotPasswordAccent}>رمز عبور</span>
              </span>
            </button>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className={styles.submitButton}
          >
            {loading ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <svg
                  className={styles.loadingSpinner}
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    strokeOpacity="0.25"
                  />
                  <path
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    opacity="0.75"
                  />
                </svg>
                درحال ورود
              </span>
            ) : (
              "ورود"
            )}
          </button>

          {/* Link to Signup */}
          <div className={styles.signupLink}>
            <button
              type="button"
              onClick={() => router.push("/signup")}
              className={styles.signupButton}
              disabled={loading}
            >
              <span className={styles.signupText}>
                حساب کاربری ندارید؟{" "}
                <span className={styles.signupAccent}>ثبت‌نام کنید</span>
              </span>
            </button>
          </div>
        </form>
      </div>

      {showForgotPasswordModal && (
        <div
          className={styles.modalBackdrop}
          onClick={() => setShowForgotPasswordModal(false)}
          role="dialog"
          aria-modal="true"
          aria-label="راهنمای بازیابی رمز عبور"
        >
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <p className={styles.modalText}>برای بازیابی رمز عبور با ایجنت خود تماس بگیرید</p>
            <button
              type="button"
              className={styles.modalCloseButton}
              onClick={() => setShowForgotPasswordModal(false)}
            >
              متوجه شدم
            </button>
          </div>
        </div>
      )}

      {adminPortalRequired && (
        <AdminPortalRequiredScreen
          asOverlay
          onBackToLogin={() => setAdminPortalRequired(false)}
        />
      )}
    </div>
  );
}

