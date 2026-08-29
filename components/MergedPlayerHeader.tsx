"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useTheme } from "@/lib/contexts/ThemeContext";
import { getLogoImagePath } from "@/lib/theme/logoImageFiles";
import KycVerifiedBadge from "@/components/KycVerifiedBadge";
import styles from "./MergedPlayerHeader.module.css";

import dingCoinIcon from "@/src/assets/icons/ding-coin.png";
import refreshIcon from "@/src/assets/icons/refresh.webp";

// Import آواتارهای موجود (کپی از PlayerStatusBar برای عدم دستکاری کامپوننت قبلی)
import avatar001 from "@/src/assets/avatars/avatar-001.png";
import avatar002 from "@/src/assets/avatars/avatar-002.png";
import avatar003 from "@/src/assets/avatars/avatar-003.png";
import avatar004 from "@/src/assets/avatars/avatar-004.png";
import avatar005 from "@/src/assets/avatars/avatar-005.png";
import avatar006 from "@/src/assets/avatars/avatar-006.png";
import avatar007 from "@/src/assets/avatars/avatar-007.png";
import avatar008 from "@/src/assets/avatars/avatar-008.png";
import avatar009 from "@/src/assets/avatars/avatar-009.png";
import avatar010 from "@/src/assets/avatars/avatar-010.png";
import avatar011 from "@/src/assets/avatars/avatar-011.png";
import avatar012 from "@/src/assets/avatars/avatar-012.png";
import avatar013 from "@/src/assets/avatars/avatar-013.png";
import avatar014 from "@/src/assets/avatars/avatar-014.png";
import avatar015 from "@/src/assets/avatars/avatar-015.png";
import avatar017 from "@/src/assets/avatars/avatar-017.png";
import avatar018 from "@/src/assets/avatars/avatar-018.png";
import avatar019 from "@/src/assets/avatars/avatar-019.png";
import avatar020 from "@/src/assets/avatars/avatar-020.png";
import avatar021 from "@/src/assets/avatars/avatar-021.png";
import avatar022 from "@/src/assets/avatars/avatar-022.png";
import avatar023 from "@/src/assets/avatars/avatar-023.png";
import avatar024 from "@/src/assets/avatars/avatar-024.png";
import avatar025 from "@/src/assets/avatars/avatar-025.png";

const avatarMap: Record<string, any> = {
  "001": avatar001,
  "002": avatar002,
  "003": avatar003,
  "004": avatar004,
  "005": avatar005,
  "006": avatar006,
  "007": avatar007,
  "008": avatar008,
  "009": avatar009,
  "010": avatar010,
  "011": avatar011,
  "012": avatar012,
  "013": avatar013,
  "014": avatar014,
  "015": avatar015,
  "017": avatar017,
  "018": avatar018,
  "019": avatar019,
  "020": avatar020,
  "021": avatar021,
  "022": avatar022,
  "023": avatar023,
  "024": avatar024,
  "025": avatar025,
};

interface MergedPlayerHeaderProps {
  dingBalance: number;
  tomanBalance: number;
  loading?: boolean;
  isAnimating?: boolean;
  isTomanAnimating?: boolean;
  showBackButton?: boolean;
  onBackClick?: () => void;
  onRefreshBalances?: () => Promise<void> | void;
  refreshDisabled?: boolean;
}

