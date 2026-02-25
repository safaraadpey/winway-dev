/**
 * Admin API Client
 * 
 * Helper functions برای فراخوانی Admin API routes از فرانت‌اند.
 * این helperها فقط برای routeهای `/api/admin/...` استفاده می‌شوند.
 * 
 * ⚠️ هشدار: این helperها فقط در فرانت‌اند (React components/pages) استفاده می‌شوند.
 */

import { supabase } from '@/lib/supabaseClient'

/**
 * Error class برای خطاهای Admin API
 */
export class AdminApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode?: number
  ) {
    super(message)
    this.name = 'AdminApiError'
  }
}

/**
 * فراخوانی Admin API route
 * 
 * @param path - مسیر API (مثلاً '/api/admin/users/set-role')
 * @param options - گزینه‌های درخواست (method, body)
 * @returns نتیجه درخواست
 * @throws AdminApiError در صورت خطا
 */
export async function callAdminApi<T = any>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
    body?: any
  } = {}
): Promise<T> {
  const { method = 'POST', body } = options

  try {
    // گرفتن session برای Authorization header
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    
    if (sessionError || !session) {
      throw new AdminApiError('UNAUTHORIZED', 'Session not found', 401)
    }

    // ساخت URL
    const url = path.startsWith('/') ? path : `/${path}`

    // ساخت headers
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    }

    // ساخت request options
    const requestOptions: RequestInit = {
      method,
      headers,
    }

    // اضافه کردن body اگر موجود باشد
    if (body) {
      requestOptions.body = JSON.stringify(body)
    }

    // فراخوانی API
    const response = await fetch(url, requestOptions)

    // خواندن response
    const data = await response.json()

    // بررسی response
    if (!response.ok) {
      // اگر response.ok نباشد، خطا برمی‌گرداند
      const errorCode = data.error || 'UNKNOWN_ERROR'
      const errorMessage = data.message || `HTTP ${response.status}: ${response.statusText}`
      throw new AdminApiError(errorCode, errorMessage, response.status)
    }

    // بررسی فرمت استاندارد { ok: true/false }
    if (data.ok === false) {
      const errorCode = data.error || 'UNKNOWN_ERROR'
      const errorMessage = data.message || 'Unknown error'
      throw new AdminApiError(errorCode, errorMessage, response.status)
    }

    if (data.ok === true) {
      // موفقیت - داده‌های اضافی را برمی‌گردانیم (اگر موجود باشد)
      return (data.data || {}) as T
    }

    // اگر ok وجود نداشته باشد، کل response را برمی‌گردانیم
    return data as T
  } catch (err) {
    // اگر AdminApiError باشد، دوباره throw می‌کنیم
    if (err instanceof AdminApiError) {
      throw err
    }

    // خطاهای دیگر (مثلاً network error)
    console.error('callAdminApi error:', err)
    throw new AdminApiError(
      'NETWORK_ERROR',
      err instanceof Error ? err.message : 'Network error occurred',
      0
    )
  }
}

/**
 * Helper برای تغییر نقش کاربر
 */
export async function setUserRole(
  userId: string,
  newRole: 'player' | 'agent' | 'super' | 'admin',
  adminSubRole?: 'manager' | 'finance' | 'support' | 'room' | null
): Promise<void> {
  await callAdminApi('/api/admin/users/set-role', {
    method: 'POST',
    body: {
      user_id: userId,
      new_role: newRole,
      admin_sub_role: adminSubRole,
    },
  })
}

/**
 * Helper برای تغییر sub-role مدیر
 */
export async function setAdminSubRole(
  adminId: string,
  newSubRole: 'manager' | 'finance' | 'support' | 'room' | null
): Promise<void> {
  await callAdminApi('/api/admin/admins/set-sub-role', {
    method: 'POST',
    body: {
      admin_id: adminId,
      new_sub_role: newSubRole,
    },
  })
}

/**
 * Helper برای تعلیق/فعال‌سازی کاربر
 */
export async function toggleUserSuspension(userId: string): Promise<void> {
  await callAdminApi('/api/admin/users/toggle-suspension', {
    method: 'POST',
    body: {
      user_id: userId,
    },
  })
}

/**
 * Helper برای صدور رمز عبور جدید توسط ادمین (فقط نقش admin)
 */
export async function setUserPassword(userId: string, newPassword: string): Promise<void> {
  await callAdminApi('/api/admin/users/set-password', {
    method: 'POST',
    body: {
      user_id: userId,
      new_password: newPassword,
    },
  })
}

/**
 * Helper برای تنظیم درصد کانیات (commission) برای agent/super
 */
export async function setUserCommissionPercent(
  userId: string,
  commissionPercent: number
): Promise<void> {
  await callAdminApi('/api/admin/users/set-commission', {
    method: 'POST',
    body: {
      user_id: userId,
      commission_percent: commissionPercent,
    },
  })
}

/**
 * Helper برای تعلیق/فعال‌سازی مدیر
 */
export async function toggleAdminStatus(adminId: string): Promise<void> {
  await callAdminApi('/api/admin/admins/toggle-status', {
    method: 'POST',
    body: {
      admin_id: adminId,
    },
  })
}

export type GlobalRegistrationLockState = {
  global_registration_locked: boolean;
  global_registration_locked_at: string | null;
  global_registration_locked_by: string | null;
  global_registration_lock_reason: string | null;
  updated_at: string | null;
}

export async function getGlobalRegistrationLockState(): Promise<GlobalRegistrationLockState> {
  const data = await callAdminApi<GlobalRegistrationLockState>(
    '/api/admin/runtime/global-registration-lock',
    { method: 'GET' }
  )
  return data
}

export async function setGlobalRegistrationLockState(
  locked: boolean,
  reason?: string
): Promise<GlobalRegistrationLockState> {
  const data = await callAdminApi<GlobalRegistrationLockState>(
    '/api/admin/runtime/global-registration-lock',
    {
      method: 'POST',
      body: {
        locked,
        reason: reason ?? null,
      },
    }
  )
  return data
}

