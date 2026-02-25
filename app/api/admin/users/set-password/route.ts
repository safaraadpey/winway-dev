/**
 * API Route: صدور رمز عبور جدید توسط ادمین
 *
 * POST /api/admin/users/set-password
 *
 * فقط ادمین (نقش admin) می‌تواند برای هر کاربر رمز عبور جدید تنظیم کند.
 * از Supabase Auth Admin API استفاده می‌کند (service role).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminContextOrThrow, logAdminAction } from '@/lib/supabaseServer'

const MIN_PASSWORD_LENGTH = 6
const PASSWORD_CHANGE_COOLDOWN_MINUTES = 20
const PASSWORD_CHANGE_COOLDOWN_MS = PASSWORD_CHANGE_COOLDOWN_MINUTES * 60 * 1000

export async function POST(request: NextRequest) {
  try {
    const { session, supabase } = await getAdminContextOrThrow(request)

    // فقط نقش admin اجازه دارد وارد این مسیر شود
    if (session.role !== 'admin') {
      return NextResponse.json(
        { ok: false, error: 'forbidden', message: 'only admin can set user password' },
        { status: 403 }
      )
    }

    // محدودیت امنیتی: فقط adminzero (و نه sub-roleهای admin) مجاز است
    const { data: currentAdmin, error: currentAdminError } = await supabase
      .from('users')
      .select('username, role, admin_sub_role')
      .eq('id', session.user.id)
      .single()

    if (currentAdminError || !currentAdmin) {
      return NextResponse.json(
        { ok: false, error: 'forbidden', message: 'unable to verify current admin' },
        { status: 403 }
      )
    }

    const isAdminZero =
      currentAdmin.role === 'admin' &&
      currentAdmin.username === 'adminzero' &&
      currentAdmin.admin_sub_role === null

    if (!isAdminZero) {
      return NextResponse.json(
        {
          ok: false,
          error: 'forbidden',
          message: 'only adminzero can set user password',
        },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { user_id, new_password } = body

    if (!user_id || typeof user_id !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'invalid_payload', message: 'user_id is required' },
        { status: 400 }
      )
    }

    if (!new_password || typeof new_password !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'invalid_payload', message: 'new_password is required' },
        { status: 400 }
      )
    }

    const trimmed = new_password.trim()
    if (trimmed.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        {
          ok: false,
          error: 'invalid_password',
          message: `رمز عبور باید حداقل ${MIN_PASSWORD_LENGTH} کاراکتر باشد`,
        },
        { status: 400 }
      )
    }

    // Rate-limit امنیتی: هر ادمین فقط هر 20 دقیقه یک‌بار می‌تواند پسورد تغییر دهد
    const { data: lastPasswordChange, error: lastPasswordChangeError } = await supabase
      .from('admin_audit_log')
      .select('created_at')
      .eq('admin_id', session.user.id)
      .eq('action', 'admin_set_user_password')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (lastPasswordChangeError) {
      console.error('set-password cooldown check error:', lastPasswordChangeError)
      return NextResponse.json(
        { ok: false, error: 'cooldown_check_failed', message: 'could not verify cooldown window' },
        { status: 500 }
      )
    }

    if (lastPasswordChange?.created_at) {
      const lastChangedAtMs = new Date(lastPasswordChange.created_at).getTime()
      const elapsedMs = Date.now() - lastChangedAtMs

      if (Number.isFinite(lastChangedAtMs) && elapsedMs < PASSWORD_CHANGE_COOLDOWN_MS) {
        const remainingMs = PASSWORD_CHANGE_COOLDOWN_MS - elapsedMs
        const remainingSeconds = Math.ceil(remainingMs / 1000)
        const remainingMinutes = Math.ceil(remainingSeconds / 60)

        return NextResponse.json(
          {
            ok: false,
            error: 'password_change_cooldown',
            message: `تا ${remainingMinutes} دقیقه دیگر امکان تغییر رمز وجود ندارد`,
            data: {
              remaining_seconds: remainingSeconds,
            },
          },
          { status: 429 }
        )
      }
    }

    // بررسی وجود کاربر در جدول users (همان auth user است)
    const { data: targetUser, error: targetError } = await supabase
      .from('users')
      .select('id')
      .eq('id', user_id)
      .single()

    if (targetError || !targetUser) {
      return NextResponse.json(
        { ok: false, error: 'user_not_found', message: 'user not found' },
        { status: 404 }
      )
    }

    const { error: authError } = await supabase.auth.admin.updateUserById(user_id, {
      password: trimmed,
    })

    if (authError) {
      console.error('set-password auth.admin.updateUserById error:', authError)
      return NextResponse.json(
        { ok: false, error: 'auth_error', message: authError.message },
        { status: 500 }
      )
    }

    await logAdminAction(
      supabase,
      session.user.id,
      'admin_set_user_password',
      'auth.users',
      user_id,
      {},
      request
    )

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (err: any) {
    if (err.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        { ok: false, error: 'unauthorized', message: 'missing or invalid session' },
        { status: 401 }
      )
    }
    if (err.message === 'FORBIDDEN') {
      return NextResponse.json(
        { ok: false, error: 'forbidden', message: 'insufficient permissions' },
        { status: 403 }
      )
    }
    console.error('POST /api/admin/users/set-password error:', err)
    return NextResponse.json(
      { ok: false, error: 'unexpected_error', message: err?.message || 'unexpected error' },
      { status: 500 }
    )
  }
}
