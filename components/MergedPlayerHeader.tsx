"use client";

import React, { memo, useCallback } from "react";
import { motion, type TargetAndTransition } from "framer-motion";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTheme } from "@/lib/contexts/ThemeContext";
import { usePlayerProfileOptional } from "@/lib/contexts/PlayerProfileContext";
import { getLogoImagePath } from "@/lib/theme/logoImageFiles";
import KycVerifiedBadge from "@/components/KycVerifiedBadge";
import styles from "./MergedPlayerHeader.module.css";

import dingCoinIcon from "@/src/assets/icons/ding-coin.png";
import refreshIcon from "@/src/assets/icons/refresh.webp";

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

const avatarMap: Record<string, typeof avatar001> = {
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

export interface MergedPlayerHeaderProps {
  dingBalance: number;
  tomanBalance: number;
  hasHydrated?: boolean;
  isRefreshing?: boolean;
  /** @deprecated Prefer hasHydrated */
  loading?: boolean;
  isAnimating?: boolean;
  isTomanAnimating?: boolean;
  showBackButton?: boolean;
  onBackClick?: () => void;
  onRefreshBalances?: () => Promise<void> | void;
  refreshDisabled?: boolean;
  guestPresentation?: {
    playerName: string;
  };
}

function MergedPlayerHeader({
  dingBalance,
  tomanBalance,
  hasHydrated,
  isRefreshing = false,
  loading,
  isAnimating = false,
  isTomanAnimating = false,
  showBackButton = false,
  onBackClick,
  onRefreshBalances,
  refreshDisabled = false,
  guestPresentation,
}: MergedPlayerHeaderProps) {
  const isGuestPresentation = Boolean(guestPresentation);
  const router = useRouter();
  const { themeId } = useTheme();
  const profile = usePlayerProfileOptional();

  const balancesReady =
    isGuestPresentation || (hasHydrated ?? loading === false);

  const displayPlayerName = guestPresentation
    ? guestPresentation.playerName
    : profile?.hasHydrated
      ? profile.playerName
      : profile?.playerName ?? "اسم بازیکن";

  const avatarId = isGuestPresentation ? "001" : profile?.avatarId ?? "001";
  const kycVerified = isGuestPresentation ? false : profile?.kycVerified ?? false;

  const refreshLocked = refreshDisabled || isGuestPresentation;

  const formatBalance = (amount: number) => amount.toLocaleString("en-US");

  const getAvatarImage = () => avatarMap[avatarId] || avatar001;

  const handleBackClick = () => {
    if (onBackClick) onBackClick();
    else router.back();
  };

  const handleRefreshBalances = useCallback(async () => {
    if (!onRefreshBalances || refreshLocked || isRefreshing) return;
    await onRefreshBalances();
  }, [isRefreshing, onRefreshBalances, refreshLocked]);

  const handleRefreshKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (refreshLocked) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      void handleRefreshBalances();
    }
  };

  const capsuleClass = (bgClass: string) =>
    `${styles.balanceCapsule} ${bgClass}${
      refreshLocked ? "" : ` ${styles.refreshableCapsule}`
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
        filter: [
          "brightness(1)",
          "brightness(1.6)",
          "brightness(1.3)",
          "brightness(1)",
        ],
        textShadow: [
          "0 0 0px rgba(251, 191, 36, 0)",
          "0 0 15px rgba(251, 191, 36, 0.8)",
          "0 0 10px rgba(251, 191, 36, 0.5)",
          "0 0 0px rgba(251, 191, 36, 0)",
        ],
      }
    : {};

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

  const renderBalanceAmount = (
    amount: number,
    amountAnimateProps: TargetAndTransition
  ) => {
    if (!balancesReady) {
      return <span className={styles.loadingText}>...</span>;
    }
    return (
      <motion.span
        className={styles.balanceAmount}
        animate={amountAnimateProps}
        transition={{ duration: 0.8, ease: "easeInOut" }}
      >
        {formatBalance(amount)}
      </motion.span>
    );
  };

  return (
    <div className={styles.container}>
      <div className={styles.row1}>
        <div className={styles.backButtonPlaceholder}>
          {showBackButton ? (
            <button
              className={styles.backButton}
              onClick={handleBackClick}
              aria-label="بازگشت"
            >
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
            <Image
              src={getAvatarImage()}
              alt="Player Avatar"
              className={styles.avatar}
              width={32}
              height={32}
            />
          </div>
          <div className={styles.playerName}>
            {displayPlayerName}
            {!isGuestPresentation && profile?.hasHydrated && kycVerified ? (
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

      <div
        className={`${styles.row2} ${showBackButton ? "" : styles.row2NoBackButton}`}
      >
        <div
          className={styles.balanceCapsulesGroup}
          data-tour-id="game-browser-wallet"
        >
          <motion.div
            data-tour-id="player-balance"
            data-wallet-toman-target
            className={capsuleClass(styles.tomanBg)}
            animate={tomanCapsuleAnimate}
            transition={{ duration: 0.85, ease: "easeInOut" }}
            onClick={
              refreshLocked ? undefined : () => void handleRefreshBalances()
            }
            role={refreshLocked ? undefined : "button"}
            tabIndex={refreshLocked ? undefined : 0}
            onKeyDown={refreshLocked ? undefined : handleRefreshKeyDown}
          >
            {isGuestPresentation
              ? null
              : renderBalanceAmount(tomanBalance, tomanAmountAnimate)}
            {!isGuestPresentation && balancesReady ? (
              <Image
                src={refreshIcon}
                alt="Refresh"
                className={`${styles.refreshIcon} ${isRefreshing ? styles.refreshSpinning : ""}`}
                width={32}
                height={32}
              />
            ) : null}
          </motion.div>

          <motion.div
            data-tour-id="ding-balance"
            data-wallet-ding-target
            className={capsuleClass(styles.dingBg)}
            animate={dingCapsuleAnimate}
            transition={{ duration: 0.8, ease: "easeInOut" }}
            onClick={
              refreshLocked ? undefined : () => void handleRefreshBalances()
            }
            role={refreshLocked ? undefined : "button"}
            tabIndex={refreshLocked ? undefined : 0}
            onKeyDown={refreshLocked ? undefined : handleRefreshKeyDown}
          >
            {isGuestPresentation ? (
              <Image
                src={dingCoinIcon}
                alt="Ding Coin"
                className={styles.coinIcon}
                width={30}
                height={30}
              />
            ) : (
              <>
                {renderBalanceAmount(dingBalance, dingAmountAnimate)}
                {balancesReady ? (
                  <motion.div
                    animate={isAnimating ? { scale: [1, 1.25, 1] } : {}}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                  >
                    <Image
                      src={dingCoinIcon}
                      alt="Ding Coin"
                      className={`${styles.coinIcon} ${isRefreshing ? styles.refreshSpinning : ""}`}
                      width={30}
                      height={30}
                    />
                  </motion.div>
                ) : null}
              </>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}

export default memo(MergedPlayerHeader);
