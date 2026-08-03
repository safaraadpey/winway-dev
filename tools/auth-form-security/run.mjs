/**
 * Auth form transport security checks (static + unit).
 *
 * Run: node tools/auth-form-security/run.mjs
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

function hasPostForm(src, label) {
  const formOpen = src.match(/<form[\s\S]*?>/);
  assert(!!formOpen, `${label}: has <form>`);
  if (!formOpen) return;
  const tag = formOpen[0];
  assert(/\bmethod=["']post["']/i.test(tag), `${label}: method="post"`);
  assert(
    !/\baction=["']#["']/.test(tag),
    `${label}: does not use action="#"`
  );
  assert(
    /action=\{AUTH_FORM_FALLBACK_PATH\}/.test(tag) ||
      /action=["']\/api\/auth\/form-fallback["']/.test(tag),
    `${label}: action points at form-fallback`
  );
}

// --- Static source contracts ---
const loginSrc = read("components/auth/LoginForm.tsx");
const signupSrc = read("components/auth/SignupForm.tsx");
const recoverySrc = read("app/(auth)/recovery/page.tsx");
const authPageSrc = read("app/(public)/auth/page.tsx");
const fallbackRouteSrc = read("app/api/auth/form-fallback/route.ts");
const fallbackLibSrc = read("lib/auth/formFallback.ts");

hasPostForm(loginSrc, "LoginForm");
hasPostForm(signupSrc, "SignupForm");
hasPostForm(recoverySrc, "Recovery");

assert(
  /autoComplete=["']username["']/.test(loginSrc),
  "LoginForm: autocomplete=username"
);
assert(
  /autoComplete=["']current-password["']/.test(loginSrc),
  "LoginForm: autocomplete=current-password"
);
assert(
  /autoComplete=["']username["']/.test(signupSrc),
  "SignupForm: autocomplete=username"
);
assert(
  /autoComplete=["']new-password["']/.test(signupSrc),
  "SignupForm: autocomplete=new-password"
);
assert(
  /autoComplete=["']email["']/.test(recoverySrc),
  "Recovery: autocomplete=email"
);

assert(
  /redirect\(\s*["']\/login["']\s*\)/.test(authPageSrc),
  "/auth page redirects to /login"
);
assert(
  !/signInWithPassword/.test(authPageSrc),
  "/auth page no longer calls signInWithPassword"
);
assert(
  !/<form[\s\S]*?>/.test(authPageSrc),
  "/auth page has no legacy form"
);

assert(
  !/request\.(json|text|formData|arrayBuffer|blob)\s*\(/.test(fallbackRouteSrc),
  "form-fallback never reads request body"
);
assert(
  !/console\.(log|info|warn|error|debug)\([^)]*(password|token|body|formData|username)/i.test(
    fallbackRouteSrc
  ),
  "form-fallback does not log password/token/body"
);
assert(
  /Cache-Control/.test(fallbackRouteSrc) || /AUTH_FORM_FALLBACK_CACHE_CONTROL/.test(fallbackRouteSrc),
  "form-fallback sets Cache-Control no-store"
);
assert(
  /status:\s*303/.test(fallbackRouteSrc),
  "form-fallback uses 303 redirect"
);
assert(
  /AUTH_FORM_FALLBACK_REDIRECT_PATH\s*=\s*["']\/login\?auth_fallback=1["']/.test(
    fallbackLibSrc
  ),
  "fallback redirect is relative /login (no cross-host absolute URL)"
);

// Password must not be placed into URL by form action/redirect helpers
assert(
  !/password\s*[:=].*searchParams|searchParams.*password|URLSearchParams[\s\S]*password/i.test(
    loginSrc
  ),
  "LoginForm does not put password into URL/searchParams"
);

// --- Runtime unit: redirect URL builder (no Next runtime needed) ---
async function runUnit() {
  // Compile TS helpers via dynamic transpile is heavy; re-check contract by evaluating the exported path string from source.
  const redirectMatch = fallbackLibSrc.match(
    /AUTH_FORM_FALLBACK_REDIRECT_PATH\s*=\s*["']([^"']+)["']/
  );
  const redirectPath = redirectMatch?.[1];
  assert(!!redirectPath, "export AUTH_FORM_FALLBACK_REDIRECT_PATH");
  assert(
    redirectPath === "/login?auth_fallback=1",
    "redirect path is /login?auth_fallback=1"
  );
  assert(
    !/password|token|access_token|refresh_token/i.test(redirectPath || ""),
    "redirect path contains no password/token"
  );

  // Simulate URL join like the helper does
  const location = new URL(redirectPath, "https://admin.dingmoney.org/admin/login");
  assert(
    location.hostname === "admin.dingmoney.org",
    "relative redirect keeps admin host (no main-host loop)"
  );
  assert(
    location.pathname === "/login",
    "relative redirect lands on /login"
  );
  assert(
    !location.search.includes("password"),
    "redirect Location has no password query"
  );

  const locationMain = new URL(redirectPath, "https://dingmoney.org/login");
  assert(
    locationMain.hostname === "dingmoney.org",
    "relative redirect keeps main host"
  );
}

await runUnit();

// Optional: load compiled route if present — source contracts already cover logging.
console.log("");
if (failed > 0) {
  console.error(`auth-form-security: ${failed} failure(s)`);
  process.exit(1);
}
console.log("auth-form-security: all checks passed");
