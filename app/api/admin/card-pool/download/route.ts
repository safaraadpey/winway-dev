/**
 * API Route: دانلود اطلاعات کارت‌های استخر
 * 
 * GET /api/admin/card-pool/download?poolId=...
 * 
 * این route فقط برای admin قابل دسترسی است (نه agent، نه super)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminContextOrThrow } from '@/lib/supabaseServer'

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

    // 4. بررسی وجود استخر
    const { data: pool, error: poolError } = await supabase
      .from('card_pools')
      .select('id, card_count')
      .eq('id', poolId)
      .maybeSingle()

    if (poolError) {
      console.error('Error fetching pool:', poolError)
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

    // 5. دریافت کارت‌های استخر (محدود به 1000 کارت برای جلوگیری از بار زیاد)
    const { data: cards, error: cardsError } = await supabase
      .from('card_pool_cards')
      .select('card_no, card_data, is_taken')
      .eq('pool_id', poolId)
      .order('card_no', { ascending: true })
      .limit(1000)

    if (cardsError) {
      console.error('Error fetching cards:', cardsError)
      return NextResponse.json(
        { ok: false, error: 'database_error', message: cardsError.message },
        { status: 500 }
      )
    }

    // 6. آماده‌سازی داده برای دانلود
    const cardsData = (cards || []).map((card) => ({
      cardNo: card.card_no,
      cardData: card.card_data,
      isTaken: card.is_taken || false,
    }))

    // 7. ایجاد JSON برای دانلود
    const jsonData = JSON.stringify({
      poolId: pool.id,
      cardCount: pool.card_count,
      downloadedCount: cardsData.length,
      downloadedAt: new Date().toISOString(),
      cards: cardsData,
    }, null, 2)

    // 8. برگرداندن فایل JSON
    return new NextResponse(jsonData, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="card-pool-${poolId.substring(0, 8)}-${new Date().toISOString().split('T')[0]}.json"`,
      },
    })
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

    console.error('GET /api/admin/card-pool/download error:', err)
    return NextResponse.json(
      { ok: false, error: 'unexpected_error', message: err?.message || 'خطای غیرمنتظره' },
      { status: 500 }
    )
  }
}
