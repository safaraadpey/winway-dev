/**
 * API Route: تغییر sub-role مدیر
 * 
 * POST /api/admin/admins/set-sub-role
 * 
 * این route برای تغییر sub-role مدیر استفاده می‌شود.
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
        { ok: false, error: 'forbidden', message: 'only manager can change admin sub-role' },
        { status: 403 }
      )
    }

    // 3. خواندن body
    const body = await request.json()
    const { admin_id, new_sub_role } = body

    if (!admin_id || new_sub_role === undefined) {
      return NextResponse.json(
        { ok: false, error: 'invalid_payload', message: 'admin_id and new_sub_role are required' },
        { status: 400 }
      )
    }

    // 4. Validation new_sub_role
    const validSubRoles = [null, 'finance', 'support', 'room', 'dev_panel']
    if (!validSubRoles.includes(new_sub_role)) {
      return NextResponse.json(
        { ok: false, error: 'validation_error', message: 'invalid sub_role' },
        { status: 400 }
      )
    }

    // 5. بررسی وجود و role مدیر هدف
    const { data: targetAdmin, error: targetAdminError } = await supabase
      .from('users')
      .select('id, role, admin_sub_role')
      .eq('id', admin_id)
      .eq('role', 'admin')
      .single()

    if (targetAdminError || !targetAdmin) {
      return NextResponse.json(
        { ok: false, error: 'admin_not_found', message: 'admin not found' },
        { status: 404 }
      )
    }

    // 6. Update admin_sub_role
    const { error: updateError } = await supabase
      .from('users')
      .update({ admin_sub_role: new_sub_role })
      .eq('id', admin_id)
      .eq('role', 'admin')

    if (updateError) {
      console.error('set-sub-role update error:', updateError)
      return NextResponse.json(
        { ok: false, error: 'database_error', message: updateError.message },
        { status: 500 }
      )
    }

    // 7. ثبت در audit log
    await logAdminAction(
      supabase,
      session.user.id,
      'set_sub_role',
      'users',
      admin_id,
      {
        old_sub_role: targetAdmin.admin_sub_role,
        new_sub_role: new_sub_role,
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

    console.error('POST /api/admin/admins/set-sub-role error:', err)
    return NextResponse.json(
      { ok: false, error: 'unexpected_error', message: err?.message || 'unexpected error' },
      { status: 500 }
    )
  }
}

