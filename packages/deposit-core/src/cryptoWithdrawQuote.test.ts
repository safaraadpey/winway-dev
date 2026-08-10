/**
 * Crypto withdrawal quote — toman exact, crypto truncated to 2 decimals.
 * Run: npm run test -w @dingmoney/deposit-core
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateCryptoWithdrawQuote,
  isCryptoWithdrawQuoteFresh,
  truncateCryptoAmount,
  validateCryptoWalletAddress,
} from "./cryptoWithdrawQuote";
import type { CryptoReferencePrices } from "./cryptoPrices";

const RATES: CryptoReferencePrices = {
  usdtTomanPrice: 549_388,
  trxUsdPrice: 0.329242,
  fetchedAt: new Date().toISOString(),
  sources: {
    usdtToman: "tetherland",
    trxUsd: "coingecko",
  },
};

describe("truncateCryptoAmount", () => {
  it("floors to 2 decimal places without rounding up", () => {
    assert.equal(truncateCryptoAmount(5.049), 5.04);
    assert.equal(truncateCryptoAmount(1.8299), 1.82);
  });
});

describe("calculateCryptoWithdrawQuote", () => {
  it("keeps requested toman and truncates USDT to 2 decimals for TRC20", () => {
    const tomanAmount = 1_000_000;
    const quote = calculateCryptoWithdrawQuote({
      tomanAmount,
      network: "TRC20",
      rates: RATES,
    });

    const expectedUsdt = truncateCryptoAmount(tomanAmount / RATES.usdtTomanPrice, 2);

    assert.equal(quote.cryptoSymbol, "USDT");
    assert.equal(quote.cryptoAmount, expectedUsdt);
    assert.equal(quote.lockedToman, tomanAmount);
    assert.equal(quote.requestedToman, tomanAmount);
  });

  it("uses same USDT truncation for BEP20", () => {
    const tomanAmount = 11_000_000;
    const quote = calculateCryptoWithdrawQuote({
      tomanAmount,
      network: "BEP20",
      rates: RATES,
    });

    assert.equal(
      quote.cryptoAmount,
      truncateCryptoAmount(tomanAmount / RATES.usdtTomanPrice, 2)
    );
    assert.equal(quote.lockedToman, tomanAmount);
  });

  it("truncates TRX to 2 decimal places and locks full toman", () => {
    const tomanAmount = 5_000_000;
    const quote = calculateCryptoWithdrawQuote({
      tomanAmount,
      network: "TRX",
      rates: RATES,
    });

    const expectedTrx = truncateCryptoAmount(
      tomanAmount / (RATES.usdtTomanPrice * RATES.trxUsdPrice),
      2
    );

    assert.equal(quote.cryptoSymbol, "TRX");
    assert.equal(quote.cryptoAmount, expectedTrx);
    assert.equal(quote.lockedToman, tomanAmount);
  });

  it("rejects invalid toman amount", () => {
    assert.throws(
      () =>
        calculateCryptoWithdrawQuote({
          tomanAmount: 0,
          network: "TRC20",
          rates: RATES,
        }),
      /invalid_toman_amount/
    );
  });
});

describe("validateCryptoWalletAddress", () => {
  it("validates BEP20 address", () => {
    assert.ok(
      validateCryptoWalletAddress(
        "BEP20",
        "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0"
      )
    );
    assert.ok(!validateCryptoWalletAddress("BEP20", "TInvalid"));
  });

  it("validates TRC20/TRX address", () => {
    assert.ok(
      validateCryptoWalletAddress(
        "TRC20",
        "TXYZopYRdj2D9XRtbG411XZZ3kM5oNm3im"
      )
    );
    assert.ok(!validateCryptoWalletAddress("TRC20", "0xabc"));
  });
});

describe("isCryptoWithdrawQuoteFresh", () => {
  it("accepts recent quotes", () => {
    assert.ok(isCryptoWithdrawQuoteFresh(new Date().toISOString()));
  });

  it("rejects stale quotes", () => {
    const old = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    assert.ok(!isCryptoWithdrawQuoteFresh(old));
  });
});
