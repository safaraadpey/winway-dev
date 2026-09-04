/**
 * Supabase Server Client
 * 
 * این کلاینت فقط برای استفاده در محیط سرور (API routes, server actions) است.
 * از SUPABASE_SERVICE_ROLE_KEY استفاده می‌کند و دسترسی کامل به دیتابیس دارد.
 * 
 * ⚠️ هشدار: هرگز این کلاینت را در فرانت‌اند (React components/pages) استفاده نکنید!
 */

import { createClient } from '@supabase/supabase-js'
import { sampledLog } from "@/lib/observability/sampledLog";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL environment variable'
  )
}

if (!supabaseServiceRoleKey) {
  throw new Error(
    'Missing SUPABASE_SERVICE_ROLE_KEY environment variable. ' +
    'This key is required for server-side operations and should never be exposed to the client.'
  )
}

/**
 * Supabase client با service role key
 *
 * این کلاینت:
 * - از RLS policies عبور می‌کند (دسترسی کامل)
 * - فقط باید در محیط سرور استفاده شود
 * - برای عملیات حساس ادمین استفاده می‌شود
 *
 * Next.js App Router caches `fetch` GETs by default. Supabase-js uses fetch,
 * so without the no-store override, snapshot APIs can keep serving a stale
 * empty result (e.g. tournament tables before room_id was linked).
 *
 * @example
 * ```typescript
 * // در API route
 * import { supabaseServer } from '@/lib/supabaseServer'
 *
 * export async function POST(request: Request) {
 *   const { data, error } = await supabaseServer
 *     .from('users')
 *     .update({ role: 'admin' })
 *     .eq('id', userId)
 * }
 * ```
 */
const noStoreFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, cache: "no-store" });

export const supabaseServer = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  global: {
    fetch: noStoreFetch,
  },
})

/**
 * Helper function برای بررسی اینکه آیا کاربر فعلی admin است
 * 
 * @param userId - شناسه کاربر (از session)
 * @returns اطلاعات کاربر شامل role و admin_sub_role
 */
export async function verifyAdminAccess(userId: string): Promise<{
  isAdmin: boolean;
  adminSubRole: string | null;
  user: any;
} | null> {
  try {
    const { data: user, error } = await supabaseServer
      .from('users')
      .select('id, role, admin_sub_role')
      .eq('id', userId)
      .single()

    if (error || !user) {
      return null
    }

    return {
      isAdmin: user.role === 'admin',
      adminSubRole: user.admin_sub_role,
      user,
    }
  } catch (err) {
    console.error('verifyAdminAccess error:', err)
    return null
  }
}

/**
 * Helper function برای بررسی اینکه آیا کاربر مدیر کل است
 * 
 * @param userId - شناسه کاربر (از session)
 * @returns true اگر کاربر مدیر کل باشد (admin با admin_sub_role = null)
 */
export async function verifyManagerAccess(userId: string): Promise<boolean> {
  const adminInfo = await verifyAdminAccess(userId)
  if (!adminInfo || !adminInfo.isAdmin) {
    return false
  }
  return adminInfo.adminSubRole === null
}

/**
 * فقط ادمین با sub_role = dev_panel
 */
export async function verifyDevPanelAccess(userId: string): Promise<boolean> {
  const adminInfo = await verifyAdminAccess(userId)
  if (!adminInfo || !adminInfo.isAdmin) {
    return false
  }
  return adminInfo.adminSubRole === 'dev_panel'
}

/**
 * Helper function برای استخراج user از request
 * از Authorization header (Bearer token) استفاده می‌کند
 * 
 * @param authHeader - مقدار Authorization header
 * @returns user object یا null
 */
type HeadersLike = { get(name: string): string | null } | null | undefined;
type RequestLike = { headers: HeadersLike } | HeadersLike | string | null | undefined;

