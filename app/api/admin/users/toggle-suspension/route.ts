/**
 * API Route: تعلیق/فعال‌سازی کاربر
 * 
 * POST /api/admin/users/toggle-suspension
 * 
 * این route برای تعلیق یا فعال‌سازی کاربر استفاده می‌شود.
 * وضعیت به صورت خودکار toggle می‌شود (active ↔ suspended).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminContextOrThrow, logAdminAction } from '@/lib/supabaseServer'

export async function POST(request: NextRequest) {
  try {
    // 1. استخراج session و service client
    const { session, supabase } = await getAdminContextOrThrow(request)

    // 2. خواندن body
    const body = await request.json()
    const { user_id } = body

    if (!user_id) {
      return NextResponse.json(
        { ok: false, error: 'invalid_payload', message: 'user_id is required' },
        { status: 400 }
      )
    }

    // 3. جلوگیری از تعلیق خود
    if (user_id === session.user.id) {
      return NextResponse.json(
        { ok: false, error: 'cannot_suspend_self', message: 'cannot suspend yourself' },
        { status: 400 }
      )
    }

    // 4. بررسی وجود کاربر
    const { data: targetUser, error: targetUserError } = await supabase
      .from('users')
      .select('id, status, role')
      .eq('id', user_id)
      .single()

    if (targetUserError || !targetUser) {
      return NextResponse.json(
        { ok: false, error: 'user_not_found', message: 'user not found' },
        { status: 404 }
      )
    }

    // 5. (اختیاری) بررسی سلسله‌مراتب
    // Admin نمی‌تواند Admin دیگر را تعلیق کند (فقط مدیر کل می‌تواند)
    if (targetUser.role === 'admin' && session.role === 'admin' && session.adminSubRole !== null) {
      return NextResponse.json(
        { ok: false, error: 'forbidden', message: 'only manager can suspend admins' },
        { status: 403 }
      )
    }

    // 6. Toggle status
    const currentStatus = targetUser.status as 'active' | 'suspended' | 'deleted'
    const newStatus: 'active' | 'suspended' = currentStatus === 'suspended' ? 'active' : 'suspended'

    const { error: updateError } = await supabase
      .from('users')
      .update({ status: newStatus })
      .eq('id', user_id)

    if (updateError) {
      console.error('toggle-suspension update error:', updateError)
      return NextResponse.json(
        { ok: false, error: 'database_error', message: updateError.message },
        { status: 500 }
      )
    }

    // 7. ثبت در audit log
    await logAdminAction(
      supabase,
      session.user.id,
      'toggle_user_suspension',
      'users',
      user_id,
      {
        old_status: currentStatus,
        new_status: newStatus,
      },
      request
    )

    return NextResponse.json(
      { ok: true },
      { status: 200 }
    )
  } catch (err: any) {
    // Handle thrown errors from getAdminContextOrThrow
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

    console.error('POST /api/admin/users/toggle-suspension error:', err)
    return NextResponse.json(
      { ok: false, error: 'unexpected_error', message: err?.message || 'unexpected error' },
      { status: 500 }
    )
  }
}

