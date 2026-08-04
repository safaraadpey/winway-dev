/**
 * Regression: no_tier_for_TRX was caused by TRC-10 TransferAssetContract
 * raw units being priced as native TRX (USD ≫ tier max).
 *
 * Run: npm run test -w @dingmoney/deposit-core
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cryptoAmountToUsd,
  getTierMultiplier,
  isSupportedDepositCurrency,
  observeTronNativeTransfer,
  sunToTrx,
  tierNetworkForDeposit,
  type CryptoRateTier,
  type LockedRates,
} from "./index";

const RATES: LockedRates = {
  usdtTomanPrice: 189_600,
  trxUsdPrice: 0.329242,
  fetchedAt: new Date().toISOString(),
  sources: {
    usdtToman: "tetherland",
    trxUsd: "coingecko",
  },
  bnbUsdPrice: 600,
};

/** Mirrors prod admin tier that should match normal native TRX deposits. */
const TRX_TIER_0_1000: CryptoRateTier = {
  id: "trx-0-1000",
  network: "TRX",
  minUsd: 0,
  maxUsd: 1000,
  multiplier: 1.12,
  bonusPercent: 0,
  sortOrder: 60,
  isActive: true,
};

const TIERS: CryptoRateTier[] = [
  {
    id: "trc20-0-20",
    network: "TRC20",
    minUsd: 0,
    maxUsd: 20,
    multiplier: 1,
    bonusPercent: 0,
    sortOrder: 10,
    isActive: true,
  },
  TRX_TIER_0_1000,
];

/** Failing Railway hashes — all TransferAssetContract (TRC-10), not native TRX. */
const FAILING_TRC10_CASES = [
  {
    txHash: "1682b3cf931af400c4d3230fe100cc9e81370a8c7fe70deeb439b8da34094e7c",
    rawAmount: 8888,
  },
  {
    txHash: "19b777135ae6b09f3b2263baf14a0a7027fea6ea9c34e954dcc70c9b0ce2a72d",
    rawAmount: 8888,
  },
  {
    txHash: "28ddcd9947e44d8b535ff8fbd0ad14a6e5368687a538463fefd72a4b600da006",
    rawAmount: 8_888_888,
  },
] as const;

function fakeAssetTx(txHash: string, amount: number) {
  return {
    txID: txHash,
    confirmed: true,
    ret: [{ contractRet: "SUCCESS" }],
    block_timestamp: Date.now(),
    raw_data: {
      contract: [
        {
          type: "TransferAssetContract",
          parameter: {
            value: {
              amount,
              asset_name: "1005119",
              owner_address: "TFrom",
              to_address: "TTo",
            },
          },
        },
      ],
    },
  };
}

function fakeNativeTx(txHash: string, amountSun: number) {
  return {
    txID: txHash,
    confirmed: true,
    ret: [{ contractRet: "SUCCESS" }],
    block_timestamp: Date.now(),
    raw_data: {
      contract: [
        {
          type: "TransferContract",
          parameter: {
            value: {
              amount: amountSun,
              owner_address: "TFrom",
              to_address: "TTo",
            },
          },
        },
      ],
    },
  };
}

describe("TRX amount normalization (sun → TRX)", () => {
  it("converts sun to TRX", () => {
    assert.equal(sunToTrx(31_000_000), 31);
    assert.equal(sunToTrx(8), 0.000008);
    assert.equal(sunToTrx(1), 0.000001);
    assert.equal(sunToTrx(0), 0);
    assert.equal(sunToTrx(-1), 0);
  });
});

describe("native TRX vs TRC10 mapping", () => {
  it("maps native TRX on TRC20 rail to TRX pricing tier", () => {
    assert.equal(tierNetworkForDeposit("TRC20", "TRX"), "TRX");
  });

  it("maps TRC20 USDT to TRC20 tier", () => {
    assert.equal(tierNetworkForDeposit("TRC20", "USDT"), "TRC20");
  });

  it("rejects TRC10 for tier network resolution", () => {
    assert.throws(
      () => tierNetworkForDeposit("TRC20", "TRC10"),
      /unsupported_currency:TRC10/
    );
  });

  it("marks TRC10 unsupported for deposit credit", () => {
    assert.equal(isSupportedDepositCurrency("TRX"), true);
    assert.equal(isSupportedDepositCurrency("USDT"), true);
    assert.equal(isSupportedDepositCurrency("TRC10"), false);
  });
});

describe("TRX tier 0–1000 USD matching", () => {
  it("matches small and normal native TRX deposits", () => {
    const dustUsd = cryptoAmountToUsd("TRX", 0.000001, RATES);
    const normalUsd = cryptoAmountToUsd("TRX", 31, RATES);
    assert.ok(dustUsd > 0 && dustUsd < 1);
    assert.ok(normalUsd > 0 && normalUsd < 1000);
    assert.equal(
      getTierMultiplier(TIERS, "TRX", dustUsd).id,
      "trx-0-1000"
    );
    assert.equal(
      getTierMultiplier(TIERS, "TRX", normalUsd).id,
      "trx-0-1000"
    );
  });

  it("matches inclusive boundaries 0 and 1000", () => {
    assert.equal(getTierMultiplier(TIERS, "TRX", 0).id, "trx-0-1000");
    assert.equal(getTierMultiplier(TIERS, "TRX", 1000).id, "trx-0-1000");
  });

  it("reports usd_out_of_range when above max (not a missing network tier)", () => {
    assert.throws(
      () => getTierMultiplier(TIERS, "TRX", 1000.01),
      /no_tier_for_TRX:usd_out_of_range/
    );
  });
});

describe("failing Railway TRC-10 cases (regression)", () => {
  it("does not observe TransferAssetContract as deposits", () => {
    for (const c of FAILING_TRC10_CASES) {
      const obs = observeTronNativeTransfer(
        fakeAssetTx(c.txHash, c.rawAmount),
        "TPJuZNopGonqQQjTSUgmrnq7qLymSduFki"
      );
      assert.equal(obs, null, `expected skip for ${c.txHash}`);
    }
  });

  it("never prices TRC10 raw units as TRX (old bug path)", () => {
    for (const c of FAILING_TRC10_CASES) {
      // Old bug: amount * trxUsdPrice → millions USD → no_tier_for_TRX
      const bogusUsd = c.rawAmount * RATES.trxUsdPrice;
      assert.ok(
        bogusUsd > 1000,
        `raw ${c.rawAmount} would exceed $1000 tier if mispriced`
      );
      assert.throws(
        () => cryptoAmountToUsd("TRC10", c.rawAmount, RATES),
        /unsupported_currency:TRC10/
      );
    }
  });

  it("still observes native TransferContract TRX with sun normalization", () => {
    const obs = observeTronNativeTransfer(
      fakeNativeTx(
        "5a255ea4bd32ace9ac25294eac43f9be79856b29bc19a23a7ba8b8725d381f33",
        31_000_000
      ),
      "TPJuZNopGonqQQjTSUgmrnq7qLymSduFki"
    );
    assert.ok(obs);
    assert.equal(obs!.currency, "TRX");
    assert.equal(obs!.eventIndex, 0);
    assert.equal(obs!.cryptoAmount, 31);
    const usd = cryptoAmountToUsd("TRX", obs!.cryptoAmount, RATES);
    assert.equal(getTierMultiplier(TIERS, "TRX", usd).id, "trx-0-1000");
  });
});
