"use client";

import loginBg from "@/src/assets/logo/login_BG.png";
import bg002 from "@/src/assets/logo/BG002.png";
import buyCardButtonBg from "@/src/assets/logo/BuyCardBotton.png";
import ingameLogo from "@/src/assets/logo/ingamelogo.png";
import Image from "next/image";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Confetti from "react-confetti";
import { motion, AnimatePresence } from "framer-motion";
import { dispatchWalletPrizeCelebrate } from "@/lib/walletPrizeCelebrate";
import type { DrawVerificationSpec } from "@/lib/provablyFairDrawSpec";

export type Winner = {
  id: string;
  avatarUrl: string;
  nickname: string;
  prizeAmount: number;
};

const COUNTUP_DELAY_MS = 500;
const COUNTUP_DURATION_MS = 1500;
const COIN_FLY_DELAY_MS = 2000;
const COIN_FLY_DURATION_MS = 650;
const CONFETTI_DURATION_MS = 3800;

function useCountUp(target: number, active: boolean, delayMs: number) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!active || target <= 0) {
      setValue(target);
      return;
    }

    setValue(0);
    let frame = 0;
    let delayTimer: ReturnType<typeof setTimeout> | null = null;
    let startTime = 0;

    const tick = (now: number) => {
      if (!startTime) startTime = now;
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / COUNTUP_DURATION_MS);
      setValue(Math.round(target * progress));
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    };

    delayTimer = setTimeout(() => {
      frame = requestAnimationFrame(tick);
    }, delayMs);

    return () => {
      if (delayTimer) clearTimeout(delayTimer);
      cancelAnimationFrame(frame);
    };
  }, [target, active, delayMs]);

  return value;
}

interface WinnerRowProps {
  winner: Winner;
  showPrize: boolean;
  isCurrentUser: boolean;
  celebrate: boolean;
  displayPrize?: number;
  prizeRef?: React.Ref<HTMLDivElement>;
}

function WinnerRow({
  winner,
  showPrize,
  isCurrentUser,
  celebrate,
  displayPrize,
  prizeRef,
}: WinnerRowProps) {
  const amount = displayPrize ?? winner.prizeAmount;

  return (
    <motion.div
      dir="ltr"
      initial={celebrate && isCurrentUser ? { scale: 0.96, opacity: 0.85 } : false}
      animate={
        celebrate && isCurrentUser
          ? { scale: [0.96, 1.03, 1], opacity: 1 }
          : { scale: 1, opacity: 1 }
      }
      transition={{ duration: 0.55, ease: "easeOut" }}
      className={`flex items-center justify-between gap-3 rounded-2xl px-4 py-1 h-[39px] max-h-[40px] ${
        isCurrentUser && celebrate
          ? "bg-black/70 border-2 border-[#fbbf24] shadow-[0_0_14px_rgba(251,191,36,0.55)]"
          : "bg-black/60 border border-[rgba(101,79,150,1)]"
      }`}
    >
      <span className="text-base font-semibold text-white">
        {isCurrentUser && celebrate ? (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden>🏅</span>
            {winner.nickname}
          </span>
        ) : (
          winner.nickname
        )}
      </span>
      {showPrize && (
        <div ref={prizeRef} className="flex flex-col items-end">
          <div className="flex items-baseline gap-1">
            <motion.span
              className="latin-number text-lg font-extrabold text-[#fbbf24]"
              animate={
                celebrate && isCurrentUser
                  ? {
                      textShadow: [
                        "0 0 0px rgba(251, 191, 36, 0)",
                        "0 0 12px rgba(251, 191, 36, 0.9)",
                        "0 0 0px rgba(251, 191, 36, 0)",
                      ],
                    }
                  : {}
              }
              transition={{ duration: 1.2, repeat: celebrate && isCurrentUser ? 1 : 0 }}
            >
              {amount.toLocaleString("en-US")}
            </motion.span>
            <span className="text-sm font-semibold text-[#fbbf24]">تومان</span>
          </div>
        </div>
      )}
    </motion.div>
  );
}

interface WinnersSectionProps {
  kind: "line" | "full";
  winners: Winner[];
  showPrize: boolean;
  currentUserId: string | null;
  celebrate: boolean;
  countUpActive: boolean;
  flyPrizeRef?: React.Ref<HTMLDivElement>;
  flyPrizeKind?: "line" | "full" | null;
}

