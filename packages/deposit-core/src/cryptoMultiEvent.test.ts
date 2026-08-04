/**
 * Multi-event deposit identity + concurrent credit safety tests.
 *
 * Run: npm run test -w @dingmoney/deposit-core
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cryptoDepositIdempotencyKey,
  normalizeEventIndex,
  observeTronNativeTransfer,
  normalizeTronEventAddress,
} from "./index";

type DepositKey = string;
type CreditKey = string;

function depositKey(network: string, txHash: string, eventIndex: number): DepositKey {
  return `${network}|${txHash}|${eventIndex}`;
}

/**
 * In-memory stand-in for:
 * - UNIQUE(network, tx_hash, event_index) on deposit.crypto_transactions
 * - UNIQUE(idempotency_key) + advisory lock semantics on fn_wallet_apply_delta
 */
function createMultiEventSafeStore() {
  const deposits = new Map<
    DepositKey,
    { status: "PENDING" | "CONFIRMED"; amount: number; creditKey: CreditKey }
  >();
  const credits = new Map<CreditKey, { amount: number }>();
  let creditCount = 0;
  const locks = new Map<string, Promise<void>>();

  async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    while (locks.has(key)) {
      await locks.get(key);
    }
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    locks.set(key, gate);
    try {
      return await fn();
    } finally {
      locks.delete(key);
      release();
    }
  }

  async function processEvent(opts: {
    network: string;
    txHash: string;
    eventIndex: number;
    amount: number;
    crashAfterInsert?: boolean;
  }): Promise<"inserted" | "confirmed" | "duplicate" | "recovered"> {
    const dKey = depositKey(opts.network, opts.txHash, opts.eventIndex);
    const cKey = cryptoDepositIdempotencyKey(opts);

    // Serialize per deposit event (UNIQUE + FOR UPDATE stand-in)
    return withLock(`dep:${dKey}`, async () => {
      const existing = deposits.get(dKey);
      if (existing?.status === "CONFIRMED") return "duplicate";

      if (!existing) {
        deposits.set(dKey, {
          status: "PENDING",
          amount: opts.amount,
          creditKey: cKey,
        });
        if (opts.crashAfterInsert) return "inserted";
      }

      return withLock(`cred:${cKey}`, async () => {
        const row = deposits.get(dKey);
        if (!row) return "duplicate";
        if (row.status === "CONFIRMED") return "duplicate";

        if (credits.has(cKey)) {
          row.status = "CONFIRMED";
          return "recovered";
        }

        credits.set(cKey, { amount: row.amount });
        creditCount += 1;
        row.status = "CONFIRMED";
        return existing ? "recovered" : "confirmed";
      });
    });
  }

  return {
    processEvent,
    get creditCount() {
      return creditCount;
    },
    get depositCount() {
      return deposits.size;
    },
    getCredits: () => [...credits.entries()],
  };
}

describe("event identity helpers", () => {
  it("normalizeEventIndex parses decimal and hex", () => {
    assert.equal(normalizeEventIndex(0), 0);
    assert.equal(normalizeEventIndex(3), 3);
    assert.equal(normalizeEventIndex("12"), 12);
    assert.equal(normalizeEventIndex("0xa"), 10);
    assert.equal(normalizeEventIndex(undefined), 0);
  });

  it("idempotency key includes network + tx + eventIndex", () => {
    assert.equal(
      cryptoDepositIdempotencyKey({
        network: "TRC20",
        txHash: "abc",
        eventIndex: 2,
      }),
      "deposit:crypto:TRC20:abc:2"
    );
    assert.notEqual(
      cryptoDepositIdempotencyKey({
        network: "TRC20",
        txHash: "abc",
        eventIndex: 0,
      }),
      cryptoDepositIdempotencyKey({
        network: "TRC20",
        txHash: "abc",
        eventIndex: 1,
      })
    );
  });

  it("native TRX observes eventIndex 0", () => {
    const obs = observeTronNativeTransfer(
      {
        txID: "native-hash",
        confirmed: true,
        ret: [{ contractRet: "SUCCESS" }],
        raw_data: {
          contract: [
            {
              type: "TransferContract",
              parameter: { value: { amount: 1_000_000, owner_address: "F" } },
            },
          ],
        },
      },
      "TTo"
    );
    assert.ok(obs);
    assert.equal(obs!.eventIndex, 0);
    assert.equal(obs!.txHash, "native-hash");
  });

  it("normalizes TronGrid padded event addresses", () => {
    assert.equal(
      normalizeTronEventAddress(
        "0x000000000000000000000000925364d76493029580f725ff4c0bd8ca427184d7"
      ),
      "0x925364d76493029580f725ff4c0bd8ca427184d7"
    );
  });
});

