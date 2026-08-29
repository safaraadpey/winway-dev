"use client";

import React, { useCallback, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import toast from "react-hot-toast";
import type { WatchInviteBanner } from "@/lib/watch-invite/types";
import styles from "./WatchInviteShareButton.module.css";

type WatchInviteShareButtonProps = {
  tournamentId: string;
  tournamentTitle?: string | null;
};

async function loadShareBanner(tournamentId: string): Promise<WatchInviteBanner | null> {
  try {
    const res = await fetch(
      `/api/watch/banner?tournamentId=${encodeURIComponent(tournamentId)}`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    const payload = (await res.json()) as { banner?: WatchInviteBanner | null };
    return payload.banner ?? null;
  } catch {
    return null;
  }
}

async function fetchShareUrl(tournamentId: string): Promise<{
  shareUrl?: string;
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

  const handleShare = useCallback(async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const payload = await fetchShareUrl(tournamentId);
      const url = payload.shareUrl;
      if (!url) {
        toast.error(payload.message || "لینک اشتراک‌گذاری در دسترس نیست");
        return;
      }

      const banner = await loadShareBanner(tournamentId);
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

      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        toast.success("لینک کپی شد");
        return;
      }

      toast.error("مرورگر از اشتراک‌گذاری پشتیبانی نمی‌کند");
    } catch (err) {
      console.error("[WatchInvite] share button error:", err);
      toast.error("خطا در اشتراک‌گذاری");
    } finally {
      setSharing(false);
    }
  }, [sharing, tournamentId, tournamentTitle]);

  return (
    <div className={styles.root}>
      <button
        type="button"
        className={styles.shareButton}
        onClick={() => void handleShare()}
        disabled={sharing}
      >
        {sharing ? "در حال آماده‌سازی..." : "به اشتراک گذاری تورنومنت"}
      </button>
    </div>
  );
}
