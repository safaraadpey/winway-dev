/**
 * API Route: تغییر نقش کاربر
 * 
 * POST /api/admin/users/set-role
 * 
 * این route برای تغییر نقش کاربر استفاده می‌شود.
 * از supabaseServer (service role) استفاده می‌کند.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminContextOrThrow, logAdminAction } from '@/lib/supabaseServer'

export async function POST(request: NextRequest) {
  try {
    // 1. استخراج session و service client
    const { session, supabase } = await getAdminContextOrThrow(request)

    // 2. خواندن body
    const body = await request.json()
    const { user_id, new_role, admin_sub_role } = body

    // 3. Validation اولیه
    if (!user_id || !new_role) {
      return NextResponse.json(
        { ok: false, error: 'invalid_payload', message: 'user_id and new_role are required' },
        { status: 400 }
      )
    }

    // 4. Validation new_role
    const validRoles = ['player', 'agent', 'super', 'admin']
    if (!validRoles.includes(new_role)) {
      return NextResponse.json(
        { ok: false, error: 'validation_error', message: 'invalid new_role' },
        { status: 400 }
      )
    }

    // 5. بررسی وجود کاربر هدف
    const { data: targetUser, error: targetUserError } = await supabase
      .from('users')
      .select('id, role, parent_id')
      .eq('id', user_id)
      .single()

    if (targetUserError || !targetUser) {
      return NextResponse.json(
        { ok: false, error: 'user_not_found', message: 'target user not found' },
        { status: 404 }
      )
    }

    const currentRole = session.role
    const currentUserId = session.user.id
    const targetRole = targetUser.role

    // 6. بررسی قوانین دسترسی (authorization)
    // فقط Admin می‌تواند نقش را به Super یا Admin تبدیل کند
    if ((new_role === 'super' || new_role === 'admin') && currentRole !== 'admin') {
      return NextResponse.json(
        { ok: false, error: 'forbidden', message: 'only admin can promote to super or admin' },
        { status: 403 }
      )
    }

    // 6.1 قوانین بر اساس نقش ادمین فعلی

    // (الف) Admin (شامل sub-role مدیر کل) با همان قواعد پنل ادمین:
    // - مستقیم: کاربرانی که parent_id آن‌ها خود admin است
    // - در سلسله adminzero: اگر خود adminzero باشد یا زیرمجموعه مستقیم adminzero باشد،
    //   می‌تواند کاربران مستقیم adminzero را هم مدیریت کند.
    if (currentRole === 'admin') {
      const parentId = targetUser.parent_id as string | null

      const { data: actorUser, error: actorUserErr } = await supabase
        .from('users')
        .select('id, parent_id')
        .eq('id', currentUserId)
        .single()

      if (actorUserErr || !actorUser) {
        return NextResponse.json(
          { ok: false, error: 'user_not_found', message: 'actor user not found' },
          { status: 404 }
        )
      }

      const actorParentId = (actorUser as any).parent_id as string | null

      const { data: adminZero, error: adminZeroErr } = await supabase
        .from('users')
        .select('id')
        .eq('username', 'adminzero')
        .eq('role', 'admin')
        .single()

      if (adminZeroErr || !adminZero) {
        return NextResponse.json(
          { ok: false, error: 'adminzero_not_found', message: 'adminzero user not found' },
          { status: 500 }
        )
      }

      const adminZeroId = (adminZero as any).id as string
      const isAdminZero = currentUserId === adminZeroId
      const isUnderAdminZero = actorParentId === adminZeroId

      const adminCanEditUnderAdminZero =
        (isAdminZero || isUnderAdminZero) && parentId === adminZeroId
      const adminCanEditDirect = parentId === currentUserId

      if (!adminCanEditUnderAdminZero && !adminCanEditDirect) {
        return NextResponse.json(
          {
            ok: false,
            error: 'forbidden_parent',
            message: 'ادمین فقط می‌تواند کاربران مستقیم مجاز خود را تغییر نقش دهد',
          },
          { status: 403 }
        )
      }
    }

    // (ب) Super فقط می‌تواند Player را به Agent تبدیل کند
    if (currentRole === 'super') {
      // فقط player → agent مجاز است (قانون قبلی)
      if (targetRole !== 'player' || new_role !== 'agent') {
        return NextResponse.json(
          { ok: false, error: 'forbidden', message: 'super can only convert player to agent' },
          { status: 403 }
        )
      }

      // قانون جدید: فقط اگر خودش «معرف مستقیم» پلیر بوده باشد (direct super)
      // ترجیحاً از player_affiliation، در صورت نبود، fallback به parent_id
      const { data: paRow, error: paError } = await supabase
        .from('player_affiliation')
        .select('agent_id, super_id')
        .eq('user_id', user_id)
        .maybeSingle()

      let isDirectSuper = false

      if (!paError && paRow) {
        // direct super یعنی super_id = currentUserId و agent_id خالی
        isDirectSuper =
          paRow.super_id === currentUserId &&
          (paRow.agent_id === null || paRow.agent_id === undefined)
      } else {
        // fallback: اگر player_affiliation نداریم، از parent_id استفاده می‌کنیم
        const parentId = targetUser.parent_id as string | null
        isDirectSuper = parentId === currentUserId
      }

      if (!isDirectSuper) {
        return NextResponse.json(
          {
            ok: false,
            error: 'forbidden',
            message: 'سوپر فقط می‌تواند پلیرهایی را به ایجنت تبدیل کند که خودش معرف مستقیم آن‌ها بوده است',
          },
          { status: 403 }
        )
      }
    }

    // Agent فقط می‌تواند Player را به Agent تبدیل کند
    if (currentRole === 'agent') {
      if (targetRole !== 'player' || new_role !== 'agent') {
        return NextResponse.json(
          { ok: false, error: 'forbidden', message: 'agent can only convert player to agent' },
          { status: 403 }
        )
      }
    }

    // 7. بررسی قوانین business (جلوگیری از تنزل نقش)
    if (targetRole === 'super' && new_role !== 'super') {
      return NextResponse.json(
        { ok: false, error: 'validation_error', message: 'cannot demote super' },
        { status: 400 }
      )
    }
    if (targetRole === 'agent' && new_role === 'player') {
      return NextResponse.json(
        { ok: false, error: 'validation_error', message: 'cannot demote agent to player' },
        { status: 400 }
      )
    }
    if (targetRole === 'admin') {
      return NextResponse.json(
        { ok: false, error: 'validation_error', message: 'cannot change admin role' },
        { status: 400 }
      )
    }

    // 8. آماده‌سازی update data
    const updateData: any = {
      role: new_role,
      parent_id: targetUser.parent_id, // حفظ parent_id
    }

    if (new_role === 'admin') {
      // manager = null در دیتابیس
      updateData.admin_sub_role = admin_sub_role === 'manager' || admin_sub_role === null 
        ? null 
        : admin_sub_role
    } else {
      updateData.admin_sub_role = null
    }

    // 9. Update users
    const { error: updateError } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', user_id)

    if (updateError) {
      console.error('set-role update error:', updateError)
      return NextResponse.json(
        { ok: false, error: 'database_error', message: updateError.message },
        { status: 500 }
      )
    }

    // 10. مدیریت user_commissions بر اساس نقش جدید
    const commissionUpdateData: any = { user_id }
    if (new_role === 'agent') {
      commissionUpdateData.super_commission = null
      // بررسی وجود agent_commission قبلی
      const { data: existingCommission } = await supabase
        .from('user_commissions')
        .select('agent_commission')
        .eq('user_id', user_id)
        .maybeSingle()
      
      if (
        targetRole === "agent" &&
        existingCommission &&
        existingCommission.agent_commission !== null
      ) {
        commissionUpdateData.agent_commission =
          existingCommission.agent_commission;
      } else {
        commissionUpdateData.agent_commission = null
      }
    } else if (new_role === 'super') {
      commissionUpdateData.agent_commission = null
      // بررسی وجود super_commission قبلی
      const { data: existingCommission } = await supabase
        .from('user_commissions')
        .select('super_commission')
        .eq('user_id', user_id)
        .maybeSingle()
      
      if (
        targetRole === "super" &&
        existingCommission &&
        existingCommission.super_commission !== null
      ) {
        commissionUpdateData.super_commission =
          existingCommission.super_commission;
      } else {
        commissionUpdateData.super_commission = null
      }
    } else if (new_role === 'player') {
      commissionUpdateData.agent_commission = null
      commissionUpdateData.super_commission = null
    }

    if (new_role === 'agent' || new_role === 'super' || new_role === 'player') {
      await supabase
        .from('user_commissions')
        .upsert(commissionUpdateData, { onConflict: 'user_id' })
    }

    // 11. ثبت در audit log
    await logAdminAction(
      supabase,
      session.user.id,
      'set_role',
      'users',
      user_id,
      {
        old_role: targetRole,
        new_role: new_role,
        admin_sub_role: updateData.admin_sub_role,
      },
      request
    )

    // 12. برگرداندن نتیجه موفق
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

    console.error('POST /api/admin/users/set-role error:', err)
    return NextResponse.json(
      { ok: false, error: 'unexpected_error', message: err?.message || 'unexpected error' },
      { status: 500 }
    )
  }
}

