export const WALLET_PRIZE_CELEBRATE_EVENT = "wallet-prize-celebrate";

export type WalletPrizeCelebrateDetail = {
  amount?: number;
};

export function dispatchWalletPrizeCelebrate(amount?: number) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<WalletPrizeCelebrateDetail>(WALLET_PRIZE_CELEBRATE_EVENT, {
      detail: { amount },
    })
  );
}
