"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import {
  analyzeKycImageQuality,
  qualityFailureMessage,
} from "@/lib/kyc/imageQuality";
import { fetchKycStatus, submitKyc } from "@/services/kyc";
import type { KycSubmissionStatus } from "@/src/types/kyc";
import styles from "./KycPage.module.css";

type Step = "instructions" | "camera" | "review" | "done";

const COUNTDOWN_SECONDS = 3;

export default function KycPage() {
  const { setShowBackButton, setOnBackClick } = useHeaderVisibility();
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>("instructions");
  const [status, setStatus] = useState<KycSubmissionStatus>("none");
  const [declarationText, setDeclarationText] = useState("");
  const [kycCode, setKycCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const captureLockRef = useRef(false);

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

  const stopCamera = useCallback(() => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setCountdown(null);
    captureLockRef.current = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [stopCamera, previewUrl]);

  useEffect(() => {
    const onHardExit = () => {
      stopCamera();
    };
    window.addEventListener("winway:hard-exit", onHardExit);
    return () => window.removeEventListener("winway:hard-exit", onHardExit);
  }, [stopCamera]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await fetchKycStatus();
        if (cancelled) return;
        setStatus(data.status);
        setKycCode(data.kycCode || "");
        setDeclarationText(data.declarationText || "");
        if (data.status === "pending_review" || data.status === "approved") {
          setStep("done");
        }
      } catch (err) {
        console.error("[KYC] Failed to load status", err);
        if (!cancelled) {
          setError("بارگذاری وضعیت احراز هویت ناموفق بود.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const captureFrame = useCallback(async () => {
    if (captureLockRef.current) return;
    captureLockRef.current = true;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0) {
      setError("دوربین آماده نیست. دوباره تلاش کنید.");
      captureLockRef.current = false;
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setError("خطا در آماده‌سازی تصویر.");
      captureLockRef.current = false;
      return;
    }

    // Do not mirror — ID/bank card text must stay readable for review.
    ctx.drawImage(video, 0, 0);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85)
    );

    if (!blob) {
      setError("ثبت تصویر ناموفق بود.");
      captureLockRef.current = false;
      return;
    }

    stopCamera();

    try {
      const checks = await analyzeKycImageQuality(blob);
      if (!checks.passed) {
        setError(qualityFailureMessage(checks.failures));
        setStep("instructions");
        captureLockRef.current = false;
        return;
      }

      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      setCapturedBlob(blob);
      setError(null);
      setStep("review");
    } catch (err) {
      console.error("[KYC] Quality check failed", err);
      setError("بررسی کیفیت تصویر ناموفق بود.");
      setStep("instructions");
    } finally {
      captureLockRef.current = false;
    }
  }, [previewUrl, stopCamera]);

  const startCountdownAndCapture = useCallback(() => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
    }
    setCountdown(COUNTDOWN_SECONDS);
    countdownTimerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          if (countdownTimerRef.current) {
            clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
          }
          void captureFrame();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }, [captureFrame]);

  const openCamera = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "user" },
          width: { ideal: 1280 },
          height: { ideal: 960 },
        },
      });
      streamRef.current = stream;
      setStep("camera");

      // Attach after paint
      requestAnimationFrame(() => {
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        void video.play().then(() => {
          startCountdownAndCapture();
        });
      });
    } catch (err) {
      console.error("[KYC] Camera permission failed", err);
      setError(
        "دسترسی به دوربین ممکن نیست. مجوز دوربین را در تنظیمات مرورگر فعال کنید."
      );
      setStep("instructions");
    }
  };

  const blobToBase64 = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = String(reader.result || "");
        const base64 = result.includes(",") ? result.split(",")[1]! : result;
        resolve(base64);
      };
      reader.onerror = () => reject(new Error("read_failed"));
      reader.readAsDataURL(blob);
    });

  const handleSubmit = async () => {
    if (!capturedBlob || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const checks = await analyzeKycImageQuality(capturedBlob);
      if (!checks.passed) {
        setError(qualityFailureMessage(checks.failures));
        setSubmitting(false);
        return;
      }

      const imageBase64 = await blobToBase64(capturedBlob);
      const clientRequestId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `kyc-${Date.now()}`;

      const result = await submitKyc({
        clientRequestId,
        kycCode,
        declarationText,
        imageBase64,
        imageMimeType: "image/jpeg",
        qualityChecks: checks,
      });

      console.log("[KYC] Submit ok", result.submissionId);
      setStatus("pending_review");
      setStep("done");
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
      setCapturedBlob(null);
    } catch (err) {
      console.error("[KYC] Submit error", err);
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: string }).code)
          : "";
      if (code === "already_pending") {
        setStatus("pending_review");
        setStep("done");
        return;
      }
      const message =
        err instanceof Error && err.message && err.message !== "KYC_SUBMIT_FAILED"
          ? err.message
          : "ارسال درخواست ناموفق بود.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const retake = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setCapturedBlob(null);
    setError(null);
    setStep("instructions");
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.content}>
          <p className={styles.loading}>در حال بارگذاری…</p>
        </div>
      </div>
    );
  }

  if (step === "done" || status === "pending_review" || status === "approved") {
    const isApproved = status === "approved";
    return (
      <div className={styles.container}>
        <div className={styles.content}>
          <h1 className={styles.title}>احراز هویت</h1>
          <div className={styles.statusCard}>
            <div className={styles.statusIcon} aria-hidden="true">
              {isApproved ? "✓" : "…"}
            </div>
            <h2 className={styles.statusTitle}>
              {isApproved
                ? "احراز هویت تأیید شد"
                : "احراز هویت در دست بررسی"}
            </h2>
            <p className={styles.statusMessage}>
              {isApproved
                ? "هویت شما با موفقیت تأیید شده است."
                : "احراز هویت شما در دست بررسی قرار گرفت. نتیجه پس از بررسی مدارک اعلام می‌شود."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <h1 className={styles.title}>احراز هویت</h1>
        <p className={styles.subtitle}>
          برای تکمیل احراز هویت، مطابق نمونه زیر عکس بگیرید.
        </p>

        {error ? <div className={styles.errorBanner}>{error}</div> : null}

        {step === "instructions" ? (
          <>
            <div className={styles.guideImageWrap}>
              <Image
                src="/images/kyc-instruction.png"
                alt="نمونه صحیح گرفتن مدارک و کاغذ"
                width={1024}
                height={1024}
                className={styles.guideImage}
                priority
              />
            </div>

            <div className={styles.instructionBox}>
              <div className={styles.instructionTitle}>راهنمای تصویربرداری</div>
              <p className={styles.instructionBody}>
                متن زیر را روی کاغذ بنویسید و مطابق تصویر، به همراه مدارک کارت
                ملی و کارت بانکی خود، بعد از زدن دکمه تصویربرداری مقابل دوربین
                نگه دارید. تصویر شما به‌صورت خودکار ثبت خواهد شد.
              </p>
            </div>

            <div className={styles.declarationBox}>
              <div className={styles.declarationLabel}>
                متنی که باید روی کاغذ بنویسید:
              </div>
              {kycCode ? (
                <span className={styles.declarationCode} dir="ltr">
                  {kycCode}
                </span>
              ) : null}
              <pre className={styles.declarationText}>
                {declarationText.replace(kycCode ? `${kycCode}\n` : "", "")}
              </pre>
            </div>

            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => void openCamera()}
            >
              شروع تصویربرداری
            </button>
          </>
        ) : null}

        {step === "camera" ? (
          <>
            <div className={styles.cameraStage}>
              <video
                ref={videoRef}
                className={styles.video}
                playsInline
                muted
                autoPlay
              />
              {countdown !== null ? (
                <div className={styles.countdownOverlay}>
                  <span className={styles.countdownNumber} dir="ltr">
                    {countdown}
                  </span>
                </div>
              ) : null}
            </div>
            <p className={styles.subtitle}>
              مدارک را مقابل دوربین ثابت نگه دارید…
            </p>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => {
                stopCamera();
                setStep("instructions");
              }}
            >
              انصراف
            </button>
          </>
        ) : null}

        {step === "review" ? (
          <>
            <div className={styles.cameraStage}>
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt="پیش‌نمایش تصویر احراز هویت"
                  className={styles.previewImage}
                />
              ) : null}
            </div>
            <button
              type="button"
              className={styles.primaryButton}
              disabled={submitting}
              onClick={() => void handleSubmit()}
            >
              {submitting ? "در حال ارسال…" : "تأیید و ارسال"}
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={submitting}
              onClick={retake}
            >
              گرفتن مجدد
            </button>
          </>
        ) : null}

        <canvas ref={canvasRef} className={styles.hiddenCanvas} />
      </div>
    </div>
  );
}
