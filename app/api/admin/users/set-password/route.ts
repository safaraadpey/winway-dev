/**
 * API Route: صدور رمز عبور جدید توسط ادمین / سوپر / ایجنت
 *
 * POST /api/admin/users/set-password
 *
 * دسترسی:
 * - مدیر کل (admin با admin_sub_role = null، شامل adminzero): هر کاربر
 * - super/agent: فقط کاربران زیرمجموعه (player/agent)
 *
 * از Supabase Auth Admin API استفاده می‌کند (service role).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminContextOrThrow, logAdminAction } from '@/lib/supabaseServer'
import type { createServiceClient } from '@/lib/supabaseServer'

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_PASSWORD_LENGTH = 6
const PASSWORD_CHANGE_COOLDOWN_MINUTES = 20
const PASSWORD_CHANGE_COOLDOWN_MS = PASSWORD_CHANGE_COOLDOWN_MINUTES * 60 * 1000

type ServiceClient = ReturnType<typeof createServiceClient>

async function isSubordinateForPasswordReset(
  supabase: ServiceClient,
  actorId: string,
  actorRole: 'super' | 'agent',
  targetUserId: string,
  targetUser: { role: string; parent_id: string | null }
): Promise<boolean> {
  if (targetUser.role === 'admin' || targetUser.role === 'super') {
    return false
  }

  if (targetUser.parent_id === actorId) {
    return true
  }

  if (actorRole === 'agent') {
    const { data: paRow } = await supabase
      .from('player_affiliation')
      .select('agent_id')
      .eq('user_id', targetUserId)
      .maybeSingle()

    return paRow?.agent_id === actorId
  }

  const { data: paRow } = await supabase
    .from('player_affiliation')
    .select('agent_id, super_id')
    .eq('user_id', targetUserId)
    .maybeSingle()

  if (paRow?.super_id === actorId) {
    return true
  }

  if (paRow?.agent_id) {
    const { data: agentUser } = await supabase
      .from('users')
      .select('parent_id')
      .eq('id', paRow.agent_id)
      .maybeSingle()

    if (agentUser?.parent_id === actorId) {
      return true
    }
  }

  if (targetUser.parent_id) {
    const { data: parentUser } = await supabase
      .from('users')
      .select('role, parent_id')
      .eq('id', targetUser.parent_id)
      .maybeSingle()

    if (parentUser?.role === 'agent' && parentUser.parent_id === actorId) {
      return true
    }
  }

  return false
}

export async function POST(request: NextRequest) {
  try {
    const { session, supabase } = await getAdminContextOrThrow(request)
    const actorId = session.user.id
    const actorRole = session.role

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

    if (user_id === actorId) {
      return NextResponse.json(
        { ok: false, error: 'forbidden', message: 'cannot set your own password through admin panel' },
        { status: 403 }
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

    const { data: targetUser, error: targetError } = await supabase
      .from('users')
      .select('id, role, parent_id')
      .eq('id', user_id)
      .single()

    if (targetError || !targetUser) {
      return NextResponse.json(
        { ok: false, error: 'user_not_found', message: 'user not found' },
        { status: 404 }
      )
    }

    let authorized = false

    if (actorRole === 'admin') {
      if (session.adminSubRole === null) {
        authorized = true
      }
    } else if (actorRole === 'super' || actorRole === 'agent') {
      authorized = await isSubordinateForPasswordReset(
        supabase,
        actorId,
        actorRole,
        user_id,
        {
          role: String(targetUser.role ?? ''),
          parent_id: (targetUser.parent_id as string | null) ?? null,
        }
      )
    }

    if (!authorized) {
      return NextResponse.json(
        {
          ok: false,
          error: 'forbidden',
          message: 'insufficient permissions to set user password',
        },
        { status: 403 }
      )
    }

    // Rate-limit امنیتی: هر actor فقط هر 20 دقیقه یک‌بار می‌تواند پسورد تغییر دهد
    const { data: lastPasswordChange, error: lastPasswordChangeError } = await supabase
      .from('admin_audit_log')
      .select('created_at')
      .eq('admin_id', actorId)
      .eq('action', 'admin_set_user_password')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (lastPasswordChangeError) {
      console.error('[Admin] set-password cooldown check error:', lastPasswordChangeError)
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

    const { error: authError } = await supabase.auth.admin.updateUserById(user_id, {
      password: trimmed,
    })

    if (authError) {
      console.error('[Admin] set-password auth.admin.updateUserById error:', authError)
      return NextResponse.json(
        { ok: false, error: 'auth_error', message: authError.message },
        { status: 500 }
      )
    }

    await logAdminAction(
      supabase,
      actorId,
      'admin_set_user_password',
      'auth.users',
      user_id,
      { actor_role: actorRole },
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
    console.error('[Admin] POST /api/admin/users/set-password error:', err)
    return NextResponse.json(
      { ok: false, error: 'unexpected_error', message: err?.message || 'unexpected error' },
      { status: 500 }
    )
  }
}
