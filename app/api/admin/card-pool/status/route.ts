/**
 * API Route: دریافت وضعیت ساخت استخر کارت
 * 
 * GET /api/admin/card-pool/status?poolId=...
 * 
 * این route فقط برای admin قابل دسترسی است (نه agent، نه super)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminContextOrThrow } from '@/lib/supabaseServer'

export async function GET(request: NextRequest) {
  try {
    // 1. استخراج session و service client
    const { session, supabase } = await getAdminContextOrThrow(request)

    // 2. بررسی اینکه فقط admin باشد (نه agent، نه super)
    if (session.role !== 'admin') {
      return NextResponse.json(
        { ok: false, error: 'forbidden', message: 'فقط ادمین می‌تواند به این بخش دسترسی داشته باشد' },
        { status: 403 }
      )
    }

    // 3. دریافت poolId از query params
    const { searchParams } = new URL(request.url)
    const poolId = searchParams.get('poolId')

    if (!poolId) {
      return NextResponse.json(
        { ok: false, error: 'validation_error', message: 'شناسه استخر الزامی است' },
        { status: 400 }
      )
    }

    // 4. دریافت وضعیت استخر
    const { data: pool, error: poolError } = await supabase
      .from('card_pools')
      .select('id, card_count, is_building, cards_built, is_active')
      .eq('id', poolId)
      .maybeSingle()

    if (poolError) {
      console.error('Error fetching pool status:', poolError)
      return NextResponse.json(
        { ok: false, error: 'database_error', message: poolError.message },
        { status: 500 }
      )
    }

    if (!pool) {
      return NextResponse.json(
        { ok: false, error: 'not_found', message: 'استخر پیدا نشد' },
        { status: 404 }
      )
    }

    const isComplete = !pool.is_building && pool.cards_built >= pool.card_count
    const progress = pool.card_count > 0 
      ? Math.round((pool.cards_built / pool.card_count) * 100) 
      : 0

    return NextResponse.json(
      {
        ok: true,
        status: {
          poolId: pool.id,
          cardCount: pool.card_count,
          cardsBuilt: pool.cards_built || 0,
          isBuilding: pool.is_building || false,
          isActive: pool.is_active || false,
          isComplete,
          progress,
        }
      },
      { status: 200 }
    )
  } catch (err: any) {
    if (err.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        { ok: false, error: 'unauthorized', message: 'جلسه معتبر نیست' },
        { status: 401 }
      )
    }
    if (err.message === 'FORBIDDEN') {
      return NextResponse.json(
        { ok: false, error: 'forbidden', message: 'دسترسی کافی نیست' },
        { status: 403 }
      )
    }

    console.error('GET /api/admin/card-pool/status error:', err)
    return NextResponse.json(
      { ok: false, error: 'unexpected_error', message: err?.message || 'خطای غیرمنتظره' },
      { status: 500 }
    )
  }
}
