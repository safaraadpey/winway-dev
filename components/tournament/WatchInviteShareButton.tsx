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

export default function WatchInviteShareButton({
  tournamentId,
  tournamentTitle,
}: WatchInviteShareButtonProps) {
  const [sharing, setSharing] = useState(false);

  const handleShare = useCallback(async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        toast.error("ابتدا وارد حساب کاربری شوید");
        return;
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
        error?: string;
      };

      if (!res.ok) {
        toast.error(payload.message || "خطا در ساخت لینک اشتراک‌گذاری");
        return;
      }

      const shareUrl = payload.shareUrl;
      if (!shareUrl) {
        toast.error("لینک اشتراک‌گذاری در دسترس نیست");
        return;
      }

      const banner = await loadShareBanner();
      const title =
        banner?.isEnabled && banner.title.trim()
          ? banner.title.trim()
          : payload.tournamentTitle || tournamentTitle || "تماشای تورنومنت";
      const text =
        banner?.isEnabled && banner.caption.trim()
          ? banner.caption.trim()
          : "برای تماشای تورنومنت روی لینک بزنید";

      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        try {
          await navigator.share({ title, text, url: shareUrl });
          return;
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") return;
        }
      }

      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
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
    <button
      type="button"
      className={styles.shareButton}
      onClick={() => void handleShare()}
      disabled={sharing}
    >
      {sharing ? "در حال آماده‌سازی..." : "به اشتراک گذاری تورنومنت"}
    </button>
  );
}
