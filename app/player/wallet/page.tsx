"use client";

import React, { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { usePaymentMenus } from "@/lib/deposit/usePaymentMenus";
import styles from "./WalletPage.module.css";

function WalletPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const action = searchParams.get("action");
  const { setShowBackButton, setOnBackClick } = useHeaderVisibility();
  const { menus: paymentMenus, loading: paymentMenusLoading } =
    usePaymentMenus();

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

  if (action === "buy") {
    const showWalletBuy = !paymentMenusLoading && paymentMenus.walletBuy;
    const showBuyRial = showWalletBuy && paymentMenus.buyRial;
    const showBuyCrypto = showWalletBuy;

    return (
      <div className="h-full overflow-y-auto p-4">
        <div className="mx-auto max-w-[600px]">
          {paymentMenusLoading ? (
            <p className="mt-[30px] text-center text-sm text-[var(--player-text-muted,#9ca3af)]">
              در حال بارگذاری…
            </p>
          ) : !showWalletBuy ? (
            <p className="mt-[30px] text-center text-sm leading-7 text-[var(--player-text-muted,#9ca3af)]">
              خرید برای حساب شما فعال نیست.
            </p>
          ) : (
            <div className="mt-[30px] flex flex-col gap-3">
              {showBuyRial ? (
                <button
                  type="button"
                  className={styles.buyOptionButton}
                  onClick={() => router.push("/player/wallet/buy-rial")}
                >
                  خرید ریالی
                </button>
              ) : null}
              {showBuyCrypto ? (
                <button
                  type="button"
                  className={styles.buyOptionButton}
                  onClick={() => router.push("/player/wallet/buy-dollar")}
                >
                  خرید رمز ارزی
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (action === "withdraw") {
    return (
      <div className="h-full overflow-y-auto p-4">
        <div className="mx-auto max-w-[600px]">
          <div className="mt-[30px] flex flex-col gap-3">
            <button
              type="button"
              className={styles.buyOptionButton}
              onClick={() => router.push("/player/wallet/withdraw-rial")}
            >
              برداشت ریالی
            </button>
            <button
              type="button"
              className={styles.buyOptionButton}
              onClick={() => router.push("/player/wallet/withdraw-crypto")}
            >
              برداشت رمز ارزی
            </button>
          </div>
        </div>
      </div>
    );
  }

  const title = "کیف پول";
  const message = "این بخش به‌زودی فعال می‌شود.";

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto max-w-[600px] text-center">
        <h1 className="mb-3 text-2xl font-bold text-[var(--player-text-primary,#fff)]">
          {title}
        </h1>
        <p className="text-sm leading-7 text-[var(--player-text-muted,#9ca3af)]">
          {message}
        </p>
      </div>
    </div>
  );
}

export default function WalletPage() {
  return (
    <Suspense
      fallback={
        <div className="p-4 text-center text-[var(--player-text-muted,#9ca3af)]">
          در حال بارگذاری…
        </div>
      }
    >
      <WalletPageContent />
    </Suspense>
  );
}