function WinnersSection({
  kind,
  winners,
  showPrize,
  currentUserId,
  celebrate,
  countUpActive,
  flyPrizeRef,
  flyPrizeKind,
}: WinnersSectionProps) {
  const title =
    kind === "line"
      ? winners.length === 1
        ? "برنده خطی"
        : "برندگان خطی"
      : winners.length === 1
        ? "برنده دبرنا"
        : "برندگان دبرنا";

  return (
    <div
      className="rounded-none px-4 py-4 space-y-3"
      style={{
        backgroundImage: `url(${bg002.src})`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center center",
        backgroundSize: "100% 100%",
        backgroundColor: "#1f2735",
      }}
    >
      <div className="flex items-center justify-center gap-2 text-base font-semibold">
        <span>🏆</span>
        <span
          style={{
            color: "rgba(254, 238, 180, 1)",
            textShadow: "0 1px 0 rgba(0, 0, 0, 0.6)",
          }}
        >
          {title}
        </span>
        <span>🏆</span>
      </div>
      {winners.length === 0 ? (
        <div className="rounded-2xl bg-[#242c3b] px-3 py-3 text-center text-sm text-gray-400">
          برنده‌ای ثبت نشده است
        </div>
      ) : (
        <div className="space-y-3">
          {winners.map((w, idx) => {
            const isCurrentUser = !!currentUserId && w.id === currentUserId;
            const rowCelebrate = celebrate && isCurrentUser && w.prizeAmount > 0;
            const attachFlyRef =
              rowCelebrate && flyPrizeKind === kind ? flyPrizeRef : undefined;

            return (
              <WinnerRowWithCountUp
                key={`${w.id}-${idx}`}
                winner={w}
                showPrize={showPrize}
                isCurrentUser={isCurrentUser}
                celebrate={rowCelebrate}
                countUpActive={countUpActive && rowCelebrate}
                prizeRef={attachFlyRef}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function WinnerRowWithCountUp({
  winner,
  showPrize,
  isCurrentUser,
  celebrate,
  countUpActive,
  prizeRef,
}: {
  winner: Winner;
  showPrize: boolean;
  isCurrentUser: boolean;
  celebrate: boolean;
  countUpActive: boolean;
  prizeRef?: React.Ref<HTMLDivElement>;
}) {
  const countUpValue = useCountUp(
    winner.prizeAmount,
    countUpActive,
    COUNTUP_DELAY_MS
  );
  const displayPrize =
    countUpActive && celebrate ? countUpValue : winner.prizeAmount;

  return (
    <WinnerRow
      winner={winner}
      showPrize={showPrize}
      isCurrentUser={isCurrentUser}
      celebrate={celebrate}
      displayPrize={displayPrize}
      prizeRef={prizeRef}
    />
  );
}

type FlyCoinState = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  amount: number;
};

interface GameResultsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserId: string | null;
  lineWinners: Winner[];
  fullWinners: Winner[];
  isTournament?: boolean;
  title?: React.ReactNode;
  proofSeed?: string | null;
  proofCommitHash?: string | null;
  drawVerification?: DrawVerificationSpec | null;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
}

export default function GameResultsDialog({
  isOpen,
  onClose,
  currentUserId,
  lineWinners,
  fullWinners,
  isTournament = false,
  title,
  proofSeed,
  proofCommitHash,
  drawVerification,
  primaryActionLabel,
  onPrimaryAction,
}: GameResultsDialogProps) {
  const [copyToast, setCopyToast] = useState<null | "success" | "error">(null);
  const copyToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flyPrizeRef = useRef<HTMLDivElement>(null);
  const celebrationStartedRef = useRef(false);

  const [showConfetti, setShowConfetti] = useState(false);
  const [confettiBurst, setConfettiBurst] = useState(0);
  const [countUpActive, setCountUpActive] = useState(false);
  const [flyCoin, setFlyCoin] = useState<FlyCoinState | null>(null);
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 });

  const isWinner = useMemo(
    () =>
      !!currentUserId &&
      (lineWinners.some((w) => w.id === currentUserId) ||
        fullWinners.some((w) => w.id === currentUserId)),
    [currentUserId, lineWinners, fullWinners]
  );

  const myFullWin = useMemo(
    () => fullWinners.find((w) => w.id === currentUserId) ?? null,
    [fullWinners, currentUserId]
  );
  const myLineWin = useMemo(
    () => lineWinners.find((w) => w.id === currentUserId) ?? null,
    [lineWinners, currentUserId]
  );

  const flyPrizeKind: "line" | "full" | null = myFullWin
    ? "full"
    : myLineWin
      ? "line"
      : null;

  const totalPrizeAmount = useMemo(() => {
    let sum = 0;
    if (myLineWin?.prizeAmount) sum += myLineWin.prizeAmount;
    if (myFullWin?.prizeAmount) sum += myFullWin.prizeAmount;
    return sum;
  }, [myLineWin, myFullWin]);

  const celebrate = isWinner && !isTournament && totalPrizeAmount > 0;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () =>
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      celebrationStartedRef.current = false;
      setShowConfetti(false);
      setCountUpActive(false);
      setFlyCoin(null);
      return;
    }

    if (!celebrate || celebrationStartedRef.current) return;
    celebrationStartedRef.current = true;

    setShowConfetti(true);
    setConfettiBurst((v) => v + 1);
    setCountUpActive(true);

    const burst2 = setTimeout(() => setConfettiBurst((v) => v + 1), 1500);
    const confettiOff = setTimeout(() => setShowConfetti(false), CONFETTI_DURATION_MS);

    const flyTimer = setTimeout(() => {
      const src = flyPrizeRef.current?.getBoundingClientRect();
      const tgt = document
        .querySelector("[data-wallet-toman-target]")
        ?.getBoundingClientRect();

      if (!src || !tgt) {
        dispatchWalletPrizeCelebrate(totalPrizeAmount);
        return;
      }

      setFlyCoin({
        startX: src.left + src.width / 2,
        startY: src.top + src.height / 2,
        endX: tgt.left + tgt.width / 2,
        endY: tgt.top + tgt.height / 2,
        amount: totalPrizeAmount,
      });
    }, COIN_FLY_DELAY_MS);

    return () => {
      clearTimeout(burst2);
      clearTimeout(confettiOff);
      clearTimeout(flyTimer);
    };
  }, [isOpen, celebrate, totalPrizeAmount]);

  const effectivePrimaryActionLabel =
    primaryActionLabel ??
    (isTournament ? "بازگشت به لابی تورنومنت" : "بازگشت به لیست اتاق‌ها");

  const seedRaw = proofSeed ? String(proofSeed) : null;
  const seedHex = seedRaw
    ? seedRaw.startsWith("\\x")
      ? seedRaw.slice(2)
      : seedRaw
    : null;

  const commitRaw = proofCommitHash ? String(proofCommitHash) : null;

  const proofFull =
    seedHex && commitRaw
      ? `${seedHex}|${commitRaw}`
      : commitRaw
        ? commitRaw
        : null;

  const proofDisplay =
    seedHex && commitRaw
      ? `${seedHex.slice(0, 6)}...${seedHex.slice(-6)}|${commitRaw.slice(0, 4)}...${commitRaw.slice(-4)}`
      : commitRaw
        ? `${commitRaw.slice(0, 6)}...${commitRaw.slice(-6)}`
        : null;

  const verificationJson = drawVerification
    ? JSON.stringify(drawVerification, null, 2)
    : null;

  const copyText = async (text: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        return true;
      } catch {
        return false;
      }
    }
  };

  const showCopyToast = (copied: boolean) => {
    setCopyToast(copied ? "success" : "error");
    if (copyToastTimerRef.current) {
      clearTimeout(copyToastTimerRef.current);
      copyToastTimerRef.current = null;
    }
    copyToastTimerRef.current = setTimeout(() => {
      setCopyToast(null);
      copyToastTimerRef.current = null;
    }, 2000);
  };

  const copyProof = async () => {
    const payload = verificationJson ?? proofFull;
    if (!payload) return;
    showCopyToast(await copyText(payload));
  };

  useEffect(() => {
    return () => {
      if (copyToastTimerRef.current) {
        clearTimeout(copyToastTimerRef.current);
        copyToastTimerRef.current = null;
      }
    };
  }, []);

  if (!isOpen) return null;

  return (
    <>
      {showConfetti && windowSize.width > 0 && (
        <Confetti
          key={confettiBurst}
          width={windowSize.width}
          height={windowSize.height}
          recycle={false}
          numberOfPieces={celebrate ? 320 : 0}
          gravity={0.28}
          initialVelocityY={18}
          colors={["#fbbf24", "#fde047", "#f59e0b", "#ffffff", "#a78bfa"]}
          style={{ position: "fixed", inset: 0, zIndex: 1001, pointerEvents: "none" }}
        />
      )}

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {flyCoin && (
              <motion.div
                key="prize-fly-coin"
                className="pointer-events-none fixed z-[1002] flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#fde047] bg-gradient-to-br from-[#fbbf24] to-[#f59e0b] text-lg shadow-[0_0_18px_rgba(251,191,36,0.85)]"
                style={{ left: flyCoin.startX, top: flyCoin.startY, x: "-50%", y: "-50%" }}
                initial={{ scale: 1, opacity: 1 }}
                animate={{
                  left: flyCoin.endX,
                  top: flyCoin.endY,
                  scale: [1, 1.15, 0.55],
                  opacity: [1, 1, 0.9],
                }}
                transition={{
                  duration: COIN_FLY_DURATION_MS / 1000,
                  ease: [0.22, 0.61, 0.36, 1],
                }}
                onAnimationComplete={() => {
                  setFlyCoin(null);
                  dispatchWalletPrizeCelebrate(flyCoin.amount);
                }}
              >
                <span aria-hidden>💰</span>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}

      <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 px-4">
        <motion.div
          initial={celebrate ? { scale: 0.92, opacity: 0 } : false}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className={`w-full max-w-md rounded-3xl p-5 shadow-2xl text-white space-y-4 ${
            celebrate
              ? "border-2 border-[#fbbf24]/80 shadow-[0_0_28px_rgba(251,191,36,0.35)]"
              : "border border-[#1f2837]"
          }`}
          style={{
            backgroundImage: `url(${loginBg.src})`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: "center center",
            backgroundSize: "100% 100%",
            backgroundColor: "#0f1720",
          }}
        >
          <div className="flex flex-col items-center text-center space-y-2">
            <Image
              src={ingameLogo}
              alt="ingame logo"
              width={220}
              height={100}
              style={{ height: 100, width: "auto" }}
              priority={false}
            />
            <div
              className="text-[14px] font-extrabold max-w-full truncate"
              style={{
                unicodeBidi: "plaintext",
                color: "rgba(254, 238, 180, 1)",
                textShadow: "0 1px 0 rgba(0, 0, 0, 0.6)",
              }}
            >
              {celebrate ? "🎉 تبریک! شما برنده شدید" : (title ?? "بازی تمام شد!")}
            </div>

            {(proofDisplay || verificationJson) && (
              <div className="relative w-full space-y-2 text-[12px]">
                {copyToast && (
                  <span
                    role="status"
                    aria-live="polite"
                    className={`pointer-events-none absolute -top-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border px-2 py-1 text-[12px] shadow-lg ${
                      copyToast === "success"
                        ? "border-emerald-300 bg-emerald-600 text-white"
                        : "border-red-300 bg-red-600 text-white"
                    }`}
                  >
                    {copyToast === "success" ? "کپی شد" : "خطا در کپی"}
                  </span>
                )}
                {(proofDisplay || verificationJson) && (
                  <div className="flex items-center justify-center gap-2">
                    {proofDisplay && (
                      <>
                        <span className="text-white/70">seed|commit</span>
                        <span dir="ltr" className="latin-number text-white/90">
                          {proofDisplay}
                        </span>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={copyProof}
                      className="rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-white/90 active:opacity-80"
                    >
                      کپی هش
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-4">
            {!isTournament && (
              <WinnersSection
                kind="line"
                winners={lineWinners}
                showPrize
                currentUserId={currentUserId}
                celebrate={celebrate}
                countUpActive={countUpActive}
                flyPrizeRef={flyPrizeKind === "line" ? flyPrizeRef : undefined}
                flyPrizeKind={flyPrizeKind}
              />
            )}
            <WinnersSection
              kind="full"
              winners={fullWinners}
              showPrize={!isTournament}
              currentUserId={currentUserId}
              celebrate={celebrate}
              countUpActive={countUpActive}
              flyPrizeRef={flyPrizeKind === "full" ? flyPrizeRef : undefined}
              flyPrizeKind={flyPrizeKind}
            />
          </div>

          <button
            type="button"
            onClick={onPrimaryAction ?? onClose}
            className="mt-2 w-full rounded-2xl py-3 text-center text-white font-bold shadow-lg active:opacity-90 transition"
            style={{
              backgroundImage: `url(${buyCardButtonBg.src})`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "center center",
              backgroundSize: "100% 100%",
            }}
          >
            {effectivePrimaryActionLabel}
          </button>
        </motion.div>
      </div>
    </>
  );
}
