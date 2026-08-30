/**
 * Referral path-based link checks (static + unit mirrors).
 *
 * Run: node tools/referral-links/run.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error(`FAIL: ${msg}`);
  } else {
    console.log(`PASS: ${msg}`);
  }
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function normalizeReferralCodeSegment(raw) {
  try {
    return decodeURIComponent(raw).trim().toUpperCase();
  } catch {
    return raw.trim().toUpperCase();
  }
}

function buildRegistrationLinkPath(referralCode) {
  const code = normalizeReferralCodeSegment(referralCode);
  return `/register/${encodeURIComponent(code)}`;
}

function buildRegistrationLink(referralCode) {
  return `https://www.dingmoney.org${buildRegistrationLinkPath(referralCode)}`;
}

function resolveRegisterPageUrl(options = {}) {
  const siteOrigin = "https://www.dingmoney.org";
  const fromPath = options.referralCode
    ? normalizeReferralCodeSegment(options.referralCode)
    : "";
  const raw = Array.isArray(options.legacyQueryRef)
    ? options.legacyQueryRef[0]
    : options.legacyQueryRef;
  const fromQuery = raw?.trim()
    ? normalizeReferralCodeSegment(raw)
    : "";
  const normalizedRef = fromPath || fromQuery;

  if (!normalizedRef) {
    return `${siteOrigin}/register`;
  }
  if (options.legacySignupPath && fromQuery && !fromPath) {
    return `${siteOrigin}/signup?ref=${encodeURIComponent(normalizedRef)}`;
  }
  return `${siteOrigin}/register/${encodeURIComponent(normalizedRef)}`;
}

// --- A. Link builder ---
assert(
  buildRegistrationLink("DING1313") ===
    "https://www.dingmoney.org/register/DING1313",
  "buildRegistrationLink(DING1313)"
);
assert(
  buildRegistrationLink(" ding1313 ") ===
    "https://www.dingmoney.org/register/DING1313",
  "buildRegistrationLink trims and uppercases"
);

// --- B. Path normalization ---
assert(
  normalizeReferralCodeSegment("ding1313") === "DING1313",
  "normalizeReferralCodeSegment lowercase"
);
assert(
  buildRegistrationLinkPath("ding1313") === "/register/DING1313",
  "buildRegistrationLinkPath lowercase"
);

// --- C. Metadata URLs differ per referral ---
const metaA = resolveRegisterPageUrl({ referralCode: "DING1313" });
const metaB = resolveRegisterPageUrl({ referralCode: "ABC123" });
assert(
  metaA === "https://www.dingmoney.org/register/DING1313",
  "metadata URL for DING1313"
);
assert(
  metaB === "https://www.dingmoney.org/register/ABC123",
  "metadata URL for ABC123"
);
assert(metaA !== metaB, "metadata URLs are unique per referral");

// --- D. Legacy query resolves to path-based canonical URL ---
assert(
  resolveRegisterPageUrl({ legacyQueryRef: "DING1313" }) ===
    "https://www.dingmoney.org/register/DING1313",
  "legacy ?ref= maps to path metadata URL"
);

// --- E. Empty ref ---
assert(
  resolveRegisterPageUrl({}) === "https://www.dingmoney.org/register",
  "empty ref metadata is /register"
);

// --- Static source contracts ---
const buildSrc = read("lib/referral/buildRegistrationLink.ts");
const metaSrc = read("lib/referral/registerPageMetadata.ts");
const registerPageSrc = read("app/(auth)/register/page.tsx");
const registerCodePageSrc = read("app/(auth)/register/[code]/page.tsx");
const signupPageSrc = read("app/(auth)/signup/page.tsx");
const signupFormSrc = read("components/auth/SignupForm.tsx");
const referralUiSrc = read("components/admin/ReferralRegistrationLink.tsx");
const portalHostsSrc = read("lib/auth/portalHosts.ts");

assert(
  buildSrc.includes("getMainPublicOrigin"),
  "buildRegistrationLink uses getMainPublicOrigin"
);
assert(
  buildSrc.includes("/register/${encodeURIComponent(code)}"),
  "buildRegistrationLink path-based"
);
assert(
  !buildSrc.includes("?ref="),
  "buildRegistrationLink no longer emits ?ref="
);
assert(
  portalHostsSrc.includes("getMainPublicOrigin"),
  "portalHosts defines getMainPublicOrigin"
);
assert(
  registerPageSrc.includes('redirect(`/register/${encodeURIComponent(code)}`)'),
  "/register?ref= redirects to path route"
);
assert(
  registerCodePageSrc.includes("initialReferralCode={normalizedCode}"),
  "/register/[code] passes initialReferralCode to SignupForm"
);
assert(
  signupPageSrc.includes('redirect(`/register/${encodeURIComponent(code)}`)'),
  "/signup?ref= redirects to path route"
);
assert(
  signupFormSrc.includes("initialReferralCode"),
  "SignupForm accepts initialReferralCode prop"
);
assert(
  signupFormSrc.includes("refFromProp || refFromUrl"),
  "SignupForm prop takes priority over query ref"
);
assert(
  !referralUiSrc.includes('"/register/"'),
  "ReferralRegistrationLink shows referral code only in the box"
);
assert(
  referralUiSrc.includes("navigator.share"),
  "ReferralRegistrationLink supports native share"
);
assert(
  referralUiSrc.includes("ارسال لینک"),
  "ReferralRegistrationLink shows send button"
);
assert(
  !metaSrc.includes("ADMIN26"),
  "metadata helper has no ADMIN26 special-case"
);

console.log(failed === 0 ? "\nAll referral link checks passed." : `\n${failed} check(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
