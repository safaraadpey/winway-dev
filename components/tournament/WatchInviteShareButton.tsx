"use client";

import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import toast from "react-hot-toast";
import type { WatchInviteBanner } from "@/lib/watch-invite/types";
import styles from "./WatchInviteShareButton.module.css";

type WatchInviteShareButtonProps = {
  tournamentId: string;
  tournamentTitle?: string | null;
};

async function loadShareBanner(): Promise<WatchInviteBanner | null> {
  try {
    const res = await fetch("/api/watch/banner", { cache: "no-store" });
    if (!res.ok) return null;
    const payload = (await res.json()) as { banner?: WatchInviteBanner | null };
    return payload.banner ?? null;
  } catch {
    return null;
  }
}

async function fetchShareUrl(tournamentId: string): Promise<{
  shareUrl?: string;
  tournamentTitle?: string;
  message?: string;
}> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    return { message: "ابتدا وارد حساب کاربری شوید" };
  }

  const res = await fetch("/api/player/watch-invite", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ tournamentId }),
    cache: "no-store",
  });

  const payload = (await res.json()) as {
    shareUrl?: string;
    tournamentTitle?: string;
    message?: string;
  };

  if (!res.ok) {
    return { message: payload.message || "خطا در ساخت لینک اشتراک‌گذاری" };
  }

  return payload;
}

export default function WatchInviteShareButton({
  tournamentId,
  tournamentTitle,
}: WatchInviteShareButtonProps) {
  const [sharing, setSharing] = useState(false);
  const [loadingLink, setLoadingLink] = useState(true);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadShareLink = async () => {
      setLoadingLink(true);
      setLinkError(null);
      try {
        const payload = await fetchShareUrl(tournamentId);
        if (!active) return;
        if (payload.shareUrl) {
          setShareUrl(payload.shareUrl);
          setLinkError(null);
        } else {
          setShareUrl(null);
          setLinkError(payload.message || "لینک اشتراک‌گذاری در دسترس نیست");
        }
      } catch (err) {
        console.error("[WatchInvite] preload share link error:", err);
        if (!active) return;
        setShareUrl(null);
        setLinkError("خطا در دریافت لینک اشتراک‌گذاری");
      } finally {
        if (active) setLoadingLink(false);
      }
    };

    void loadShareLink();
    return () => {
      active = false;
    };
  }, [tournamentId]);

  const resolveShareUrl = useCallback(async () => {
    const payload = await fetchShareUrl(tournamentId);
    if (payload.shareUrl) {
      setShareUrl(payload.shareUrl);
      setLinkError(null);
      return payload.shareUrl;
    }
    setShareUrl(null);
    setLinkError(payload.message || "لینک اشتراک‌گذاری در دسترس نیست");
    return null;
  }, [tournamentId]);

  const handleCopy = useCallback(async () => {
    const url = shareUrl || (await resolveShareUrl());
    if (!url) {
      toast.error(linkError || "لینک اشتراک‌گذاری در دسترس نیست");
      return;
    }

    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      toast.success("لینک کپی شد");
      return;
    }

    toast.error("مرورگر از کپی کردن پشتیبانی نمی‌کند");
  }, [linkError, resolveShareUrl, shareUrl]);

  const handleShare = useCallback(async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const url = shareUrl || (await resolveShareUrl());
      if (!url) {
        toast.error(linkError || "لینک اشتراک‌گذاری در دسترس نیست");
        return;
      }

      const banner = await loadShareBanner();
      const title =
        banner?.isEnabled && banner.title.trim()
          ? banner.title.trim()
          : tournamentTitle || "تماشای تورنومنت";
      const text =
        banner?.isEnabled && banner.caption.trim()
          ? banner.caption.trim()
          : "برای تماشای تورنومنت روی لینک بزنید";

      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        try {
          await navigator.share({ title, text, url });
          return;
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") return;
        }
      }

      await handleCopy();
    } catch (err) {
      console.error("[WatchInvite] share button error:", err);
      toast.error("خطا در اشتراک‌گذاری");
    } finally {
      setSharing(false);
    }
  }, [handleCopy, linkError, resolveShareUrl, shareUrl, sharing, tournamentTitle]);

  return (
    <div className={styles.root}>
      <button
        type="button"
        className={styles.shareButton}
        onClick={() => void handleShare()}
        disabled={sharing || loadingLink}
      >
        {sharing ? "در حال آماده‌سازی..." : "به اشتراک گذاری تورنومنت"}
      </button>

      <div className={styles.linkCard}>
        <div className={styles.linkLabel}>لینک اشتراک‌گذاری</div>
        {loadingLink ? (
          <div className={styles.linkLoading}>در حال دریافت لینک...</div>
        ) : shareUrl ? (
          <>
            <div className={styles.linkValue} dir="ltr">
              {shareUrl}
            </div>
            <button
              type="button"
              className={styles.copyButton}
              onClick={() => void handleCopy()}
            >
              کپی لینک
            </button>
          </>
        ) : (
          <div className={styles.linkError}>{linkError || "لینک در دسترس نیست"}</div>
        )}
      </div>
    </div>
  );
}