export async function getUserFromRequest(
  reqOrHeaders: RequestLike
): Promise<{ id: string } | null> {
  // نرمال‌سازی هدرها
  const headers: HeadersLike =
    typeof reqOrHeaders === "string" || reqOrHeaders === null || reqOrHeaders === undefined
      ? null
      : "headers" in reqOrHeaders
        ? (reqOrHeaders as { headers: HeadersLike }).headers
        : (reqOrHeaders as HeadersLike);

  const rawHeader =
    typeof reqOrHeaders === "string"
      ? reqOrHeaders
      : headers?.get("authorization") ?? headers?.get("Authorization");

  // اگر هدر نبود یا نوع آن string نیست، ناشناس در نظر بگیر
  if (!rawHeader || typeof rawHeader !== "string") {
    return null;
  }

  if (!rawHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = rawHeader.replace("Bearer ", "");

  sampledLog(
    "auth:api-getUser",
    "[Auth] getUserFromRequest",
    { mode: "api" },
    100
  );

  try {
    const { createClient } = await import("@supabase/supabase-js");
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return null;
    }

    const anonClient = createClient(supabaseUrl, supabaseAnonKey);
    const {
      data: { user },
      error,
    } = await anonClient.auth.getUser(token);

    if (error || !user) {
      return null;
    }

    return user;
  } catch (err) {
    console.error("getUserFromRequest error:", err);
    return null;
  }
}

/**
 * Extracts and verifies the Bearer access token and returns the verified user + token.
 * IMPORTANT: This guarantees a single identity: the returned token is the only token we should
 * use for downstream user-scoped DB/RPC calls in that request.
 */
export async function getVerifiedUserAndTokenFromRequestOrThrow(request: Request): Promise<{
  user: { id: string };
  accessToken: string;
}> {
  const rawHeader =
    request.headers.get("authorization") ?? request.headers.get("Authorization");

  if (!rawHeader || !rawHeader.startsWith("Bearer ")) {
    throw new Error("UNAUTHORIZED");
  }

  const accessToken = rawHeader.replace("Bearer ", "");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("UNAUTHORIZED");
  }

  const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const {
    data: { user },
    error,
  } = await anonClient.auth.getUser(accessToken);

  if (error || !user) {
    throw new Error("UNAUTHORIZED");
  }

  return { user, accessToken };
}

/**
 * Creates a user-scoped server Supabase client that uses the verified Bearer token
 * as the only identity for DB operations (auth.uid() in Postgres will match).
 */
export function createUserClientFromAccessToken(accessToken: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

/**
 * Single-identity admin context:
 * - Verifies the Bearer token once
 * - Uses service_role ONLY to read role metadata (never to execute user-scoped finance RPC)
 * - Returns the verified user id, role, and the verified access token
 */
export async function getAdminJwtContextOrThrow(request: Request): Promise<{
  user: { id: string };
  adminUser: { id: string; role: string; admin_sub_role: string | null };
  role: string;
  adminSubRole: string | null;
  accessToken: string;
}> {
  const { user, accessToken } = await getVerifiedUserAndTokenFromRequestOrThrow(
    request
  );

  const adminInfo = await verifyAdminAccess(user.id);
  if (!adminInfo) {
    throw new Error("FORBIDDEN");
  }

  const allowedRoles = ["admin", "super", "agent"];
  if (!allowedRoles.includes(adminInfo.user.role)) {
    throw new Error("FORBIDDEN");
  }

  return {
    user,
    accessToken,
    adminUser: adminInfo.user,
    role: adminInfo.user.role,
    adminSubRole: adminInfo.adminSubRole,
  };
}

/**
 * Helper function برای استخراج session از request و بررسی admin بودن
 * از Authorization header (Bearer token) استفاده می‌کند
 * 
 * @param request - Next.js Request object
 * @returns اطلاعات admin شامل user, role, admin_sub_role
 * @throws Error اگر کاربر لاگین نیست یا admin نیست
 */
export async function getAdminSessionOrThrow(request: Request): Promise<{
  user: { id: string };
  adminUser: { id: string; role: string; admin_sub_role: string | null };
  role: string;
  adminSubRole: string | null;
}> {
  const authHeader = request.headers.get('authorization')
  const user = await getUserFromRequest(authHeader)
  
  if (!user) {
    throw new Error('UNAUTHORIZED')
  }

  const adminInfo = await verifyAdminAccess(user.id)
  if (!adminInfo) {
    throw new Error('FORBIDDEN')
  }

  // بررسی اینکه کاربر admin, super, یا agent باشد
  const allowedRoles = ['admin', 'super', 'agent']
  if (!allowedRoles.includes(adminInfo.user.role)) {
    throw new Error('FORBIDDEN')
  }

  return {
    user,
    adminUser: adminInfo.user,
    role: adminInfo.user.role,
    adminSubRole: adminInfo.adminSubRole,
  }
}

/**
 * Helper function برای ایجاد Supabase client با service role
 * این تابع فقط در سرور استفاده می‌شود
 * 
 * @returns Supabase client با service_role key
 */
export function createServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable')
  }

  if (!supabaseServiceRoleKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable')
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      fetch: noStoreFetch,
    },
  })
}

