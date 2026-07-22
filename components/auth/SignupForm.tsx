"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";
import { usernameToEmail, validateUsername } from "@/lib/auth-helpers";
import toast from "react-hot-toast";
import styles from "./SignupForm.module.css";
import { getLogoImagePath } from "@/lib/theme/logoImageFiles";
import { DEFAULT_THEME } from "@/lib/theme/types";

const logoSrc = getLogoImagePath(DEFAULT_THEME, "logo");

/**
 * کامپوننت فرم ثبت‌نام با Username + Password
 * 
 * ویژگی‌ها:
 * - فقط username و password می‌گیرد (نه email)
 * - ایمیل را خودش می‌سازد: ${username}@dingmoney.org
 * - از Supabase برای ثبت‌نام استفاده می‌کند
 * - Toast برای نمایش خطاها و موفقیت‌ها
 * - Redirect به /post-login بعد از موفقیت
 */
export default function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [referralErrorHint, setReferralErrorHint] = useState<string | null>(null);
  
  // پسورد به صورت پیش‌فرض visible است
  const [showPassword] = useState(true);

  useEffect(() => {
    const refFromUrl = searchParams.get("ref");
    if (refFromUrl?.trim()) {
      setReferralCode(refFromUrl.trim().toUpperCase());
    }
  }, [searchParams]);

  /**
   * هندل کردن submit فرم ثبت‌نام
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

      // اعتبارسنجی referral code (اجباری) — authoritative server check
      if (!referralCode || referralCode.trim().length === 0) {
        setReferralErrorHint("کد معرف الزامی است");
        toast.error("کد معرف الزامی است");
        setLoading(false);
        return;
      }

      const validationRes = await fetch("/api/auth/validate-referral-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: referralCode }),
      });

      const validationBody = (await validationRes.json()) as {
        valid?: boolean;
        normalizedCode?: string;
        message?: string;
      };

      if (!validationRes.ok || !validationBody.valid || !validationBody.normalizedCode) {
        const message =
          validationBody.message || "کد معرف معتبر نیست. لطفاً کد صحیح را وارد کنید";
        setReferralErrorHint(message);
        toast.error(message);
        setLoading(false);
        return;
      }

      const trimmedReferralCode = validationBody.normalizedCode;

      // ساخت ایمیل از username
      const email = usernameToEmail(username);

      // ثبت‌نام
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // ذخیره username و referral code در metadata
          data: {
            username: username.toLowerCase().trim(),
            referral_code: trimmedReferralCode,
          },
        },
      });

      if (signUpError) {
        if (
          signUpError.message.includes("already registered") ||
          signUpError.message.includes("already exists")
        ) {
          toast.error("این نام کاربری قبلاً ثبت شده است. لطفاً از صفحه ورود استفاده کنید");
        } else if (
          signUpError.message.includes("کد معرف") ||
          signUpError.message.toLowerCase().includes("referral")
        ) {
          const message = "کد معرف معتبر نیست. لطفاً کد صحیح را وارد کنید";
          setReferralErrorHint(message);
          toast.error(message);
        } else {
          toast.error(signUpError.message || "خطایی در ثبت‌نام رخ داد");
        }
        setLoading(false);
        return;
      }

      setReferralErrorHint(null);

      if (data.user) {
        toast.success("ثبت‌نام موفق! در حال ورود...");

        // بعد از ثبت‌نام موفق، وارد می‌شویم
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) {
          toast.error("خطا در ورود بعد از ثبت‌نام");
          setLoading(false);
          return;
        }

        // موفقیت
        toast.success("خوش آمدید!");
        router.push("/post-login");
      }
    } catch (err: any) {
      console.error("Signup error:", err);
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
            <div className={styles.inputFrame}>
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${styles.input} ${styles.latinInput}`}
                placeholder="رمز عبور خود را وارد کنید"
                disabled={loading}
              />
            </div>
            <p className={styles.helperText}>
              حداقل 6 کاراکتر
            </p>
          </div>

          {/* Referral Code Input */}
          <div className={styles.inputGroup}>
            <label htmlFor="referralCode" className={styles.label}>
              کد معرف
            </label>
            <div className={styles.inputFrame}>
              <input
                id="referralCode"
                name="referralCode"
                type="text"
                required
                value={referralCode}
                onChange={(e) => {
                  setReferralCode(e.target.value.toUpperCase());
                  if (referralErrorHint) setReferralErrorHint(null);
                }}
                className={`${styles.input} ${styles.latinInput} ${styles.uppercaseInput}`}
                placeholder="کد معرف خود را وارد کنید"
                disabled={loading}
              />
            </div>
            {referralErrorHint ? (
              <p className={styles.errorHint}>{referralErrorHint}</p>
            ) : (
              <p className={styles.helperText}>
                ثبت‌نام بدون کد معرف امکان‌پذیر نیست
              </p>
            )}
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
                در حال ثبت‌نام...
              </span>
            ) : (
              "ثبت‌نام"
            )}
          </button>

          {/* Link to Login */}
          <div className={styles.loginLink}>
            <button
              type="button"
              onClick={() => router.push("/login")}
              className={styles.loginButton}
              disabled={loading}
            >
              <span className={styles.loginText}>
                قبلاً ثبت‌نام کرده‌اید؟{" "}
                <span className={styles.loginAccent}>وارد شوید</span>
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