export default function MergedPlayerHeader({
  dingBalance,
  tomanBalance,
  loading = false,
  isAnimating = false,
  isTomanAnimating = false,
  showBackButton = false,
  onBackClick,
  onRefreshBalances,
  refreshDisabled = false,
}: MergedPlayerHeaderProps) {
  const router = useRouter();
  const { themeId } = useTheme();

  const [playerName, setPlayerName] = useState<string>("اسم بازیکن");
  const [avatarId, setAvatarId] = useState<string>("001");
  const [kycVerified, setKycVerified] = useState(false);
  const [playerLoading, setPlayerLoading] = useState<boolean>(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshingBalances, setIsRefreshingBalances] = useState(false);

  // helper: تولید یک ID کوتاه ۱۰ رقمی پایدار از روی UUID (کپی از PlayerStatusBar)
  const makeShortIdFromUuid = (id: string): string => {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = Math.imul(31, hash) + id.charCodeAt(i);
    }
    const num = (hash >>> 0) % 1_000_000_0000; // 10^10
    return num.toString().padStart(10, "0");
  };

  useEffect(() => {
    async function fetchPlayerInfo() {
      try {
        setPlayerLoading(true);
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          setPlayerLoading(false);
          return;
        }

        // shortId محاسبه می‌شود تا منطق کامپوننت قبلی عیناً منتقل شود (در UI فعلاً نمایش داده نمی‌شود)
        makeShortIdFromUuid(user.id);

        const { data: profile } = await supabase
          .from("user_profiles")
          .select("nickname, avatar_url, metadata")
          .eq("user_id", user.id)
          .single();

        const { data: dbUser } = await supabase
          .from("users")
          .select("username, kyc_verified")
          .eq("id", user.id)
          .single();

        if (profile?.nickname) {
          setPlayerName(profile.nickname);
        } else if (dbUser?.username) {
          setPlayerName(dbUser.username);
        } else if (user.email) {
          setPlayerName(user.email.split("@")[0]);
        } else {
          setPlayerName("کاربر");
        }

        setKycVerified(Boolean(dbUser?.kyc_verified));

        if (profile?.metadata && typeof profile.metadata === "object") {
          const metadata = profile.metadata as any;
          if (metadata.avatar_id) {
            setAvatarId(String(metadata.avatar_id).padStart(3, "0"));
          }
        } else {
          const { data: oldProfile } = await supabase
            .from("profiles")
            .select("avatar_id")
            .eq("id", user.id)
            .single();

          if (oldProfile?.avatar_id) {
            const avatarNumber = String(oldProfile.avatar_id).padStart(3, "0");
            setAvatarId(avatarNumber);
          } else {
            setAvatarId("001");
          }
        }
      } catch (error) {
        console.error("Error fetching player info:", error);
      } finally {
        setPlayerLoading(false);
      }
    }

    fetchPlayerInfo();
  }, [refreshKey]);

  useEffect(() => {
    const handleProfileUpdate = () => setRefreshKey((prev) => prev + 1);
    window.addEventListener("profileDisplayNameUpdated", handleProfileUpdate);
    window.addEventListener("profileAvatarUpdated", handleProfileUpdate);
    window.addEventListener("kycVerifiedUpdated", handleProfileUpdate);
    return () => {
      window.removeEventListener("profileDisplayNameUpdated", handleProfileUpdate);
      window.removeEventListener("profileAvatarUpdated", handleProfileUpdate);
      window.removeEventListener("kycVerifiedUpdated", handleProfileUpdate);
    };
  }, []);

  const formatBalance = (amount: number) => amount.toLocaleString("en-US");

  const getAvatarImage = () => avatarMap[avatarId] || avatar001;

  const handleBackClick = () => {
    if (onBackClick) onBackClick();
    else router.back();
  };

  const handleRefreshBalances = async () => {
    if (!onRefreshBalances || refreshDisabled || isRefreshingBalances) return;
    try {
      setIsRefreshingBalances(true);
      await onRefreshBalances();
    } finally {
      setIsRefreshingBalances(false);
    }
  };

  const handleRefreshKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (refreshDisabled) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      void handleRefreshBalances();
    }
  };

  const capsuleClass = (bgClass: string) =>
    `${styles.balanceCapsule} ${bgClass}${
      refreshDisabled ? "" : ` ${styles.refreshableCapsule}`
    }`;

  const capsuleAnimate = isAnimating
    ? {
        boxShadow: [
          "0 0 0px rgba(251, 191, 36, 0)",
          "0 0 20px rgba(251, 191, 36, 0.6)",
          "0 0 15px rgba(251, 191, 36, 0.4)",
          "0 0 0px rgba(251, 191, 36, 0)",
        ],
      }
    : {};

  const amountAnimate = isAnimating
    ? {
        color: ["#ffffff", "#fcd34d", "#fde047", "#ffffff"],
        filter: ["brightness(1)", "brightness(1.6)", "brightness(1.3)", "brightness(1)"],
        textShadow: [
          "0 0 0px rgba(251, 191, 36, 0)",
          "0 0 15px rgba(251, 191, 36, 0.8)",
          "0 0 10px rgba(251, 191, 36, 0.5)",
          "0 0 0px rgba(251, 191, 36, 0)",
        ],
      }
    : {};

  // فقط کپسول Ding باید انیمیشن glow داشته باشد؛ کپسول Toman ثابت بماند
  const dingCapsuleAnimate = capsuleAnimate;
  const dingAmountAnimate = amountAnimate;
  const tomanCapsuleAnimate = isTomanAnimating
    ? {
        boxShadow: [
          "0 0 0px rgba(251, 191, 36, 0)",
          "0 0 22px rgba(251, 191, 36, 0.75)",
          "0 0 14px rgba(251, 191, 36, 0.45)",
          "0 0 0px rgba(251, 191, 36, 0)",
        ],
      }
    : {};
  const tomanAmountAnimate = isTomanAnimating
    ? {
        color: ["#ffffff", "#fcd34d", "#fde047", "#ffffff"],
        scale: [1, 1.12, 1],
      }
    : {};

  return (
    <div className={styles.container}>
      {/* Row 1: Avatar + Player name (with header.png background) + Brand logo */}
      <div className={styles.row1}>
        <div className={styles.backButtonPlaceholder}>
          {showBackButton ? (
            <button className={styles.backButton} onClick={handleBackClick} aria-label="بازگشت">
              <svg
                className={styles.backIcon}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
          ) : null}
        </div>

        <div className={styles.playerPill}>
          <div className={styles.avatarContainer}>
            <Image src={getAvatarImage()} alt="Player Avatar" className={styles.avatar} width={32} height={32} />
          </div>
          <div className={styles.playerName}>
            {playerLoading ? "..." : playerName}
            {!playerLoading && kycVerified ? (
              <KycVerifiedBadge className={styles.kycBadge} size={14} />
            ) : null}
          </div>
        </div>

        <div className={styles.brandLogoWrap}>
          <Image
            src={getLogoImagePath(themeId, "playerHeaderLogo")}
            alt="Ding Money"
            className={styles.brandLogo}
            width={96}
            height={40}
            priority={false}
          />
        </div>
      </div>

      {/* Row 2: Balance capsules */}
      <div
        className={`${styles.row2} ${showBackButton ? "" : styles.row2NoBackButton}`}
      >
        <div
          className={styles.balanceCapsulesGroup}
          data-tour-id="game-browser-wallet"
        >
        {/* Toman Capsule */}
        <motion.div
          data-tour-id="player-balance"
          data-wallet-toman-target
          className={capsuleClass(styles.tomanBg)}
          animate={tomanCapsuleAnimate}
          transition={{ duration: 0.85, ease: "easeInOut" }}
          onClick={
            refreshDisabled ? undefined : () => void handleRefreshBalances()
          }
          role={refreshDisabled ? undefined : "button"}
          tabIndex={refreshDisabled ? undefined : 0}
          onKeyDown={refreshDisabled ? undefined : handleRefreshKeyDown}
        >
          {loading ? (
            <span className={styles.loadingText}>...</span>
          ) : (
            <>
              <motion.span
                className={styles.balanceAmount}
                animate={tomanAmountAnimate}
                transition={{ duration: 0.8, ease: "easeInOut" }}
              >
                {formatBalance(tomanBalance)}
              </motion.span>
              <Image
                src={refreshIcon}
                alt="Refresh"
                className={`${styles.refreshIcon} ${isRefreshingBalances ? styles.refreshSpinning : ""}`}
                width={32}
                height={32}
              />
            </>
          )}
        </motion.div>

        {/* Ding Capsule */}
        <motion.div
          data-tour-id="ding-balance"
          data-wallet-ding-target
          className={capsuleClass(styles.dingBg)}
          animate={dingCapsuleAnimate}
          transition={{ duration: 0.8, ease: "easeInOut" }}
          onClick={
            refreshDisabled ? undefined : () => void handleRefreshBalances()
          }
          role={refreshDisabled ? undefined : "button"}
          tabIndex={refreshDisabled ? undefined : 0}
          onKeyDown={refreshDisabled ? undefined : handleRefreshKeyDown}
        >
          {loading ? (
            <span className={styles.loadingText}>...</span>
          ) : (
            <>
              <motion.span
                className={styles.balanceAmount}
                animate={dingAmountAnimate}
                transition={{ duration: 0.8, ease: "easeInOut" }}
              >
                {formatBalance(dingBalance)}
              </motion.span>
              <motion.div
                animate={isAnimating ? { scale: [1, 1.25, 1] } : {}}
                transition={{ duration: 0.6, ease: "easeOut" }}
              >
                <Image
                  src={dingCoinIcon}
                  alt="Ding Coin"
                  className={`${styles.coinIcon} ${isRefreshingBalances ? styles.refreshSpinning : ""}`}
                  width={30}
                  height={30}
                />
              </motion.div>
            </>
          )}
        </motion.div>
        </div>
      </div>
    </div>
  );
}


