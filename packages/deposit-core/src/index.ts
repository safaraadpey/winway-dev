/**
 * @dingmoney/deposit-core
 *
 * Server-only crypto deposit runtime (scan / credit / notify / redis / invoice helpers).
 * Do not import from client/browser bundles.
 */

export {
  scanUserAddresses,
  runActiveCryptoScan,
  runHotCryptoScan,
  runWarmCryptoScan,
  runConfirmCryptoScan,
  runHotAndConfirmCryptoScan,
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
  touchHotWatch,
  listHotWatchTargets,
  type ActiveCryptoTarget,
} from "./cryptoActiveScan";

export {
  registerConfirmWatch,
  unregisterConfirmWatch,
  syncConfirmWatchFromPending,
  listConfirmWatchTargets,
  listWarmWatchTargets,
  listColdScanTargets,
  promoteUserToConfirmWatch,
  clearConfirmIfNoPending,
  type CryptoWatchTarget,
} from "./cryptoWatch";

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
  tierNetworkForDeposit,
  isSupportedDepositCurrency,
  SUPPORTED_DEPOSIT_CURRENCIES,
  type CryptoCurrency,
  type SupportedDepositCurrency,
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
  cryptoDepositIdempotencyKey,
  normalizeEventIndex,
} from "./cryptoDepositIdentity";

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
  observeTronNativeTransfer,
  sunToTrx,
  fetchTronTxEvents,
  tronBase58ToHexAddress,
  normalizeTronEventAddress,
  TRON_USDT_CONTRACT,
} from "./cryptoScanners/trongrid";
