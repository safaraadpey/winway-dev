/**
 * API Route: دریافت سوابق استخرهای کارت ساخته شده
 * 
 * GET /api/admin/card-pool/history
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

    // 3. دریافت سوابق استخرها (مرتب بر اساس تاریخ ایجاد - جدیدترین اول)
    const { data: pools, error: poolsError } = await supabase
      .from('card_pools')
      .select('id, pool_seed, commit_hash, card_count, created_at, is_active, is_building, cards_built')
      .order('created_at', { ascending: false })
      .limit(50) // محدودیت برای جلوگیری از بار زیاد

    if (poolsError) {
      console.error('Error fetching pool history:', poolsError)
      return NextResponse.json(
        { ok: false, error: 'database_error', message: poolsError.message },
        { status: 500 }
      )
    }

    // تبدیل pool_seed به hex string برای نمایش
    const poolsWithSeedHex = (pools || []).map((pool) => {
      let poolSeedHex: string | null = null
      if (pool.pool_seed) {
        if (Buffer.isBuffer(pool.pool_seed)) {
          poolSeedHex = pool.pool_seed.toString('hex')
        } else if (typeof pool.pool_seed === 'string') {
          poolSeedHex = pool.pool_seed
        } else if (Array.isArray(pool.pool_seed)) {
          poolSeedHex = Buffer.from(pool.pool_seed).toString('hex')
        }
      }

      return {
        id: pool.id,
        seed: poolSeedHex,
        commitHash: pool.commit_hash,
        cardCount: pool.card_count,
        createdAt: pool.created_at,
        isActive: pool.is_active || false,
        isBuilding: pool.is_building || false,
        cardsBuilt: pool.cards_built || 0,
      }
    })

    return NextResponse.json(
      {
        ok: true,
        pools: poolsWithSeedHex
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

    console.error('GET /api/admin/card-pool/history error:', err)
    return NextResponse.json(
      { ok: false, error: 'unexpected_error', message: err?.message || 'خطای غیرمنتظره' },
      { status: 500 }
    )
  }
}
