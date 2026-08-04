/**
 * API Route: تعلیق/فعال‌سازی مدیر
 * 
 * POST /api/admin/admins/toggle-status
 * 
 * این route برای تعلیق یا فعال‌سازی مدیر استفاده می‌شود.
 * فقط مدیر کل می‌تواند این کار را انجام دهد.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminContextOrThrow, verifyManagerAccess, logAdminAction } from '@/lib/supabaseServer'

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    // 1. استخراج session و service client
    const { session, supabase } = await getAdminContextOrThrow(request)

    // 2. بررسی مدیر کل بودن
    const isManager = await verifyManagerAccess(session.user.id)
    if (!isManager) {
      return NextResponse.json(
        { ok: false, error: 'forbidden', message: 'only manager can toggle admin status' },
        { status: 403 }
      )
    }

    // 3. خواندن body
    const body = await request.json()
    const { admin_id } = body

    if (!admin_id) {
      return NextResponse.json(
        { ok: false, error: 'invalid_payload', message: 'admin_id is required' },
        { status: 400 }
      )
    }

    // 4. جلوگیری از تعلیق خود
    if (admin_id === session.user.id) {
      return NextResponse.json(
        { ok: false, error: 'cannot_suspend_self', message: 'cannot suspend yourself' },
        { status: 400 }
      )
    }

    // 5. بررسی وجود و role مدیر
    const { data: targetAdmin, error: targetAdminError } = await supabase
      .from('users')
      .select('id, status, role')
      .eq('id', admin_id)
      .eq('role', 'admin')
      .single()

    if (targetAdminError || !targetAdmin) {
      return NextResponse.json(
        { ok: false, error: 'admin_not_found', message: 'admin not found' },
        { status: 404 }
      )
    }

    // 6. Toggle status
    const currentStatus = targetAdmin.status as 'active' | 'suspended' | 'deleted'
    const newStatus: 'active' | 'suspended' = currentStatus === 'suspended' ? 'active' : 'suspended'

    const { error: updateError } = await supabase
      .from('users')
      .update({ status: newStatus })
      .eq('id', admin_id)
      .eq('role', 'admin')

    if (updateError) {
      console.error('toggle-status update error:', updateError)
      return NextResponse.json(
        { ok: false, error: 'database_error', message: updateError.message },
        { status: 500 }
      )
    }

    // 7. ثبت در audit log
    await logAdminAction(
      supabase,
      session.user.id,
      'toggle_admin_status',
      'users',
      admin_id,
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

    console.error('POST /api/admin/admins/toggle-status error:', err)
    return NextResponse.json(
      { ok: false, error: 'unexpected_error', message: err?.message || 'unexpected error' },
      { status: 500 }
    )
  }
}

