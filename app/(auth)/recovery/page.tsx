"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import styles from "./auth.module.css";
import { AUTH_FORM_FALLBACK_PATH } from "@/lib/auth/formFallback";

export default function RecoveryPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/login`,
      });

      if (recoveryError) throw recoveryError;

      setSuccess(true);
    } catch (err: any) {
      setError(err.message || "خطایی رخ داد. لطفاً دوباره تلاش کنید.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.loginContainer}>
      <div className={styles.formWrapper}>
        <h1 className={styles.logo}>dingmoney</h1>

        <form
          method="post"
          action={AUTH_FORM_FALLBACK_PATH}
          onSubmit={handleSubmit}
          className={styles.form}
        >
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={styles.input}
            placeholder="user name"
          />

          {error && <div className={styles.errorMessage}>{error}</div>}

          {success && (
            <div
              className={styles.errorMessage}
              style={{ backgroundColor: "#d1fae5", color: "#065f46" }}
            >
              لینک بازیابی رمز عبور به ایمیل شما ارسال شد.
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className={styles.primaryButton}
          >
            {loading ? "Loading..." : "SEND RECOVERY LINK"}
          </button>

          <button
            type="button"
            onClick={() => {
              router.push("/login");
            }}
            className={styles.secondaryLink}
          >
            Back to Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
