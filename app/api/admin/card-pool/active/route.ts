/**
 * API Route: دریافت اطلاعات استخر کارت فعال
 * 
 * GET /api/admin/card-pool/active
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

    // 3. دریافت استخر فعال
    const { data: activePool, error: poolError } = await supabase
      .from('card_pools')
      .select('id, pool_seed, commit_hash, prng_version, card_count, created_at, is_building, cards_built')
      .eq('is_active', true)
      .maybeSingle()

    if (poolError) {
      console.error('Error fetching active pool:', poolError)
      return NextResponse.json(
        { ok: false, error: 'database_error', message: poolError.message },
        { status: 500 }
      )
    }

    if (!activePool) {
      return NextResponse.json(
        { ok: true, pool: null },
        { status: 200 }
      )
    }

    // تبدیل pool_seed به hex string برای نمایش
    let poolSeedHex: string | null = null
    if (activePool.pool_seed) {
      if (Buffer.isBuffer(activePool.pool_seed)) {
        poolSeedHex = activePool.pool_seed.toString('hex')
      } else if (typeof activePool.pool_seed === 'string') {
        poolSeedHex = activePool.pool_seed
      } else if (Array.isArray(activePool.pool_seed)) {
        poolSeedHex = Buffer.from(activePool.pool_seed).toString('hex')
      }
    }

    return NextResponse.json(
      {
        ok: true,
        pool: {
          id: activePool.id,
          seed: poolSeedHex,
          commitHash: activePool.commit_hash,
          prngVersion: activePool.prng_version,
          cardCount: activePool.card_count,
          createdAt: activePool.created_at,
          isBuilding: activePool.is_building || false,
          cardsBuilt: activePool.cards_built || 0,
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

    console.error('GET /api/admin/card-pool/active error:', err)
    return NextResponse.json(
      { ok: false, error: 'unexpected_error', message: err?.message || 'خطای غیرمنتظره' },
      { status: 500 }
    )
  }
}
