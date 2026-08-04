/**
 * @dingmoney/deposit-core
 *
 * Server-only crypto deposit runtime (scan / credit / notify / redis / invoice helpers).
 * Do not import from client/browser bundles.
 */

export {
  scanUserAddresses,
  runActiveCryptoScan,
  runFullOfflineCryptoScan,
  type ScanUserResult,
} from "./cryptoMonitor";

export {
  processObservedDeposit,
  recheckPendingConfirmations,
  type ProcessResult,
} from "./cryptoDepositProcessor";

export { creditCryptoDepositWallet } from "./cryptoCredit";

export { notifyCryptoDepositConfirmed } from "./cryptoNotify";

export {
  registerActiveCryptoAddresses,
  listActiveCryptoTargets,
  tryAcquireCheckCooldown,
  type ActiveCryptoTarget,
} from "./cryptoActiveScan";

export {
  getCryptoRedis,
  CRYPTO_REDIS_KEYS,
  CRYPTO_TTL,
  type CryptoRedis,
} from "./cryptoRedis";

export {
  createAndStorePriceLock,
  getPriceLock,
  getLockedRates,
  quoteDepositToman,
  cryptoAmountToUsd,
  type CryptoCurrency,
  type LockedRates,
  type PriceLockPayload,
  type TomanQuoteResult,
} from "./cryptoPriceLock";

export {
  getCryptoReferencePrices,
  fetchUsdtTomanPrice,
  fetchTrxUsdPrice,
  type CryptoReferencePrices,
} from "./cryptoPrices";

export {
  calculateCryptoInvoice,
  listCryptoRateTiers,
  replaceCryptoRateTiers,
  getTierMultiplier,
  type CryptoNetwork,
  type CryptoRateTier,
  type UpsertTierInput,
  type InvoiceNetworkOption,
  type InvoiceBadge,
  type CryptoInvoiceQuote,
} from "./cryptoInvoice";

export {
  getCryptoXpubSettings,
  getCryptoConfirmationRules,
  saveCryptoXpubSettings,
  maskXpub,
  DEFAULT_BEP20_CONFIRMATIONS,
  DEFAULT_TRON_CONFIRMATIONS,
  type CryptoXpubSettings,
} from "./cryptoXpubSettings";

export {
  deriveUserCryptoAddresses,
  deriveBep20AddressFromXpub,
  deriveTrc20AddressFromXpub,
  assertValidXpub,
} from "./cryptoHdDerive";

export { withExponentialBackoff } from "./cryptoRetry";

export {
  scanBep20Address,
  scanBscNativeTransfers,
  scanBscTokenTransfers,
  BSC_USDT_CONTRACT,
  type ObservedChainTx,
} from "./cryptoScanners/etherscan";

export {
  scanTrc20Address,
  scanTronNativeAndTrc10,
  scanTronTrc20,
  TRON_USDT_CONTRACT,
} from "./cryptoScanners/trongrid";
