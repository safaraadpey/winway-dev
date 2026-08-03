"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/lib/contexts/SessionContext";
import {
  acknowledgeKycNotification,
  fetchKycNotification,
} from "@/services/kyc";
import type { KycNotificationResponse } from "@/src/types/kyc";

type KycResultModalProps = {
  visibleOnPaths?: string[];
};

export default function KycResultModal({ visibleOnPaths }: KycResultModalProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { userId } = useSession();
  const [notification, setNotification] =
    useState<KycNotificationResponse | null>(null);
  const [acking, setAcking] = useState(false);

  const shouldShowOnThisPath =
    !visibleOnPaths ||
    visibleOnPaths.some(
      (basePath) => pathname === basePath || pathname.startsWith(`${basePath}/`)
    );

  useEffect(() => {
    if (!shouldShowOnThisPath || !userId) {
      setNotification(null);
      return;
    }

    let cancelled = false;

    const timeoutId = setTimeout(() => {
      void (async () => {
        try {
          const data = await fetchKycNotification();
          if (cancelled) return;
          if (data.hasNotification) {
            setNotification(data);
          } else {
            setNotification(null);
          }
        } catch (err) {
          console.error("[KYC] Entry notification load failed", err);
        }
      })();
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [shouldShowOnThisPath, userId]);

  if (!shouldShowOnThisPath || !notification?.hasNotification) {
    return null;
  }

  const isApproved = notification.kind === "approved";

  const dismiss = async (navigateToKyc: boolean) => {
    if (acking || !notification.submissionId) return;
    setAcking(true);
    try {
      await acknowledgeKycNotification(notification.submissionId);
    } catch (err) {
      console.error("[KYC] Ack failed", err);
    } finally {
      setNotification(null);
      setAcking(false);
      if (navigateToKyc) {
        router.push("/player/kyc");
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4">
      <div
        className="w-full max-w-[340px] rounded-2xl border border-[var(--player-border,rgba(64,64,64,0.5))] bg-[var(--player-surface,#1a1a1a)] p-5 text-center"
        role="dialog"
        aria-modal="true"
      >
        <div
          className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full text-2xl font-bold ${
            isApproved
              ? "bg-[rgba(0,212,170,0.15)] text-[var(--player-accent,#00d4aa)]"
              : "bg-amber-500/15 text-amber-300"
          }`}
          aria-hidden="true"
        >
          {isApproved ? "✓" : "!"}
        </div>

        <h2 className="mb-2 text-lg font-bold text-[var(--player-text-primary,#fff)]">
          {isApproved ? "تبریک!" : "نیاز به تکرار احراز هویت"}
        </h2>

        <p className="mb-4 text-sm leading-6 text-[var(--player-text-muted,#9ca3af)]">
          {isApproved
            ? "احراز هویت شما با موفقیت تأیید شد."
            : notification.rejectionReasonLabel
              ? `لطفاً فرآیند احراز هویت را دوباره انجام دهید. دلیل: ${notification.rejectionReasonLabel}`
              : "لطفاً فرآیند احراز هویت را دوباره انجام دهید."}
        </p>

        {isApproved ? (
          <button
            type="button"
            disabled={acking}
            onClick={() => void dismiss(false)}
            className="w-full rounded-xl bg-[var(--player-accent,#00d4aa)] py-3 font-bold text-black disabled:opacity-50"
          >
            متوجه شدم
          </button>
        ) : (
          <div className="grid gap-2">
            <button
              type="button"
              disabled={acking}
              onClick={() => void dismiss(true)}
              className="w-full rounded-xl bg-[var(--player-accent,#00d4aa)] py-3 font-bold text-black disabled:opacity-50"
            >
              شروع مجدد احراز هویت
            </button>
            <button
              type="button"
              disabled={acking}
              onClick={() => void dismiss(false)}
              className="w-full rounded-xl border border-[var(--player-border,rgba(64,64,64,0.8))] py-3 text-[var(--player-text-primary,#fff)] disabled:opacity-50"
            >
              بعداً
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