describe("multi-event deposit safety (simulated DB constraints)", () => {
  it("Test 1: one tx one transfer → exactly one credit", async () => {
    const store = createMultiEventSafeStore();
    const r = await store.processEvent({
      network: "TRC20",
      txHash: "tx1",
      eventIndex: 0,
      amount: 10,
    });
    assert.equal(r, "confirmed");
    assert.equal(store.creditCount, 1);
    assert.equal(store.depositCount, 1);
  });

  it("Test 2: two workers same event → one credit", async () => {
    const store = createMultiEventSafeStore();
    const results = await Promise.all([
      store.processEvent({
        network: "BEP20",
        txHash: "same",
        eventIndex: 7,
        amount: 20,
      }),
      store.processEvent({
        network: "BEP20",
        txHash: "same",
        eventIndex: 7,
        amount: 20,
      }),
    ]);
    assert.ok(results.includes("confirmed") || results.includes("recovered"));
    assert.equal(store.creditCount, 1);
    assert.equal(store.depositCount, 1);
  });

  it("Test 3: one tx two transfer events → two independent credits", async () => {
    const store = createMultiEventSafeStore();
    const a = await store.processEvent({
      network: "TRC20",
      txHash: "multi",
      eventIndex: 0,
      amount: 5,
    });
    const b = await store.processEvent({
      network: "TRC20",
      txHash: "multi",
      eventIndex: 1,
      amount: 9,
    });
    assert.equal(a, "confirmed");
    assert.equal(b, "confirmed");
    assert.equal(store.creditCount, 2);
    assert.equal(store.depositCount, 2);
    const keys = store.getCredits().map(([k]) => k).sort();
    assert.deepEqual(keys, [
      "deposit:crypto:TRC20:multi:0",
      "deposit:crypto:TRC20:multi:1",
    ]);
  });

  it("Test 4: ten workers × two events → no duplicate credits", async () => {
    const store = createMultiEventSafeStore();
    const jobs = [];
    for (let w = 0; w < 10; w++) {
      jobs.push(
        store.processEvent({
          network: "TRC20",
          txHash: "race-tx",
          eventIndex: 0,
          amount: 1,
        })
      );
      jobs.push(
        store.processEvent({
          network: "TRC20",
          txHash: "race-tx",
          eventIndex: 3,
          amount: 2,
        })
      );
    }
    await Promise.all(jobs);
    assert.equal(store.depositCount, 2);
    assert.equal(store.creditCount, 2);
  });

  it("Test 5: crash after insert → recovery credits once", async () => {
    const store = createMultiEventSafeStore();
    const first = await store.processEvent({
      network: "BEP20",
      txHash: "crash-tx",
      eventIndex: 4,
      amount: 42,
      crashAfterInsert: true,
    });
    assert.equal(first, "inserted");
    assert.equal(store.creditCount, 0);

    const recovered = await store.processEvent({
      network: "BEP20",
      txHash: "crash-tx",
      eventIndex: 4,
      amount: 42,
    });
    assert.ok(recovered === "confirmed" || recovered === "recovered");
    assert.equal(store.creditCount, 1);

    const again = await store.processEvent({
      network: "BEP20",
      txHash: "crash-tx",
      eventIndex: 4,
      amount: 42,
    });
    assert.equal(again, "duplicate");
    assert.equal(store.creditCount, 1);
  });
});