/**
 * Helper function برای گرفتن context کامل admin (session + service client)
 * این تابع session را بررسی می‌کند و service client را برمی‌گرداند
 * 
 * @param request - Next.js Request object
 * @returns context شامل session, adminUser, supabase (service client)
 * @throws Error اگر کاربر لاگین نیست یا admin نیست
 */
export async function getDevPanelContextOrThrow(request: Request): Promise<{
  session: {
    user: { id: string };
    adminUser: { id: string; role: string; admin_sub_role: string | null };
    role: string;
    adminSubRole: string | null;
  };
  supabase: ReturnType<typeof createServiceClient>;
}> {
  const context = await getAdminContextOrThrow(request)
  const allowed = await verifyDevPanelAccess(context.session.user.id)
  if (!allowed) {
    throw new Error('FORBIDDEN_DEV_PANEL')
  }
  return context
}

export async function getAdminContextOrThrow(request: Request): Promise<{
  session: {
    user: { id: string };
    adminUser: { id: string; role: string; admin_sub_role: string | null };
    role: string;
    adminSubRole: string | null;
  };
  supabase: ReturnType<typeof createServiceClient>;
}> {
  const session = await getAdminSessionOrThrow(request)
  const supabase = createServiceClient()

  return {
    session,
    supabase,
  }
}

/**
 * Helper function برای ثبت عملیات در admin_audit_log
 * 
 * @param supabase - Supabase service client
 * @param adminId - شناسه ادمین
 * @param action - نوع عملیات (مثلاً: 'change_user_role', 'toggle_suspension', ...)
 * @param targetTable - نام جدول هدف (مثلاً: 'users', 'room_templates', ...)
 * @param targetId - شناسه رکورد هدف (اختیاری)
 * @param payload - داده‌های اضافی (JSONB)
 * @param request - Request object برای استخراج IP و User-Agent (اختیاری)
 * @returns شناسه رکورد ثبت شده یا null در صورت خطا
 */
export async function logAdminAction(
  supabase: ReturnType<typeof createServiceClient>,
  adminId: string,
  action: string,
  targetTable: string,
  targetId: string | null = null,
  payload: Record<string, any> = {},
  request?: Request
): Promise<string | null> {
  try {
    // استخراج IP و User-Agent از request (اگر موجود باشد)
    let ipAddress: string | null = null
    let userAgent: string | null = null

    if (request) {
      // استخراج IP از headers (ممکن است در X-Forwarded-For باشد)
      ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                  request.headers.get('x-real-ip') ||
                  null

      userAgent = request.headers.get('user-agent') || null
    }

    const { data, error } = await supabase
      .from('admin_audit_log')
      .insert({
        admin_id: adminId,
        action,
        target_table: targetTable,
        target_id: targetId,
        payload,
        ip_address: ipAddress,
        user_agent: userAgent,
      })
      .select('id')
      .single()

    if (error) {
      console.error('logAdminAction error:', error)
      return null
    }

    return data?.id || null
  } catch (err) {
    console.error('logAdminAction unexpected error:', err)
    return null
  }
}

